import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData, Cycle, LiftConfig, Settings, Workout } from '../types';
import * as db from '../lib/db';
import { buildFirstCycle, buildNextCycle, generateWorkoutsForCycle } from '../lib/wendler';
import { makeAppError, type AppError } from '../lib/errors';
import { useGitHubSync, type UseGitHubSyncReturn } from './useGitHubSync';

interface UseAppDataReturn extends Omit<UseGitHubSyncReturn, 'syncError'> {
  loading: boolean;
  settings: Settings;
  lifts: LiftConfig[];
  cycles: Cycle[];
  workouts: Workout[];
  activeCycle: Cycle | null;
  /** Most recent local-write or sync failure, for a banner/toast. Cleared on the next successful action, or manually via dismissError. */
  appError: AppError | null;
  dismissError: () => void;
  completeOnboarding: (
    settings: Settings,
    lifts: LiftConfig[],
    trainingMaxes: Record<string, number>
  ) => Promise<void>;
  updateSettings: (settings: Settings) => Promise<void>;
  updateLifts: (lifts: LiftConfig[]) => Promise<void>;
  saveWorkout: (workout: Workout) => Promise<void>;
  startNextCycle: (overrideTMs?: Record<string, number>) => Promise<void>;
  reloadAll: () => Promise<void>;
}

const EMPTY_DATA: AppData = {
  settings: db.DEFAULT_SETTINGS,
  lifts: [],
  cycles: [],
  workouts: [],
};

export function useAppData(): UseAppDataReturn {
  const [loading, setLoading] = useState(true);
  const [data, setDataState] = useState<AppData>(EMPTY_DATA);
  const dataRef = useRef(data);

  const [appError, setAppError] = useState<AppError | null>(null);

  /** Updates render state and the ref together, always - the audit flagged
   * an earlier version of this file for only doing this consistently in one
   * of several call sites, which left a window where async callbacks could
   * read a stale value from the ref. */
  const setData = useCallback((next: AppData) => {
    dataRef.current = next;
    setDataState(next);
  }, []);

  /** Every local write goes through here: on failure, surfaces an AppError
   * and returns {ok:false} so the caller can bail out *without* touching
   * `data` - meaning the UI never shows an optimistic change that didn't
   * actually get persisted. */
  const withPersistence = useCallback(
    async <T,>(action: () => Promise<T>, actionLabel: string): Promise<{ ok: true; value: T } | { ok: false }> => {
      try {
        const value = await action();
        setAppError(null);
        return { ok: true, value };
      } catch (err) {
        setAppError(makeAppError(actionLabel, err));
        return { ok: false };
      }
    },
    []
  );

  const dismissError = useCallback(() => setAppError(null), []);

  const reloadAll = useCallback(async () => {
    const result = await withPersistence(() => db.getAllData(), 'reloading your data');
    if (result.ok) setData(result.value);
  }, [withPersistence, setData]);

  const onAdoptRemote = useCallback(
    async (remoteData: AppData) => {
      const result = await withPersistence(() => db.replaceAllData(remoteData), 'applying synced data');
      if (result.ok) setData(remoteData);
    },
    [withPersistence, setData]
  );

  const sync = useGitHubSync(!loading, () => dataRef.current, onAdoptRemote);

  // Surface a sync failure the same way a local-write failure would show up,
  // but don't let it clobber a more specific local error that's already showing.
  useEffect(() => {
    if (sync.syncError) setAppError((prev) => prev ?? sync.syncError);
  }, [sync.syncError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await db.requestPersistentStorage();
      const result = await withPersistence(() => db.getAllData(), 'loading your data');
      if (cancelled) return;
      if (result.ok) setData(result.value);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeOnboarding = useCallback(
    async (settings: Settings, lifts: LiftConfig[], trainingMaxes: Record<string, number>) => {
      const finalSettings: Settings = { ...settings, onboardingComplete: true };
      const startDate = new Date().toISOString().slice(0, 10);
      const cycle = buildFirstCycle(lifts, trainingMaxes, startDate);
      const workouts = generateWorkoutsForCycle(cycle, lifts, finalSettings);

      const result = await withPersistence(
        () => db.saveOnboardingData(finalSettings, lifts, cycle, workouts),
        'setting up your first cycle'
      );
      if (!result.ok) return;

      setData({ settings: finalSettings, lifts, cycles: [cycle], workouts });
      sync.notifyLocalChange();
    },
    [withPersistence, setData, sync]
  );

  const updateSettings = useCallback(
    async (settings: Settings) => {
      const result = await withPersistence(() => db.saveSettings(settings), 'saving settings');
      if (!result.ok) return;
      setData({ ...dataRef.current, settings });
      sync.notifyLocalChange();
    },
    [withPersistence, setData, sync]
  );

  const updateLifts = useCallback(
    async (lifts: LiftConfig[]) => {
      const result = await withPersistence(() => db.saveLifts(lifts), 'saving your lifts');
      if (!result.ok) return;
      setData({ ...dataRef.current, lifts });
      sync.notifyLocalChange();
    },
    [withPersistence, setData, sync]
  );

  const saveWorkoutFn = useCallback(
    async (workout: Workout) => {
      const result = await withPersistence(() => db.saveWorkout(workout), 'saving your workout');
      if (!result.ok) return;
      const current = dataRef.current;
      setData({
        ...current,
        workouts: current.workouts.some((w) => w.id === workout.id)
          ? current.workouts.map((w) => (w.id === workout.id ? workout : w))
          : [...current.workouts, workout],
      });
      sync.notifyLocalChange();
    },
    [withPersistence, setData, sync]
  );

  const startNextCycle = useCallback(
    async (overrideTMs?: Record<string, number>) => {
      const current = dataRef.current;
      const active = current.cycles.find((c) => c.status === 'active');
      if (!active) return;

      const completedActive: Cycle = {
        ...active,
        status: 'completed',
        completedDate: new Date().toISOString().slice(0, 10),
      };
      const startDate = new Date().toISOString().slice(0, 10);
      let nextCycle = buildNextCycle(completedActive, current.lifts, startDate);
      if (overrideTMs) {
        nextCycle = { ...nextCycle, trainingMaxes: { ...nextCycle.trainingMaxes, ...overrideTMs } };
      }
      const nextWorkouts = generateWorkoutsForCycle(nextCycle, current.lifts, current.settings);

      const result = await withPersistence(
        () => db.saveCycleTransition(completedActive, nextCycle, nextWorkouts),
        'starting the new cycle'
      );
      if (!result.ok) return;

      setData({
        ...current,
        cycles: current.cycles.map((c) => (c.id === completedActive.id ? completedActive : c)).concat(nextCycle),
        workouts: [...current.workouts, ...nextWorkouts],
      });
      sync.notifyLocalChange();
    },
    [withPersistence, setData, sync]
  );

  const activeCycle = data.cycles.find((c) => c.status === 'active') ?? null;

  return {
    loading,
    settings: data.settings,
    lifts: data.lifts,
    cycles: data.cycles,
    workouts: data.workouts,
    activeCycle,
    appError,
    dismissError,
    completeOnboarding,
    updateSettings,
    updateLifts,
    saveWorkout: saveWorkoutFn,
    startNextCycle,
    reloadAll,
    syncConfig: sync.syncConfig,
    syncStatus: sync.syncStatus,
    syncState: sync.syncState,
    pendingConflict: sync.pendingConflict,
    updateSyncConfig: sync.updateSyncConfig,
    syncNow: sync.syncNow,
    resolveConflict: sync.resolveConflict,
    notifyLocalChange: sync.notifyLocalChange,
  };
}
