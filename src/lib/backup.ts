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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidLift(v: unknown): boolean {
  return isPlainObject(v) && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.cycleIncrement === 'number';
}

function isValidCycle(v: unknown): boolean {
  return (
    isPlainObject(v) &&
    typeof v.id === 'string' &&
    typeof v.cycleNumber === 'number' &&
    isPlainObject(v.trainingMaxes) &&
    (v.status === 'active' || v.status === 'completed')
  );
}

function isValidWorkout(v: unknown): boolean {
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

/**
 * Checks the shape of every record, not just that the top-level containers
 * are arrays - a backup that passed only the old shallow check could still
 * crash the app later (e.g. a Workout missing `mainSets` throws the moment
 * the dashboard tries to read its last set). Not exhaustive field-by-field
 * validation, but enough to catch anything that would otherwise blow up a
 * component render.
 */
function isValidAppData(data: unknown): data is AppData {
  if (!isPlainObject(data)) return false;
  return (
    isPlainObject(data.settings) &&
    Array.isArray(data.lifts) &&
    data.lifts.every(isValidLift) &&
    Array.isArray(data.cycles) &&
    data.cycles.every(isValidCycle) &&
    Array.isArray(data.workouts) &&
    data.workouts.every(isValidWorkout)
  );
}

export async function importBackupFromFile(file: File): Promise<void> {
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
  await replaceAllData(backup.data);
  // Deliberately not marked as a fresh backup: restoring FROM a file doesn't
  // mean there's now an up-to-date copy of your CURRENT data anywhere else -
  // the "back up soon" nag should only reset when you actually export.
}
