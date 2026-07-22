import { describe, it, expect } from 'vitest';
import { checkPlateau, resetTrainingMax } from './plateau';
import type { Cycle, Workout } from '../types';

function makeCycle(n: number): Cycle {
  return {
    id: `c${n}`,
    cycleNumber: n,
    startDate: '2026-01-01',
    trainingMaxes: {},
    status: n < 5 ? 'completed' : 'active',
    completedDate: null,
  };
}

function week3Workout(cycleId: string, liftId: string, e1rm: number | null): Workout {
  return {
    id: `${cycleId}-${liftId}-w3`,
    cycleId,
    liftId,
    week: 3,
    date: '2026-01-01',
    warmupSets: [],
    mainSets: [],
    bbsSets: [],
    accessories: [],
    estimatedOneRepMax: e1rm,
    status: 'completed',
    bodyweight: null,
    notes: '',
  };
}

const cycles = [1, 2, 3, 4, 5].map(makeCycle);

describe('checkPlateau', () => {
  it('does not flag steady improvement', () => {
    const workouts = [week3Workout('c3', 'bench', 180), week3Workout('c4', 'bench', 185), week3Workout('c5', 'bench', 192)];
    expect(checkPlateau('bench', 5, cycles, workouts, 'kg').isPlateaued).toBe(false);
  });

  it('flags 3 flat cycles', () => {
    const workouts = [week3Workout('c3', 'bench', 185), week3Workout('c4', 'bench', 184.5), week3Workout('c5', 'bench', 185.2)];
    expect(checkPlateau('bench', 5, cycles, workouts, 'kg').isPlateaued).toBe(true);
  });

  it('flags a decline', () => {
    const workouts = [week3Workout('c3', 'bench', 190), week3Workout('c4', 'bench', 185), week3Workout('c5', 'bench', 178)];
    expect(checkPlateau('bench', 5, cycles, workouts, 'kg').isPlateaued).toBe(true);
  });

  it('a dip followed by recovery is not a plateau - one improvement step breaks the streak', () => {
    const workouts = [week3Workout('c3', 'bench', 190), week3Workout('c4', 'bench', 182), week3Workout('c5', 'bench', 195)];
    expect(checkPlateau('bench', 5, cycles, workouts, 'kg').isPlateaued).toBe(false);
  });

  it('fewer than 3 cycles of data is inconclusive, not a plateau', () => {
    const workouts = [week3Workout('c4', 'bench', 185), week3Workout('c5', 'bench', 178)];
    expect(checkPlateau('bench', 5, cycles, workouts, 'kg').isPlateaued).toBe(false);
  });

  it('a missing cycle in the middle (e.g. an all-skip cycle) is inconclusive, not treated as flat', () => {
    const workouts = [week3Workout('c3', 'bench', 190), week3Workout('c5', 'bench', 178)];
    expect(checkPlateau('bench', 5, cycles, workouts, 'kg').isPlateaued).toBe(false);
  });

  it('is scoped per lift - one lift plateauing does not affect another', () => {
    const workouts = [
      week3Workout('c3', 'squat', 200),
      week3Workout('c4', 'squat', 200),
      week3Workout('c5', 'squat', 200),
      week3Workout('c3', 'bench', 180),
      week3Workout('c4', 'bench', 190),
      week3Workout('c5', 'bench', 200),
    ];
    expect(checkPlateau('bench', 5, cycles, workouts, 'kg').isPlateaued).toBe(false);
    expect(checkPlateau('squat', 5, cycles, workouts, 'kg').isPlateaued).toBe(true);
  });

  it('the reason message respects the unit setting - this was hardcoded to kg before', () => {
    const workouts = [week3Workout('c3', 'bench', 100), week3Workout('c4', 'bench', 100), week3Workout('c5', 'bench', 100)];
    expect(checkPlateau('bench', 5, cycles, workouts, 'kg').reason).toMatch(/kg\)$/);
    expect(checkPlateau('bench', 5, cycles, workouts, 'lb').reason).toMatch(/lb\)$/);
  });
});

describe('resetTrainingMax', () => {
  it('drops TM by the given percentage, 90% by default', () => {
    expect(resetTrainingMax(185, 0.9)).toBeCloseTo(166.5, 5);
  });
});
