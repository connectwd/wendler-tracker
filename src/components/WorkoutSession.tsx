import { useState } from 'react';
import type { LiftConfig, LoggedAccessoryExercise, LoggedSet, Settings, Workout } from '../types';
import { estimateOneRepMax } from '../lib/wendler';
import { findLastAccessorySelection } from '../lib/accessories';
import { PlateBar } from './PlateBar';
import { AccessoryWork } from './AccessoryWork';
import { useWakeLock } from '../hooks/useWakeLock';

interface WorkoutSessionProps {
  workout: Workout;
  lift: LiftConfig;
  settings: Settings;
  /** Same lift, same week, previous cycle - for the inline comparison. Null if there wasn't one (e.g. cycle 1). */
  previousWorkout: Workout | null;
  /** Best e1RM ever logged for this lift, excluding this session - used to flag a live "new PR". */
  currentBestE1RM: number | null;
  /** Full history, any lift/cycle - needed for accessory "last time" lookups and remembering the last pick for this lift. */
  allWorkouts: Workout[];
  onSave: (workout: Workout) => void;
  onClose: () => void;
}

export function WorkoutSession({
  workout,
  lift,
  settings,
  previousWorkout,
  currentBestE1RM,
  allWorkouts,
  onSave,
  onClose,
}: WorkoutSessionProps) {
  useWakeLock(true);

  const [warmupChecked, setWarmupChecked] = useState<boolean[]>(workout.warmupSets.map((s) => s.completed));
  const [mainSets, setMainSets] = useState<LoggedSet[]>(workout.mainSets);
  const [bbsCompletedCount, setBbsCompletedCount] = useState(
    workout.bbsSets.filter((s) => s.completed).length
  );
  const [bbsRepsOverride, setBbsRepsOverride] = useState<string>('');
  const [notes, setNotes] = useState(workout.notes);
  const [dirty, setDirty] = useState(false);
  const [accessories, setAccessories] = useState<LoggedAccessoryExercise[]>(workout.accessories ?? []);

  // If this session hasn't had accessories picked yet, default to whatever
  // was picked last time this same lift was trained (any prior cycle) rather
  // than making every single session start from a blank 20-exercise picker.
  const [initialAccessories] = useState<LoggedAccessoryExercise[]>(
    () => workout.accessories ?? findLastAccessorySelection(workout.liftId, allWorkouts, workout.id) ?? []
  );

  function handleAccessoriesChange(next: LoggedAccessoryExercise[]) {
    setAccessories(next);
    setDirty(true);
  }

  function toggleWarmup(index: number) {
    setWarmupChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
    setDirty(true);
  }

  function updateMainSet(index: number, patch: Partial<LoggedSet>) {
    setMainSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  function toggleMainSet(index: number) {
    const set = mainSets[index];
    if (set.isAmrap) return; // AMRAP sets are completed by entering reps, not tapping
    updateMainSet(index, {
      completed: !set.completed,
      actualWeight: !set.completed ? set.targetWeight : null,
      actualReps: !set.completed ? set.targetReps : null,
    });
  }

  const amrapIndex = mainSets.findIndex((s) => s.isAmrap);
  const amrapSet = amrapIndex >= 0 ? mainSets[amrapIndex] : null;
  const liveE1RM =
    amrapSet?.actualReps && amrapSet.actualWeight
      ? estimateOneRepMax(amrapSet.actualWeight, amrapSet.actualReps)
      : null;

  const previousAmrap = previousWorkout?.mainSets.find((s) => s.isAmrap) ?? null;
  const isNewPR = liveE1RM !== null && (currentBestE1RM === null || liveE1RM > currentBestE1RM);

  const allMainComplete = mainSets.every((s) => s.completed);
  const bbsWeight = workout.bbsSets[0]?.targetWeight ?? 0;
  const bbsTotalSets = workout.bbsSets.length;
  const bbsDone = bbsCompletedCount >= bbsTotalSets;

  function buildUpdatedWorkout(status: Workout['status']): Workout {
    const finalWarmup: LoggedSet[] = workout.warmupSets.map((s, i) => ({
      ...s,
      completed: warmupChecked[i] ?? false,
      actualReps: warmupChecked[i] ? s.targetReps : null,
      actualWeight: warmupChecked[i] ? s.targetWeight : null,
    }));
    const finalBbs: LoggedSet[] = workout.bbsSets.map((s, i) => ({
      ...s,
      completed: i < bbsCompletedCount,
      actualReps: i < bbsCompletedCount ? (bbsRepsOverride ? parseInt(bbsRepsOverride, 10) : s.targetReps) : null,
      actualWeight: i < bbsCompletedCount ? s.targetWeight : null,
    }));

    return {
      ...workout,
      warmupSets: finalWarmup,
      mainSets,
      bbsSets: finalBbs,
      accessories,
      // Only a *completed* session's e1RM counts toward PR history and plateau
      // detection - a 'pending' session might just have the AMRAP field filled
      // in while warm-up/BBS were never finished, which shouldn't count as a
      // real data point (it used to: this checked `!== 'skipped'`, which let
      // an abandoned partial entry through).
      estimatedOneRepMax: status === 'completed' ? liveE1RM : null,
      status,
      date: workout.date ?? new Date().toISOString().slice(0, 10),
      notes,
    };
  }

  function handleSave() {
    onSave(buildUpdatedWorkout(allMainComplete && bbsDone ? 'completed' : 'pending'));
    onClose();
  }

  function handleSkip() {
    onSave(buildUpdatedWorkout('skipped'));
    onClose();
  }

  function handleBack() {
    if (dirty && !window.confirm('Discard your changes to this session? Nothing will be saved.')) {
      return;
    }
    onClose();
  }

  return (
    <div className="screen">
      <button className="btn btn-ghost" onClick={handleBack} style={{ paddingLeft: 0 }}>
        ← Back
      </button>
      <p className="eyebrow">Week {workout.week}</p>
      <h1>{lift.name}</h1>

      {previousWorkout && (
        <p style={{ fontSize: 13 }} data-testid="previous-cycle-comparison">
          Last cycle, same week:{' '}
          {previousAmrap?.actualReps != null && previousAmrap.actualWeight != null ? (
            <span className="mono-num">
              {previousAmrap.actualWeight}
              {settings.units} × {previousAmrap.actualReps}
              {previousWorkout.estimatedOneRepMax ? ` (e1RM ${previousWorkout.estimatedOneRepMax.toFixed(0)}${settings.units})` : ''}
            </span>
          ) : previousWorkout.status === 'skipped' ? (
            'skipped'
          ) : (
            'not logged'
          )}
        </p>
      )}

      <h3 style={{ marginTop: 20 }}>Warm-up</h3>
      <div className="card">
        {workout.warmupSets.map((set, i) => (
          <div className="set-row" key={i}>
            <button
              className={`set-check ${warmupChecked[i] ? 'checked' : ''}`}
              onClick={() => toggleWarmup(i)}
              aria-label={`Mark warm-up set ${i + 1} complete`}
              data-testid={`warmup-check-${i}`}
            >
              ✓
            </button>
            <div className="mono-num" style={{ fontSize: 15 }}>
              {set.targetWeight}
              {settings.units} × {set.targetReps}
            </div>
            <div />
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 20 }}>Main work</h3>
      <div className="card">
        {mainSets.map((set, i) => (
          <div className="set-row" key={i}>
            <button
              className={`set-check ${set.completed ? 'checked' : ''}`}
              onClick={() => toggleMainSet(i)}
              disabled={set.isAmrap}
              style={set.isAmrap ? { opacity: set.completed ? 1 : 0.4 } : undefined}
              aria-label={set.isAmrap ? 'Completed once reps are entered' : `Mark set ${i + 1} complete`}
              data-testid={`main-check-${i}`}
            >
              ✓
            </button>
            <div>
              <div className="mono-num" style={{ fontSize: 16 }}>
                {set.targetWeight}
                {settings.units} × {set.targetReps}
                {set.isAmrap ? '+' : ''}
              </div>
              {set.isAmrap && (
                <div style={{ marginTop: 6 }}>
                  <input
                    type="number"
                    className="reps-input"
                    placeholder="reps"
                    value={set.actualReps ?? ''}
                    data-testid="amrap-reps-input"
                    onChange={(e) => {
                      const reps = e.target.value ? parseInt(e.target.value, 10) : null;
                      updateMainSet(i, {
                        actualReps: reps,
                        actualWeight: set.targetWeight,
                        completed: !!reps,
                      });
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>reps completed</span>
                </div>
              )}
            </div>
            <div />
          </div>
        ))}
      </div>
      {amrapSet && liveE1RM !== null && (
        <p style={{ fontSize: 13 }} data-testid="live-e1rm">
          Estimated 1RM from that set: <span className="mono-num">{liveE1RM.toFixed(1)}{settings.units}</span>
          {isNewPR && (
            <span
              data-testid="new-pr-badge"
              style={{
                marginLeft: 8,
                color: 'var(--plate-red)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              New PR!
            </span>
          )}
        </p>
      )}
      <PlateBar weight={mainSets[mainSets.length - 1].targetWeight} barWeight={settings.barWeight} unit={settings.units} />

      <h3 style={{ marginTop: 20 }}>Boring But Strong — {bbsTotalSets} × 5 @ {bbsWeight}{settings.units}</h3>
      <div className="card">
        <div className="row">
          <span>Sets completed</span>
          <div className="row" style={{ gap: 10, width: 'auto' }}>
            <button
              className="btn"
              style={{ padding: '6px 14px', minHeight: 'auto' }}
              onClick={() => {
                setBbsCompletedCount((c) => Math.max(0, c - 1));
                setDirty(true);
              }}
              aria-label="Decrease BBS sets completed"
              data-testid="bbs-decrement"
            >
              −
            </button>
            <span className="mono-num" style={{ fontSize: 18, minWidth: 36, textAlign: 'center' }} data-testid="bbs-count">
              {bbsCompletedCount}/{bbsTotalSets}
            </span>
            <button
              className="btn"
              style={{ padding: '6px 14px', minHeight: 'auto' }}
              onClick={() => {
                setBbsCompletedCount((c) => Math.min(bbsTotalSets, c + 1));
                setDirty(true);
              }}
              aria-label="Increase BBS sets completed"
              data-testid="bbs-increment"
            >
              +
            </button>
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="bbs-reps-override">If you couldn't hit 5 on every set, note reps here (optional)</label>
          <input
            id="bbs-reps-override"
            type="number"
            placeholder="5"
            value={bbsRepsOverride}
            onChange={(e) => {
              setBbsRepsOverride(e.target.value);
              setDirty(true);
            }}
          />
        </div>
      </div>
      <PlateBar weight={bbsWeight} barWeight={settings.barWeight} unit={settings.units} />

      <h3 style={{ marginTop: 20 }}>Accessory work</h3>
      <AccessoryWork
        workoutId={workout.id}
        allWorkouts={allWorkouts}
        settings={settings}
        initialAccessories={initialAccessories}
        onChange={handleAccessoriesChange}
      />

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="workout-notes">Notes (optional)</label>
        <input
          id="workout-notes"
          type="text"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setDirty(true);
          }}
          placeholder="How did it feel?"
        />
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleSave} data-testid="save-session-btn">
        Save session
      </button>
      <button className="btn btn-block btn-ghost" style={{ marginTop: 8 }} onClick={handleSkip} data-testid="skip-session-btn">
        Skip / rest this session
      </button>
    </div>
  );
}
