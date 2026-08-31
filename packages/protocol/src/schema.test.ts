import { describe, expect, it } from 'vitest';
import {
  validateProjectNarrativeManifest,
  validateProtocolPayload
} from './schema.js';

describe('ShiShan JSON Schema', () => {
  it('rejects unrelated JSON', () => {
    const result = validateProtocolPayload({ hello: 'world' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validates bounded project narrative manifests', () => {
    const valid = validateProjectNarrativeManifest({
      schemaVersion: 'shishan/project-v1',
      title: 'Request lifecycle',
      summary: 'Explain how a request becomes a response.',
      entryFlow: 'request-lifecycle',
      flows: [
        {
          id: 'request-lifecycle',
          title: 'Request lifecycle',
          summary: 'Follow the main request path.',
          nodes: [
            {
              id: 'receive-request',
              kind: 'entry',
              label: 'Receive request',
              summary: 'Accept an incoming request.',
              source: { path: 'src/app.ts', symbol: 'fetch' }
            }
          ],
          edges: []
        }
      ]
    });
    expect(valid).toEqual({ valid: true, errors: [] });

    const invalid = validateProjectNarrativeManifest({
      schemaVersion: 'shishan/project-v1',
      title: 'Invalid',
      summary: 'Contains an unsafe identifier.',
      entryFlow: 'Request Flow',
      flows: []
    });
    expect(invalid.valid).toBe(false);
  });
});
