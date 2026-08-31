import { createHash } from 'node:crypto';
import Parser from 'tree-sitter';
import type { FileAnalysis, SupportedLanguage } from '@shishan/protocol';
import { analyzeTree } from './analyzer.js';
import { getLanguageDefinition } from './language.js';

interface CacheEntry {
  language: SupportedLanguage;
  content: string;
  hash: string;
  tree: Parser.Tree;
  analysis: FileAnalysis;
}

const DEFAULT_TREE_SITTER_BUFFER_UNITS = 32 * 1024;

function parserBufferSize(content: string): number {
  // node-tree-sitter 0.21 chunks string input through a 32K UTF-16 callback
  // buffer. Its multi-chunk path can fail with `Invalid argument`, so keep
  // each supported source in one callback buffer.
  return Math.max(DEFAULT_TREE_SITTER_BUFFER_UNITS, content.length + 1);
}

export interface ParseResult {
  analysis: FileAnalysis;
  parsed: boolean;
  incremental: boolean;
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function pointAt(text: string, characterOffset: number): Parser.Point {
  const prefix = text.slice(0, characterOffset);
  const lines = prefix.split('\n');
  return {
    row: lines.length - 1,
    column: Buffer.byteLength(lines.at(-1) ?? '')
  };
}

function calculateEdit(oldText: string, newText: string): Parser.Edit {
  let prefix = 0;
  const shortest = Math.min(oldText.length, newText.length);
  while (prefix < shortest && oldText[prefix] === newText[prefix]) {
    prefix += 1;
  }
  if (
    prefix > 0 &&
    prefix < shortest &&
    oldText.charCodeAt(prefix - 1) >= 0xd800 &&
    oldText.charCodeAt(prefix - 1) <= 0xdbff
  ) {
    prefix -= 1;
  }

  let oldSuffix = oldText.length;
  let newSuffix = newText.length;
  while (
    oldSuffix > prefix &&
    newSuffix > prefix &&
    oldText[oldSuffix - 1] === newText[newSuffix - 1]
  ) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }
  if (
    oldSuffix < oldText.length &&
    newSuffix < newText.length &&
    oldText.charCodeAt(oldSuffix) >= 0xdc00 &&
    oldText.charCodeAt(oldSuffix) <= 0xdfff
  ) {
    oldSuffix += 1;
    newSuffix += 1;
  }

  const startIndex = Buffer.byteLength(oldText.slice(0, prefix));
  return {
    startIndex,
    oldEndIndex:
      startIndex + Buffer.byteLength(oldText.slice(prefix, oldSuffix)),
    newEndIndex:
      startIndex + Buffer.byteLength(newText.slice(prefix, newSuffix)),
    startPosition: pointAt(oldText, prefix),
    oldEndPosition: pointAt(oldText, oldSuffix),
    newEndPosition: pointAt(newText, newSuffix)
  };
}

export class ParserEngine {
  readonly #parsers = new Map<SupportedLanguage, Parser>();
  readonly #cache = new Map<string, CacheEntry>();

  #parser(language: SupportedLanguage): Parser {
    const existing = this.#parsers.get(language);
    if (existing) {
      return existing;
    }
    const parser = new Parser();
    parser.setLanguage(getLanguageDefinition(language).grammar);
    this.#parsers.set(language, parser);
    return parser;
  }

  analyze(
    path: string,
    language: SupportedLanguage,
    content: string
  ): ParseResult {
    const nextHash = hash(content);
    const previous = this.#cache.get(path);
    if (
      previous &&
      previous.language === language &&
      previous.hash === nextHash
    ) {
      return {
        analysis: previous.analysis,
        parsed: false,
        incremental: false
      };
    }

    const parser = this.#parser(language);
    let incremental = previous?.language === language;
    let tree: Parser.Tree;
    const options = { bufferSize: parserBufferSize(content) };
    if (incremental && previous) {
      try {
        previous.tree.edit(calculateEdit(previous.content, content));
        tree = parser.parse(content, previous.tree, options);
      } catch {
        tree = parser.parse(content, undefined, options);
        incremental = false;
      }
    } else {
      tree = parser.parse(content, undefined, options);
    }

    const analysis = analyzeTree({
      path,
      language,
      content,
      tree,
      parseMode: incremental ? 'incremental' : 'full'
    });
    this.#cache.set(path, {
      language,
      content,
      hash: nextHash,
      tree,
      analysis
    });
    return {
      analysis,
      parsed: true,
      incremental
    };
  }

  remove(path: string): void {
    this.#cache.delete(path);
  }

  has(path: string): boolean {
    return this.#cache.has(path);
  }
}
