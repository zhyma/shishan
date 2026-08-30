import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportStaticSite } from './static-export.js';

const source = [
  '// @shishan function greet',
  '// @summary Return a greeting',
  'export function greet() {',
  '  return "hello";',
  '}',
  ''
].join('\n');

async function makeWebRoot(root: string): Promise<string> {
  const webRoot = join(root, 'web');
  await mkdir(join(webRoot, 'assets'), { recursive: true });
  await writeFile(
    join(webRoot, 'index.html'),
    '<!doctype html><html><head><title>ShiShan</title><script type="module" src="./assets/app.js"></script></head><body></body></html>'
  );
  await writeFile(join(webRoot, 'assets', 'app.js'), 'export {};\n');
  return webRoot;
}

function payloadFromScript(script: string): {
  snapshot: { files: Array<{ path: string }> };
  sources?: Record<string, string>;
} {
  const prefix = 'globalThis.__SHISHAN_STATIC__ = ';
  expect(script.startsWith(prefix)).toBe(true);
  return JSON.parse(script.slice(prefix.length, -2)) as {
    snapshot: { files: Array<{ path: string }> };
    sources?: Record<string, string>;
  };
}

describe('static site export', () => {
  it('creates an offline site without exposing source by default', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'shishan-static-'));
    const project = join(temporary, 'project');
    await mkdir(project);
    await writeFile(join(project, 'greet.ts'), source);
    const webRoot = await makeWebRoot(temporary);
    const output = join(temporary, 'site');

    const result = await exportStaticSite({
      root: project,
      output,
      webRoot,
      freshnessBase: false
    });

    expect(result).toMatchObject({ files: 1, includedSources: 0, sourceBytes: 0 });
    expect(result.payloadBytes).toBeGreaterThan(0);
    expect(await readFile(join(output, 'index.html'), 'utf8')).toContain(
      './shishan-data.js'
    );
    expect(await readFile(join(output, 'assets', 'app.js'), 'utf8')).toContain(
      'export'
    );
    const payload = payloadFromScript(
      await readFile(join(output, 'shishan-data.js'), 'utf8')
    );
    expect(payload.snapshot.files.map((file) => file.path)).toEqual([
      'greet.ts'
    ]);
    expect(payload.sources).toBeUndefined();

    await expect(
      exportStaticSite({
        root: project,
        output,
        webRoot,
        freshnessBase: false
      })
    ).rejects.toThrow('already exists');
  });

  it('includes indexed source only when explicitly requested', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'shishan-static-source-'));
    const project = join(temporary, 'project');
    await mkdir(project);
    await writeFile(join(project, 'greet.ts'), source);
    const webRoot = await makeWebRoot(temporary);
    const output = join(temporary, 'site');

    const result = await exportStaticSite({
      root: project,
      output,
      webRoot,
      includeSource: true,
      freshnessBase: false
    });
    const payload = payloadFromScript(
      await readFile(join(output, 'shishan-data.js'), 'utf8')
    );

    expect(result.includedSources).toBe(1);
    expect(result.sourceBytes).toBe(Buffer.byteLength(source));
    expect(payload.sources).toEqual({ 'greet.ts': source });
  });
});
