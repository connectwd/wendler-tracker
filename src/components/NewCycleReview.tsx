import { useMemo, useState } from 'react';
import type { Cycle, LiftConfig, Settings, Workout } from '../types';
import { nextCycleTrainingMax } from '../lib/wendler';
import { checkPlateau, resetTrainingMax } from '../lib/plateau';
import { parsePositiveWeight } from '../lib/validation';

interface NewCycleReviewProps {
  activeCycle: Cycle;
  cycles: Cycle[];
  lifts: LiftConfig[];
  workouts: Workout[];
  settings: Settings;
  onConfirm: (overrides: Record<string, number>) => void;
  onCancel: () => void;
}

export function NewCycleReview({
  activeCycle,
  cycles,
  lifts,
  workouts,
  settings,
  onConfirm,
  onCancel,
}: NewCycleReviewProps) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const cycleWorkouts = useMemo(
    () => workouts.filter((w) => w.cycleId === activeCycle.id),
    [workouts, activeCycle]
  );

  function amrapSummary(liftId: string): string {
    const liftWorkouts = cycleWorkouts.filter((w) => w.liftId === liftId && w.week !== 4);
    const parts = liftWorkouts
      .sort((a, b) => a.week - b.week)
      .map((w) => {
        if (w.status === 'skipped') return 'skip';
        const amrap = w.mainSets.find((s) => s.isAmrap);
        return amrap?.actualReps != null ? `${amrap.actualReps}` : '—';
      });
    return parts.join(' / ');
  }

  function suggestedTM(liftId: string, increment: number): number {
    const prev = activeCycle.trainingMaxes[liftId] ?? 0;
    return nextCycleTrainingMax(prev, increment);
  }

  /** Empty field = use the suggestion (always valid). A non-empty field must
   * parse to a positive number, or it's invalid - never silently NaN. */
  function overrideIsValid(lift: LiftConfig): boolean {
    const override = overrides[lift.id];
    if (override === undefined || override.trim() === '') return true;
    return parsePositiveWeight(override) !== null;
  }

  function finalTM(lift: LiftConfig): number {
    const override = overrides[lift.id];
    if (override !== undefined && override.trim() !== '') {
      const parsed = parsePositiveWeight(override);
      if (parsed !== null) return parsed;
    }
    return suggestedTM(lift.id, lift.cycleIncrement);
  }

  function applyReset(lift: LiftConfig) {
    const currentTM = activeCycle.trainingMaxes[lift.id] ?? 0;
    const reset = resetTrainingMax(currentTM, 0.9);
    setOverrides((prev) => ({ ...prev, [lift.id]: reset.toFixed(1) }));
  }

  const allOverridesValid = lifts.every(overrideIsValid);

  function handleConfirm() {
    if (!allOverridesValid) return;
    const finalOverrides: Record<string, number> = {};
    for (const lift of lifts) {
      finalOverrides[lift.id] = finalTM(lift);
    }
    onConfirm(finalOverrides);
  }

  return (
    <div className="screen">
      <button className="btn btn-ghost" onClick={onCancel} style={{ paddingLeft: 0 }}>
        ← Back
      </button>
      <p className="eyebrow">Cycle {activeCycle.cycleNumber} → {activeCycle.cycleNumber + 1}</p>
      <h1>Next Training Maxes</h1>
      <p>
        AMRAP reps shown are weeks 1/2/3 for this cycle — a quick sanity check before you roll forward. The suggested
        TM is just last cycle's TM plus your configured increment; edit any of them if a cycle didn't go to plan.
      </p>

      <div className="stack">
        {lifts.map((lift) => {
          const suggestion = suggestedTM(lift.id, lift.cycleIncrement);
          const plateau = checkPlateau(lift.id, activeCycle.cycleNumber, cycles, workouts, settings.units);
          const valid = overrideIsValid(lift);
          return (
            <div className="card" key={lift.id}>
              <div className="row">
                <h3 style={{ fontSize: 15, color: 'var(--text)', textTransform: 'none', letterSpacing: 0 }}>
                  {lift.name}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>AMRAP: {amrapSummary(lift.id)}</span>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {activeCycle.trainingMaxes[lift.id]?.toFixed(1)}
                  {settings.units} → +{lift.cycleIncrement}
                  {settings.units}
                </span>
                <input
                  type="number"
                  style={{ width: 100, borderColor: valid ? undefined : 'var(--plate-red)' }}
                  placeholder={suggestion.toFixed(1)}
                  value={overrides[lift.id] ?? ''}
                  onChange={(e) => setOverrides((prev) => ({ ...prev, [lift.id]: e.target.value }))}
                  data-testid={`tm-override-${lift.name}`}
                />
              </div>
              {!valid && (
                <p style={{ fontSize: 12, color: 'var(--plate-red)', marginTop: 4, marginBottom: 0 }}>
                  Enter a positive number, or leave blank to use the suggested {suggestion.toFixed(1)}
                  {settings.units}.
                </p>
              )}
              {plateau.isPlateaued && (
                <div className="warning-banner" style={{ marginTop: 12, marginBottom: 0 }} data-testid={`plateau-warning-${lift.name}`}>
                  <div>{plateau.reason}.</div>
                  <button
                    className="btn"
                    style={{ marginTop: 8, padding: '8px 12px', minHeight: 'auto' }}
                    onClick={() => applyReset(lift)}
                    data-testid={`plateau-reset-btn-${lift.name}`}
                  >
                    Reset to {resetTrainingMax(activeCycle.trainingMaxes[lift.id] ?? 0, 0.9).toFixed(1)}
                    {settings.units} (−10%) and rebuild
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: 20 }}
        onClick={handleConfirm}
        disabled={!allOverridesValid}
        data-testid="confirm-next-cycle-btn"
      >
        Start Cycle {activeCycle.cycleNumber + 1}
      </button>
    </div>
  );
}
