import { useEffect, useState, type ChangeEvent } from 'react';
import type { LiftConfig, Settings, SyncConfig, SyncState, SyncStatus } from '../types';
import { daysSinceLastBackup, exportBackup, importBackupFromFile, BackupValidationError } from '../lib/backup';
import { getStorageEstimate } from '../lib/db';
import { GitHubSyncSettings } from './GitHubSyncSettings';

interface SettingsViewProps {
  settings: Settings;
  lifts: LiftConfig[];
  onUpdateSettings: (settings: Settings) => Promise<void>;
  onUpdateLifts: (lifts: LiftConfig[]) => Promise<void>;
  onDataRestored: () => Promise<void>;
  syncConfig: SyncConfig;
  syncStatus: SyncStatus;
  syncState: SyncState;
  onUpdateSyncConfig: (config: SyncConfig) => Promise<void>;
  onSyncNow: () => Promise<void>;
}

export function SettingsView({
  settings,
  lifts,
  onUpdateSettings,
  onUpdateLifts,
  onDataRestored,
  syncConfig,
  syncStatus,
  syncState,
  onUpdateSyncConfig,
  onSyncNow,
}: SettingsViewProps) {
  const [local, setLocal] = useState(settings);
  const [localLifts, setLocalLifts] = useState(lifts);
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

  function saveSettings() {
    onUpdateSettings(local);
  }

  function saveLiftIncrement(id: string, cycleIncrement: number) {
    const updated = localLifts.map((l) => (l.id === id ? { ...l, cycleIncrement } : l));
    setLocalLifts(updated);
    onUpdateLifts(updated);
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
          <label htmlFor="settings-bodyweight">Bodyweight ({local.units})</label>
          <input
            id="settings-bodyweight"
            type="number"
            value={local.bodyweight ?? ''}
            onChange={(e) =>
              setLocal((s) => ({ ...s, bodyweight: e.target.value ? parseFloat(e.target.value) : null }))
            }
            onBlur={saveSettings}
          />
        </div>
      </div>

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
