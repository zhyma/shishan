import { mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateProtocolPayload,
  type FileAnalysis,
  type NarrativeNode
} from '@shishan/protocol';
import { MAX_SOURCE_BYTES } from './config.js';
import { ProjectIndex } from './project-index.js';

const fixtureRoot = fileURLToPath(
  new URL('../../../fixtures/polyglot', import.meta.url)
);
const goldenPath = fileURLToPath(
  new URL('../../../fixtures/golden/polyglot.json', import.meta.url)
);

function projectNode(node: NarrativeNode): object {
  return {
    localId: node.localId,
    ...(node.name ? { name: node.name } : {}),
    kind: node.kind,
    children: node.children.map(projectNode),
    details: node.details.map((detail) => ({
      localId: detail.localId,
      coveredStatements: detail.coveredStatements
    }))
  };
}

function projectFile(file: FileAnalysis): object {
  return {
    path: file.path,
    language: file.language,
    coverage: file.coverage,
    functions: file.functions.map(projectNode),
    diagnosticCodes: file.diagnostics.map((diagnostic) => diagnostic.code)
  };
}

const simpleTs = (value: number): string =>
  [
    '// @shishan function read-value',
    '// @summary Read a stable numeric value',
    'export function readValue() {',
    '  // @shishan step return-value',
    '  // @summary Return the configured value',
    '  return ' + value + ';',
    '}',
    ''
  ].join('\n');

describe('ProjectIndex', () => {
  it('matches the cross-language golden IR and validates its schema', async () => {
    const index = await ProjectIndex.create(fixtureRoot);
    const snapshot = await index.initialize();
    const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as object;

    expect(snapshot.files.map(projectFile)).toEqual(golden);
    expect(validateProtocolPayload(snapshot)).toEqual({
      valid: true,
      errors: []
    });
    expect(snapshot.coverage).toMatchObject({
      files: 6,
      filesWithNarratives: 6,
      totalFunctions: 6,
      narratedFunctions: 6,
      percent: 100
    });
  });

  it('updates only a changed file and reuses untouched file objects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-incremental-'));
    await writeFile(join(root, 'a.ts'), simpleTs(1));
    await writeFile(join(root, 'b.ts'), simpleTs(2).replaceAll('read-value', 'read-other'));
    const index = await ProjectIndex.create(root);
    const initial = await index.initialize();
    const untouched = index.file('b.ts');

    await writeFile(join(root, 'a.ts'), simpleTs(3));
    const patch = await index.updatePaths(['a.ts']);

    expect(patch.upsertFiles.map((file) => file.path)).toEqual(['a.ts']);
    expect(patch.removedFiles).toEqual([]);
    expect(patch.metrics.lastUpdate).toMatchObject({
      requestedPaths: ['a.ts'],
      parsedPaths: ['a.ts'],
      unchangedPaths: [],
      reusedFileCount: 1
    });
    expect(patch.upsertFiles[0]?.parseMode).toBe('incremental');
    expect(index.file('b.ts')).toBe(untouched);
    expect(patch.generation).toBe(initial.generation + 1);

    const unchanged = await index.updatePaths(['a.ts']);
    expect(unchanged.upsertFiles).toEqual([]);
    expect(unchanged.metrics.lastUpdate.parsedPaths).toEqual([]);
    expect(unchanged.metrics.lastUpdate.unchangedPaths).toEqual(['a.ts']);
    expect(unchanged.generation).toBe(patch.generation);

    await unlink(join(root, 'b.ts'));
    const removed = await index.updatePaths(['b.ts']);
    expect(removed.removedFiles).toEqual(['b.ts']);
    expect(index.file('b.ts')).toBeUndefined();
  });

  it('does not parse files above the resource safety limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-limit-'));
    await writeFile(join(root, 'large.js'), 'x'.repeat(MAX_SOURCE_BYTES + 1));
    const index = await ProjectIndex.create(root);
    const snapshot = await index.initialize();

    expect(snapshot.files[0]?.diagnostics[0]?.code).toBe('SHISHAN002');
    expect(snapshot.metrics.totalParseOperations).toBe(0);
  });

  it('rejects source paths outside the project root', async () => {
    const index = await ProjectIndex.create(fixtureRoot);
    expect(index.sourcePath('../order.py')).toBeUndefined();
    expect(index.sourcePath('/etc/passwd')).toBeUndefined();
  });

  it('uses the same include and exclude policy for live updates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-policy-'));
    await writeFile(
      join(root, '.shishanrc.json'),
      JSON.stringify({
        include: ['**/*.ts'],
        exclude: ['**/ignored*.ts']
      })
    );
    await writeFile(join(root, 'kept.ts'), simpleTs(1));
    await writeFile(join(root, 'ignored.ts'), simpleTs(2));
    const index = await ProjectIndex.create(root);
    const snapshot = await index.initialize();
    expect(snapshot.files.map((item) => item.path)).toEqual(['kept.ts']);

    await writeFile(join(root, 'ignored-new.ts'), simpleTs(3));
    const patch = await index.updatePaths(['ignored-new.ts']);
    expect(patch.upsertFiles).toEqual([]);
    expect(patch.metrics.lastUpdate.requestedPaths).toEqual([]);
    expect(index.sourcePath('ignored-new.ts')).toBeUndefined();
  });

  it('keeps UTF-8 byte positions valid during incremental emoji edits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-unicode-'));
    const unicodeSource = (emoji: string): string =>
      simpleTs(1).replace('return 1;', 'return "' + emoji + '";');
    await writeFile(join(root, 'unicode.ts'), unicodeSource('😀'));
    const index = await ProjectIndex.create(root);
    await index.initialize();

    await writeFile(join(root, 'unicode.ts'), unicodeSource('😁'));
    const patch = await index.updatePaths(['unicode.ts']);
    expect(patch.upsertFiles[0]).toMatchObject({
      path: 'unicode.ts',
      parseMode: 'incremental',
      syntaxError: false
    });
  });

  it('diagnoses duplicate targets and ids without emitting duplicate IR ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-duplicates-'));
    const duplicateSource = [
      '// @shishan function inspect-value',
      '// @summary Inspect a numeric value',
      'export function inspectValue(value: number) {',
      '  // @shishan step evaluate-value',
      '  // @summary Evaluate the value as one workflow step',
      '  // @shishan branch choose-value',
      '  // @summary Choose a path from the value',
      '  if (value > 0) {',
      '    return value;',
      '  }',
      '  // @shishan detail repeated-detail',
      '  // @summary Prepare the fallback',
      '  const fallback = 0;',
      '  // @shishan detail repeated-detail',
      '  // @summary Return the fallback',
      '  return fallback;',
      '}',
      ''
    ].join('\n');
    await writeFile(join(root, 'duplicate.ts'), duplicateSource);
    const index = await ProjectIndex.create(root);
    const snapshot = await index.initialize();
    const analysis = snapshot.files[0];

    expect(analysis?.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['SHISHAN305', 'SHISHAN306'])
    );
    expect(analysis?.functions[0]?.children).toHaveLength(1);
    expect(analysis?.functions[0]?.details).toHaveLength(1);
  });
});
