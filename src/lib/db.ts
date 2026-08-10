import type { AppData, Settings, LiftConfig, Cycle, Workout, BodyweightEntry, SyncConfig, SyncState } from '../types';
import { StorageError } from './errors';

const DB_NAME = 'wendler-tracker';
// v3: adds the 'bodyweightEntries' store. New-store creation (the loop in
// openDB below) is idempotent and always runs regardless of oldVersion, so
// this is a plain version bump with no entry in `migrations` - there's no
// existing store whose *shape* changed, just a new one added.
const DB_VERSION = 3;
const STORES = ['settings', 'lifts', 'cycles', 'workouts', 'bodyweightEntries', 'syncConfig', 'syncState'] as const;
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
  theme: 'serious',
  restTimerShortSeconds: 90,
  restTimerLongSeconds: 180,
  restGameHighScore: 0,
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

/**
 * Record-shape migrations, keyed by the DB_VERSION they migrate a database
 * TO. When a browser's stored oldVersion is below some key N, migrations[N]
 * runs during the upgrade. Steps run in ascending order, so a browser that's
 * been offline since v2, now opening against v5, replays v3's, v4's, and
 * v5's steps in turn rather than jumping straight to the latest shape.
 *
 * This is separate from the store-creation loop in openDB() below, which
 * always runs and is idempotent (an existing store is left alone) - that
 * handles new stores; this handles changing the shape of records already
 * sitting in an existing store. Runs inside the same versionchange
 * transaction the store-creation loop uses, so it has the same all-or-
 * nothing guarantee as everything else in this file: if a migration throws,
 * the whole upgrade aborts and the database stays at its old version rather
 * than landing half-migrated. That failure surfaces through the existing
 * `req.onerror` handler below - no separate error wiring needed for it.
 *
 * Empty for now - nothing's ever needed one. This exists so the day a
 * record's shape actually changes, there's already a place to put the
 * transform instead of retrofitting one under pressure. For example, if a
 * future version split a lift's `name` into `firstName`/`lastName`:
 *
 *   const migrations: Record<number, (t: IDBTransaction) => void> = {
 *     3: (t) =>
 *       migrateStoreRecords(t, 'lifts', (lift) => {
 *         const { name, ...rest } = lift as { name: string };
 *         const [firstName, ...lastParts] = name.split(' ');
 *         return { ...rest, firstName, lastName: lastParts.join(' ') };
 *       }),
 *   };
 */
const migrations: Record<number, (t: IDBTransaction) => void> = {};

/**
 * Applies `transform` to every existing record in `storeName`, in place,
 * within the given (upgrade) transaction. `transform` receives each record
 * in whatever shape it was actually stored in - not necessarily the current
 * `Settings`/`LiftConfig`/etc. type, since the whole point is migrating
 * *away* from an older shape - and must return the new shape to write back.
 */
export function migrateStoreRecords(
  t: IDBTransaction,
  storeName: StoreName,
  transform: (record: unknown) => unknown
): void {
  const store = t.objectStore(storeName);
  const req = store.openCursor();
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;
    cursor.update(transform(cursor.value));
    cursor.continue();
  };
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
      const t = req.transaction;
      if (t) {
        const stepVersions = Object.keys(migrations)
          .map(Number)
          .sort((a, b) => a - b);
        for (const version of stepVersions) {
          if (event.oldVersion < version) {
            migrations[version](t);
          }
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

const DATA_STORES = ['settings', 'lifts', 'cycles', 'workouts', 'bodyweightEntries'] as const;

// ---- Generic singleton-row helpers (settings / sync config / sync state
// all follow "one row, fixed key" - this replaces three near-identical
// get/strip-id/default implementations with one.) ----

async function getSingleton<T extends object>(storeName: StoreName, key: string, fallback: T): Promise<T> {
  const rows = await getAll<T & { id: string }>(storeName);
  const row = rows.find((r) => r.id === key);
  if (!row) return { ...fallback };
  const { id: _id, ...rest } = row;
  // Merge over the default rather than trusting the stored record alone - an
  // existing row predates whatever field was added most recently (e.g.
  // `theme`, added well after `onboardingComplete`), so it won't have it.
  // Without this, that field would be `undefined` at runtime despite the
  // type claiming otherwise.
  return { ...fallback, ...rest };
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

// ---- Bodyweight entries ----

export function getBodyweightEntries(): Promise<BodyweightEntry[]> {
  return getAll<BodyweightEntry>('bodyweightEntries').then((entries) =>
    entries.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  );
}

/**
 * Logs (or overwrites, same date) one weigh-in, and updates the
 * `settings.bodyweight` cache in the same transaction - the caller
 * (useAppData) works out what the new "latest" value should be, since that
 * depends on every entry, not just the one being written (deleting today's
 * entry when yesterday's still exists should fall back to yesterday's, not
 * null). Atomic so the entry and the cache can't drift apart on a partial
 * failure.
 */
export function saveBodyweightEntryWithSettings(entry: BodyweightEntry, settings: Settings): Promise<void> {
  return runTransaction(['bodyweightEntries', 'settings'], 'readwrite', (t) => {
    t.objectStore('bodyweightEntries').put(entry);
    t.objectStore('settings').put({ id: SETTINGS_KEY, ...settings });
  });
}

export function deleteBodyweightEntryWithSettings(id: string, settings: Settings): Promise<void> {
  return runTransaction(['bodyweightEntries', 'settings'], 'readwrite', (t) => {
    t.objectStore('bodyweightEntries').delete(id);
    t.objectStore('settings').put({ id: SETTINGS_KEY, ...settings });
  });
}

// ---- Bulk/atomic operations ----

export async function getAllData(): Promise<AppData> {
  const [settings, lifts, cycles, workouts, bodyweightEntries] = await Promise.all([
    getSettings(),
    getLifts(),
    getCycles(),
    getWorkouts(),
    getBodyweightEntries(),
  ]);
  return { settings, lifts, cycles, workouts, bodyweightEntries };
}

/** Everything onboarding creates (settings, lifts, Cycle 1, its 16 workouts, and an
 * optional first bodyweight entry if one was captured in the wizard) as one atomic write. */
export function saveOnboardingData(
  settings: Settings,
  lifts: LiftConfig[],
  cycle: Cycle,
  workouts: Workout[],
  bodyweightEntries: BodyweightEntry[] = []
): Promise<void> {
  return runTransaction(['settings', 'lifts', 'cycles', 'workouts', 'bodyweightEntries'], 'readwrite', (t) => {
    t.objectStore('settings').put({ id: SETTINGS_KEY, ...settings });
    for (const lift of lifts) t.objectStore('lifts').put(lift);
    t.objectStore('cycles').put(cycle);
    for (const w of workouts) t.objectStore('workouts').put(w);
    for (const e of bodyweightEntries) t.objectStore('bodyweightEntries').put(e);
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

/**
 * Correcting a lift's Training Max mid-cycle (e.g. fixing an onboarding mistake),
 * plus whatever pending workouts got their target weights recalculated as a
 * result - as one atomic write, same reasoning as saveCycleTransition.
 */
export function saveTrainingMaxCorrection(updatedCycle: Cycle, updatedWorkouts: Workout[]): Promise<void> {
  return runTransaction(['cycles', 'workouts'], 'readwrite', (t) => {
    t.objectStore('cycles').put(updatedCycle);
    for (const w of updatedWorkouts) t.objectStore('workouts').put(w);
  });
}

/**
 * Wipes and rewrites all AppData in one transaction - used for backup restore
 * and for adopting a synced remote version, so a failure partway through
 * can't leave a half-restored mix of old and new data.
 *
 * `data.bodyweightEntries` is defaulted to `[]` rather than trusted as
 * present: unlike a backup file (which `backup.ts` validates field-by-field
 * before this ever runs), a synced payload from GitHub is parsed straight
 * from JSON with a type assertion and no runtime check (`github-sync.ts`) -
 * a file written by an older version of the app, from before this field
 * existed, would otherwise hand this function `undefined` here and crash
 * the `for` loop below on the very first sync after updating.
 */
export function replaceAllData(data: AppData): Promise<void> {
  return runTransaction(DATA_STORES as unknown as StoreName[], 'readwrite', (t) => {
    for (const store of DATA_STORES) {
      t.objectStore(store).clear();
    }
    t.objectStore('settings').put({ id: SETTINGS_KEY, ...data.settings });
    for (const lift of data.lifts) t.objectStore('lifts').put(lift);
    for (const cycle of data.cycles) t.objectStore('cycles').put(cycle);
    for (const workout of data.workouts) t.objectStore('workouts').put(workout);
    for (const entry of data.bodyweightEntries ?? []) t.objectStore('bodyweightEntries').put(entry);
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
