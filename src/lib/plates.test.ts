import { describe, it, expect } from 'vitest';
import { calculatePlates, availablePlates } from './plates';

describe('availablePlates', () => {
  it('kg and lb are genuinely different plate sets', () => {
    expect(availablePlates('kg').map((p) => p.weight)).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
    expect(availablePlates('lb').map((p) => p.weight)).toEqual([45, 35, 25, 10, 5, 2.5]);
  });
});

describe('calculatePlates', () => {
  it('kg: 85kg over a 20kg bar', () => {
    // (85-20)/2 = 32.5/side -> 25 + 5 + 2.5
    expect(calculatePlates(85, 20, 'kg').perSide.map((p) => p.weight)).toEqual([25, 5, 2.5]);
  });

  it('kg: 107.5kg over a 20kg bar', () => {
    // (107.5-20)/2 = 43.75/side -> 25 + 15 + 2.5 + 1.25
    expect(calculatePlates(107.5, 20, 'kg').perSide.map((p) => p.weight)).toEqual([25, 15, 2.5, 1.25]);
  });

  it('lb: uses the lb plate set, not kg plates mislabeled', () => {
    // (235-45)/2 = 95/side -> 45 + 45 + 5
    expect(calculatePlates(235, 45, 'lb').perSide.map((p) => p.weight)).toEqual([45, 45, 5]);
  });

  it('a weight at or below the bar needs no plates', () => {
    expect(calculatePlates(20, 20, 'kg').perSide).toEqual([]);
    expect(calculatePlates(15, 20, 'kg').achievable).toBe(true);
  });

  it('flags an unachievable combination rather than silently rounding', () => {
    // 0.5kg over the bar per side isn't makeable with any plate in the set.
    const result = calculatePlates(21, 20, 'kg');
    expect(result.achievable).toBe(false);
    expect(result.remainder).toBeGreaterThan(0);
  });
});
