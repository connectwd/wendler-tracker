import { describe, it, expect } from 'vitest';
import {
  generateMainWorkSets,
  generateBbsSets,
  generateWarmupSets,
  estimateOneRepMax,
  calculateTrainingMax,
  nextCycleTrainingMax,
  roundToIncrement,
  generateWorkoutsForCycle,
  buildFirstCycle,
  buildNextCycle,
} from './wendler';
import type { LiftConfig, Settings } from '../types';

// Every expected value here was checked against a real logged cycle from the
// spreadsheet this app replaced - not just re-derived from the same formula.
describe('main work percentages', () => {
  const tm = 166.5;
  const round = 2.5;

  it('week 1 (65/75/85%)', () => {
    expect(generateMainWorkSets(tm, 1, round).map((s) => s.targetWeight)).toEqual([107.5, 125, 142.5]);
  });
  it('week 2 (70/80/90%)', () => {
    expect(generateMainWorkSets(tm, 2, round).map((s) => s.targetWeight)).toEqual([117.5, 132.5, 150]);
  });
  it('week 3 (75/85/95%)', () => {
    expect(generateMainWorkSets(tm, 3, round).map((s) => s.targetWeight)).toEqual([125, 142.5, 157.5]);
  });
  it('week 4 deload (40/50/60%)', () => {
    expect(generateMainWorkSets(tm, 4, round).map((s) => s.targetWeight)).toEqual([67.5, 82.5, 100]);
  });
  it('only the last set of weeks 1-3 is AMRAP', () => {
    for (const week of [1, 2, 3] as const) {
      const sets = generateMainWorkSets(tm, week, round);
      expect(sets.map((s) => s.isAmrap)).toEqual([false, false, true]);
    }
  });
  it('deload week has no AMRAP set', () => {
    expect(generateMainWorkSets(tm, 4, round).every((s) => !s.isAmrap)).toBe(true);
  });
});

describe('Boring But Strong (true BBS, not Boring But Big)', () => {
  const tm = 166.5;
  const round = 2.5;

  it('10 sets of 5 at First-Set-Last percentage, which varies by week', () => {
    expect(generateBbsSets(tm, 1, round)[0].targetWeight).toBe(107.5); // 65% - same as week 1's first main set
    expect(generateBbsSets(tm, 3, round)[0].targetWeight).toBe(125); // 75%
    expect(generateBbsSets(tm, 4, round)[0].targetWeight).toBe(67.5); // 40%, deload
  });
  it('always 10 sets of 5, none AMRAP', () => {
    const sets = generateBbsSets(tm, 2, round);
    expect(sets).toHaveLength(10);
    expect(sets.every((s) => s.targetReps === 5 && !s.isAmrap)).toBe(true);
  });
});

describe('warm-up ramp', () => {
  it('40/50/60% for 5/5/3 reps, same every week', () => {
    const sets = generateWarmupSets(166.5, 2.5);
    expect(sets.map((s) => s.targetWeight)).toEqual([67.5, 82.5, 100]);
    expect(sets.map((s) => s.targetReps)).toEqual([5, 5, 3]);
  });
});

describe('rounding', () => {
  it('rounds to the nearest increment, half rounds up', () => {
    expect(roundToIncrement(108.225, 2.5)).toBe(107.5);
    expect(roundToIncrement(99.9, 2.5)).toBe(100);
    expect(roundToIncrement(108.3, 1)).toBe(108);
  });
  it('a non-positive increment is a no-op rather than dividing by zero', () => {
    expect(roundToIncrement(123.456, 0)).toBe(123.456);
    expect(roundToIncrement(123.456, -1)).toBe(123.456);
  });
});

describe('estimateOneRepMax (Brzycki)', () => {
  it('matches real logged AMRAP performance', () => {
    expect(estimateOneRepMax(142.5, 5)).toBeCloseTo(160.328533, 4);
    expect(estimateOneRepMax(150, 6)).toBeCloseTo(174.216028, 4);
  });
  it('a single rep is just the weight itself, no formula needed', () => {
    expect(estimateOneRepMax(185, 1)).toBe(185);
  });
  it('invalid input returns null instead of NaN/Infinity', () => {
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(100, -3)).toBeNull();
  });
  it('very high rep counts are capped rather than blowing up the formula', () => {
    // Brzycki's denominator hits zero at 37 reps - the cap keeps this finite and sane.
    expect(estimateOneRepMax(50, 50)).not.toBeNull();
    expect(Number.isFinite(estimateOneRepMax(50, 50)!)).toBe(true);
  });
});

describe('Training Max math', () => {
  it('90% of 1RM, kept unrounded (only prescribed set weights get rounded)', () => {
    expect(calculateTrainingMax(185)).toBe(166.5);
  });
  it('next cycle TM is a flat add, never rounded to the plate increment', () => {
    // Verified against the source spreadsheet: 166.5 -> 169.5 -> 172.5, never
    // snapped to a "cleaner" number even though 169.5 isn't a multiple of 2.5.
    expect(nextCycleTrainingMax(166.5, 3)).toBe(169.5);
    expect(nextCycleTrainingMax(169.5, 3)).toBe(172.5);
  });
});

describe('cycle and workout generation', () => {
  const lifts: LiftConfig[] = [
    { id: 'bench', name: 'Bench Press', dayOfWeek: 1, order: 1, cycleIncrement: 3 },
    { id: 'squat', name: 'Squat', dayOfWeek: 2, order: 2, cycleIncrement: 3 },
  ];
  const settings: Settings = {
    units: 'kg',
    barWeight: 20,
    roundingIncrement: 2.5,
    bodyweight: null,
    onboardingComplete: true,
  };

  it('builds cycle 1 with the given Training Maxes', () => {
    const cycle = buildFirstCycle(lifts, { bench: 166.5, squat: 108 }, '2026-07-14');
    expect(cycle.cycleNumber).toBe(1);
    expect(cycle.status).toBe('active');
    expect(cycle.trainingMaxes).toEqual({ bench: 166.5, squat: 108 });
  });

  it('generates exactly 4 weeks per lift, with warm-up/main/BBS sets present', () => {
    const cycle = buildFirstCycle(lifts, { bench: 166.5, squat: 108 }, '2026-07-14');
    const workouts = generateWorkoutsForCycle(cycle, lifts, settings);
    expect(workouts).toHaveLength(8); // 2 lifts x 4 weeks
    for (const w of workouts) {
      expect(w.warmupSets).toHaveLength(3);
      expect(w.mainSets).toHaveLength(3);
      expect(w.bbsSets).toHaveLength(10);
      expect(w.status).toBe('pending');
    }
  });

  it('rolls each lift forward by its own configured increment', () => {
    const cycle1 = buildFirstCycle(lifts, { bench: 166.5, squat: 108 }, '2026-07-14');
    const cycle2 = buildNextCycle(cycle1, lifts, '2026-08-11');
    expect(cycle2.cycleNumber).toBe(2);
    expect(cycle2.trainingMaxes.bench).toBe(169.5);
    expect(cycle2.trainingMaxes.squat).toBe(111);
  });
});
