import { describe, it, expect, vi } from 'vitest';
import { insertEventsWithTransaction } from '../../repositories/event.repository.js';
describe('insertEventsWithTransaction', () => {
  it('commits', async () => {
    const c = { query: vi.fn().mockResolvedValue() };
    expect(await insertEventsWithTransaction(c, [{ a: 1 }])).toBe(1);
  });
});
