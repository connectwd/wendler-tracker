import type { BodyweightEntry, LiftConfig, Workout } from '../types';

/** Today's date as yyyy-mm-dd, matching how every other date in this app is stored. */
export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Builds the entry a log action would write. `id` is the date itself - see the BodyweightEntry comment in types.ts. */
export function buildBodyweightEntry(date: string, weight: number): BodyweightEntry {
  return { id: date, date, weight };
}

/** Entries in chronological order, oldest first - every function below assumes this ordering rather than re-sorting internally. */
export function sortedByDate(entries: BodyweightEntry[]): BodyweightEntry[] {
  return entries.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The single most recent weigh-in, or null if nothing's been logged yet. */
export function latestBodyweight(entries: BodyweightEntry[]): BodyweightEntry | null {
  const sorted = sortedByDate(entries);
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

/**
 * What your weight was as of `date` - the most recent entry on or before
 * that date (a "carry forward" lookup), not necessarily an entry logged on
 * that exact day. Returns null if there's no entry on or before `date` yet
 * (e.g. you're looking at a workout logged before you ever weighed in).
 */
export function bodyweightAsOf(entries: BodyweightEntry[], date: string): number | null {
  const sorted = sortedByDate(entries);
  let result: number | null = null;
  for (const entry of sorted) {
    if (entry.date > date) break;
    result = entry.weight;
  }
  return result;
}

export interface ChartPoint {
  x: number;
  y: number;
}

/** Bodyweight over time, oldest first, x as a sequential index (matches how the e1RM chart plots real dates - see ProgressCharts.tsx). */
export function bodyweightTrendPoints(entries: BodyweightEntry[]): ChartPoint[] {
  return sortedByDate(entries).map((e, i) => ({ x: i, y: Math.round(e.weight * 10) / 10 }));
}

/**
 * Estimated-1RM ÷ bodyweight for one lift, across every completed session
 * that has both an e1RM and a bodyweight known as of that session's date -
 * the same "Strength/Weight Ratio" idea the original spreadsheet tracked
 * per cycle, but per session and using a real carried-forward weigh-in
 * instead of one manually-entered number per cycle.
 *
 * A session before the first-ever weigh-in is skipped (no bodyweight to
 * divide by yet) rather than guessed at - a wrong denominator would be
 * worse than a gap in the chart.
 */
export function strengthToBodyweightRatioPoints(
  workouts: Workout[],
  entries: BodyweightEntry[],
  liftId: string
): ChartPoint[] {
  const liftWorkouts = workouts
    .filter((w) => w.liftId === liftId && w.estimatedOneRepMax !== null && w.date !== null)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));

  const points: ChartPoint[] = [];
  for (const w of liftWorkouts) {
    const bw = bodyweightAsOf(entries, w.date!);
    if (bw === null || bw <= 0) continue;
    points.push({ x: points.length, y: Math.round((w.estimatedOneRepMax! / bw) * 1000) / 1000 });
  }
  return points;
}

/** True if every lift has at least one completed e1RM data point that also has a bodyweight to divide by - used to decide whether the ratio chart section has anything worth showing at all. */
export function hasAnyRatioData(workouts: Workout[], entries: BodyweightEntry[], lifts: LiftConfig[]): boolean {
  return lifts.some((lift) => strengthToBodyweightRatioPoints(workouts, entries, lift.id).length > 0);
}
