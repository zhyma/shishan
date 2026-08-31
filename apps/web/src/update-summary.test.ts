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

  it('renders Chinese update labels without changing source paths', () => {
    expect(updatePathSummary([], 2, 'zh-CN')).toBe('复用缓存文件');
    expect(updatePathSummary(['src/入口.ts'], 1, 'zh-CN')).toBe(
      '初始快照 · 1 个文件'
    );
    expect(
      updatePathSummary(['src/a.ts', 'src/b.ts', 'src/c.ts'], 2, 'zh-CN')
    ).toBe('src/a.ts, src/b.ts，另有 1 个');
  });
});
