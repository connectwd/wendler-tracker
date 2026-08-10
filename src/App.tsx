import { useEffect, useState } from 'react';
import { useAppData } from './hooks/useAppData';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { WorkoutSession } from './components/WorkoutSession';
import { NewCycleReview } from './components/NewCycleReview';
import { ProgressCharts } from './components/ProgressCharts';
import { SettingsView } from './components/SettingsView';
import { SyncConflictScreen } from './components/SyncConflictScreen';
import { ErrorBanner } from './components/ErrorBanner';
import { UpdateToast } from './components/UpdateToast';
import { bestE1RMExcluding } from './lib/stats';
import { registerServiceWorker, applyUpdate } from './lib/pwa';
import { initBackHandling } from './lib/backNav';

type View = 'dashboard' | 'progress' | 'settings';

export default function App() {
  const {
    loading,
    settings,
    lifts,
    cycles,
    workouts,
    activeCycle,
    appError,
    dismissError,
    completeOnboarding,
    updateSettings,
    updateLifts,
    saveWorkout,
    startNextCycle,
    updateLiftTrainingMax,
    reloadAll,
    bodyweightEntries,
    logBodyweight,
    deleteBodyweightEntry,
    syncConfig,
    syncStatus,
    syncState,
    pendingConflict,
    updateSyncConfig,
    syncNow,
    resolveConflict,
  } = useAppData();

  const [view, setView] = useState<View>('dashboard');
  const [openWorkoutId, setOpenWorkoutId] = useState<string | null>(null);
  const [reviewingNewCycle, setReviewingNewCycle] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    registerServiceWorker(() => setUpdateAvailable(true));
  }, []);

  // Installed (standalone) PWAs have no browser chrome of their own, so
  // Android's back gesture/button falls through to closing the app entirely
  // unless a screen change actually pushed real browser history for it to
  // pop instead. WorkoutSession, RestTimer, and NewCycleReview each register
  // themselves via useBackable when they open; this just wires up the one
  // shared listener that routes a back gesture to whichever of them is
  // currently open. See lib/backNav.ts for the full explanation.
  useEffect(() => {
    initBackHandling();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="screen empty-state">Loading…</div>
      </div>
    );
  }

  if (!settings.onboardingComplete) {
    return (
      <div className="app-shell">
        <Onboarding onComplete={completeOnboarding} />
      </div>
    );
  }

  const openWorkout = workouts.find((w) => w.id === openWorkoutId) ?? null;
  const openLift = openWorkout ? lifts.find((l) => l.id === openWorkout.liftId) ?? null : null;

  // A pending sync conflict blocks everything else until resolved - except an
  // open, unsaved workout session. Editing in progress always wins; the
  // conflict prompt waits until you close or save that session, rather than
  // force-switching away and discarding whatever you were mid-typing.
  if (pendingConflict && !(openWorkout && openLift)) {
    return (
      <div className="app-shell">
        {appError && <ErrorBanner error={appError} onDismiss={dismissError} />}
        <SyncConflictScreen
          local={{ settings, lifts, cycles, workouts, bodyweightEntries }}
          conflict={pendingConflict}
          onResolve={resolveConflict}
        />
        {updateAvailable && (
          <UpdateToast onRefresh={applyUpdate} onDismiss={() => setUpdateAvailable(false)} />
        )}
      </div>
    );
  }

  const openWorkoutCycle = openWorkout ? cycles.find((c) => c.id === openWorkout.cycleId) ?? null : null;
  const previousCycle = openWorkoutCycle
    ? cycles.find((c) => c.cycleNumber === openWorkoutCycle.cycleNumber - 1) ?? null
    : null;
  const previousWorkout =
    previousCycle && openWorkout
      ? workouts.find(
          (w) => w.cycleId === previousCycle.id && w.liftId === openWorkout.liftId && w.week === openWorkout.week
        ) ?? null
      : null;
  const currentBestE1RM = openWorkout ? bestE1RMExcluding(openWorkout.liftId, workouts, openWorkout.id) : null;

  return (
    <div className="app-shell">
      {appError && <ErrorBanner error={appError} onDismiss={dismissError} />}

      {openWorkout && openLift ? (
        <WorkoutSession
          workout={openWorkout}
          lift={openLift}
          settings={settings}
          previousWorkout={previousWorkout}
          currentBestE1RM={currentBestE1RM}
          allWorkouts={workouts}
          onSave={saveWorkout}
          onClose={() => setOpenWorkoutId(null)}
          onUpdateSettings={updateSettings}
        />
      ) : reviewingNewCycle && activeCycle ? (
        <NewCycleReview
          activeCycle={activeCycle}
          cycles={cycles}
          lifts={lifts}
          workouts={workouts}
          settings={settings}
          onCancel={() => setReviewingNewCycle(false)}
          onConfirm={async (overrides) => {
            await startNextCycle(overrides);
            setReviewingNewCycle(false);
          }}
        />
      ) : view === 'dashboard' ? (
        <Dashboard
          activeCycle={activeCycle}
          lifts={lifts}
          workouts={workouts}
          settings={settings}
          onOpenWorkout={setOpenWorkoutId}
          onStartNextCycle={() => setReviewingNewCycle(true)}
        />
      ) : view === 'progress' ? (
        <ProgressCharts
          lifts={lifts}
          cycles={cycles}
          workouts={workouts}
          settings={settings}
          bodyweightEntries={bodyweightEntries}
          onLogBodyweight={logBodyweight}
          onDeleteBodyweightEntry={deleteBodyweightEntry}
        />
      ) : (
        <SettingsView
          settings={settings}
          lifts={lifts}
          activeCycle={activeCycle}
          onUpdateSettings={updateSettings}
          onUpdateLifts={updateLifts}
          onUpdateLiftTrainingMax={updateLiftTrainingMax}
          onDataRestored={reloadAll}
          syncConfig={syncConfig}
          syncStatus={syncStatus}
          syncState={syncState}
          onUpdateSyncConfig={updateSyncConfig}
          onSyncNow={syncNow}
          onNavigateToProgress={() => setView('progress')}
        />
      )}

      {!openWorkout && !reviewingNewCycle && (
        <nav className="bottom-nav">
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
            <span className="nav-dot" />
            Train
          </button>
          <button className={view === 'progress' ? 'active' : ''} onClick={() => setView('progress')}>
            <span className="nav-dot" />
            Progress
          </button>
          <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>
            <span className="nav-dot" />
            Settings
          </button>
        </nav>
      )}

      {updateAvailable && <UpdateToast onRefresh={applyUpdate} onDismiss={() => setUpdateAvailable(false)} />}
    </div>
  );
}
