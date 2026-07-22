import type { AppData, Settings, LiftConfig, Cycle, Workout, SyncConfig, SyncState } from '../types';
import { StorageError } from './errors';

const DB_NAME = 'wendler-tracker';
const DB_VERSION = 2;
const STORES = ['settings', 'lifts', 'cycles', 'workouts', 'syncConfig', 'syncState'] as const;
type StoreName = (typeof STORES)[number];

const SETTINGS_KEY = 'app-settings';
const SYNC_CONFIG_KEY = 'sync-config';
const SYNC_STATE_KEY = 'sync-state';

export const DEFAULT_SETTINGS: Settings = {
  units: 'kg',
  barWeight: 20,
  roundingIncrement: 2.5,
  bodyweight: null,
  onboardingComplete: false,
};

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  owner: '',
  repo: '',
  path: 'wendler-data.json',
  token: '',
};

export const DEFAULT_SYNC_STATE: SyncState = {
  lastKnownSha: null,
  lastSyncedAt: null,
  localDirty: false,
  lastError: null,
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(new StorageError('Could not open the local database.', req.error));
    // Fires if another tab has the DB open on an older version and won't let
    // this one upgrade. Without this the promise would just hang forever.
    req.onblocked = () =>
      reject(
        new StorageError(
          'The local database is open in another tab on an older version - close other tabs of this app and reload.'
        )
      );
  });
  return dbPromise;
}

/** Single-store request (get/put/delete/getAll) wrapped in a consistent StorageError on failure. */
function tx<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () =>
          reject(new StorageError(`A database request on "${storeName}" failed.`, req.error));
      })
  );
}

/**
 * Runs several writes across one or more stores as a single atomic
 * transaction - either everything in `work` lands, or none of it does.
 * Used for anything that writes more than one logical record at a time
 * (starting a cycle, restoring a backup) so a mid-way failure can't leave
 * the data half-written.
 */
function runTransaction(
  storeNames: StoreName[],
  mode: IDBTransactionMode,
  work: (t: IDBTransaction) => void
): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(new StorageError('A database transaction failed.', t.error));
        t.onabort = () => reject(new StorageError('A database transaction was aborted.', t.error));
        try {
          work(t);
        } catch (err) {
          reject(err instanceof StorageError ? err : new StorageError('Failed to queue database writes.', err));
        }
      })
  );
}

function getAll<T>(storeName: StoreName): Promise<T[]> {
  return tx<T[]>(storeName, 'readonly', (store) => store.getAll() as IDBRequest<T[]>);
}

function put<T>(storeName: StoreName, value: T): Promise<IDBValidKey> {
  return tx<IDBValidKey>(storeName, 'readwrite', (store) => store.put(value));
}

const DATA_STORES = ['settings', 'lifts', 'cycles', 'workouts'] as const;

// ---- Generic singleton-row helpers (settings / sync config / sync state
// all follow "one row, fixed key" - this replaces three near-identical
// get/strip-id/default implementations with one.) ----

async function getSingleton<T extends object>(storeName: StoreName, key: string, fallback: T): Promise<T> {
  const rows = await getAll<T & { id: string }>(storeName);
  const row = rows.find((r) => r.id === key);
  if (!row) return { ...fallback };
  const { id: _id, ...rest } = row;
  return rest as T;
}

function saveSingleton<T extends object>(storeName: StoreName, key: string, value: T): Promise<IDBValidKey> {
  return put(storeName, { id: key, ...value });
}

// ---- Settings ----

export function getSettings(): Promise<Settings> {
  return getSingleton('settings', SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function saveSettings(settings: Settings): Promise<IDBValidKey> {
  return saveSingleton('settings', SETTINGS_KEY, settings);
}

// ---- Lifts ----

export function getLifts(): Promise<LiftConfig[]> {
  return getAll<LiftConfig>('lifts').then((lifts) => lifts.sort((a, b) => a.order - b.order));
}

/**
 * Replaces the entire lift list atomically: clears the store and reinserts
 * exactly what's given, in one transaction. This is a reconcile, not a
 * merge - a lift missing from `lifts` is genuinely removed, not left
 * behind as a stale record (the previous version only ever added/updated,
 * never cleaned up).
 */
export function saveLifts(lifts: LiftConfig[]): Promise<void> {
  return runTransaction(['lifts'], 'readwrite', (t) => {
    const store = t.objectStore('lifts');
    store.clear();
    for (const lift of lifts) store.put(lift);
  });
}

// ---- Cycles ----

export function getCycles(): Promise<Cycle[]> {
  return getAll<Cycle>('cycles').then((cycles) => cycles.sort((a, b) => a.cycleNumber - b.cycleNumber));
}

export function saveCycle(cycle: Cycle): Promise<IDBValidKey> {
  return put('cycles', cycle);
}

// ---- Workouts ----

export function getWorkouts(): Promise<Workout[]> {
  return getAll<Workout>('workouts');
}

export function saveWorkout(workout: Workout): Promise<IDBValidKey> {
  return put('workouts', workout);
}

// ---- Bulk/atomic operations ----

export async function getAllData(): Promise<AppData> {
  const [settings, lifts, cycles, workouts] = await Promise.all([
    getSettings(),
    getLifts(),
    getCycles(),
    getWorkouts(),
  ]);
  return { settings, lifts, cycles, workouts };
}

/** Everything onboarding creates (settings, lifts, Cycle 1, its 16 workouts) as one atomic write. */
export function saveOnboardingData(
  settings: Settings,
  lifts: LiftConfig[],
  cycle: Cycle,
  workouts: Workout[]
): Promise<void> {
  return runTransaction(['settings', 'lifts', 'cycles', 'workouts'], 'readwrite', (t) => {
    t.objectStore('settings').put({ id: SETTINGS_KEY, ...settings });
    for (const lift of lifts) t.objectStore('lifts').put(lift);
    t.objectStore('cycles').put(cycle);
    for (const w of workouts) t.objectStore('workouts').put(w);
  });
}

/** Completing one cycle and starting the next, as one atomic write. */
export function saveCycleTransition(completedCycle: Cycle, nextCycle: Cycle, nextWorkouts: Workout[]): Promise<void> {
  return runTransaction(['cycles', 'workouts'], 'readwrite', (t) => {
    t.objectStore('cycles').put(completedCycle);
    t.objectStore('cycles').put(nextCycle);
    for (const w of nextWorkouts) t.objectStore('workouts').put(w);
  });
}

/** Wipes and rewrites all AppData in one transaction - used for backup restore, so a failure partway through can't leave a half-restored mix of old and new data. */
export function replaceAllData(data: AppData): Promise<void> {
  return runTransaction(DATA_STORES as unknown as StoreName[], 'readwrite', (t) => {
    for (const store of DATA_STORES) {
      t.objectStore(store).clear();
    }
    t.objectStore('settings').put({ id: SETTINGS_KEY, ...data.settings });
    for (const lift of data.lifts) t.objectStore('lifts').put(lift);
    for (const cycle of data.cycles) t.objectStore('cycles').put(cycle);
    for (const workout of data.workouts) t.objectStore('workouts').put(workout);
  });
}

/**
 * Asks the browser to grant "persistent" storage, which makes eviction
 * under storage pressure far less likely. Best-effort only - not every
 * browser grants it, and it doesn't survive a manual "clear browsing data".
 * That's what the backup export is for.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (navigator.storage?.estimate) {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage ?? 0, quota: quota ?? 0 };
  }
  return null;
}

// ---- GitHub sync config & state - deliberately separate from AppData/backups ----

export function getSyncConfig(): Promise<SyncConfig> {
  return getSingleton('syncConfig', SYNC_CONFIG_KEY, DEFAULT_SYNC_CONFIG);
}

export function saveSyncConfig(config: SyncConfig): Promise<IDBValidKey> {
  return saveSingleton('syncConfig', SYNC_CONFIG_KEY, config);
}

export function getSyncState(): Promise<SyncState> {
  return getSingleton('syncState', SYNC_STATE_KEY, DEFAULT_SYNC_STATE);
}

export function saveSyncState(state: SyncState): Promise<IDBValidKey> {
  return saveSingleton('syncState', SYNC_STATE_KEY, state);
}
