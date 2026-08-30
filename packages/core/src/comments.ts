import type Parser from 'tree-sitter';
import type { CommentToken, SourceRange } from '@shishan/protocol';

function sourceRange(
  path: string,
  line: number,
  column: number,
  text: string
): SourceRange {
  return {
    path,
    start: { line, column },
    end: { line, column: column + text.length }
  };
}

function stripLineComment(line: string): {
  text: string;
  prefix: string;
  contentColumn: number;
} {
  const leading = /^\s*/.exec(line)?.[0].length ?? 0;
  const trimmed = line.slice(leading);
  if (trimmed.startsWith('//')) {
    const after = trimmed.slice(2);
    const padding = /^\s?/.exec(after)?.[0].length ?? 0;
    return {
      text: after.slice(padding),
      prefix: '//',
      contentColumn: leading + 2 + padding
    };
  }
  if (trimmed.startsWith('#')) {
    const after = trimmed.slice(1);
    const padding = /^\s?/.exec(after)?.[0].length ?? 0;
    return {
      text: after.slice(padding),
      prefix: '#',
      contentColumn: leading + 1 + padding
    };
  }

  let body = trimmed;
  if (body.startsWith('/*')) {
    body = body.slice(2);
  }
  if (body.endsWith('*/')) {
    body = body.slice(0, -2);
  }
  const star = /^\s*\*?\s?/.exec(body)?.[0].length ?? 0;
  return {
    text: body.slice(star),
    prefix: '/*',
    contentColumn: leading + star
  };
}

function collectCommentNodes(root: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const comments: Parser.SyntaxNode[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if (node.type === 'comment') {
      comments.push(node);
      continue;
    }
    for (let index = node.namedChildren.length - 1; index >= 0; index -= 1) {
      const child = node.namedChildren[index];
      if (child) {
        stack.push(child);
      }
    }
  }
  return comments.sort((left, right) => left.startIndex - right.startIndex);
}

export function extractCommentTokens(
  root: Parser.SyntaxNode,
  path: string
): CommentToken[] {
  const tokens: CommentToken[] = [];

  for (const node of collectCommentNodes(root)) {
    const lines = node.text.split(/\r?\n/);
    let byteOffset = node.startIndex;
    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index] ?? '';
      const stripped = stripLineComment(rawLine);
      const line = node.startPosition.row + index;
      const baseColumn = index === 0 ? node.startPosition.column : 0;
      const column = baseColumn + stripped.contentColumn;
      const lineBytes = Buffer.byteLength(rawLine);
      tokens.push({
        key: path + ':' + node.startIndex + ':' + index,
        text: stripped.text,
        prefix: stripped.prefix,
        indent: node.startPosition.column,
        startOffset: byteOffset,
        endOffset: byteOffset + lineBytes,
        range: sourceRange(path, line, column, stripped.text)
      });
      byteOffset += lineBytes + 1;
    }
  }

  return tokens;
}
