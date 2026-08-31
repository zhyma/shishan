import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveExistingSourceTarget,
  resolveSourceTarget
} from './source-target.js';

describe('VS Code source target validation', () => {
  it('resolves a URL-encoded relative source path', () => {
    expect(
      resolveSourceTarget(
        '/workspace/project',
        'path=src%2Forder%20flow.ts&line=12&column=4'
      )
    ).toEqual({
      path: '/workspace/project/src/order flow.ts',
      line: 12,
      column: 4
    });
  });

  it('rejects traversal and absolute paths', () => {
    expect(
      resolveSourceTarget('/workspace/project', 'path=..%2Fsecret.ts')
    ).toBeUndefined();
    expect(
      resolveSourceTarget('/workspace/project', 'path=%2Fetc%2Fpasswd')
    ).toBeUndefined();
  });

  it('uses one-based defaults for malformed positions', () => {
    expect(resolveSourceTarget('/workspace/project', 'path=src%2Fa.ts')).toEqual(
      {
        path: '/workspace/project/src/a.ts',
        line: 1,
        column: 1
      }
    );
  });

  it('rejects a workspace symlink whose real target escapes the workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-vscode-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'shishan-vscode-outside-'));
    const secret = join(outside, 'secret.ts');
    await writeFile(secret, 'export const secret = true;\n');
    await symlink(secret, join(root, 'linked.ts'));

    await expect(
      resolveExistingSourceTarget(root, 'path=linked.ts&line=1&column=1')
    ).resolves.toBeUndefined();
  });
});
