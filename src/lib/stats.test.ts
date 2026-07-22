import { describe, it, expect } from 'vitest';
import {
  workoutTonnage,
  aggregateDailyStats,
  detectPersonalRecords,
  bestE1RMExcluding,
  calculateLifetimeStats,
  buildHeatmapWeeks,
  tonnageBucket,
  formatTonnage,
} from './stats';
import type { Cycle, LiftConfig, LoggedSet, Workout } from '../types';

function loggedSet(target: number, reps: number, completed: boolean): LoggedSet {
  return {
    setNumber: 1,
    targetWeight: target,
    targetReps: reps,
    isAmrap: false,
    actualWeight: completed ? target : null,
    actualReps: completed ? reps : null,
    completed,
  };
}

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: 'w1',
    cycleId: 'c1',
    liftId: 'bench',
    week: 1,
    date: '2026-01-01',
    warmupSets: [],
    mainSets: [],
    bbsSets: [],
    accessories: [],
    estimatedOneRepMax: null,
    status: 'completed',
    bodyweight: null,
    notes: '',
    ...overrides,
  };
}

describe('workoutTonnage', () => {
  it('sums weight x reps across warm-up, main, and BBS - but only completed sets', () => {
    const w = makeWorkout({
      warmupSets: [loggedSet(40, 5, true), loggedSet(50, 5, true)],
      mainSets: [loggedSet(100, 5, true), loggedSet(100, 5, false)],
      bbsSets: Array.from({ length: 3 }, () => loggedSet(65, 5, true)),
    });
    // 200 + 250 + 500 + 0 (uncompleted) + 3*325 = 1925
    expect(workoutTonnage(w)).toBe(1925);
  });

  it('an empty workout has zero tonnage', () => {
    expect(workoutTonnage(makeWorkout({}))).toBe(0);
  });
});

describe('aggregateDailyStats', () => {
  it('groups by date, combines multiple workouts on the same day, and excludes pending sessions', () => {
    const completed = makeWorkout({
      id: 'w1',
      date: '2026-01-01',
      mainSets: [loggedSet(100, 5, true)],
    });
    const skipped = makeWorkout({ id: 'w2', date: '2026-01-01', status: 'skipped', liftId: 'squat' });
    const pending = makeWorkout({ id: 'w3', date: null, status: 'pending', liftId: 'deadlift' });

    const daily = aggregateDailyStats([completed, skipped, pending]);
    expect(daily.size).toBe(1);
    expect(daily.get('2026-01-01')?.tonnage).toBe(500);
    expect(daily.get('2026-01-01')?.hasSkip).toBe(true);
    expect(daily.get('2026-01-01')?.hasCompleted).toBe(true);
  });
});

describe('detectPersonalRecords', () => {
  const lifts: LiftConfig[] = [{ id: 'bench', name: 'Bench Press', dayOfWeek: 1, order: 1, cycleIncrement: 3 }];
  const cycles: Cycle[] = [
    { id: 'c1', cycleNumber: 1, startDate: '2026-01-01', trainingMaxes: {}, status: 'completed', completedDate: null },
    { id: 'c2', cycleNumber: 2, startDate: '2026-02-01', trainingMaxes: {}, status: 'active', completedDate: null },
  ];

  it('records only genuine new highs, in chronological order, newest first', () => {
    const workouts: Workout[] = [
      makeWorkout({ id: 'pr1', date: '2026-01-05', estimatedOneRepMax: 150, cycleId: 'c1', week: 3 }),
      makeWorkout({ id: 'pr2', date: '2026-01-12', estimatedOneRepMax: 145, cycleId: 'c1', week: 1 }), // not a PR
      makeWorkout({ id: 'pr3', date: '2026-02-05', estimatedOneRepMax: 160, cycleId: 'c2', week: 3 }), // new PR
    ];
    const records = detectPersonalRecords(workouts, lifts, cycles);
    expect(records).toHaveLength(2);
    expect(records[0].e1rm).toBe(160);
    expect(records[0].cycleNumber).toBe(2);
    expect(records[1].e1rm).toBe(150);
  });

  it('a workout with no estimatedOneRepMax (e.g. a pending or skipped session) is ignored', () => {
    const workouts: Workout[] = [makeWorkout({ estimatedOneRepMax: null })];
    expect(detectPersonalRecords(workouts, lifts, cycles)).toHaveLength(0);
  });
});

describe('bestE1RMExcluding', () => {
  const workouts: Workout[] = [
    makeWorkout({ id: 'a', liftId: 'bench', estimatedOneRepMax: 150 }),
    makeWorkout({ id: 'b', liftId: 'bench', estimatedOneRepMax: 160 }),
  ];

  it('finds the best across all workouts for a lift', () => {
    expect(bestE1RMExcluding('bench', workouts)).toBe(160);
  });
  it('excludes the specified workout - used to check "is this live entry a new PR"', () => {
    expect(bestE1RMExcluding('bench', workouts, 'b')).toBe(150);
  });
  it('returns null for a lift with no data', () => {
    expect(bestE1RMExcluding('squat', workouts)).toBeNull();
  });
});

describe('calculateLifetimeStats', () => {
  it('tallies tonnage/sessions/skips/cycles/PRs correctly', () => {
    const completed = makeWorkout({ id: 'a', mainSets: [loggedSet(100, 5, true)] });
    const skipped = makeWorkout({ id: 'b', status: 'skipped' });
    const cycles: Cycle[] = [
      { id: 'c1', cycleNumber: 1, startDate: '2026-01-01', trainingMaxes: {}, status: 'completed', completedDate: null },
    ];
    const stats = calculateLifetimeStats([completed, skipped], cycles, []);
    expect(stats.totalSessions).toBe(1);
    expect(stats.totalSkipped).toBe(1);
    expect(stats.cyclesCompleted).toBe(1);
    expect(stats.totalTonnage).toBe(500);
  });
});

describe('buildHeatmapWeeks', () => {
  // Anchored to a known Wednesday so the calendar-alignment math is checkable by hand.
  const now = new Date('2026-07-15T12:00:00.000Z');

  it('produces the right number of weeks and days', () => {
    const weeks = buildHeatmapWeeks(new Map(), 4, now);
    expect(weeks).toHaveLength(4);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('the last week spans Sunday through Saturday around today', () => {
    const weeks = buildHeatmapWeeks(new Map(), 4, now);
    const lastWeek = weeks[3];
    expect(lastWeek[0].date).toBe('2026-07-12'); // Sunday
    expect(lastWeek[3].date).toBe('2026-07-15'); // today (Wednesday)
    expect(lastWeek[6].date).toBe('2026-07-18'); // Saturday
    expect(lastWeek[3].isFuture).toBe(false);
    expect(lastWeek[6].isFuture).toBe(true);
  });

  it('cells pick up matching daily stats by date', () => {
    const daily = aggregateDailyStats([makeWorkout({ date: '2026-07-15' })]);
    const weeks = buildHeatmapWeeks(daily, 1, now);
    expect(weeks[0][3].stat?.hasCompleted).toBe(true);
    expect(weeks[0][0].stat).toBeNull();
  });
});

describe('tonnageBucket', () => {
  it('buckets relative to the max, 0 for nothing logged', () => {
    expect(tonnageBucket(0, 1000)).toBe(0);
    expect(tonnageBucket(1000, 1000)).toBe(4);
    expect(tonnageBucket(800, 1000)).toBe(4);
    expect(tonnageBucket(600, 1000)).toBe(3);
    expect(tonnageBucket(300, 1000)).toBe(2);
    expect(tonnageBucket(100, 1000)).toBe(1);
  });
  it('handles a zero max without dividing by zero', () => {
    expect(tonnageBucket(50, 0)).toBe(1);
  });
});

describe('formatTonnage', () => {
  it('adds thousands separators for readability at scale', () => {
    expect(formatTonnage(1925, 'kg')).toBe('1,925kg');
    expect(formatTonnage(500, 'kg')).toBe('500kg');
    expect(formatTonnage(45890, 'lb')).toBe('45,890lb');
  });
});
