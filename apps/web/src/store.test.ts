import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@shishan/protocol';
import type {
  FileAnalysis,
  ProjectPatch,
  ProjectSnapshot
} from '@shishan/protocol';
import { applyProjectPatch, stateFromSnapshot } from './store.js';

function file(path: string, hash: string): FileAnalysis {
  return {
    path,
    language: 'typescript',
    contentHash: hash,
    functions: [],
    symbols: [],
    diagnostics: [],
    coverage: {
      totalFunctions: 0,
      narratedFunctions: 0,
      percent: 100,
      flowNodes: 0,
      details: 0
    },
    parseMode: 'full',
    syntaxError: false
  };
}

const metrics = {
  totalParseOperations: 2,
  fullParses: 2,
  incrementalParses: 0,
  skippedUnchangedFiles: 0,
  lastUpdate: {
    requestedPaths: ['a.ts', 'b.ts'],
    parsedPaths: ['a.ts', 'b.ts'],
    removedPaths: [],
    unchangedPaths: [],
    reusedFileCount: 0,
    durationMs: 2
  }
};

const coverage = {
  totalFunctions: 0,
  narratedFunctions: 0,
  percent: 100,
  flowNodes: 0,
  details: 0,
  files: 2,
  filesWithNarratives: 0
};

describe('project patch store', () => {
  it('replaces only changed file objects', () => {
    const snapshot: ProjectSnapshot = {
      protocolVersion: PROTOCOL_VERSION,
      generation: 1,
      rootName: 'demo',
      projectNarrative: null,
      projectDiagnostics: [],
      files: [file('a.ts', 'a1'), file('b.ts', 'b1')],
      coverage,
      metrics
    };
    const state = stateFromSnapshot(snapshot);
    const untouched = state.files.get('b.ts');
    const patch: ProjectPatch = {
      protocolVersion: PROTOCOL_VERSION,
      generation: 2,
      projectNarrativeChanged: false,
      upsertFiles: [file('a.ts', 'a2')],
      removedFiles: [],
      coverage,
      metrics: {
        ...metrics,
        incrementalParses: 1,
        lastUpdate: {
          ...metrics.lastUpdate,
          requestedPaths: ['a.ts'],
          parsedPaths: ['a.ts'],
          reusedFileCount: 1
        }
      }
    };

    const next = applyProjectPatch(state, patch);
    expect(next.files.get('a.ts')?.contentHash).toBe('a2');
    expect(next.files.get('b.ts')).toBe(untouched);
  });

  it('ignores duplicate or out-of-order patches', () => {
    const state = stateFromSnapshot({
      protocolVersion: PROTOCOL_VERSION,
      generation: 3,
      rootName: 'demo',
      projectNarrative: null,
      projectDiagnostics: [],
      files: [file('a.ts', 'a3')],
      coverage: { ...coverage, files: 1 },
      metrics
    });
    const stale: ProjectPatch = {
      protocolVersion: PROTOCOL_VERSION,
      generation: 2,
      projectNarrativeChanged: false,
      upsertFiles: [file('a.ts', 'stale')],
      removedFiles: [],
      coverage: { ...coverage, files: 1 },
      metrics
    };

    expect(applyProjectPatch(state, stale)).toBe(state);
  });
});
