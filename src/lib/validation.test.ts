import { describe, it, expect } from 'vitest';
import { parsePositiveWeight } from './validation';

describe('parsePositiveWeight', () => {
  it('parses a valid positive number', () => {
    expect(parsePositiveWeight('150.5')).toBe(150.5);
    expect(parsePositiveWeight('100')).toBe(100);
  });

  it('rejects empty/whitespace input', () => {
    expect(parsePositiveWeight('')).toBeNull();
    expect(parsePositiveWeight('   ')).toBeNull();
  });

  it('rejects non-numeric input rather than propagating NaN', () => {
    expect(parsePositiveWeight('abc')).toBeNull();
    expect(parsePositiveWeight('-')).toBeNull();
  });

  it('rejects zero and negative numbers - a Training Max can never be <= 0', () => {
    expect(parsePositiveWeight('0')).toBeNull();
    expect(parsePositiveWeight('-50')).toBeNull();
  });
});
