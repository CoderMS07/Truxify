import { describe, it, expect } from 'vitest';
import { validatePrediction } from '../../../src/lib/predictionValidator.js';

describe('predictionValidator.js', () => {
  it('returns true for valid prediction object', () => {
    const pred = { demand: 0.75, confidence: 0.92, timestamp: Date.now() };
    expect(validatePrediction(pred)).toBe(true);
  });

  it('returns false for missing demand field', () => {
    const pred = { confidence: 0.92 };
    expect(validatePrediction(pred)).toBe(false);
  });

  it('returns false for non-number demand', () => {
    const pred = { demand: 'high', confidence: 0.92 };
    expect(validatePrediction(pred)).toBe(false);
  });

  it('returns false for demand out of range', () => {
    expect(validatePrediction({ demand: 1.5 })).toBe(false);
    expect(validatePrediction({ demand: -0.1 })).toBe(false);
  });

  it('returns false for null/undefined input', () => {
    expect(validatePrediction(null)).toBe(false);
    expect(validatePrediction(undefined)).toBe(false);
  });
});
