import type { Cycle, Unit, Workout } from '../types';

export interface PlateauCheck {
  isPlateaued: boolean;
  reason: string | null;
  /** Oldest to newest, e1RM from each cycle's week-3 AMRAP set. */
  recentE1RMs: number[];
}

const LOOKBACK_CYCLES = 3;
/** Allow a hair of noise/measurement variance before calling something a "decline". */
const NOISE_TOLERANCE = 1.01;

/**
 * Looks at the last few cycles' week-3 AMRAP set (the highest-intensity,
 * most sensitive-to-real-strength indicator) for one lift. Flags a plateau
 * if estimated 1RM hasn't meaningfully improved across that whole window -
 * i.e. every step is flat or a decline, not just one off week.
 */
export function checkPlateau(
  liftId: string,
  upToCycleNumber: number,
  cycles: Cycle[],
  workouts: Workout[],
  unit: Unit
): PlateauCheck {
  const relevantCycles = cycles
    .filter((c) => c.cycleNumber <= upToCycleNumber)
    .sort((a, b) => a.cycleNumber - b.cycleNumber)
    .slice(-LOOKBACK_CYCLES);

  const e1rms: number[] = [];
  for (const cycle of relevantCycles) {
    const week3 = workouts.find((w) => w.cycleId === cycle.id && w.liftId === liftId && w.week === 3);
    if (week3?.estimatedOneRepMax) e1rms.push(week3.estimatedOneRepMax);
  }

  if (e1rms.length < LOOKBACK_CYCLES) {
    return { isPlateaued: false, reason: null, recentE1RMs: e1rms };
  }

  let isPlateaued = true;
  for (let i = 1; i < e1rms.length; i++) {
    if (e1rms[i] > e1rms[i - 1] * NOISE_TOLERANCE) {
      isPlateaued = false;
      break;
    }
  }

  const reason = isPlateaued
    ? `Estimated 1RM hasn't improved in ${e1rms.length} cycles (${e1rms.map((v) => v.toFixed(0)).join(' → ')}${unit})`
    : null;

  return { isPlateaued, reason, recentE1RMs: e1rms };
}

/** Standard 5/3/1 "reset": drop Training Max ~10% and build back up from there with more room to move. */
export function resetTrainingMax(currentTM: number, resetPercentage = 0.9): number {
  return currentTM * resetPercentage;
}
