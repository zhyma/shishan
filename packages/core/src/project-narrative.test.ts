import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileAnalysis } from '@shishan/protocol';
import {
  PROJECT_NARRATIVE_FILE,
  loadProjectNarrative
} from './project-narrative.js';

function file(): FileAnalysis {
  return {
    path: 'src/app.ts',
    language: 'typescript',
    contentHash: 'hash',
    functions: [],
    symbols: [
      {
        id: 'src/app.ts::fetch',
        name: 'fetch',
        kind: 'function',
        source: {
          path: 'src/app.ts',
          start: { line: 4, column: 0 },
          end: { line: 8, column: 1 }
        },
        narrativeId: 'src/app.ts::receive-request'
      }
    ],
    diagnostics: [],
    coverage: {
      totalFunctions: 1,
      narratedFunctions: 1,
      percent: 100,
      flowNodes: 1,
      details: 0
    },
    parseMode: 'full',
    syntaxError: false
  };
}

async function writeManifest(root: string, value: unknown): Promise<void> {
  const path = join(root, PROJECT_NARRATIVE_FILE);
  await mkdir(join(root, '.shishan'), { recursive: true });
  await writeFile(path, JSON.stringify(value), 'utf8');
}

const manifest = {
  schemaVersion: 'shishan/project-v1',
  title: 'Demo architecture',
  summary: 'Explain the request lifecycle.',
  entryFlow: 'request-lifecycle',
  flows: [
    {
      id: 'request-lifecycle',
      title: 'Request lifecycle',
      summary: 'Turn a request into a response.',
      nodes: [
        {
          id: 'receive-request',
          kind: 'entry',
          label: 'Receive request',
          summary: 'Accept the request.',
          source: { path: 'src/app.ts', symbol: 'fetch' }
        },
        {
          id: 'return-response',
          kind: 'output',
          label: 'Return response',
          summary: 'Return the finalized response.'
        }
      ],
      edges: [
        {
          id: 'request-to-response',
          source: 'receive-request',
          target: 'return-response',
          kind: 'next'
        }
      ]
    }
  ]
};

describe('project narrative manifest', () => {
  it('binds project nodes to indexed symbols and function narratives', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-project-narrative-'));
    await writeManifest(root, manifest);
    const result = await loadProjectNarrative(
      root,
      new Map([['src/app.ts', file()]])
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.narrative?.flows[0]?.nodes[0]?.source).toMatchObject({
      path: 'src/app.ts',
      symbol: 'fetch',
      narrativeId: 'src/app.ts::receive-request',
      range: { start: { line: 4, column: 0 } }
    });
  });

  it('rejects broken topology and unsafe source traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-project-invalid-'));
    await writeManifest(root, {
      ...manifest,
      flows: [
        {
          ...manifest.flows[0]!,
          nodes: [
            {
              ...manifest.flows[0]!.nodes[0]!,
              source: { path: '../secret.ts', symbol: 'fetch' }
            }
          ],
          edges: [
            {
              id: 'missing-target',
              source: 'receive-request',
              target: 'return-response',
              kind: 'next'
            }
          ]
        }
      ]
    });
    const result = await loadProjectNarrative(root, new Map());

    expect(result.narrative).toBeNull();
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['SHISHAN603', 'SHISHAN604'])
    );
  });

  it('reports missing symbols without hiding an otherwise valid flow', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shishan-project-symbol-'));
    await writeManifest(root, {
      ...manifest,
      flows: [
        {
          ...manifest.flows[0]!,
          nodes: [
            {
              ...manifest.flows[0]!.nodes[0]!,
              source: { path: 'src/app.ts', symbol: 'renamed' }
            }
          ],
          edges: []
        }
      ]
    });
    const result = await loadProjectNarrative(
      root,
      new Map([['src/app.ts', file()]])
    );

    expect(result.narrative).not.toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'SHISHAN605', severity: 'warning' })
    ]);
  });
});
