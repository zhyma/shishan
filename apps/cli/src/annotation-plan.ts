import { createHash, randomBytes } from 'node:crypto';
import {
  chmod,
  link,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { ParserEngine, ProjectIndex } from '@shishan/core';
import type {
  NarrativeFields,
  SourceRange,
  SupportedLanguage
} from '@shishan/protocol';

export const ANNOTATION_PLAN_VERSION = 'shishan/annotation-plan/v1' as const;
export const DEFAULT_ANNOTATION_PLAN = '.shishan/annotation-plan.json';
const MAX_PLAN_BYTES = 10 * 1024 * 1024;
const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REVIEW_FIELDS = new Set(['input', 'output', 'effect', 'note']);
const SUPPORTED_LANGUAGES = new Set<SupportedLanguage>([
  'python',
  'cpp',
  'typescript',
  'tsx',
  'javascript',
  'jsx'
]);

export type AnnotationReviewStatus = 'draft' | 'approved' | 'skipped';

export interface AnnotationCandidate {
  id: string;
  functionName: string;
  source: SourceRange;
  insertionLine: number;
  signature: string;
  status: AnnotationReviewStatus;
  summary: string | null;
  fields: NarrativeFields;
}

export interface AnnotationPlanFile {
  path: string;
  language: SupportedLanguage;
  contentHash: string;
  candidates: AnnotationCandidate[];
}

export interface AnnotationPlan {
  schemaVersion: typeof ANNOTATION_PLAN_VERSION;
  rootName: string;
  generatedAt: string;
  files: AnnotationPlanFile[];
}

export interface AnnotationApplyResult {
  reviewed: number;
  approved: number;
  files: number;
  written: boolean;
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function projectPath(root: string, requested: string): string {
  if (!requested || isAbsolute(requested)) {
    throw new Error('Annotation plan paths must be relative to the project root.');
  }
  const absolute = resolve(root, requested);
  const relation = relative(root, absolute);
  if (!relation || relation === '..' || relation.startsWith('..' + sep)) {
    throw new Error('Annotation plan path escapes the project root: ' + requested);
  }
  return absolute;
}

function isInside(root: string, target: string): boolean {
  const relation = relative(root, target);
  return (
    Boolean(relation) &&
    relation !== '..' &&
    !relation.startsWith('..' + sep) &&
    !isAbsolute(relation)
  );
}

async function existingProjectPath(
  root: string,
  requested: string
): Promise<string> {
  const lexical = projectPath(root, requested);
  const [realRoot, realTarget] = await Promise.all([
    realpath(root),
    realpath(lexical)
  ]);
  if (!isInside(realRoot, realTarget)) {
    throw new Error(
      'Annotation plan path resolves outside the project root: ' + requested
    );
  }
  return realTarget;
}

async function outputProjectPath(
  root: string,
  requested: string
): Promise<string> {
  const lexical = projectPath(root, requested);
  const realRoot = await realpath(root);
  let ancestor = dirname(lexical);
  while (true) {
    try {
      const realAncestor = await realpath(ancestor);
      if (realAncestor !== realRoot && !isInside(realRoot, realAncestor)) {
        throw new Error(
          'Annotation plan output resolves outside the project root: ' + requested
        );
      }
      break;
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String(error.code)
          : '';
      if (code !== 'ENOENT') {
        throw error;
      }
      const parent = dirname(ancestor);
      if (parent === ancestor) {
        throw error;
      }
      ancestor = parent;
    }
  }
  try {
    const realTarget = await realpath(lexical);
    if (!isInside(realRoot, realTarget)) {
      throw new Error(
        'Annotation plan output resolves outside the project root: ' + requested
      );
    }
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : '';
    if (code !== 'ENOENT') {
      throw error;
    }
  }
  return lexical;
}

function slug(value: string, line: number): string {
  const separated = value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return /^[a-z]/.test(separated) ? separated : 'function-' + line;
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = base + '-' + suffix;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function leadingWhitespace(value: string): string {
  return /^\s*/.exec(value)?.[0] ?? '';
}

function insertionIndex(
  lines: readonly string[],
  functionLine: number,
  language: SupportedLanguage
): number {
  let index = functionLine;
  const indent = leadingWhitespace(lines[functionLine] ?? '');
  while (index > 0) {
    const previous = lines[index - 1] ?? '';
    const trimmed = previous.trim();
    if (
      leadingWhitespace(previous) === indent &&
      (trimmed.startsWith('@') || trimmed.startsWith('[['))
    ) {
      index -= 1;
      continue;
    }
    break;
  }

  if (language === 'cpp' && index > 0) {
    const lowerBound = Math.max(0, index - 8);
    for (let probe = index - 1; probe >= lowerBound; probe -= 1) {
      const line = lines[probe] ?? '';
      if (leadingWhitespace(line) !== indent) {
        break;
      }
      if (line.trim().startsWith('template')) {
        index = probe;
        break;
      }
      if (
        !line.trim() ||
        line.trim().startsWith('//') ||
        /[;{}]/u.test(line)
      ) {
        break;
      }
    }
  }
  return index;
}

// @shishan function create-annotation-plan
// @summary Inventory un-narrated functions without inventing business intent
// @input project root
// @output draft review plan
export async function createAnnotationPlan(root: string): Promise<AnnotationPlan> {
  const index = await ProjectIndex.create(root);
  const snapshot = await index.initialize();
  const files: AnnotationPlanFile[] = [];

  for (const analysis of snapshot.files) {
    const missing = analysis.symbols.filter((symbol) => !symbol.narrativeId);
    if (missing.length === 0) {
      continue;
    }
    const content = await readFile(
      await existingProjectPath(root, analysis.path),
      'utf8'
    );
    const lines = content.split(/\r?\n/);
    const used = new Set(analysis.functions.map((item) => item.localId));
    const candidates = missing.map((symbol) => {
      const targetIndex = insertionIndex(
        lines,
        symbol.source.start.line,
        analysis.language
      );
      return {
        id: uniqueId(
          slug(symbol.name, symbol.source.start.line + 1),
          used
        ),
        functionName: symbol.name,
        source: symbol.source,
        insertionLine: targetIndex + 1,
        signature: (lines[symbol.source.start.line] ?? '').trim().slice(0, 240),
        status: 'draft' as const,
        summary: null,
        fields: {}
      };
    });
    files.push({
      path: analysis.path,
      language: analysis.language,
      contentHash: analysis.contentHash,
      candidates
    });
  }

  return {
    schemaVersion: ANNOTATION_PLAN_VERSION,
    rootName: snapshot.rootName,
    generatedAt: new Date().toISOString(),
    files
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateFields(value: unknown): value is NarrativeFields {
  return (
    object(value) &&
    Object.entries(value).every(
      ([key, values]) =>
        REVIEW_FIELDS.has(key) &&
        Array.isArray(values) &&
        values.every((item) => typeof item === 'string')
    )
  );
}

function validateRange(value: unknown): value is SourceRange {
  if (!object(value) || typeof value.path !== 'string') {
    return false;
  }
  for (const position of [value.start, value.end]) {
    if (
      !object(position) ||
      !Number.isSafeInteger(position.line) ||
      Number(position.line) < 0 ||
      !Number.isSafeInteger(position.column) ||
      Number(position.column) < 0
    ) {
      return false;
    }
  }
  return true;
}

function validateCandidate(value: unknown): value is AnnotationCandidate {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    typeof value.functionName === 'string' &&
    validateRange(value.source) &&
    typeof value.insertionLine === 'number' &&
    Number.isSafeInteger(value.insertionLine) &&
    value.insertionLine > 0 &&
    typeof value.signature === 'string' &&
    typeof value.status === 'string' &&
    ['draft', 'approved', 'skipped'].includes(value.status) &&
    (value.summary === null || typeof value.summary === 'string') &&
    validateFields(value.fields)
  );
}

function validatePlan(value: unknown): value is AnnotationPlan {
  return (
    object(value) &&
    value.schemaVersion === ANNOTATION_PLAN_VERSION &&
    typeof value.rootName === 'string' &&
    typeof value.generatedAt === 'string' &&
    Array.isArray(value.files) &&
    value.files.every(
      (file) =>
        object(file) &&
        typeof file.path === 'string' &&
        typeof file.language === 'string' &&
        SUPPORTED_LANGUAGES.has(file.language as SupportedLanguage) &&
        typeof file.contentHash === 'string' &&
        Array.isArray(file.candidates) &&
        file.candidates.every(validateCandidate)
    )
  );
}

async function atomicWrite(
  path: string,
  content: string,
  mode?: number
): Promise<void> {
  const temporary =
    resolve(
      dirname(path),
      '.' +
        basename(path) +
        '.shishan-' +
        process.pid +
        '-' +
        randomBytes(6).toString('hex') +
        '.tmp'
    );
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    if (mode !== undefined) {
      await chmod(temporary, mode);
    }
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function atomicCreate(path: string, content: string): Promise<void> {
  const temporary = resolve(
    dirname(path),
    '.' +
      basename(path) +
      '.shishan-' +
      process.pid +
      '-' +
      randomBytes(6).toString('hex') +
      '.tmp'
  );
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await link(temporary, path);
    await unlink(temporary);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function writeAnnotationPlan(
  root: string,
  requestedPath: string,
  plan: AnnotationPlan
): Promise<string> {
  if (!validatePlan(plan)) {
    throw new Error('Invalid annotation plan structure.');
  }
  const path = await outputProjectPath(root, requestedPath);
  await mkdir(dirname(path), { recursive: true });
  try {
    await atomicCreate(path, JSON.stringify(plan, null, 2) + '\n');
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : '';
    if (code === 'EEXIST') {
      throw new Error(
        'Annotation plan already exists at ' +
          requestedPath +
          '; move or remove it explicitly before generating a replacement.'
      );
    }
    throw error;
  }
  return path;
}

export async function readAnnotationPlan(
  root: string,
  requestedPath: string
): Promise<AnnotationPlan> {
  const path = await existingProjectPath(root, requestedPath);
  const info = await stat(path);
  if (info.size > MAX_PLAN_BYTES) {
    throw new Error('Annotation plan exceeds the 10 MiB safety limit.');
  }
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!validatePlan(parsed)) {
    throw new Error(
      'Invalid annotation plan. Keep the generated structure and use draft, approved, or skipped status values.'
    );
  }
  return parsed;
}

function approvedSummary(candidate: AnnotationCandidate): string {
  const summary = candidate.summary?.trim() ?? '';
  if (!summary || summary.length > 400 || /[\r\n]/u.test(summary)) {
    throw new Error(
      'Approved annotation ' + candidate.id + ' needs a 1–400 character summary.'
    );
  }
  if (/\b(?:todo|tbd|placeholder)\b|待补|稍后补/iu.test(summary)) {
    throw new Error(
      'Approved annotation ' + candidate.id + ' still contains placeholder text.'
    );
  }
  return summary;
}

function annotationLines(
  candidate: AnnotationCandidate,
  language: SupportedLanguage,
  indent: string
): string[] {
  const prefix = language === 'python' ? '#' : '//';
  const lines = [
    indent + prefix + ' @shishan function ' + candidate.id,
    indent + prefix + ' @summary ' + approvedSummary(candidate)
  ];
  for (const [field, values] of Object.entries(candidate.fields)) {
    for (const value of values) {
      const normalized = value.trim();
      if (normalized.length > 400 || /[\r\n]/u.test(normalized)) {
        throw new Error(
          'Field @' + field + ' on ' + candidate.id + ' must be one line and at most 400 characters.'
        );
      }
      if (normalized) {
        lines.push(indent + prefix + ' @' + field + ' ' + normalized);
      }
    }
  }
  return lines;
}

interface PreparedWrite {
  path: string;
  content: string;
  mode: number;
}

// @shishan function apply-annotation-plan
// @summary Validate every approved review before atomically replacing source files
// @input project root
// @input reviewed plan
// @output dry-run or write summary
export async function applyAnnotationPlan(
  root: string,
  plan: AnnotationPlan,
  write: boolean
): Promise<AnnotationApplyResult> {
  if (!validatePlan(plan)) {
    throw new Error('Invalid annotation plan structure.');
  }
  const planPaths = new Set<string>();
  for (const file of plan.files) {
    if (planPaths.has(file.path)) {
      throw new Error('Annotation plan contains a duplicate file: ' + file.path);
    }
    planPaths.add(file.path);
  }
  const approved = plan.files.flatMap((file) =>
    file.candidates
      .filter((candidate) => candidate.status === 'approved')
      .map((candidate) => ({ file, candidate }))
  );
  const reviewed = plan.files.reduce(
    (total, file) =>
      total + file.candidates.filter((item) => item.status !== 'draft').length,
    0
  );
  const index = await ProjectIndex.create(root);
  const snapshot = await index.initialize();
  const analysisByPath = new Map(snapshot.files.map((file) => [file.path, file]));
  const prepared: PreparedWrite[] = [];
  const parser = new ParserEngine();

  for (const file of plan.files) {
    const selected = file.candidates.filter(
      (candidate) => candidate.status === 'approved'
    );
    if (selected.length === 0) {
      continue;
    }
    const path = await existingProjectPath(root, file.path);
    const [content, info] = await Promise.all([
      readFile(path, 'utf8'),
      stat(path)
    ]);
    if (hash(content) !== file.contentHash) {
      throw new Error(
        'Source changed after the plan was generated: ' +
          file.path +
          '. Generate a new plan before applying.'
      );
    }
    const analysis = analysisByPath.get(file.path);
    if (!analysis || analysis.language !== file.language) {
      throw new Error('Source is no longer analyzable as planned: ' + file.path);
    }
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r?\n/);
    const ids = new Set<string>();
    for (const candidate of selected) {
      if (
        !ID_RE.test(candidate.id) ||
        ids.has(candidate.id) ||
        analysis.functions.some((item) => item.localId === candidate.id)
      ) {
        throw new Error(
          'Approved annotation has an invalid or duplicate id: ' + candidate.id
        );
      }
      ids.add(candidate.id);
      approvedSummary(candidate);
      const symbol = analysis.symbols.find(
        (item) =>
          item.name === candidate.functionName &&
          item.source.start.line === candidate.source.start.line
      );
      if (!symbol || symbol.narrativeId) {
        throw new Error(
          'Function moved or already has a narrative: ' +
            file.path +
            '#' +
            candidate.functionName
        );
      }
      const expectedLine = insertionIndex(
        lines,
        symbol.source.start.line,
        file.language
      ) + 1;
      const signature = (lines[symbol.source.start.line] ?? '')
        .trim()
        .slice(0, 240);
      if (
        candidate.insertionLine !== expectedLine ||
        candidate.signature !== signature ||
        candidate.source.path !== file.path
      ) {
        throw new Error(
          'Generated source location was edited for annotation ' +
            candidate.id +
            '. Generate a new plan instead of moving insertion lines by hand.'
        );
      }
    }

    for (const candidate of [...selected].sort(
      (left, right) => right.insertionLine - left.insertionLine
    )) {
      const targetIndex = candidate.insertionLine - 1;
      if (targetIndex < 0 || targetIndex >= lines.length) {
        throw new Error(
          'Invalid insertion line for annotation ' + candidate.id + '.'
        );
      }
      const indent = leadingWhitespace(lines[targetIndex] ?? '');
      lines.splice(
        targetIndex,
        0,
        ...annotationLines(candidate, file.language, indent)
      );
    }
    const nextContent = lines.join(eol);
    const verification = parser.analyze(
      file.path,
      file.language,
      nextContent
    ).analysis;
    if (
      verification.syntaxError ||
      selected.some(
        (candidate) =>
          !verification.functions.some((item) => item.localId === candidate.id)
      )
    ) {
      throw new Error(
        'Generated annotations did not bind cleanly in ' +
          file.path +
          '; no source files were changed.'
      );
    }
    prepared.push({
      path,
      content: nextContent,
      mode: info.mode
    });
  }

  if (write) {
    for (const item of prepared) {
      await atomicWrite(item.path, item.content, item.mode);
    }
  }
  return {
    reviewed,
    approved: approved.length,
    files: prepared.length,
    written: write
  };
}
