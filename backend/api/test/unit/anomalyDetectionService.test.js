/**
 * Unit tests for backend/api/src/services/security/anomalyDetectionService.js
 *
 * Coverage:
 *   - detectUnusualTime evaluates the UTC hour (not the server-local hour)
 *   - A transaction inside the unusual window is flagged
 *   - A transaction outside the unusual window is not flagged
 *
 * Run with:  npm run test:unit -- test/unit/anomalyDetectionService.test.js
 */
import { describe, it, expect } from 'vitest';
import AnomalyDetectionService from '../../src/services/security/anomalyDetectionService.js';

describe('AnomalyDetectionService.detectUnusualTime', () => {
  const service = new AnomalyDetectionService();

  it('flags a transaction whose UTC hour is inside the unusual window', () => {
    // 2026-08-04T01:30:00Z -> UTC hour 1, inside [0, 6)
    const result = service.detectUnusualTime({ timestamp: '2026-08-04T01:30:00.000Z' });
    expect(result).not.toBeNull();
    expect(result.type).toBe('UNUSUAL_TIME');
    expect(result.message).toContain('1:00 UTC');
  });

  it('does not flag a transaction whose UTC hour is outside the unusual window', () => {
    // 2026-08-04T18:30:00Z -> UTC hour 18, outside [0, 6)
    const result = service.detectUnusualTime({ timestamp: '2026-08-04T18:30:00.000Z' });
    expect(result).toBeNull();
  });

  it('does not flag a late-evening UTC transaction even when it is a local morning hour', () => {
    // 2026-08-04T23:30:00Z -> UTC hour 23. On a server at UTC+5:30 this is
    // 05:00 local, which would previously be misclassified as inside the window.
    const result = service.detectUnusualTime({ timestamp: '2026-08-04T23:30:00.000Z' });
    expect(result).toBeNull();
  });
});
