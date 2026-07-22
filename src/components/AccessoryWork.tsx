import { useState } from 'react';
import type { AccessoryCategory, LoggedAccessoryExercise, Settings, Workout } from '../types';
import {
  ACCESSORY_CATALOG,
  ACCESSORY_CATEGORY_LABELS,
  ACCESSORY_REP_TARGET,
  MAX_ACCESSORY_EXERCISES,
  findLastAccessoryLog,
  getAccessoryOption,
} from '../lib/accessories';

const CATEGORIES: AccessoryCategory[] = ['push', 'pull', 'core'];

function emptySets(count = 3) {
  return Array.from({ length: count }, (_, i) => ({ setNumber: i + 1, weight: null, reps: null }));
}

interface AccessoryWorkProps {
  workoutId: string;
  allWorkouts: Workout[];
  settings: Settings;
  initialAccessories: LoggedAccessoryExercise[];
  onChange: (accessories: LoggedAccessoryExercise[]) => void;
}

export function AccessoryWork({ workoutId, allWorkouts, settings, initialAccessories, onChange }: AccessoryWorkProps) {
  const [mode, setMode] = useState<'picker' | 'logging'>(initialAccessories.length > 0 ? 'logging' : 'picker');
  const [selectedIds, setSelectedIds] = useState<string[]>(initialAccessories.map((a) => a.exerciseId));
  const [exercises, setExercises] = useState<LoggedAccessoryExercise[]>(initialAccessories);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_ACCESSORY_EXERCISES) return prev;
      return [...prev, id];
    });
  }

  function confirmSelection() {
    const next: LoggedAccessoryExercise[] = selectedIds.map((id) => {
      const existing = exercises.find((e) => e.exerciseId === id);
      if (existing) return existing;
      const option = getAccessoryOption(id)!;
      return { exerciseId: id, name: option.name, category: option.category, sets: emptySets() };
    });
    setExercises(next);
    onChange(next);
    setMode('logging');
  }

  function updateSet(exerciseId: string, setIndex: number, patch: Partial<{ weight: number | null; reps: number | null }>) {
    setExercises((prev) => {
      const next = prev.map((ex) =>
        ex.exerciseId === exerciseId
          ? { ...ex, sets: ex.sets.map((s, i) => (i === setIndex ? { ...s, ...patch } : s)) }
          : ex
      );
      onChange(next);
      return next;
    });
  }

  function addSet(exerciseId: string) {
    setExercises((prev) => {
      const next = prev.map((ex) =>
        ex.exerciseId === exerciseId
          ? { ...ex, sets: [...ex.sets, { setNumber: ex.sets.length + 1, weight: null, reps: null }] }
          : ex
      );
      onChange(next);
      return next;
    });
  }

  function removeSet(exerciseId: string, setIndex: number) {
    setExercises((prev) => {
      const next = prev.map((ex) =>
        ex.exerciseId === exerciseId
          ? { ...ex, sets: ex.sets.filter((_, i) => i !== setIndex).map((s, i) => ({ ...s, setNumber: i + 1 })) }
          : ex
      );
      onChange(next);
      return next;
    });
  }

  if (mode === 'picker') {
    return (
      <div className="card">
        <p style={{ fontSize: 13, marginBottom: 4 }}>
          Wendler's assistance framework: one exercise each from Push, Pull, and Single Leg/Core, aiming for{' '}
          {ACCESSORY_REP_TARGET} per category. Pick up to {MAX_ACCESSORY_EXERCISES}.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }} data-testid="accessory-selected-count">
          {selectedIds.length}/{MAX_ACCESSORY_EXERCISES} selected
        </p>
        {CATEGORIES.map((cat) => (
          <div key={cat}>
            <div className="accessory-category-label">{ACCESSORY_CATEGORY_LABELS[cat]}</div>
            {ACCESSORY_CATALOG.filter((o) => o.category === cat).map((option) => {
              const checked = selectedIds.includes(option.id);
              const disabled = !checked && selectedIds.length >= MAX_ACCESSORY_EXERCISES;
              return (
                <div className="accessory-picker-row" key={option.id}>
                  <button
                    className={`accessory-checkbox ${checked ? 'checked' : ''}`}
                    onClick={() => toggleSelected(option.id)}
                    disabled={disabled}
                    aria-label={`${checked ? 'Deselect' : 'Select'} ${option.name}`}
                    data-testid={`accessory-option-${option.id}`}
                  >
                    ✓
                  </button>
                  <span style={{ opacity: disabled ? 0.4 : 1 }}>{option.name}</span>
                </div>
              );
            })}
          </div>
        ))}
        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 14 }}
          onClick={confirmSelection}
          data-testid="accessory-confirm-btn"
        >
          {selectedIds.length === 0 ? 'Skip accessories today' : `Confirm ${selectedIds.length} exercise${selectedIds.length === 1 ? '' : 's'}`}
        </button>
      </div>
    );
  }

  if (exercises.length === 0) {
    return (
      <div className="card">
        <div className="row">
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No accessory work logged today.</span>
          <button className="btn" onClick={() => setMode('picker')} data-testid="accessory-change-btn">
            Add some
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {exercises.map((ex) => {
        const last = findLastAccessoryLog(ex.exerciseId, allWorkouts, workoutId);
        return (
          <div className="card" key={ex.exerciseId}>
            <div className="row">
              <h3 style={{ fontSize: 15, color: 'var(--text)', textTransform: 'none', letterSpacing: 0 }}>{ex.name}</h3>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{ACCESSORY_CATEGORY_LABELS[ex.category]}</span>
            </div>
            {last && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }} data-testid={`accessory-history-${ex.exerciseId}`}>
                Last time ({last.date}):{' '}
                {last.exercise.sets
                  .filter((s) => s.weight !== null && s.reps !== null)
                  .map((s) => `${s.weight}${settings.units}×${s.reps}`)
                  .join(', ')}
              </p>
            )}
            <div style={{ marginTop: 10 }}>
              {ex.sets.map((set, i) => (
                <div className="accessory-set-row" key={i}>
                  <input
                    type="number"
                    placeholder={`Weight (${settings.units})`}
                    value={set.weight ?? ''}
                    onChange={(e) => updateSet(ex.exerciseId, i, { weight: e.target.value ? parseFloat(e.target.value) : null })}
                    data-testid={`accessory-weight-${ex.exerciseId}-${i}`}
                  />
                  <input
                    type="number"
                    placeholder="Reps"
                    value={set.reps ?? ''}
                    onChange={(e) => updateSet(ex.exerciseId, i, { reps: e.target.value ? parseInt(e.target.value, 10) : null })}
                    data-testid={`accessory-reps-${ex.exerciseId}-${i}`}
                  />
                  <button
                    className="accessory-remove-set"
                    onClick={() => removeSet(ex.exerciseId, i)}
                    aria-label={`Remove set ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button className="btn" style={{ padding: '8px 12px', minHeight: 'auto' }} onClick={() => addSet(ex.exerciseId)}>
                + Add set
              </button>
            </div>
          </div>
        );
      })}
      <button className="btn btn-ghost" onClick={() => setMode('picker')} data-testid="accessory-change-btn">
        Change exercises
      </button>
    </div>
  );
}
