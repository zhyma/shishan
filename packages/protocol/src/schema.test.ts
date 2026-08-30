import { describe, expect, it } from 'vitest';
import { validateProtocolPayload } from './schema.js';

describe('ShiShan JSON Schema', () => {
  it('rejects unrelated JSON', () => {
    const result = validateProtocolPayload({ hello: 'world' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
