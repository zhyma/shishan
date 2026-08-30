import { describe, expect, it } from 'vitest';
import type { NarrativeNode } from '@shishan/protocol';
import {
  LARGE_GRAPH_THRESHOLD,
  MAX_GRAPH_NODES,
  initialGraphMinZoom,
  layoutWithDagre,
  narrativeNodeLabel,
  needsLargeGraphLayout,
  prepareGraph,
  resolveLargeGraphLayout
} from './graph-layout.js';

function narrative(index: number, children: NarrativeNode[] = []): NarrativeNode {
  const id = 'large.ts#large/node-' + index;
  return {
    id,
    localId: 'node-' + index,
    kind: index === 0 ? 'function' : 'step',
    summary: 'Narrative node ' + index,
    fields: {},
    source: {
      path: 'large.ts',
      start: { line: index, column: 0 },
      end: { line: index, column: 1 }
    },
    annotationSource: {
      path: 'large.ts',
      start: { line: index, column: 0 },
      end: { line: index, column: 1 }
    },
    children,
    edges: children.map((child) => ({
      id: id + '--next--' + child.id,
      source: id,
      target: child.id,
      kind: 'next'
    })),
    details: []
  };
}

function chain(size: number): NarrativeNode {
  let current = narrative(size - 1);
  for (let index = size - 2; index >= 0; index -= 1) {
    current = narrative(index, [current]);
  }
  return current;
}

describe('large graph layout policy', () => {
  it('reports the rendered node count and preserves readability for medium graphs', () => {
    expect(narrativeNodeLabel(chain(15))).toBe('15 nodes');
    expect(narrativeNodeLabel(chain(MAX_GRAPH_NODES + 25))).toBe('600+ nodes');
    expect(initialGraphMinZoom(15)).toBe(0.42);
    expect(initialGraphMinZoom(21)).toBe(0.08);
  });

  it('keeps small graphs on the synchronous layout path', () => {
    expect(needsLargeGraphLayout(prepareGraph(chain(8)))).toBe(false);
  });

  it('routes large graphs to ELK and bounds rendered work', () => {
    const model = prepareGraph(chain(MAX_GRAPH_NODES + 25));
    expect(model.narratives).toHaveLength(MAX_GRAPH_NODES);
    expect(model.truncated).toBe(true);
    expect(model.edges).toHaveLength(MAX_GRAPH_NODES - 1);
    expect(needsLargeGraphLayout(model)).toBe(true);
  });

  it('returns finite fallback positions at the ELK threshold', () => {
    const model = prepareGraph(chain(LARGE_GRAPH_THRESHOLD + 1));
    const positions = layoutWithDagre(model);
    expect(positions).toHaveLength(LARGE_GRAPH_THRESHOLD + 1);
    for (const position of positions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }
  });

  it('falls back safely when the large-graph engine times out', async () => {
    const model = prepareGraph(chain(LARGE_GRAPH_THRESHOLD + 1));
    const result = await resolveLargeGraphLayout(model, async () => {
      throw new Error('layout timeout');
    });

    expect(result.engine).toBe('fallback');
    expect(result.positions).toHaveLength(LARGE_GRAPH_THRESHOLD + 1);
  });
});
