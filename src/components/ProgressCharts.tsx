import { useMemo, useState } from 'react';
import type { Cycle, LiftConfig, Settings, Workout } from '../types';
import { LineChart } from './LineChart';
import { ConsistencyHeatmap } from './ConsistencyHeatmap';
import { aggregateDailyStats, calculateLifetimeStats, detectPersonalRecords, formatTonnage } from '../lib/stats';

interface ProgressChartsProps {
  lifts: LiftConfig[];
  cycles: Cycle[];
  workouts: Workout[];
  settings: Settings;
}

export function ProgressCharts({ lifts, cycles, workouts, settings }: ProgressChartsProps) {
  const [selectedLiftId, setSelectedLiftId] = useState(lifts[0]?.id ?? '');
  const selectedLift = lifts.find((l) => l.id === selectedLiftId);

  const dailyStats = useMemo(() => aggregateDailyStats(workouts), [workouts]);
  const records = useMemo(() => detectPersonalRecords(workouts, lifts, cycles), [workouts, lifts, cycles]);
  const lifetime = useMemo(
    () => calculateLifetimeStats(workouts, cycles, records),
    [workouts, cycles, records]
  );

  const e1rmPoints = useMemo(() => {
    if (!selectedLift) return [];
    return workouts
      .filter((w) => w.liftId === selectedLift.id && w.estimatedOneRepMax && w.date)
      .sort((a, b) => (a.date! < b.date! ? -1 : 1))
      .map((w, i) => ({ x: i, y: Math.round(w.estimatedOneRepMax! * 10) / 10 }));
  }, [workouts, selectedLift]);

  const tmPoints = useMemo(() => {
    if (!selectedLift) return [];
    return cycles
      .filter((c) => c.trainingMaxes[selectedLift.id] !== undefined)
      .sort((a, b) => a.cycleNumber - b.cycleNumber)
      .map((c) => ({ x: c.cycleNumber, y: Math.round(c.trainingMaxes[selectedLift.id] * 10) / 10 }));
  }, [cycles, selectedLift]);

  if (lifts.length === 0) {
    return (
      <div className="screen">
        <div className="empty-state">No lifts configured yet.</div>
      </div>
    );
  }

  return (
    <div className="screen">
      <p className="eyebrow">Progress</p>
      <h1>Overview</h1>

      <div className="row" style={{ gap: 8, margin: '16px 0' }}>
        <div className="card" style={{ flex: 1, marginBottom: 0, textAlign: 'center' }}>
          <div className="big-num" style={{ fontSize: 22 }}>
            {formatTonnage(lifetime.totalTonnage, settings.units)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>lifetime moved</div>
        </div>
        <div className="card" style={{ flex: 1, marginBottom: 0, textAlign: 'center' }}>
          <div className="big-num" style={{ fontSize: 22 }}>
            {lifetime.totalSessions}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>sessions logged</div>
        </div>
        <div className="card" style={{ flex: 1, marginBottom: 0, textAlign: 'center' }}>
          <div className="big-num" style={{ fontSize: 22, color: 'var(--plate-red)' }}>
            {lifetime.prCount}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>all-time PRs</div>
        </div>
      </div>

      <div className="card">
        <h3>Consistency</h3>
        <ConsistencyHeatmap dailyStats={dailyStats} units={settings.units} />
      </div>

      {records.length > 0 && (
        <div className="card">
          <h3>Recent PRs</h3>
          <div className="stack">
            {records.slice(0, 5).map((r) => (
              <div className="row" key={`${r.liftId}-${r.date}-${r.e1rm}`}>
                <span>
                  {r.liftName} <span style={{ color: 'var(--text-faint)' }}>· Cycle {r.cycleNumber}, Wk {r.week}</span>
                </span>
                <span className="mono-num" style={{ color: 'var(--plate-red)' }}>
                  {r.e1rm.toFixed(1)}
                  {settings.units}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>Per-lift trends</h3>
      <div className="row" style={{ gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
        {lifts.map((lift) => (
          <button
            key={lift.id}
            className="btn"
            style={{ background: lift.id === selectedLiftId ? 'var(--plate-red)' : undefined }}
            onClick={() => setSelectedLiftId(lift.id)}
          >
            {lift.name}
          </button>
        ))}
      </div>

      <div className="card">
        <h3>Estimated 1RM (from AMRAP sets)</h3>
        <LineChart points={e1rmPoints} unit={settings.units} color="var(--plate-red)" />
      </div>

      <div className="card">
        <h3>Training Max by cycle</h3>
        <LineChart points={tmPoints} unit={settings.units} color="var(--plate-blue)" />
      </div>
    </div>
  );
}
