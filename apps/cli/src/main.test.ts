import { execFile, spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../dist/main.js', import.meta.url));

const source = (value: number, summary = 'Return the configured value') =>
  [
    '// @shishan function read-value',
    '// @summary Read a stable numeric value',
    'export function readValue() {',
    '  // @shishan step return-value',
    '  // @summary ' + summary,
    '  return ' + value + ';',
    '}',
    ''
  ].join('\n');

async function initializeRepository(root: string): Promise<void> {
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'ShiShan Test'], {
    cwd: root
  });
  await execFileAsync('git', ['config', 'user.email', 'test@shishan.local'], {
    cwd: root
  });
  await execFileAsync('git', ['add', 'value.ts'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'baseline'], { cwd: root });
}

function runCli(arguments_: readonly string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  message: string;
  signal?: NodeJS.Signals;
}> {
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    TMPDIR: process.env.TMPDIR
  };
  return new Promise((resolvePromise) => {
    const child = spawn(
      process.execPath,
      [cliPath, ...arguments_],
      { env: environment, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolvePromise({ code: 1, stdout, stderr, message: error.message });
    });
    child.on('close', (code, signal) => {
      resolvePromise({
        code: code ?? 1,
        stdout,
        stderr,
        message: '',
        ...(signal ? { signal } : {})
      });
    });
  });
}

describe('ShiShan CLI freshness', () => {
  it('makes strict check fail until a changed implementation narrative is updated', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-cli-freshness-'));
    const path = join(root, 'value.ts');
    await writeFile(path, source(1));
    await initializeRepository(root);
    await writeFile(path, source(2));

    expect(await runCli(['check', root, '--strict'])).toMatchObject({
      code: 1,
      stdout: expect.stringContaining('SHISHAN501')
    });

    await writeFile(path, source(2, 'Return the recalculated configured value'));
    const checked = await runCli(['check', root, '--strict']);
    expect(checked.code).toBe(0);
    expect(checked.stdout).toContain('0 errors, 0 warnings');
  });

  it('requires a value for an explicit Git baseline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-cli-base-'));
    const result = await runCli(['check', root, '--base']);
    expect(result.signal).toBeUndefined();
    expect(result).toMatchObject({
      code: 1,
      stderr: expect.stringContaining('--base requires a Git revision')
    });
  });
});
