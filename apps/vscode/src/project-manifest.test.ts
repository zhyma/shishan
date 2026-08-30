import { describe, expect, it } from 'vitest';
import { parseProjectManifest } from './project-manifest.js';

describe('VS Code project manifest display parser', () => {
  it('reads a bounded project story without evaluating content', () => {
    const result = parseProjectManifest(
      JSON.stringify({
        schemaVersion: 'shishan/project-v1',
        title: 'Request lifecycle',
        summary: 'Explain requests.',
        entryFlow: 'request',
        flows: [
          {
            id: 'request',
            title: 'Request',
            summary: 'Follow one request.',
            nodes: [
              {
                id: 'receive',
                kind: 'entry',
                label: 'Receive request',
                summary: 'Accept the request.',
                source: { path: 'src/app.ts', symbol: 'fetch' }
              }
            ],
            edges: []
          }
        ]
      })
    );
    expect(result.manifest?.flows[0]?.nodes[0]?.source).toEqual({
      path: 'src/app.ts',
      symbol: 'fetch'
    });
  });

  it('returns errors for malformed content', () => {
    expect(parseProjectManifest('{').error).toContain('not valid JSON');
    expect(parseProjectManifest('{}').error).toContain('does not match');
  });
});
