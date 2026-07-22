// Core data model for the 5/3/1 tracker.
// Everything here is plain data (no functions) so it can be serialized
// straight to IndexedDB / JSON backups without transformation.

export type Unit = 'kg' | 'lb';

export type WeekNumber = 1 | 2 | 3 | 4;

export interface LiftConfig {
  id: string;
  name: string;
  /** 0 = Sunday .. 6 = Saturday. Just a default suggestion for the dashboard, not enforced. */
  dayOfWeek: number;
  order: number;
  /** Weight added to this lift's Training Max at the start of each new cycle. */
  cycleIncrement: number;
}

export interface Settings {
  units: Unit;
  barWeight: number;
  roundingIncrement: number;
  bodyweight: number | null;
  onboardingComplete: boolean;
}

export interface Cycle {
  id: string;
  cycleNumber: number;
  startDate: string; // ISO date string (yyyy-mm-dd)
  /** Training Max used for every calculation in this cycle, keyed by LiftConfig.id */
  trainingMaxes: Record<string, number>;
  status: 'active' | 'completed';
  completedDate: string | null;
}

export interface LoggedSet {
  setNumber: number;
  targetWeight: number;
  targetReps: number;
  isAmrap: boolean;
  /** null until the person actually logs it at the gym */
  actualReps: number | null;
  /** Usually equals targetWeight, but editable in case a plate-math adjustment was made on the day */
  actualWeight: number | null;
  completed: boolean;
}

export type WorkoutStatus = 'pending' | 'completed' | 'skipped';

export type AccessoryCategory = 'push' | 'pull' | 'core';

export interface AccessorySet {
  setNumber: number;
  weight: number | null;
  reps: number | null;
}

export interface LoggedAccessoryExercise {
  exerciseId: string;
  /** Snapshot of the display name at the time it was logged, so history reads
   * correctly even if the catalog's wording changes later. */
  name: string;
  category: AccessoryCategory;
  sets: AccessorySet[];
}

export interface Workout {
  id: string;
  cycleId: string;
  liftId: string;
  week: WeekNumber;
  date: string | null; // ISO date string, set when marked complete or skipped
  warmupSets: LoggedSet[];
  mainSets: LoggedSet[];
  bbsSets: LoggedSet[];
  /** Up to 3 accessory exercises (Wendler's push/pull/single-leg-core), chosen per session. */
  accessories: LoggedAccessoryExercise[];
  /** Brzycki-estimated 1RM from the AMRAP set, main lift only. Null for week 4 (no AMRAP) or skipped sessions. */
  estimatedOneRepMax: number | null;
  status: WorkoutStatus;
  bodyweight: number | null;
  notes: string;
}

export interface AppData {
  settings: Settings;
  lifts: LiftConfig[];
  cycles: Cycle[];
  workouts: Workout[];
}

export const SCHEMA_VERSION = 3;

export interface BackupFile {
  schemaVersion: number;
  exportedAt: string;
  app: 'wendler-tracker';
  data: AppData;
}

/**
 * Lives in its own IndexedDB store, never inside AppData - this must never
 * be included in a backup export or the synced file itself, or the token
 * would end up committed to the very repo it authenticates against.
 */
export interface SyncConfig {
  enabled: boolean;
  owner: string;
  repo: string;
  path: string;
  token: string;
}

export interface SyncState {
  lastKnownSha: string | null;
  lastSyncedAt: string | null;
  localDirty: boolean;
  lastError: string | null;
}

export type SyncStatus = 'disabled' | 'syncing' | 'idle' | 'error' | 'conflict';

export interface PendingConflict {
  remote: SyncPayload;
  remoteSha: string;
}

/** The payload actually written to the GitHub file - AppData plus a timestamp to compare freshness across devices. */
export interface SyncPayload {
  schemaVersion: number;
  updatedAt: string;
  app: 'wendler-tracker';
  data: AppData;
}

