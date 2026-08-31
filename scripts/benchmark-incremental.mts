import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectIndex } from '@shishan/core';

function source(index: number, value: number): string {
  return [
    '// @shishan function module-' + index,
    '// @summary Return the value for module ' + index,
    'export function module' + index + '() {',
    '  // @shishan step return-value',
    '  // @summary Return the configured numeric value',
    '  return ' + value + ';',
    '}',
    ''
  ].join('\n');
}

function fileCount(): number {
  const argument = process.argv.find((item) => item.startsWith('--files='));
  const parsed = argument
    ? Number.parseInt(argument.slice('--files='.length), 10)
    : 250;
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 5_000) {
    throw new Error('--files must be an integer from 2 to 5000.');
  }
  return parsed;
}

const count = fileCount();
const root = await mkdtemp(join(tmpdir(), 'shishan-benchmark-'));

try {
  for (let index = 0; index < count; index += 1) {
    await writeFile(join(root, 'module-' + index + '.ts'), source(index, index));
  }

  const project = await ProjectIndex.create(root);
  const initialStarted = performance.now();
  const initial = await project.initialize();
  const initialDurationMs = performance.now() - initialStarted;
  const untouched = project.file('module-1.ts');

  await writeFile(join(root, 'module-0.ts'), source(0, count + 1));
  const updateStarted = performance.now();
  const patch = await project.updatePaths(['module-0.ts']);
  const updateDurationMs = performance.now() - updateStarted;

  if (
    patch.metrics.lastUpdate.parsedPaths.length !== 1 ||
    patch.metrics.lastUpdate.parsedPaths[0] !== 'module-0.ts'
  ) {
    throw new Error(
      'Incremental invariant failed: more than one file was parsed.'
    );
  }
  if (project.file('module-1.ts') !== untouched) {
    throw new Error(
      'Incremental invariant failed: an untouched file object changed.'
    );
  }
  if (patch.upsertFiles.length !== 1 || patch.removedFiles.length !== 0) {
    throw new Error('Patch invariant failed: patch includes unrelated files.');
  }

  const snapshotBytes = Buffer.byteLength(JSON.stringify(initial));
  const patchBytes = Buffer.byteLength(JSON.stringify(patch));
  console.log(
    JSON.stringify(
      {
        files: count,
        initialDurationMs: Math.round(initialDurationMs * 100) / 100,
        updateDurationMs: Math.round(updateDurationMs * 100) / 100,
        parsedOnUpdate: patch.metrics.lastUpdate.parsedPaths,
        reusedFiles: patch.metrics.lastUpdate.reusedFileCount,
        snapshotBytes,
        patchBytes,
        patchToSnapshotPercent:
          Math.round((patchBytes / snapshotBytes) * 10_000) / 100
      },
      null,
      2
    )
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
