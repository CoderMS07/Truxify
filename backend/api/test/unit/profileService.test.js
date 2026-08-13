import { describe, it, expect } from 'vitest';
import { getProfileById } from '../../../src/services/profileService.js';

describe('profileService.js', () => {
  it('getProfileById returns null for non-existent profile', async () => {
    const result = await getProfileById('nonexistent-id-12345');
    expect(result).toBeNull();
  });

  it('getProfileById returns null for invalid id format', async () => {
    const result = await getProfileById('');
    expect(result).toBeNull();
  });
});
