import { useMemo, useState } from 'react';
import type { BodyweightEntry, Unit } from '../types';
import { latestBodyweight, sortedByDate, todayDateString } from '../lib/bodyweight';
import { parsePositiveWeight } from '../lib/validation';

interface BodyweightLogProps {
  entries: BodyweightEntry[];
  units: Unit;
  onLog: (date: string, weight: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function BodyweightLog({ entries, units, onLog, onDelete }: BodyweightLogProps) {
  const [date, setDate] = useState(todayDateString());
  const [weight, setWeight] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  // Newest first for the history list - the quick-log form above already
  // shows the latest value, so the list is for scanning back through time
  // and fixing/removing older entries.
  const newestFirst = useMemo(() => sortedByDate(entries).reverse(), [entries]);
  const latest = latestBodyweight(entries);
  const parsedWeight = parsePositiveWeight(weight);

  async function handleLog() {
    if (parsedWeight === null) return;
    setSaving(true);
    await onLog(date, parsedWeight);
    setSaving(false);
    setWeight('');
    setDate(todayDateString());
  }

  return (
    <div className="card">
      <h3>Body weight</h3>
      {latest ? (
        <p style={{ marginBottom: 10 }}>
          Current: <span className="mono-num">{latest.weight}{units}</span>
          <span style={{ color: 'var(--text-faint)' }}> · logged {latest.date}</span>
        </p>
      ) : (
        <p style={{ marginBottom: 10 }}>No weigh-ins logged yet.</p>
      )}

      <div className="row" style={{ gap: 8 }}>
        <input
          type="date"
          value={date}
          max={todayDateString()}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          data-testid="bodyweight-date-input"
        />
        <input
          type="number"
          step="0.1"
          placeholder={`Weight (${units})`}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          aria-label={`Weight (${units})`}
          data-testid="bodyweight-weight-input"
        />
      </div>
      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: 8 }}
        onClick={handleLog}
        disabled={parsedWeight === null || saving}
        data-testid="bodyweight-log-btn"
      >
        Log weight
      </button>

      {entries.length > 0 && (
        <button
          className="btn btn-ghost"
          style={{ marginTop: 8, padding: '4px 0' }}
          onClick={() => setShowHistory((s) => !s)}
          data-testid="bodyweight-history-toggle"
        >
          {showHistory ? 'Hide history' : `Show history (${entries.length})`}
        </button>
      )}
      {showHistory && (
        <div className="stack" style={{ marginTop: 8 }}>
          {newestFirst.map((e) => (
            <div className="row" key={e.id} data-testid={`bodyweight-entry-${e.id}`}>
              <span style={{ fontSize: 13 }}>{e.date}</span>
              <div className="row" style={{ gap: 10, width: 'auto' }}>
                <span className="mono-num">
                  {e.weight}
                  {units}
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '4px 8px', minHeight: 'auto', color: 'var(--plate-red)' }}
                  onClick={() => onDelete(e.id)}
                  aria-label={`Delete entry from ${e.date}`}
                  data-testid={`bodyweight-delete-${e.id}`}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
