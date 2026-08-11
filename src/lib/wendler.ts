import type {
  WeekNumber,
  LoggedSet,
  LiftConfig,
  Cycle,
  Settings,
  Workout,
} from "../types";
import { makeId } from "./id";

/**
 * Standard Wendler 5/3/1 main-work percentage/rep scheme.
 * Verified against a real logged cycle: TM 166.5 -> week1 sets of
 * 107.5/125/142.5, week4 (deload) 67.5/82.5/100. Both match exactly.
 */
export const MAIN_WORK_SCHEME: Record<
  WeekNumber,
  { percentage: number; reps: number; isAmrap: boolean }[]
> = {
  1: [
    { percentage: 0.65, reps: 5, isAmrap: false },
    { percentage: 0.75, reps: 5, isAmrap: false },
    { percentage: 0.85, reps: 5, isAmrap: true },
  ],
  2: [
    { percentage: 0.7, reps: 3, isAmrap: false },
    { percentage: 0.8, reps: 3, isAmrap: false },
    { percentage: 0.9, reps: 3, isAmrap: true },
  ],
  3: [
    { percentage: 0.75, reps: 5, isAmrap: false },
    { percentage: 0.85, reps: 3, isAmrap: false },
    { percentage: 0.95, reps: 1, isAmrap: true },
  ],
  4: [
    { percentage: 0.4, reps: 5, isAmrap: false },
    { percentage: 0.5, reps: 5, isAmrap: false },
    { percentage: 0.6, reps: 5, isAmrap: false },
  ],
};

/**
 * "Boring But Strong": 10 sets of 5 at that week's First-Set-Last (FSL)
 * percentage - i.e. the same percentage as main work Set 1 for that week.
 * This is the true BBS scheme (as opposed to "Boring But Big", which is
 * 5x10 at a flat 50% of TM regardless of week).
 */
export const FSL_PERCENTAGE: Record<WeekNumber, number> = {
  1: 0.65,
  2: 0.7,
  3: 0.75,
  4: 0.4,
};
export const BBS_SET_COUNT = 10;
export const BBS_REPS = 5;

export const WEEK_LABELS: Record<WeekNumber, string> = {
  1: "Week 1 (5s)",
  2: "Week 2 (3s)",
  3: "Week 3 (5/3/1)",
  4: "Week 4 (Deload)",
};

/** Round to the nearest multiple of `increment` (half rounds up, matching standard plate-math conventions). */
export function roundToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return weight;
  return Math.round(weight / increment) * increment;
}

/** Training Max = a percentage (default 90%) of a true or estimated 1RM. Not rounded - kept exact so small increments compound correctly over many cycles. */
export function calculateTrainingMax(
  oneRepMax: number,
  percentageOfMax = 0.9,
): number {
  return oneRepMax * percentageOfMax;
}

/**
 * Brzycki formula: 1RM = weight / (1.0278 - 0.0278 x reps).
 * Verified against real logged data: 142.5kg x 5 reps -> 160.33kg (matches to 2dp).
 * Reps are capped at 15 - the formula diverges wildly above that and a 15+ rep
 * set was never a true strength effort anyway.
 */
export function estimateOneRepMax(weight: number, reps: number): number | null {
  if (!weight || reps === null || reps === undefined || reps <= 0) return null;
  if (reps === 1) return weight;
  const cappedReps = Math.min(reps, 15);
  const denominator = 1.0278 - 0.0278 * cappedReps;
  if (denominator <= 0) return null;
  return weight / denominator;
}

export interface SetPrescription {
  setNumber: number;
  targetWeight: number;
  targetReps: number;
  isAmrap: boolean;
}

/** Shared by all three set-generator functions below - map a scheme of percentages/reps onto actual rounded weights for one Training Max. */
function buildSetPrescriptions(
  trainingMax: number,
  roundingIncrement: number,
  sets: { percentage: number; reps: number; isAmrap: boolean }[],
): SetPrescription[] {
  return sets.map((s, i) => ({
    setNumber: i + 1,
    targetWeight: roundToIncrement(
      trainingMax * s.percentage,
      roundingIncrement,
    ),
    targetReps: s.reps,
    isAmrap: s.isAmrap,
  }));
}

export function generateMainWorkSets(
  trainingMax: number,
  week: WeekNumber,
  roundingIncrement: number,
): SetPrescription[] {
  return buildSetPrescriptions(
    trainingMax,
    roundingIncrement,
    MAIN_WORK_SCHEME[week],
  );
}

/**
 * Standard warm-up ramp before the main work, based on Training Max.
 * Kept the same across all four weeks (including deload) for simplicity -
 * the work sets are already light in week 4, so a lighter ramp isn't critical.
 */
export const WARMUP_SCHEME: { percentage: number; reps: number }[] = [
  { percentage: 0.4, reps: 5 },
  { percentage: 0.5, reps: 5 },
  { percentage: 0.6, reps: 3 },
];

export function generateWarmupSets(
  trainingMax: number,
  roundingIncrement: number,
): SetPrescription[] {
  return buildSetPrescriptions(
    trainingMax,
    roundingIncrement,
    WARMUP_SCHEME.map((s) => ({ ...s, isAmrap: false })),
  );
}

export function generateBbsSets(
  trainingMax: number,
  week: WeekNumber,
  roundingIncrement: number,
): SetPrescription[] {
  const percentage = FSL_PERCENTAGE[week];
  return buildSetPrescriptions(
    trainingMax,
    roundingIncrement,
    Array.from({ length: BBS_SET_COUNT }, () => ({
      percentage,
      reps: BBS_REPS,
      isAmrap: false,
    })),
  );
}

export function prescriptionsToLoggedSets(
  prescriptions: SetPrescription[],
): LoggedSet[] {
  return prescriptions.map((p) => ({
    setNumber: p.setNumber,
    targetWeight: p.targetWeight,
    targetReps: p.targetReps,
    isAmrap: p.isAmrap,
    actualReps: null,
    actualWeight: null,
    completed: false,
  }));
}

/**
 * The next cycle's Training Max. This is a flat add, matching standard
 * Wendler practice (and the increment your spreadsheet already used) -
 * the TM itself is never rounded to the plate increment, only the set
 * weights derived from it are. Verified: 166.5 + 3 = 169.5 across cycles
 * in the source spreadsheet, never rounded to a "cleaner" number.
 */
export function nextCycleTrainingMax(
  previousTM: number,
  cycleIncrement: number,
): number {
  return previousTM + cycleIncrement;
}

/**
 * Builds every Workout stub (4 lifts x 4 weeks = 16) for a cycle up front,
 * with prescribed sets already calculated from that lift's Training Max.
 * Actual weights/reps stay null until logged at the gym.
 */
export function generateWorkoutsForCycle(
  cycle: Cycle,
  lifts: LiftConfig[],
  settings: Settings,
): Workout[] {
  const workouts: Workout[] = [];
  for (const lift of lifts) {
    const tm = cycle.trainingMaxes[lift.id];
    if (tm === undefined) continue;
    for (const week of [1, 2, 3, 4] as WeekNumber[]) {
      const warmupSets = prescriptionsToLoggedSets(
        generateWarmupSets(tm, settings.roundingIncrement),
      );
      const mainSets = prescriptionsToLoggedSets(
        generateMainWorkSets(tm, week, settings.roundingIncrement),
      );
      const bbsSets = prescriptionsToLoggedSets(
        generateBbsSets(tm, week, settings.roundingIncrement),
      );
      workouts.push({
        id: makeId(),
        cycleId: cycle.id,
        liftId: lift.id,
        week,
        date: null,
        warmupSets,
        mainSets,
        bbsSets,
        accessories: [],
        estimatedOneRepMax: null,
        status: "pending",
        bodyweight: null,
        notes: "",
      });
    }
  }
  return workouts;
}

/** Builds the next Cycle record: bumps cycle number, carries each lift's TM forward by its configured increment. */
export function buildNextCycle(
  previousCycle: Cycle,
  lifts: LiftConfig[],
  startDate: string,
): Cycle {
  const trainingMaxes: Record<string, number> = {};
  for (const lift of lifts) {
    const prevTM = previousCycle.trainingMaxes[lift.id] ?? 0;
    trainingMaxes[lift.id] = nextCycleTrainingMax(prevTM, lift.cycleIncrement);
  }
  return {
    id: makeId(),
    cycleNumber: previousCycle.cycleNumber + 1,
    startDate,
    trainingMaxes,
    status: "active",
    completedDate: null,
  };
}

/** `lifts` isn't used in the body - kept only so this has the same call
 * shape as buildNextCycle (which does need it, to carry TMs forward). The
 * underscore keeps noUnusedParameters happy without changing any call site. */
export function buildFirstCycle(
  _lifts: LiftConfig[],
  trainingMaxes: Record<string, number>,
  startDate: string,
): Cycle {
  return {
    id: makeId(),
    cycleNumber: 1,
    startDate,
    trainingMaxes,
    status: "active",
    completedDate: null,
  };
}

/**
 * Recomputes target weights for a workout's not-yet-completed sets against a
 * corrected Training Max - used when fixing an onboarding mistake (a mis-entered
 * or over-generous rep max) mid-cycle. Any set that's already been logged at the
 * gym (`completed: true`) is left exactly as it was: that's a real historical
 * record of what actually happened, not a prescription this function should be
 * rewriting after the fact. Only pending sets' targetWeight/targetReps/isAmrap
 * get refreshed to match the new number.
 */
export function regenerateWorkoutForNewTrainingMax(
  workout: Workout,
  newTrainingMax: number,
  roundingIncrement: number,
): Workout {
  function mergeSets(
    existing: LoggedSet[],
    prescriptions: SetPrescription[],
  ): LoggedSet[] {
    return existing.map((set, i) => {
      if (set.completed) return set;
      const p = prescriptions[i];
      if (!p) return set;
      return {
        ...set,
        targetWeight: p.targetWeight,
        targetReps: p.targetReps,
        isAmrap: p.isAmrap,
      };
    });
  }

  return {
    ...workout,
    warmupSets: mergeSets(
      workout.warmupSets,
      generateWarmupSets(newTrainingMax, roundingIncrement),
    ),
    mainSets: mergeSets(
      workout.mainSets,
      generateMainWorkSets(newTrainingMax, workout.week, roundingIncrement),
    ),
    bbsSets: mergeSets(
      workout.bbsSets,
      generateBbsSets(newTrainingMax, workout.week, roundingIncrement),
    ),
  };
}
