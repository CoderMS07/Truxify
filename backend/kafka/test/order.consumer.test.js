import { describe, it, expect } from 'vitest';
import { derivePartitionKey } from '../../index.js';
describe('derivePartitionKey', () => {
  it('deterministic', () => { expect(derivePartitionKey('x')).toBe(derivePartitionKey('x')); });
  it('null', () => { expect(derivePartitionKey(null)).toBe('0'); });
});
