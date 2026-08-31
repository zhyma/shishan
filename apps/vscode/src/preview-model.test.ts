import { describe, expect, it } from 'vitest';
import { extractNodeDrilldown } from './preview-model.js';

const range = {
  path: 'src/入口.ts',
  start: { line: 2, column: 0 },
  end: { line: 8, column: 1 }
};

describe('VS Code narrative preview model', () => {
  it('extracts ordered Chinese function nodes and implementation details', () => {
    const result = extractNodeDrilldown(
      {
        projectNarrative: {
          flows: [
            {
              id: 'request',
              nodes: [
                {
                  id: 'route',
                  source: {
                    path: 'src/入口.ts',
                    narrativeId: 'narrative:route'
                  }
                }
              ]
            }
          ]
        },
        files: [
          {
            path: 'src/入口.ts',
            functions: [
              {
                id: 'narrative:route',
                localId: 'route',
                kind: 'function',
                name: '处理请求',
                summary: '处理进入的请求。',
                source: range,
                details: [],
                children: [
                  {
                    id: 'narrative:route:branch',
                    localId: 'validate',
                    kind: 'branch',
                    summary: '验证输入。',
                    source: range,
                    details: [
                      {
                        id: 'detail:guard',
                        summary: '拒绝空令牌。',
                        coveredStatements: 2,
                        source: range
                      }
                    ],
                    children: []
                  }
                ]
              }
            ]
          }
        ]
      },
      'request',
      'route'
    );

    expect(result.narrativeFound).toBe(true);
    expect(result.outline.map((item) => [item.label, item.depth])).toEqual([
      ['处理请求', 0],
      ['validate', 1]
    ]);
    expect(result.details[0]).toMatchObject({
      parentLabel: 'validate',
      summary: '拒绝空令牌。',
      coveredStatements: 2
    });
  });

  it('returns an inert empty model for malformed or unbound snapshots', () => {
    expect(extractNodeDrilldown({}, 'missing', 'missing')).toEqual({
      narrativeFound: false,
      outline: [],
      details: []
    });
  });
});
