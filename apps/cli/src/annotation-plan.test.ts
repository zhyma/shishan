import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectIndex } from '@shishan/core';
import {
  applyAnnotationPlan,
  createAnnotationPlan,
  writeAnnotationPlan
} from './annotation-plan.js';

const typescriptSource = [
  'export function readValue(value: number) {',
  '  return value;',
  '}',
  '',
  'export async function storeValue(client: Client, value: number) {',
  '  return await client.store(value);',
  '}',
  ''
].join('\n');

const pythonSource = [
  '@trace',
  'def normalize_value(value):',
  '    return str(value).strip()',
  ''
].join('\n');

function approveAll(plan: Awaited<ReturnType<typeof createAnnotationPlan>>): void {
  for (const file of plan.files) {
    for (const candidate of file.candidates) {
      candidate.status = 'approved';
      candidate.summary = 'Explain the behavior of ' + candidate.functionName;
    }
  }
}

describe('review-gated annotation plans', () => {
  it('keeps generated intent blank and performs a no-write dry run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-plan-dry-'));
    const path = join(root, 'workflow.ts');
    await writeFile(path, typescriptSource);
    const plan = await createAnnotationPlan(root);

    expect(plan.files[0]?.candidates).toHaveLength(2);
    expect(plan.files[0]?.candidates[0]).toMatchObject({
      id: 'read-value',
      status: 'draft',
      summary: null
    });
    approveAll(plan);
    const result = await applyAnnotationPlan(root, plan, false);

    expect(result).toEqual({
      reviewed: 2,
      approved: 2,
      files: 1,
      written: false
    });
    expect(await readFile(path, 'utf8')).toBe(typescriptSource);
  });

  it('writes only approved summaries and verifies that they bind', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-plan-write-'));
    const path = join(root, 'workflow.py');
    await writeFile(path, pythonSource);
    const plan = await createAnnotationPlan(root);
    approveAll(plan);

    await applyAnnotationPlan(root, plan, true);
    const content = await readFile(path, 'utf8');
    expect(content).toContain(
      '# @shishan function normalize-value\n' +
        '# @summary Explain the behavior of normalize_value\n' +
        '@trace'
    );
    const index = await ProjectIndex.create(root);
    const snapshot = await index.initialize();
    expect(snapshot.coverage).toMatchObject({
      totalFunctions: 1,
      narratedFunctions: 1,
      percent: 100
    });
  });

  it('prevalidates every file so stale source causes no partial writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-plan-stale-'));
    const tsPath = join(root, 'workflow.ts');
    const pyPath = join(root, 'workflow.py');
    await writeFile(tsPath, typescriptSource);
    await writeFile(pyPath, pythonSource);
    const plan = await createAnnotationPlan(root);
    approveAll(plan);
    await writeFile(pyPath, pythonSource + '\n# changed after review\n');

    await expect(applyAnnotationPlan(root, plan, true)).rejects.toThrow(
      'Source changed after the plan was generated'
    );
    expect(await readFile(tsPath, 'utf8')).toBe(typescriptSource);
  });

  it('rejects edited insertion coordinates and multiline field injection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-plan-tamper-'));
    await writeFile(join(root, 'workflow.ts'), typescriptSource);
    const moved = await createAnnotationPlan(root);
    approveAll(moved);
    moved.files[0]!.candidates[0]!.insertionLine += 1;
    await expect(applyAnnotationPlan(root, moved, false)).rejects.toThrow(
      'Generated source location was edited'
    );

    const injected = await createAnnotationPlan(root);
    approveAll(injected);
    injected.files[0]!.candidates[0]!.fields.note = [
      'safe\n// @shishan function injected'
    ];
    await expect(applyAnnotationPlan(root, injected, false)).rejects.toThrow(
      'must be one line'
    );
  });

  it('rejects an output directory symlink that escapes the project root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-plan-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'shishan-plan-outside-'));
    await writeFile(join(root, 'workflow.ts'), typescriptSource);
    await symlink(outside, join(root, '.shishan'));
    const plan = await createAnnotationPlan(root);

    await expect(
      writeAnnotationPlan(root, '.shishan/annotation-plan.json', plan)
    ).rejects.toThrow('outside the project root');
    await expect(
      readFile(join(outside, 'annotation-plan.json'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not overwrite an existing review plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-plan-existing-'));
    await writeFile(join(root, 'workflow.ts'), typescriptSource);
    const plan = await createAnnotationPlan(root);
    await writeAnnotationPlan(root, '.shishan/annotation-plan.json', plan);

    await expect(
      writeAnnotationPlan(root, '.shishan/annotation-plan.json', plan)
    ).rejects.toThrow('Annotation plan already exists');
  });

  it('rejects an approved id that collides with an existing function narrative', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-plan-id-'));
    await writeFile(
      join(root, 'workflow.ts'),
      [
        '// @shishan function existing-id',
        '// @summary Preserve the narrated function',
        'export function narrated() { return 1; }',
        'export function missing() { return 2; }',
        ''
      ].join('\n')
    );
    const plan = await createAnnotationPlan(root);
    approveAll(plan);
    plan.files[0]!.candidates[0]!.id = 'existing-id';

    await expect(applyAnnotationPlan(root, plan, false)).rejects.toThrow(
      'invalid or duplicate id'
    );
  });
});
