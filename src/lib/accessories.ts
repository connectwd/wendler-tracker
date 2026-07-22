import type { AccessoryCategory, LoggedAccessoryExercise, Workout } from '../types';

export interface AccessoryExerciseOption {
  id: string;
  name: string;
  category: AccessoryCategory;
}

/**
 * Wendler's own assistance framework: one exercise from each of Push, Pull,
 * and Single Leg/Core per session, aiming for 50-100 total reps per category
 * with the set/rep scheme left flexible - this is the same on every training
 * day regardless of which main lift you're doing, not a per-lift pairing.
 * Source: jimwendler.com/blogs/jimwendler-com/101065094-5-3-1-for-a-beginner
 */
export const ACCESSORY_CATALOG: AccessoryExerciseOption[] = [
  // Push
  { id: 'dips', name: 'Dips', category: 'push' },
  { id: 'pushups', name: 'Push-ups', category: 'push' },
  { id: 'db-bench', name: 'DB Bench Press', category: 'push' },
  { id: 'db-incline', name: 'DB Incline Press', category: 'push' },
  { id: 'db-shoulder-press', name: 'DB Shoulder Press', category: 'push' },
  { id: 'triceps-extension', name: 'Triceps Extension / Pushdown', category: 'push' },
  // Pull
  { id: 'chins-pullups', name: 'Chin-ups / Pull-ups', category: 'pull' },
  { id: 'inverted-rows', name: 'Inverted Rows', category: 'pull' },
  { id: 'db-bb-rows', name: 'DB / Barbell Rows', category: 'pull' },
  { id: 'face-pulls', name: 'Face Pulls', category: 'pull' },
  { id: 'band-pull-aparts', name: 'Band Pull-Aparts', category: 'pull' },
  { id: 'lat-pulldown', name: 'Lat Pulldown', category: 'pull' },
  { id: 'curls', name: 'Curls', category: 'pull' },
  // Single leg / core
  { id: 'ab-work', name: 'Ab Wheel / Abdominal Work', category: 'core' },
  { id: 'back-raises', name: 'Back Raises', category: 'core' },
  { id: 'reverse-hyper', name: 'Reverse Hyperextensions', category: 'core' },
  { id: 'lunges', name: 'Lunges', category: 'core' },
  { id: 'step-ups', name: 'Step-ups', category: 'core' },
  { id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', category: 'core' },
  { id: 'kb-swings', name: 'KB Swings', category: 'core' },
];

export const ACCESSORY_CATEGORY_LABELS: Record<AccessoryCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  core: 'Single Leg / Core',
};

/** Wendler's own number - flexible on how you get there (5x10, 3x15, 10x5, etc). */
export const ACCESSORY_REP_TARGET = '50-100 total reps';

export const MAX_ACCESSORY_EXERCISES = 3;

export function getAccessoryOption(exerciseId: string): AccessoryExerciseOption | undefined {
  return ACCESSORY_CATALOG.find((o) => o.id === exerciseId);
}

/**
 * The most recent time this specific exercise was logged with at least one
 * real set, searched across every workout regardless of cycle - a lift done
 * 9 cycles ago still counts. Excludes the workout currently being edited so
 * reopening a session you're mid-editing doesn't show itself as "last time."
 */
export function findLastAccessoryLog(
  exerciseId: string,
  workouts: Workout[],
  excludeWorkoutId?: string
): { date: string; exercise: LoggedAccessoryExercise } | null {
  let best: { date: string; exercise: LoggedAccessoryExercise } | null = null;
  for (const w of workouts) {
    if (w.id === excludeWorkoutId || !w.date) continue;
    for (const acc of w.accessories ?? []) {
      if (acc.exerciseId !== exerciseId) continue;
      const hasLoggedSet = acc.sets.some((s) => s.weight !== null && s.reps !== null);
      if (!hasLoggedSet) continue;
      if (!best || w.date > best.date) best = { date: w.date, exercise: acc };
    }
  }
  return best;
}

/**
 * What was picked last time this specific lift was trained (any prior week
 * or cycle), so a returning session can skip straight to logging instead of
 * re-picking from 20 exercises every time. Null if this lift has never had
 * accessories logged.
 */
export function findLastAccessorySelection(
  liftId: string,
  workouts: Workout[],
  excludeWorkoutId?: string
): LoggedAccessoryExercise[] | null {
  const candidates = workouts
    .filter((w) => w.liftId === liftId && w.id !== excludeWorkoutId && w.date && (w.accessories?.length ?? 0) > 0)
    .sort((a, b) => (a.date! < b.date! ? 1 : -1));
  return candidates[0]?.accessories ?? null;
}
