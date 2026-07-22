import type { Unit } from '../types';

/** Semantic plate color, matching real competition-plate conventions - the
 * component maps this to an actual CSS value. Keeping raw `var(--...)`
 * strings out of this file was flagged in review: a calculation module
 * shouldn't need to know about the app's CSS custom properties. */
export type PlateColor = 'red' | 'blue' | 'yellow' | 'green' | 'white' | 'black';

export interface PlateSpec {
  weight: number;
  color: PlateColor;
  /** Relative height for the little plate-bar visual, 1 = tallest. */
  size: number;
}

// Standard competition plate colors (kg).
const KG_PLATES: PlateSpec[] = [
  { weight: 25, color: 'red', size: 1 },
  { weight: 20, color: 'blue', size: 0.92 },
  { weight: 15, color: 'yellow', size: 0.84 },
  { weight: 10, color: 'green', size: 0.76 },
  { weight: 5, color: 'white', size: 0.6 },
  { weight: 2.5, color: 'black', size: 0.46 },
  { weight: 1.25, color: 'black', size: 0.38 },
];

// Standard US/imperial gym plate set - this is the piece that was previously
// hardcoded to kg regardless of the person's actual units setting.
const LB_PLATES: PlateSpec[] = [
  { weight: 45, color: 'blue', size: 1 },
  { weight: 35, color: 'yellow', size: 0.88 },
  { weight: 25, color: 'red', size: 0.78 },
  { weight: 10, color: 'green', size: 0.62 },
  { weight: 5, color: 'white', size: 0.5 },
  { weight: 2.5, color: 'black', size: 0.4 },
];

export function availablePlates(unit: Unit): PlateSpec[] {
  return unit === 'lb' ? LB_PLATES : KG_PLATES;
}

export interface PlateResult {
  perSide: { weight: number; color: PlateColor; size: number }[];
  /** Weight left over that can't be made with the available plates (should be ~0 in practice). */
  remainder: number;
  achievable: boolean;
}

/**
 * Greedily fills one side of the bar with the largest plates first.
 * `totalWeight` is the full loaded bar weight (matches this app's "Full weight + bar" display convention).
 * `unit` picks the plate set - kg and lb gyms stock different denominations,
 * so this must match whatever `totalWeight`/`barWeight` are actually in.
 */
export function calculatePlates(totalWeight: number, barWeight: number, unit: Unit): PlateResult {
  const perSideTarget = (totalWeight - barWeight) / 2;
  if (perSideTarget <= 0) {
    return { perSide: [], remainder: 0, achievable: totalWeight <= barWeight };
  }

  let remaining = Math.round(perSideTarget * 100) / 100;
  const perSide: { weight: number; color: PlateColor; size: number }[] = [];

  for (const plate of availablePlates(unit)) {
    while (remaining >= plate.weight - 1e-6) {
      perSide.push({ weight: plate.weight, color: plate.color, size: plate.size });
      remaining = Math.round((remaining - plate.weight) * 100) / 100;
    }
  }

  return { perSide, remainder: Math.max(remaining, 0), achievable: remaining < 0.01 };
}
