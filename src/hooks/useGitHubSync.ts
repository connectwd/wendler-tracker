import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData, PendingConflict, SyncConfig, SyncState, SyncStatus } from '../types';
import * as db from '../lib/db';
import { pullRemote, pushRemote, SyncConflictError } from '../lib/github-sync';
import { decideSyncAction } from '../lib/sync-reconcile';
import { makeAppError, type AppError } from '../lib/errors';

const SYNC_DEBOUNCE_MS = 3000;

export interface UseGitHubSyncReturn {
  syncConfig: SyncConfig;
  syncStatus: SyncStatus;
  syncState: SyncState;
  pendingConflict: PendingConflict | null;
  syncError: AppError | null;
  updateSyncConfig: (config: SyncConfig) => Promise<void>;
  syncNow: () => Promise<void>;
  resolveConflict: (keep: 'local' | 'remote') => Promise<void>;
  /** Call after any local mutation - debounces a push if sync is enabled, no-ops otherwise. */
  notifyLocalChange: () => void;
}

/**
 * Owns the GitHub sync subsystem: config, connection status, the debounced
 * push-after-save, and conflict detection/resolution. Deliberately separate
 * from useAppData - this hook only needs to read the current data (via
 * `getData`) and be told how to adopt a remote version (via `onAdoptRemote`);
 * it doesn't own the data itself.
 */
export function useGitHubSync(
  dataLoaded: boolean,
  getData: () => AppData,
  onAdoptRemote: (data: AppData) => Promise<void>
): UseGitHubSyncReturn {
  const getDataRef = useRef(getData);
  getDataRef.current = getData;
  const onAdoptRemoteRef = useRef(onAdoptRemote);
  onAdoptRemoteRef.current = onAdoptRemote;

  const [syncConfig, setSyncConfigState] = useState<SyncConfig>(db.DEFAULT_SYNC_CONFIG);
  const syncConfigRef = useRef(syncConfig);

  const [syncState, setSyncStateState] = useState<SyncState>(db.DEFAULT_SYNC_STATE);
  const syncStateRef = useRef(syncState);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('disabled');
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);
  const [syncError, setSyncError] = useState<AppError | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** The single place that updates sync state - keeps the ref and the render state
   * in lockstep so async callbacks never read a stale value between the two
   * (the previous version only did this consistently in one of six call sites). */
  const persistSyncState = useCallback(async (next: SyncState) => {
    syncStateRef.current = next;
    setSyncStateState(next);
    try {
      await db.saveSyncState(next);
    } catch {
      // Sync bookkeeping failing to persist isn't worth interrupting the user over -
      // worst case we re-evaluate from a slightly stale lastKnownSha next time, which
      // the 409-conflict path already handles safely.
    }
  }, []);

  const setConfig = useCallback((config: SyncConfig) => {
    syncConfigRef.current = config;
    setSyncConfigState(config);
  }, []);

  /** Replaces local data with a remote payload - used by both the silent
   * "adopt-remote" reconcile path and the explicit "keep the synced version"
   * conflict resolution. Previously duplicated between the two call sites. */
  const adoptRemote = useCallback(
    async (remoteData: AppData, sha: string, updatedAt: string) => {
      await onAdoptRemoteRef.current(remoteData);
      await persistSyncState({ lastKnownSha: sha, lastSyncedAt: updatedAt, localDirty: false, lastError: null });
    },
    [persistSyncState]
  );

  const performPush = useCallback(async () => {
    const config = syncConfigRef.current;
    if (!config.enabled) return;
    setSyncStatus('syncing');
    try {
      const result = await pushRemote(config, getDataRef.current(), syncStateRef.current.lastKnownSha);
      await persistSyncState({
        lastKnownSha: result.sha,
        lastSyncedAt: result.updatedAt,
        localDirty: false,
        lastError: null,
      });
      setSyncError(null);
      setSyncStatus('idle');
    } catch (err) {
      if (err instanceof SyncConflictError) {
        setPendingConflict({ remote: err.remotePayload, remoteSha: err.remoteSha });
        setSyncStatus('conflict');
        return;
      }
      const appErr = makeAppError('syncing to GitHub', err);
      setSyncError(appErr);
      await persistSyncState({ ...syncStateRef.current, lastError: appErr.message });
      setSyncStatus('error');
    }
  }, [persistSyncState]);

  const scheduleSync = useCallback(() => {
    if (!syncConfigRef.current.enabled) return;
    void persistSyncState({ ...syncStateRef.current, localDirty: true });
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void performPush();
    }, SYNC_DEBOUNCE_MS);
  }, [performPush, persistSyncState]);

  const reconcile = useCallback(async () => {
    const config = syncConfigRef.current;
    if (!config.enabled) return;
    setSyncStatus('syncing');
    try {
      const remote = await pullRemote(config);
      const decision = decideSyncAction(remote?.sha ?? null, syncStateRef.current);

      switch (decision.action) {
        case 'push-initial':
        case 'push-local':
          await performPush();
          break;
        case 'noop':
          setSyncError(null);
          setSyncStatus('idle');
          break;
        case 'adopt-remote':
          if (remote) await adoptRemote(remote.payload.data, remote.sha, remote.payload.updatedAt);
          setSyncError(null);
          setSyncStatus('idle');
          break;
        case 'conflict':
          if (remote) setPendingConflict({ remote: remote.payload, remoteSha: remote.sha });
          setSyncStatus('conflict');
          break;
      }
    } catch (err) {
      const appErr = makeAppError('checking GitHub for updates', err);
      setSyncError(appErr);
      await persistSyncState({ ...syncStateRef.current, lastError: appErr.message });
      setSyncStatus('error');
    }
  }, [performPush, adoptRemote, persistSyncState]);

  // Load sync config/state once on mount, independent of when the parent's own data finishes loading.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [config, state] = await Promise.all([db.getSyncConfig(), db.getSyncState()]);
        if (cancelled) return;
        setConfig(config);
        syncStateRef.current = state;
        setSyncStateState(state);
        setSyncStatus(config.enabled ? 'syncing' : 'disabled');
      } catch (err) {
        if (!cancelled) setSyncError(makeAppError('loading sync settings', err));
      } finally {
        if (!cancelled) setConfigLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setConfig]);

  // Once both our own config and the parent's data are ready, do the initial reconcile.
  const didInitialReconcile = useRef(false);
  useEffect(() => {
    if (configLoaded && dataLoaded && syncConfigRef.current.enabled && !didInitialReconcile.current) {
      didInitialReconcile.current = true;
      void reconcile();
    }
  }, [configLoaded, dataLoaded, reconcile]);

  const updateSyncConfig = useCallback(
    async (config: SyncConfig) => {
      setConfig(config);
      try {
        await db.saveSyncConfig(config);
      } catch (err) {
        setSyncError(makeAppError('saving sync settings', err));
        return;
      }
      setSyncStatus(config.enabled ? 'syncing' : 'disabled');
      if (config.enabled) await reconcile();
    },
    [reconcile, setConfig]
  );

  const resolveConflict = useCallback(
    async (keep: 'local' | 'remote') => {
      if (!pendingConflict) return;
      if (keep === 'remote') {
        await adoptRemote(pendingConflict.remote.data, pendingConflict.remoteSha, pendingConflict.remote.updatedAt);
      } else {
        try {
          const result = await pushRemote(syncConfigRef.current, getDataRef.current(), pendingConflict.remoteSha);
          await persistSyncState({
            lastKnownSha: result.sha,
            lastSyncedAt: result.updatedAt,
            localDirty: false,
            lastError: null,
          });
        } catch (err) {
          setSyncError(makeAppError('resyncing after conflict', err));
        }
      }
      setPendingConflict(null);
      setSyncStatus('idle');
    },
    [pendingConflict, adoptRemote, persistSyncState]
  );

  return {
    syncConfig,
    syncStatus,
    syncState,
    pendingConflict,
    syncError,
    updateSyncConfig,
    syncNow: reconcile,
    resolveConflict,
    notifyLocalChange: scheduleSync,
  };
}
