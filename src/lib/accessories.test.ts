import { describe, it, expect } from 'vitest';
import {
  ACCESSORY_CATALOG,
  findLastAccessoryLog,
  findLastAccessorySelection,
} from './accessories';
import type { LoggedAccessoryExercise, Workout } from '../types';

function makeWorkout(id: string, liftId: string, date: string, accessories: LoggedAccessoryExercise[]): Workout {
  return {
    id,
    cycleId: 'c',
    liftId,
    week: 1,
    date,
    warmupSets: [],
    mainSets: [],
    bbsSets: [],
    accessories,
    estimatedOneRepMax: null,
    status: 'completed',
    bodyweight: null,
    notes: '',
  };
}

function dipsLog(weight: number, reps: number): LoggedAccessoryExercise {
  return { exerciseId: 'dips', name: 'Dips', category: 'push', sets: [{ setNumber: 1, weight, reps }] };
}

describe('ACCESSORY_CATALOG', () => {
  it("covers all three of Wendler's categories", () => {
    const categories = new Set(ACCESSORY_CATALOG.map((o) => o.category));
    expect(categories).toEqual(new Set(['push', 'pull', 'core']));
  });

  it('every exercise has a unique id', () => {
    const ids = ACCESSORY_CATALOG.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('findLastAccessoryLog', () => {
  it('finds a log from many cycles ago, not just the current one', () => {
    const nineCyclesAgo = makeWorkout('w1', 'bench', '2025-10-01', [dipsLog(10, 12)]);
    const currentSession = makeWorkout('w3', 'bench', '2026-07-15', [dipsLog(15, 10)]);

    const last = findLastAccessoryLog('dips', [nineCyclesAgo, currentSession], 'w3');
    expect(last?.date).toBe('2025-10-01');
    expect(last?.exercise.sets[0]).toEqual({ setNumber: 1, weight: 10, reps: 12 });
  });

  it('picks the most recent of several past logs, not just the first one found', () => {
    const older = makeWorkout('w1', 'bench', '2025-10-01', [dipsLog(10, 12)]);
    const newer = makeWorkout('w2', 'bench', '2026-01-01', [dipsLog(12, 12)]);

    const last = findLastAccessoryLog('dips', [older, newer]);
    expect(last?.date).toBe('2026-01-01');
  });

  it('returns null for an exercise that has never been logged', () => {
    const w = makeWorkout('w1', 'bench', '2026-01-01', [dipsLog(10, 12)]);
    expect(findLastAccessoryLog('kb-swings', [w])).toBeNull();
  });

  it('a selected-but-empty entry (no weight/reps filled in) does not count as history', () => {
    const draft = makeWorkout('w1', 'bench', '2026-06-01', [
      { exerciseId: 'dips', name: 'Dips', category: 'push', sets: [{ setNumber: 1, weight: null, reps: null }] },
    ]);
    expect(findLastAccessoryLog('dips', [draft])).toBeNull();
  });

  it('excludes the workout currently being edited', () => {
    const current = makeWorkout('w1', 'bench', '2026-07-15', [dipsLog(20, 8)]);
    expect(findLastAccessoryLog('dips', [current], 'w1')).toBeNull();
  });
});

describe('findLastAccessorySelection', () => {
  it('finds the most recent selection for a specific lift', () => {
    const older = makeWorkout('w1', 'bench', '2025-10-01', [dipsLog(10, 12)]);
    const newer = makeWorkout('w2', 'bench', '2026-01-01', [dipsLog(12, 12)]);
    const selection = findLastAccessorySelection('bench', [older, newer]);
    expect(selection?.[0].exerciseId).toBe('dips');
  });

  it("is scoped to the right lift - a different lift's selection does not leak in", () => {
    const squatWorkout = makeWorkout('w1', 'squat', '2026-07-10', [dipsLog(20, 10)]);
    expect(findLastAccessorySelection('deadlift', [squatWorkout])).toBeNull();
  });

  it('returns null when this lift has never had accessories logged', () => {
    const w = makeWorkout('w1', 'bench', '2026-01-01', []);
    expect(findLastAccessorySelection('bench', [w])).toBeNull();
  });
});
