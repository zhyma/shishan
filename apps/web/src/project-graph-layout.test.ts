import { describe, expect, it } from 'vitest';
import type { ProjectNarrativeFlow } from '@shishan/protocol';
import { layoutProjectFlow } from './project-graph-layout.js';

const flow: ProjectNarrativeFlow = {
  id: 'request-lifecycle',
  title: 'Request lifecycle',
  summary: 'Follow a request.',
  nodes: [
    {
      id: 'receive',
      kind: 'entry',
      label: 'Receive request',
      summary: 'Accept the request.'
    },
    {
      id: 'route',
      kind: 'decision',
      label: 'Route found?',
      summary: 'Choose the route.'
    },
    {
      id: 'respond',
      kind: 'output',
      label: 'Return response',
      summary: 'Return the response.'
    }
  ],
  edges: [
    {
      id: 'receive-route',
      source: 'receive',
      target: 'route',
      kind: 'next'
    },
    {
      id: 'route-respond',
      source: 'route',
      target: 'respond',
      kind: 'true'
    }
  ]
};

describe('project flow layout', () => {
  it('places a sequential flow from left to right', () => {
    const positions = layoutProjectFlow(flow);
    expect(positions).toHaveLength(3);
    expect(positions.get('receive')?.x).toBeLessThan(
      positions.get('route')?.x ?? 0
    );
    expect(positions.get('route')?.x).toBeLessThan(
      positions.get('respond')?.x ?? 0
    );
  });

  it('places the same flow from top to bottom for a narrow viewport', () => {
    const positions = layoutProjectFlow(flow, 'TB');
    expect(positions.get('receive')?.y).toBeLessThan(
      positions.get('route')?.y ?? 0
    );
    expect(positions.get('route')?.y).toBeLessThan(
      positions.get('respond')?.y ?? 0
    );
  });
});
