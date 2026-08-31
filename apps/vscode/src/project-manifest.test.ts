import { describe, expect, it } from 'vitest';
import { parseProjectManifest } from './project-manifest.js';

describe('VS Code project manifest display parser', () => {
  it('reads a bounded project story without evaluating content', () => {
    const result = parseProjectManifest(
      JSON.stringify({
        schemaVersion: 'shishan/project-v1',
        title: '请求生命周期',
        summary: '解释请求。',
        entryFlow: 'request',
        flows: [
          {
            id: 'request',
            title: '请求',
            summary: '跟随一个请求。',
            nodes: [
              {
                id: 'receive',
                kind: 'entry',
                label: '接收请求',
                summary: '接收这个请求。',
                source: { path: 'src/app.ts', symbol: 'fetch' }
              },
              {
                id: 'reply',
                kind: 'output',
                label: '返回响应',
                summary: '发送响应。'
              }
            ],
            edges: [
              {
                id: 'receive-to-reply',
                source: 'receive',
                target: 'reply',
                kind: 'next',
                label: '下一步'
              }
            ]
          }
        ]
      })
    );
    expect(result.manifest?.flows[0]?.nodes[0]?.source).toEqual({
      path: 'src/app.ts',
      symbol: 'fetch'
    });
    expect(result.manifest?.flows[0]?.title).toBe('请求');
    expect(result.manifest?.flows[0]?.edges[0]?.label).toBe('下一步');
  });

  it('returns errors for malformed content', () => {
    expect(parseProjectManifest('{').error).toContain('not valid JSON');
    expect(parseProjectManifest('{}').error).toContain('does not match');
  });
});
