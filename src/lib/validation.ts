/**
 * Parses a user-typed weight override. Returns null for empty, non-numeric,
 * zero, or negative input rather than letting `parseFloat` hand back `NaN`
 * for the caller to propagate silently through every downstream calculation.
 */
export function parsePositiveWeight(input: string): number | null {
  if (input.trim() === '') return null;
  const value = parseFloat(input);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}
