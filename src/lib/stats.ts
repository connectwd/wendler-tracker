import type { Cycle, LiftConfig, Workout } from '../types';

/** Sum of weight x reps across every logged set (warm-up + main + BBS) in a session. */
export function workoutTonnage(workout: Workout): number {
  const allSets = [...workout.warmupSets, ...workout.mainSets, ...workout.bbsSets];
  return allSets.reduce((sum, s) => {
    if (s.actualWeight != null && s.actualReps != null) {
      return sum + s.actualWeight * s.actualReps;
    }
    return sum;
  }, 0);
}

export interface DailyStat {
  date: string; // yyyy-mm-dd
  tonnage: number;
  hasSkip: boolean;
  hasCompleted: boolean;
}

/** Groups every resolved (completed or skipped) workout by its logged date, for the heatmap. */
export function aggregateDailyStats(workouts: Workout[]): Map<string, DailyStat> {
  const map = new Map<string, DailyStat>();
  for (const w of workouts) {
    if (!w.date || w.status === 'pending') continue;
    const existing = map.get(w.date) ?? { date: w.date, tonnage: 0, hasSkip: false, hasCompleted: false };
    if (w.status === 'completed') {
      existing.tonnage += workoutTonnage(w);
      existing.hasCompleted = true;
    } else {
      existing.hasSkip = true;
    }
    map.set(w.date, existing);
  }
  return map;
}

export interface PersonalRecord {
  workoutId: string;
  liftId: string;
  liftName: string;
  date: string;
  e1rm: number;
  cycleNumber: number;
  week: number;
}

/**
 * Every all-time-best moment for each lift, in chronological order of when it
 * happened. A lift with a steadily rising e1RM produces one record per rise;
 * a lift that's plateaued produces just its one high-water mark.
 */
export function detectPersonalRecords(workouts: Workout[], lifts: LiftConfig[], cycles: Cycle[]): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  for (const lift of lifts) {
    const liftWorkouts = workouts
      .filter((w) => w.liftId === lift.id && w.estimatedOneRepMax !== null && w.date !== null)
      .slice()
      .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));
    let best = 0;
    for (const w of liftWorkouts) {
      if (w.estimatedOneRepMax! > best) {
        best = w.estimatedOneRepMax!;
        const cycle = cycles.find((c) => c.id === w.cycleId);
        records.push({
          workoutId: w.id,
          liftId: lift.id,
          liftName: lift.name,
          date: w.date!,
          e1rm: w.estimatedOneRepMax!,
          cycleNumber: cycle?.cycleNumber ?? 0,
          week: w.week,
        });
      }
    }
  }
  // Newest first for display purposes.
  return records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * The best e1RM logged for a lift so far, excluding one workout (typically the
 * session currently being edited) - used to detect "is this a new PR right now".
 */
export function bestE1RMExcluding(liftId: string, workouts: Workout[], excludeWorkoutId?: string): number | null {
  let best: number | null = null;
  for (const w of workouts) {
    if (w.liftId !== liftId || w.id === excludeWorkoutId) continue;
    if (w.estimatedOneRepMax !== null && (best === null || w.estimatedOneRepMax > best)) {
      best = w.estimatedOneRepMax;
    }
  }
  return best;
}

export interface LifetimeStats {
  totalTonnage: number;
  totalSessions: number;
  totalSkipped: number;
  cyclesCompleted: number;
  prCount: number;
}

export function calculateLifetimeStats(workouts: Workout[], cycles: Cycle[], records: PersonalRecord[]): LifetimeStats {
  let totalTonnage = 0;
  let totalSessions = 0;
  let totalSkipped = 0;
  for (const w of workouts) {
    if (w.status === 'completed') {
      totalTonnage += workoutTonnage(w);
      totalSessions += 1;
    } else if (w.status === 'skipped') {
      totalSkipped += 1;
    }
  }
  const cyclesCompleted = cycles.filter((c) => c.status === 'completed').length;
  return { totalTonnage, totalSessions, totalSkipped, cyclesCompleted, prCount: records.length };
}

// ---- Heatmap grid ----

export interface HeatmapCell {
  date: string; // yyyy-mm-dd
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
  stat: DailyStat | null;
  isFuture: boolean;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Builds a GitHub-style grid: `weeksBack` columns of 7 days each, ending with
 * the week containing today. Uses the same UTC-based date math as the rest of
 * the app (dates are stored via `toISOString().slice(0,10)`), so grid cell
 * dates line up exactly with stored workout dates regardless of local timezone.
 */
export function buildHeatmapWeeks(
  dailyStats: Map<string, DailyStat>,
  weeksBack: number,
  now: Date = new Date()
): HeatmapCell[][] {
  const todayIso = isoDate(now);
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  const currentWeekStart = new Date(today);
  currentWeekStart.setUTCDate(today.getUTCDate() - today.getUTCDay());
  const gridStart = new Date(currentWeekStart);
  gridStart.setUTCDate(currentWeekStart.getUTCDate() - (weeksBack - 1) * 7);

  const weeks: HeatmapCell[][] = [];
  for (let w = 0; w < weeksBack; w++) {
    const week: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(gridStart);
      cellDate.setUTCDate(gridStart.getUTCDate() + w * 7 + d);
      const iso = isoDate(cellDate);
      week.push({
        date: iso,
        dayOfWeek: d,
        stat: dailyStats.get(iso) ?? null,
        isFuture: iso > todayIso,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

/** Buckets a day's tonnage relative to the busiest day in the visible window, for shading. 0 = nothing logged. */
export function tonnageBucket(tonnage: number, maxTonnage: number): 0 | 1 | 2 | 3 | 4 {
  if (tonnage <= 0) return 0;
  if (maxTonnage <= 0) return 1;
  const ratio = tonnage / maxTonnage;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

/** Renders tonnage with thousands separators so big lifetime totals stay readable. */
export function formatTonnage(value: number, unit: string): string {
  return `${Math.round(value).toLocaleString()}${unit}`;
}
