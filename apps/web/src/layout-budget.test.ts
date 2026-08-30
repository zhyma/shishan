import { describe, expect, it } from 'vitest';
import { withTimeBudget } from './layout-budget.js';

describe('layout time budget', () => {
  it('returns completed work and rejects work that exceeds the budget', async () => {
    await expect(withTimeBudget(Promise.resolve('ready'), 50)).resolves.toBe(
      'ready'
    );
    await expect(
      withTimeBudget(new Promise<never>(() => undefined), 5)
    ).rejects.toThrow('time budget');
  });
});
