import { useState } from 'react';
import type { LiftConfig, Settings, Unit } from '../types';
import { calculateTrainingMax, estimateOneRepMax } from '../lib/wendler';
import { makeId } from '../lib/id';
import { parsePositiveWeight } from '../lib/validation';

const DEFAULT_LIFTS: Omit<LiftConfig, 'id'>[] = [
  { name: 'Bench Press', dayOfWeek: 1, order: 1, cycleIncrement: 3 },
  { name: 'Squat', dayOfWeek: 2, order: 2, cycleIncrement: 3 },
  { name: 'Deadlift', dayOfWeek: 4, order: 3, cycleIncrement: 3 },
  { name: 'Overhead Press', dayOfWeek: 5, order: 4, cycleIncrement: 3 },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface LiftDraft extends LiftConfig {
  inputWeight: string;
  inputReps: string;
  tmOverride: string | null; // null = use computed suggestion
}

interface OnboardingProps {
  onComplete: (settings: Settings, lifts: LiftConfig[], trainingMaxes: Record<string, number>) => Promise<void>;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [units, setUnits] = useState<Unit>('kg');
  const [barWeight, setBarWeight] = useState(20);
  const [roundingIncrement, setRoundingIncrement] = useState(2.5);
  const [bodyweight, setBodyweight] = useState('');
  const [saving, setSaving] = useState(false);

  const [lifts, setLifts] = useState<LiftDraft[]>(
    DEFAULT_LIFTS.map((l) => ({ ...l, id: makeId(), inputWeight: '', inputReps: '1', tmOverride: null }))
  );

  function updateLift(id: string, patch: Partial<LiftDraft>) {
    setLifts((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLift() {
    setLifts((prev) => [
      ...prev,
      {
        id: makeId(),
        name: '',
        dayOfWeek: 1,
        order: prev.length + 1,
        cycleIncrement: 3,
        inputWeight: '',
        inputReps: '1',
        tmOverride: null,
      },
    ]);
  }

  function removeLift(id: string) {
    setLifts((prev) => prev.filter((l) => l.id !== id));
  }

  function suggestedTM(lift: LiftDraft): number | null {
    const weight = parseFloat(lift.inputWeight);
    const reps = parseInt(lift.inputReps, 10);
    if (!weight || !reps) return null;
    const e1rm = estimateOneRepMax(weight, reps);
    if (e1rm === null) return null;
    return calculateTrainingMax(e1rm, 0.9);
  }

  function finalTM(lift: LiftDraft): number | null {
    if (lift.tmOverride !== null && lift.tmOverride.trim() !== '') {
      return parsePositiveWeight(lift.tmOverride);
    }
    return suggestedTM(lift);
  }

  const steps = ['Units', 'Lifts', 'Current maxes', 'Review'];

  const liftNames = lifts.map((l) => l.name.trim().toLowerCase()).filter(Boolean);
  const hasDuplicateNames = new Set(liftNames).size !== liftNames.length;
  const canAdvanceFromLifts =
    lifts.length > 0 && lifts.every((l) => l.name.trim().length > 0) && !hasDuplicateNames;
  const canAdvanceFromMaxes = lifts.every((l) => finalTM(l) !== null && finalTM(l)! > 0);

  async function handleFinish() {
    setSaving(true);
    const settings: Settings = {
      units,
      barWeight,
      roundingIncrement,
      bodyweight: bodyweight ? parseFloat(bodyweight) : null,
      onboardingComplete: true,
    };
    const finalLifts: LiftConfig[] = lifts.map(({ inputWeight, inputReps, tmOverride, ...l }) => l);
    const trainingMaxes: Record<string, number> = {};
    for (const l of lifts) {
      trainingMaxes[l.id] = finalTM(l)!;
    }
    await onComplete(settings, finalLifts, trainingMaxes);
  }

  return (
    <div className="screen">
      <p className="eyebrow">
        Setup {step + 1} / {steps.length} — {steps[step]}
      </p>
      <h1>Let's set your starting point</h1>

      {step === 0 && (
        <div className="stack">
          <p>Standard Wendler starting procedure: nail down your units and rounding before anything else.</p>
          <div className="field">
            <label>Units</label>
            <div className="row">
              <button
                className="btn"
                style={{ flex: 1, background: units === 'kg' ? 'var(--plate-red)' : undefined }}
                onClick={() => setUnits('kg')}
              >
                kg
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: units === 'lb' ? 'var(--plate-red)' : undefined }}
                onClick={() => setUnits('lb')}
              >
                lb
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="onb-bar-weight">Bar weight ({units})</label>
            <input
              id="onb-bar-weight"
              type="number"
              value={barWeight}
              onChange={(e) => setBarWeight(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label htmlFor="onb-rounding">Round working weights to the nearest ({units})</label>
            <input
              id="onb-rounding"
              type="number"
              step="0.25"
              value={roundingIncrement}
              onChange={(e) => setRoundingIncrement(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <p>Your four main lifts. Edit names, training day, or the amount each Training Max grows by every new cycle.</p>
          {lifts.map((lift) => (
            <div className="card" key={lift.id}>
              <div className="field">
                <label htmlFor={`lift-name-${lift.id}`}>Lift name</label>
                <input
                  id={`lift-name-${lift.id}`}
                  type="text"
                  value={lift.name}
                  onChange={(e) => updateLift(lift.id, { name: e.target.value })}
                />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`lift-day-${lift.id}`}>Usual day</label>
                  <select
                    id={`lift-day-${lift.id}`}
                    value={lift.dayOfWeek}
                    onChange={(e) => updateLift(lift.id, { dayOfWeek: parseInt(e.target.value, 10) })}
                    style={{
                      width: '100%',
                      background: 'var(--surface-raised)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      borderRadius: 6,
                      padding: 12,
                    }}
                  >
                    {DAY_LABELS.map((d, i) => (
                      <option key={i} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`lift-increment-${lift.id}`}>+ per cycle ({units})</label>
                  <input
                    id={`lift-increment-${lift.id}`}
                    type="number"
                    step="0.5"
                    value={lift.cycleIncrement}
                    onChange={(e) => updateLift(lift.id, { cycleIncrement: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              {lifts.length > 1 && (
                <button className="btn btn-ghost" onClick={() => removeLift(lift.id)}>
                  Remove lift
                </button>
              )}
            </div>
          ))}
          <button className="btn" onClick={addLift}>
            + Add another lift
          </button>
          {hasDuplicateNames && (
            <p style={{ fontSize: 13, color: 'var(--plate-red)' }}>
              Two lifts have the same name — give each one something distinct.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <p>
            For each lift, enter a recent, honest set — weight and reps you could actually complete today. If you
            know your true 1-rep max, enter it with 1 rep. Training Max defaults to 90% of that, and you can
            override it if you'd rather start conservative.
          </p>
          {lifts.map((lift) => {
            const suggestion = suggestedTM(lift);
            return (
              <div className="card" key={lift.id}>
                <h3 style={{ marginBottom: 10 }}>{lift.name || 'Unnamed lift'}</h3>
                <div className="row" style={{ gap: 10 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor={`lift-weight-${lift.id}`}>Weight ({units})</label>
                    <input
                      id={`lift-weight-${lift.id}`}
                      type="number"
                      value={lift.inputWeight}
                      onChange={(e) => updateLift(lift.id, { inputWeight: e.target.value, tmOverride: null })}
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor={`lift-reps-${lift.id}`}>Reps</label>
                    <input
                      id={`lift-reps-${lift.id}`}
                      type="number"
                      value={lift.inputReps}
                      onChange={(e) => updateLift(lift.id, { inputReps: e.target.value, tmOverride: null })}
                    />
                  </div>
                </div>
                {suggestion !== null && (
                  <p style={{ fontSize: 13 }}>
                    Estimated 1RM: <span className="mono-num">{estimateOneRepMax(parseFloat(lift.inputWeight), parseInt(lift.inputReps, 10))?.toFixed(1)}{units}</span>
                    {' · '}Suggested Training Max (90%): <span className="mono-num">{suggestion.toFixed(1)}{units}</span>
                  </p>
                )}
                <div className="field" style={{ marginTop: 6 }}>
                  <label htmlFor={`lift-tm-${lift.id}`}>Training Max to use ({units})</label>
                  <input
                    id={`lift-tm-${lift.id}`}
                    type="number"
                    placeholder={suggestion !== null ? suggestion.toFixed(1) : '—'}
                    value={lift.tmOverride ?? ''}
                    onChange={(e) => updateLift(lift.id, { tmOverride: e.target.value })}
                  />
                </div>
              </div>
            );
          })}
          <div className="field">
            <label htmlFor="onb-bodyweight">Bodyweight ({units}, optional)</label>
            <input id="onb-bodyweight" type="number" value={bodyweight} onChange={(e) => setBodyweight(e.target.value)} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <p>Cycle 1 will be created with these Training Maxes. New cycles carry each TM forward by its + per cycle amount automatically.</p>
          {lifts.map((lift) => (
            <div className="card row" key={lift.id}>
              <span>{lift.name}</span>
              <span className="mono-num">
                TM {finalTM(lift)?.toFixed(1)}
                {units} · +{lift.cycleIncrement}
                {units}/cycle
              </span>
            </div>
          ))}
          <div className="card">
            <div className="row">
              <span>Units</span>
              <span className="mono-num">{units}</span>
            </div>
            <div className="row">
              <span>Bar weight</span>
              <span className="mono-num">
                {barWeight}
                {units}
              </span>
            </div>
            <div className="row">
              <span>Rounding</span>
              <span className="mono-num">
                {roundingIncrement}
                {units}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 20, gap: 10 }}>
        {step > 0 && (
          <button className="btn" onClick={() => setStep((s) => s - 1)} disabled={saving}>
            Back
          </button>
        )}
        {step < steps.length - 1 && (
          <button
            className="btn btn-primary btn-block"
            onClick={() => setStep((s) => s + 1)}
            disabled={(step === 1 && !canAdvanceFromLifts) || (step === 2 && !canAdvanceFromMaxes)}
          >
            Continue
          </button>
        )}
        {step === steps.length - 1 && (
          <button className="btn btn-primary btn-block" onClick={handleFinish} disabled={saving}>
            {saving ? 'Setting up…' : 'Start Cycle 1'}
          </button>
        )}
      </div>
    </div>
  );
}
