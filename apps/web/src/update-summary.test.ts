import { describe, expect, it } from 'vitest';
import { updatePathSummary } from './update-summary.js';

describe('updatePathSummary', () => {
  it('keeps initial and incremental project updates concise', () => {
    expect(updatePathSummary([], 2)).toBe('reused cached files');
    expect(updatePathSummary(['src/a.ts'], 1)).toBe('initial snapshot · 1 file');
    expect(updatePathSummary(['src/a.ts', 'src/b.ts', 'src/c.ts'], 1)).toBe(
      'initial snapshot · 3 files'
    );
    expect(updatePathSummary(['src/a.ts'], 2)).toBe('src/a.ts');
    expect(updatePathSummary(['src/a.ts', 'src/b.ts', 'src/c.ts'], 2)).toBe(
      'src/a.ts, src/b.ts +1 more'
    );
  });
});
