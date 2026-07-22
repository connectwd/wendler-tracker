import { useMemo, useState } from 'react';
import type { Cycle, LiftConfig, Settings, WeekNumber, Workout } from '../types';
import { WEEK_LABELS } from '../lib/wendler';

interface DashboardProps {
  activeCycle: Cycle | null;
  lifts: LiftConfig[];
  workouts: Workout[];
  settings: Settings;
  onOpenWorkout: (workoutId: string) => void;
  onStartNextCycle: () => void;
}

function isResolved(w: Workout): boolean {
  return w.status === 'completed' || w.status === 'skipped';
}

export function Dashboard({ activeCycle, lifts, workouts, onOpenWorkout, onStartNextCycle }: DashboardProps) {
  const cycleWorkouts = useMemo(
    () => workouts.filter((w) => w.cycleId === activeCycle?.id),
    [workouts, activeCycle]
  );

  const firstIncompleteWeek = useMemo(() => {
    for (const week of [1, 2, 3, 4] as WeekNumber[]) {
      const weekWorkouts = cycleWorkouts.filter((w) => w.week === week);
      if (weekWorkouts.some((w) => !isResolved(w))) return week;
    }
    return 4 as WeekNumber;
  }, [cycleWorkouts]);

  const [selectedWeek, setSelectedWeek] = useState<WeekNumber>(firstIncompleteWeek);

  if (!activeCycle) {
    return (
      <div className="screen">
        <div className="empty-state">
          <p>No active cycle yet.</p>
        </div>
      </div>
    );
  }

  const cycleComplete = cycleWorkouts.length > 0 && cycleWorkouts.every(isResolved);
  const skippedCount = cycleWorkouts.filter((w) => w.status === 'skipped').length;
  const weekWorkouts = lifts
    .map((lift) => cycleWorkouts.find((w) => w.liftId === lift.id && w.week === selectedWeek))
    .filter((w): w is Workout => !!w);

  return (
    <div className="screen">
      <p className="eyebrow">Cycle {activeCycle.cycleNumber}</p>
      <h1>{WEEK_LABELS[selectedWeek]}</h1>

      <div className="row" style={{ gap: 6, margin: '16px 0' }}>
        {([1, 2, 3, 4] as WeekNumber[]).map((week) => {
          const wk = cycleWorkouts.filter((w) => w.week === week);
          const allDone = wk.length > 0 && wk.every(isResolved);
          return (
            <button
              key={week}
              className="btn"
              style={{
                flex: 1,
                padding: '10px 4px',
                background: week === selectedWeek ? 'var(--plate-red)' : undefined,
                borderColor: allDone ? 'var(--plate-green)' : undefined,
              }}
              onClick={() => setSelectedWeek(week)}
              data-testid={`week-tab-${week}`}
            >
              W{week}
            </button>
          );
        })}
      </div>

      <div className="stack">
        {weekWorkouts.map((w) => {
          const lift = lifts.find((l) => l.id === w.liftId);
          const tm = activeCycle.trainingMaxes[w.liftId];
          const topSet = w.mainSets[w.mainSets.length - 1];
          const pillClass =
            w.status === 'completed' ? 'pill-complete' : w.status === 'skipped' ? 'pill-skipped' : 'pill-pending';
          const label = w.status === 'completed' ? 'Done' : w.status === 'skipped' ? 'Skipped' : 'Open';
          return (
            <button
              key={w.id}
              className={`card-tap ${w.status === 'completed' ? 'is-complete' : ''}`}
              style={w.status === 'skipped' ? { borderColor: 'var(--text-faint)' } : undefined}
              onClick={() => onOpenWorkout(w.id)}
              data-testid={`workout-card-${lift?.name ?? 'lift'}`}
              data-status={w.status}
            >
              <div className="row">
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17 }}>
                    {lift?.name ?? 'Lift'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    TM {tm?.toFixed(1)} · top set {topSet.targetWeight}
                    {topSet.isAmrap ? '+' : ` x${topSet.targetReps}`}
                  </div>
                </div>
                <span className={`pill ${pillClass}`}>
                  <span className="pill-dot" />
                  {label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {cycleComplete && (
        <div className="card" style={{ borderColor: 'var(--plate-green)', marginTop: 16 }} data-testid="cycle-complete-banner">
          <h2>Cycle {activeCycle.cycleNumber} complete</h2>
          <p>
            Every lift logged across all four weeks{skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}. Ready to
            roll your Training Maxes forward.
          </p>
          <button className="btn btn-primary btn-block" onClick={onStartNextCycle} data-testid="start-next-cycle-btn">
            Review &amp; start Cycle {activeCycle.cycleNumber + 1}
          </button>
        </div>
      )}
    </div>
  );
}
