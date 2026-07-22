import type { AppData, PendingConflict } from '../types';

interface SyncConflictScreenProps {
  local: AppData;
  conflict: PendingConflict;
  onResolve: (keep: 'local' | 'remote') => void;
}

function summarize(data: AppData) {
  const completedWorkouts = data.workouts.filter((w) => w.status === 'completed').length;
  const latestCycle = data.cycles.reduce((max, c) => Math.max(max, c.cycleNumber), 0);
  return { completedWorkouts, latestCycle };
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SyncConflictScreen({ local, conflict, onResolve }: SyncConflictScreenProps) {
  const localSummary = summarize(local);
  const remoteSummary = summarize(conflict.remote.data);

  return (
    <div className="screen">
      <p className="eyebrow">Sync conflict</p>
      <h1>Two versions to choose from</h1>
      <p>
        This device and your synced backup have both changed since they last matched up — probably logged from two
        devices without a sync in between. Pick which one to keep; the other gets overwritten (but you can always
        export a backup of it first from Settings if you want a copy).
      </p>

      <div className="card">
        <h3>This device</h3>
        <div className="row">
          <span>Cycle</span>
          <span className="mono-num">{localSummary.latestCycle}</span>
        </div>
        <div className="row">
          <span>Workouts logged</span>
          <span className="mono-num">{localSummary.completedWorkouts}</span>
        </div>
      </div>

      <div className="card">
        <h3>Synced version ({timeAgo(conflict.remote.updatedAt)})</h3>
        <div className="row">
          <span>Cycle</span>
          <span className="mono-num">{remoteSummary.latestCycle}</span>
        </div>
        <div className="row">
          <span>Workouts logged</span>
          <span className="mono-num">{remoteSummary.completedWorkouts}</span>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        <button className="btn btn-primary btn-block" onClick={() => onResolve('local')}>
          Keep this device's data
        </button>
        <button className="btn btn-block" onClick={() => onResolve('remote')}>
          Keep the synced version
        </button>
      </div>
    </div>
  );
}
