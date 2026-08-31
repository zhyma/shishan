import { describe, expect, it } from 'vitest';
import { vscodeSourceUrl } from './editor-link.js';

describe('VS Code source link', () => {
  it('encodes the relative path and converts positions to one-based values', () => {
    const url = vscodeSourceUrl({
      path: 'src/order flow.ts',
      start: { line: 8, column: 3 },
      end: { line: 12, column: 1 }
    });

    expect(url).toBe(
      'vscode://zhyma.shishan-vscode/open?path=src%2Forder+flow.ts&line=9&column=4'
    );
  });
});
