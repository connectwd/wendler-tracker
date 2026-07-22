/** Random ID for anything created client-side (lifts, cycles, workouts). Falls back to a timestamp+random string on the rare browser without crypto.randomUUID. */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
