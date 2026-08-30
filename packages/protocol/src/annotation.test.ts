import { describe, expect, it } from 'vitest';
import { parseAnnotationComments } from './annotation.js';
import type { CommentToken } from './types.js';

function token(line: number, text: string, indent = 0): CommentToken {
  return {
    key: String(line),
    text,
    prefix: '//',
    indent,
    startOffset: line * 20,
    endOffset: line * 20 + text.length,
    range: {
      path: 'sample.ts',
      start: { line, column: indent },
      end: { line, column: indent + text.length }
    }
  };
}

describe('parseAnnotationComments', () => {
  it('parses a function and keeps repeated fields', () => {
    const result = parseAnnotationComments([
      token(0, '@shishan function checkout'),
      token(1, '@summary Complete a checkout'),
      token(2, '@input cart'),
      token(3, '@input payment')
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0]).toMatchObject({
      kind: 'function',
      localId: 'checkout',
      summary: 'Complete a checkout',
      fields: {
        summary: ['Complete a checkout'],
        input: ['cart', 'payment']
      }
    });
  });

  it('parses an explicit detail statement span', () => {
    const result = parseAnnotationComments([
      token(4, '@shishan detail normalize-email', 2),
      token(5, '@summary Normalize and validate the address', 2),
      token(6, '@covers statements=2', 2)
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.annotations[0]?.coveredStatements).toBe(2);
  });

  it('reports invalid coverage and a missing summary', () => {
    const result = parseAnnotationComments([
      token(7, '@shishan detail bad-span'),
      token(8, '@covers statements=0')
    ]);

    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'SHISHAN105',
      'SHISHAN104'
    ]);
  });

  it('ignores ordinary comments', () => {
    const result = parseAnnotationComments([
      token(1, 'TODO: refactor this'),
      token(2, '@param value')
    ]);

    expect(result).toEqual({ annotations: [], diagnostics: [] });
  });

  it('reports repeated single-value fields', () => {
    const result = parseAnnotationComments([
      token(1, '@shishan branch choose-path'),
      token(2, '@summary Choose the primary path'),
      token(3, '@summary Choose the fallback path'),
      token(4, '@condition input is valid'),
      token(5, '@condition input is cached')
    ]);

    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'SHISHAN202',
      'SHISHAN202'
    ]);
  });
});
