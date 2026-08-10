import type { AppData, BackupFile } from '../types';
import { SCHEMA_VERSION } from '../types';
import { getAllData, replaceAllData } from './db';

const LAST_BACKUP_KEY = 'wendler-tracker-last-backup-at';

export function getLastBackupTimestamp(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

function markExportedNow(): void {
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

/** How many days it's been since the last export, or null if never backed up. */
export function daysSinceLastBackup(): number | null {
  const last = getLastBackupTimestamp();
  if (!last) return null;
  const diffMs = Date.now() - new Date(last).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export async function exportBackup(): Promise<void> {
  const data = await getAllData();
  const backup: BackupFile = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'wendler-tracker',
    data,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `wendler-tracker-backup-${dateStamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  markExportedNow();
}

export class BackupValidationError extends Error {}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isValidLift(v: unknown): boolean {
  return isPlainObject(v) && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.cycleIncrement === 'number';
}

export function isValidCycle(v: unknown): boolean {
  return (
    isPlainObject(v) &&
    typeof v.id === 'string' &&
    typeof v.cycleNumber === 'number' &&
    isPlainObject(v.trainingMaxes) &&
    (v.status === 'active' || v.status === 'completed')
  );
}

export function isValidWorkout(v: unknown): boolean {
  return (
    isPlainObject(v) &&
    typeof v.id === 'string' &&
    typeof v.liftId === 'string' &&
    typeof v.cycleId === 'string' &&
    Array.isArray(v.warmupSets) &&
    Array.isArray(v.mainSets) &&
    Array.isArray(v.bbsSets) &&
    Array.isArray(v.accessories) &&
    (v.status === 'pending' || v.status === 'completed' || v.status === 'skipped')
  );
}

export function isValidBodyweightEntry(v: unknown): boolean {
  return isPlainObject(v) && typeof v.id === 'string' && typeof v.date === 'string' && typeof v.weight === 'number';
}

/**
 * Checks the shape of every record, not just that the top-level containers
 * are arrays - a backup that passed only the old shallow check could still
 * crash the app later (e.g. a Workout missing `mainSets` throws the moment
 * the dashboard tries to read its last set). Not exhaustive field-by-field
 * validation, but enough to catch anything that would otherwise blow up a
 * component render.
 *
 * Exported (along with the per-record checks above) so a bug in the
 * rejection logic itself - the thing standing between a corrupted file and
 * `replaceAllData` wiping good data with it - can be unit tested directly,
 * without needing a real IndexedDB.
 */
/**
 * `bodyweightEntries` is checked as *optional* rather than required - a
 * backup exported before this feature existed won't have the field at all,
 * and that's a perfectly valid, restorable backup (see the SCHEMA_VERSION
 * comment in types.ts: this was an additive field, not a shape change, so
 * it deliberately didn't bump the version older backups are checked
 * against). `importBackupFromFile` below fills in `[]` for the missing case.
 */
export function isValidAppData(data: unknown): data is AppData {
  if (!isPlainObject(data)) return false;
  return (
    isPlainObject(data.settings) &&
    Array.isArray(data.lifts) &&
    data.lifts.every(isValidLift) &&
    Array.isArray(data.cycles) &&
    data.cycles.every(isValidCycle) &&
    Array.isArray(data.workouts) &&
    data.workouts.every(isValidWorkout) &&
    (data.bodyweightEntries === undefined ||
      (Array.isArray(data.bodyweightEntries) && data.bodyweightEntries.every(isValidBodyweightEntry)))
  );
}

/**
 * `persist` defaults to the real `replaceAllData` (real IndexedDB) but can be
 * overridden - same dependency-injection approach as `registerServiceWorker`
 * in pwa.ts - so tests can verify a well-formed backup reaches persistence
 * with the right shape without needing a real IndexedDB, and so the
 * rejection paths above can be tested in complete isolation from it.
 */
export async function importBackupFromFile(
  file: File,
  persist: (data: AppData) => Promise<void> = replaceAllData
): Promise<void> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupValidationError('That file is not valid JSON.');
  }
  const backup = parsed as Partial<BackupFile>;
  if (backup.app !== 'wendler-tracker') {
    throw new BackupValidationError("That doesn't look like a wendler-tracker backup file.");
  }
  if (typeof backup.schemaVersion === 'number' && backup.schemaVersion > SCHEMA_VERSION) {
    throw new BackupValidationError('This backup was made by a newer version of the app than this one supports.');
  }
  if (typeof backup.schemaVersion === 'number' && backup.schemaVersion < SCHEMA_VERSION) {
    throw new BackupValidationError(
      `This backup is from an older version of the app (schema v${backup.schemaVersion}, this one expects v${SCHEMA_VERSION}) and can't be restored automatically - the data shape has changed since. Hold onto the file rather than discarding it.`
    );
  }
  if (!isValidAppData(backup.data)) {
    throw new BackupValidationError(
      "This file's contents don't match what a wendler-tracker backup should look like - it may be corrupted."
    );
  }
  // Older backups validated by isValidAppData above may not have this field at all.
  await persist({ ...backup.data, bodyweightEntries: backup.data.bodyweightEntries ?? [] });
  // Deliberately not marked as a fresh backup: restoring FROM a file doesn't
  // mean there's now an up-to-date copy of your CURRENT data anywhere else -
  // the "back up soon" nag should only reset when you actually export.
}
