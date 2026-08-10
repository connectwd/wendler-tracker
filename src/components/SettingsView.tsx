import { useEffect, useState, type ChangeEvent } from 'react';
import type { Cycle, LiftConfig, Settings, SyncConfig, SyncState, SyncStatus } from '../types';
import { daysSinceLastBackup, exportBackup, importBackupFromFile, BackupValidationError } from '../lib/backup';
import { getStorageEstimate } from '../lib/db';
import { estimateOneRepMax, calculateTrainingMax } from '../lib/wendler';
import { GitHubSyncSettings } from './GitHubSyncSettings';

interface SettingsViewProps {
  settings: Settings;
  lifts: LiftConfig[];
  activeCycle: Cycle | null;
  onUpdateSettings: (settings: Settings) => Promise<void>;
  onUpdateLifts: (lifts: LiftConfig[]) => Promise<void>;
  onUpdateLiftTrainingMax: (liftId: string, newTrainingMax: number) => Promise<void>;
  onDataRestored: () => Promise<void>;
  syncConfig: SyncConfig;
  syncStatus: SyncStatus;
  syncState: SyncState;
  onUpdateSyncConfig: (config: SyncConfig) => Promise<void>;
  onSyncNow: () => Promise<void>;
  onNavigateToProgress: () => void;
}

export function SettingsView({
  settings,
  lifts,
  activeCycle,
  onUpdateSettings,
  onUpdateLifts,
  onUpdateLiftTrainingMax,
  onDataRestored,
  syncConfig,
  syncStatus,
  syncState,
  onUpdateSyncConfig,
  onSyncNow,
  onNavigateToProgress,
}: SettingsViewProps) {
  const [local, setLocal] = useState(settings);
  const [localLifts, setLocalLifts] = useState(lifts);
  const [localTMs, setLocalTMs] = useState<Record<string, number>>(activeCycle?.trainingMaxes ?? {});
  const [tmCalcOpenFor, setTmCalcOpenFor] = useState<string | null>(null);
  const [calcWeight, setCalcWeight] = useState('');
  const [calcReps, setCalcReps] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number } | null>(null);
  const [backupAge, setBackupAge] = useState<number | null>(daysSinceLastBackup());

  useEffect(() => {
    getStorageEstimate().then(setStorageInfo);
  }, []);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  useEffect(() => {
    setLocalLifts(lifts);
  }, [lifts]);

  useEffect(() => {
    setLocalTMs(activeCycle?.trainingMaxes ?? {});
  }, [activeCycle]);

  function saveSettings() {
    onUpdateSettings(local);
  }

  // Unlike the text fields above (which stage into `local` and only commit
  // on blur), a visual toggle should apply the instant you tap it - there's
  // no "still typing" state to wait out, and instant feedback is the whole
  // point of a theme switch.
  function handleThemeToggle() {
    const next: Settings = { ...local, theme: local.theme === 'arcade' ? 'serious' : 'arcade' };
    setLocal(next);
    onUpdateSettings(next);
  }

  function saveLiftIncrement(id: string, cycleIncrement: number) {
    const updated = localLifts.map((l) => (l.id === id ? { ...l, cycleIncrement } : l));
    setLocalLifts(updated);
    onUpdateLifts(updated);
  }

  function saveLiftTrainingMax(liftId: string, newTM: number) {
    const currentTM = activeCycle?.trainingMaxes[liftId];
    if (currentTM !== undefined && Math.abs(newTM - currentTM) < 0.001) return;
    const confirmed = window.confirm(
      "This updates the Training Max used for this lift right now — including recalculating target weights on any workouts in your current cycle you haven't logged yet. Anything you've already logged at the gym stays exactly as it is. Continue?"
    );
    if (!confirmed) {
      setLocalTMs((prev) => ({ ...prev, [liftId]: currentTM ?? prev[liftId] }));
      return;
    }
    onUpdateLiftTrainingMax(liftId, newTM);
  }

  function applyCalculatedTrainingMax(liftId: string) {
    const weight = parseFloat(calcWeight);
    const reps = parseInt(calcReps, 10);
    const e1rm = estimateOneRepMax(weight, reps);
    if (e1rm === null) return;
    const suggested = Math.round(calculateTrainingMax(e1rm, 0.9) * 10) / 10;
    setLocalTMs((prev) => ({ ...prev, [liftId]: suggested }));
    setTmCalcOpenFor(null);
    setCalcWeight('');
    setCalcReps('');
  }

  async function handleExport() {
    await exportBackup();
    setBackupAge(0);
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);
    try {
      await importBackupFromFile(file);
      setImportSuccess(true);
      await onDataRestored();
      setBackupAge(0);
    } catch (err) {
      setImportError(err instanceof BackupValidationError ? err.message : 'Something went wrong reading that file.');
    }
    e.target.value = '';
  }

  const showBackupWarning = backupAge === null || backupAge >= 14;

  return (
    <div className="screen">
      <p className="eyebrow">Settings</p>
      <h1>Configuration</h1>

      {showBackupWarning && (
        <div className="warning-banner">
          {backupAge === null
            ? "You haven't exported a backup yet."
            : `Last backup was ${backupAge} days ago.`}{' '}
          This app only stores data in your browser — back up before switching devices or clearing browser data.
        </div>
      )}

      <div className="card">
        <h3>Backup</h3>
        <p>Everything lives in this browser's storage only. Export regularly, especially before a new phone or a browser reinstall.</p>
        <button className="btn btn-primary btn-block" onClick={handleExport}>
          Export backup (.json)
        </button>
        <div style={{ marginTop: 10 }}>
          <label htmlFor="import-file">Restore from a backup file</label>
          <input id="import-file" type="file" accept="application/json" onChange={handleImport} />
        </div>
        {importError && <p style={{ color: 'var(--plate-red)', fontSize: 13 }}>{importError}</p>}
        {importSuccess && <p style={{ color: 'var(--plate-green)', fontSize: 13 }}>Backup restored.</p>}
        {storageInfo && storageInfo.quota > 0 && (
          <p style={{ fontSize: 12 }}>
            Using {(storageInfo.usage / 1024).toFixed(0)}KB of an estimated {(storageInfo.quota / 1024 / 1024).toFixed(0)}MB available.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Appearance</h3>
        <div className="row">
          <div>
            <div style={{ fontWeight: 600 }}>Arcade Mode</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              A louder, wilder look for the whole app. Purely cosmetic — nothing about your data changes.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={local.theme === 'arcade'}
            aria-label="Arcade Mode"
            className={`theme-toggle ${local.theme === 'arcade' ? 'on' : ''}`}
            onClick={handleThemeToggle}
            data-testid="theme-toggle"
          >
            <span className="theme-toggle-thumb" />
          </button>
        </div>
      </div>

      <GitHubSyncSettings
        syncConfig={syncConfig}
        syncStatus={syncStatus}
        syncState={syncState}
        onUpdateConfig={onUpdateSyncConfig}
        onSyncNow={onSyncNow}
      />

      <div className="card">
        <h3>Units &amp; rounding</h3>
        <div className="field">
          <label htmlFor="settings-bar-weight">Bar weight ({local.units})</label>
          <input
            id="settings-bar-weight"
            type="number"
            value={local.barWeight}
            onChange={(e) => setLocal((s) => ({ ...s, barWeight: parseFloat(e.target.value) || 0 }))}
            onBlur={saveSettings}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-rounding">Round working weights to nearest ({local.units})</label>
          <input
            id="settings-rounding"
            type="number"
            step="0.25"
            value={local.roundingIncrement}
            onChange={(e) => setLocal((s) => ({ ...s, roundingIncrement: parseFloat(e.target.value) || 0 }))}
            onBlur={saveSettings}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-bodyweight">Bodyweight</label>
          <div className="row" id="settings-bodyweight">
            <span>
              {local.bodyweight != null ? (
                <>
                  <span className="mono-num">{local.bodyweight}{local.units}</span>{' '}
                  <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>current, from your last weigh-in</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Not logged yet</span>
              )}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '4px 8px', minHeight: 'auto', fontSize: 12 }}
              onClick={onNavigateToProgress}
              data-testid="settings-log-bodyweight-link"
            >
              Log in Progress →
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Rest timer</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Suggested duration when you tap the timer button - warm-up, BBS, and accessory sets use the short one, main/AMRAP sets use the long one. Always adjustable in the moment too.
        </p>
        <div className="field">
          <label htmlFor="settings-rest-short">Short rest (seconds) — warm-up / BBS / accessories</label>
          <input
            id="settings-rest-short"
            type="number"
            step="15"
            value={local.restTimerShortSeconds}
            onChange={(e) => setLocal((s) => ({ ...s, restTimerShortSeconds: parseInt(e.target.value, 10) || 0 }))}
            onBlur={saveSettings}
            data-testid="settings-rest-short"
          />
        </div>
        <div className="field">
          <label htmlFor="settings-rest-long">Long rest (seconds) — main / AMRAP sets</label>
          <input
            id="settings-rest-long"
            type="number"
            step="15"
            value={local.restTimerLongSeconds}
            onChange={(e) => setLocal((s) => ({ ...s, restTimerLongSeconds: parseInt(e.target.value, 10) || 0 }))}
            onBlur={saveSettings}
            data-testid="settings-rest-long"
          />
        </div>
        {local.restGameHighScore > 0 && (
          <p style={{ fontSize: 13 }}>
            Rest-timer game best: <span className="mono-num">{local.restGameHighScore}</span>
          </p>
        )}
      </div>

      {activeCycle && (
        <div className="card">
          <h3>Training Max</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Fix a mistake or an over-generous number from onboarding. Changing this recalculates target weights on
            any workouts in your current cycle you haven't logged yet — anything already done at the gym stays as
            it is.
          </p>
          {localLifts.map((lift) => (
            <div key={lift.id} style={{ marginBottom: 14 }}>
              <div className="row" style={{ marginBottom: tmCalcOpenFor === lift.id ? 8 : 0 }}>
                <span>{lift.name}</span>
                <input
                  type="number"
                  step="0.5"
                  style={{ width: 90 }}
                  value={localTMs[lift.id] ?? ''}
                  data-testid={`tm-input-${lift.name}`}
                  onChange={(e) =>
                    setLocalTMs((prev) => ({ ...prev, [lift.id]: parseFloat(e.target.value) || 0 }))
                  }
                  onBlur={(e) => saveLiftTrainingMax(lift.id, parseFloat(e.target.value) || 0)}
                />
              </div>
              {tmCalcOpenFor !== lift.id ? (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '4px 0' }}
                  onClick={() => {
                    setTmCalcOpenFor(lift.id);
                    setCalcWeight('');
                    setCalcReps('');
                  }}
                  data-testid={`tm-calc-open-${lift.name}`}
                >
                  Not sure? Work it out from a recent lift
                </button>
              ) : (
                <div className="field" style={{ background: 'var(--surface-raised)', padding: 10, borderRadius: 'var(--radius-sm)' }}>
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      type="number"
                      placeholder={`Weight (${local.units})`}
                      value={calcWeight}
                      onChange={(e) => setCalcWeight(e.target.value)}
                      data-testid={`tm-calc-weight-${lift.name}`}
                    />
                    <input
                      type="number"
                      placeholder="Reps"
                      value={calcReps}
                      onChange={(e) => setCalcReps(e.target.value)}
                      data-testid={`tm-calc-reps-${lift.name}`}
                    />
                  </div>
                  <p style={{ fontSize: 12, marginTop: 6 }}>
                    A recent honest set — not your all-time best. This computes a Training Max at 90% of the
                    estimated 1RM, same as onboarding.
                  </p>
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <button
                      className="btn"
                      style={{ flex: 1 }}
                      onClick={() => setTmCalcOpenFor(null)}
                      data-testid={`tm-calc-cancel-${lift.name}`}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => applyCalculatedTrainingMax(lift.id)}
                      disabled={!calcWeight || !calcReps || estimateOneRepMax(parseFloat(calcWeight), parseInt(calcReps, 10)) === null}
                      data-testid={`tm-calc-apply-${lift.name}`}
                    >
                      Use this Training Max
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Per-lift cycle increment</h3>
        {localLifts.map((lift) => (
          <div className="row" key={lift.id} style={{ marginBottom: 10 }}>
            <span>{lift.name}</span>
            <input
              type="number"
              step="0.5"
              style={{ width: 90 }}
              value={lift.cycleIncrement}
              onChange={(e) =>
                setLocalLifts((prev) =>
                  prev.map((l) => (l.id === lift.id ? { ...l, cycleIncrement: parseFloat(e.target.value) || 0 } : l))
                )
              }
              onBlur={(e) => saveLiftIncrement(lift.id, parseFloat(e.target.value) || 0)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
