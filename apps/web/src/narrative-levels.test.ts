import { describe, expect, it } from 'vitest';
import type {
  NarrativeNode,
  ProjectNarrativeFlow
} from '@shishan/protocol';
import {
  narrativeDetails,
  narrativeOutline,
  projectNodeRelations
} from './narrative-levels.js';

function narrative(): NarrativeNode {
  const source = {
    path: 'src/app.ts',
    start: { line: 1, column: 0 },
    end: { line: 4, column: 1 }
  };
  return {
    id: 'src/app.ts::fetch',
    localId: 'fetch',
    kind: 'function',
    name: 'fetch',
    summary: 'Handle a request.',
    fields: {},
    source,
    annotationSource: source,
    edges: [],
    details: [],
    children: [
      {
        id: 'src/app.ts::fetch::route',
        localId: 'route',
        kind: 'branch',
        summary: 'Choose a route.',
        fields: { condition: ['a route matches'] },
        source,
        annotationSource: source,
        edges: [],
        children: [],
        details: [
          {
            id: 'src/app.ts::fetch::route::cache',
            localId: 'cache',
            summary: 'Reuse the route cache.',
            fields: {},
            source,
            annotationSource: source,
            coveredStatements: 1
          }
        ]
      }
    ]
  };
}

describe('project node reading levels', () => {
  it('preserves nested function order and collects implementation details', () => {
    const root = narrative();
    expect(narrativeOutline(root).map(({ node, depth }) => [node.localId, depth]))
      .toEqual([
        ['fetch', 0],
        ['route', 1]
      ]);
    expect(narrativeDetails(root)).toEqual([
      expect.objectContaining({
        depth: 1,
        parent: expect.objectContaining({ localId: 'route' }),
        detail: expect.objectContaining({ localId: 'cache' })
      })
    ]);
  });

  it('shows incoming and outgoing project context for one node', () => {
    const flow: ProjectNarrativeFlow = {
      id: 'request',
      title: 'Request',
      summary: 'Follow a request.',
      nodes: [
        { id: 'entry', kind: 'entry', label: 'Entry', summary: 'Start.' },
        { id: 'route', kind: 'decision', label: 'Route', summary: 'Choose.' },
        { id: 'output', kind: 'output', label: 'Output', summary: 'Return.' }
      ],
      edges: [
        { id: 'entry-route', source: 'entry', target: 'route', kind: 'next' },
        { id: 'route-output', source: 'route', target: 'output', kind: 'true' }
      ]
    };
    const relations = projectNodeRelations(flow, 'route');
    expect(relations.incoming[0]?.node?.id).toBe('entry');
    expect(relations.outgoing[0]?.node?.id).toBe('output');
  });
});
