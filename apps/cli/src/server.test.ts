import {
  mkdtemp,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateProtocolPayload } from '@shishan/protocol';
import { createShiShanServer } from './server.js';

const source = [
  '// @shishan function greet',
  '// @summary Return a greeting',
  'export function greet() {',
  '  return "hello";',
  '}',
  ''
].join('\n');

describe('ShiShan server', () => {
  it('serves a schema-valid snapshot and protected source endpoint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-server-'));
    await writeFile(join(root, 'greet.ts'), source);
    const server = await createShiShanServer({
      root,
      watch: false
    });

    const project = await server.app.inject({
      method: 'GET',
      url: '/api/project'
    });
    expect(project.statusCode).toBe(200);
    expect(validateProtocolPayload(project.json())).toMatchObject({
      valid: true
    });
    expect(project.headers['content-security-policy']).toContain(
      "default-src 'self'"
    );

    const sourceResponse = await server.app.inject({
      method: 'GET',
      url: '/api/source?path=greet.ts'
    });
    expect(sourceResponse.statusCode).toBe(200);
    expect(sourceResponse.body).toContain('Return a greeting');

    const traversal = await server.app.inject({
      method: 'GET',
      url: '/api/source?path=../../etc/passwd'
    });
    expect(traversal.statusCode).toBe(403);

    const hostileHost = await server.app.inject({
      method: 'GET',
      url: '/api/project',
      headers: { host: 'attacker.example' }
    });
    expect(hostileHost.statusCode).toBe(403);

    const hostileOrigin = await server.app.inject({
      method: 'GET',
      url: '/api/project',
      headers: { origin: 'https://attacker.example' }
    });
    expect(hostileOrigin.statusCode).toBe(403);
    await server.close();
  });

  it('returns only changed files in update patches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-server-patch-'));
    await writeFile(join(root, 'a.ts'), source);
    await writeFile(join(root, 'b.ts'), source.replaceAll('greet', 'welcome'));
    const server = await createShiShanServer({
      root,
      watch: false
    });

    await writeFile(join(root, 'a.ts'), source.replace('hello', 'hi'));
    const patch = await server.update(['a.ts']);
    expect(patch.upsertFiles.map((file) => file.path)).toEqual(['a.ts']);
    expect(JSON.stringify(patch)).not.toContain('"path":"b.ts"');
    expect(patch.metrics.lastUpdate.reusedFileCount).toBe(1);
    await server.close();
  });

  it.runIf(process.platform !== 'win32')(
    'rejects a source file replaced by an external symbolic link',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'shishan-server-link-'));
      const outside = await mkdtemp(join(tmpdir(), 'shishan-outside-'));
      const indexedPath = join(root, 'greet.ts');
      const outsidePath = join(outside, 'secret.ts');
      await writeFile(indexedPath, source);
      await writeFile(outsidePath, 'export const secret = "not-readable";\n');
      const server = await createShiShanServer({
        root,
        watch: false
      });

      await unlink(indexedPath);
      await symlink(outsidePath, indexedPath);
      const response = await server.app.inject({
        method: 'GET',
        url: '/api/source?path=greet.ts'
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Symbolic-link sources are not allowed.'
      });
      await server.close();
    }
  );
});
