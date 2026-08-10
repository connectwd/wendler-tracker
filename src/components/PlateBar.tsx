import type { Unit } from '../types';
import { calculatePlates, type PlateColor } from '../lib/plates';

// Deliberately uses the fixed --plate-color-* tokens, not the general
// --plate-red/etc. accent tokens - this diagram represents real physical
// plates on a real bar, so it must stay accurate regardless of theme.
const COLOR_MAP: Record<PlateColor, string> = {
  red: 'var(--plate-color-red)',
  blue: 'var(--plate-color-blue)',
  yellow: 'var(--plate-color-yellow)',
  green: 'var(--plate-color-green)',
  white: 'var(--plate-color-white)',
  black: '#3a3c44',
};

export function PlateBar({ weight, barWeight, unit }: { weight: number; barWeight: number; unit: Unit }) {
  const result = calculatePlates(weight, barWeight, unit);

  if (result.perSide.length === 0) {
    return (
      <p style={{ fontSize: 12, margin: '4px 0 0' }}>
        {weight <= barWeight ? 'Bar only' : 'Below bar weight'}
      </p>
    );
  }

  return (
    <div>
      <div className="plate-bar" aria-hidden="true">
        <div className="sleeve" />
        {[...result.perSide].reverse().map((p, i) => (
          <div
            key={i}
            className="plate"
            style={{
              background: COLOR_MAP[p.color],
              width: 8,
              height: `${p.size * 34}px`,
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 12, margin: 0 }}>
        Per side: {result.perSide.map((p) => parseFloat(p.weight.toFixed(2)).toString()).join(' + ')}
        {!result.achievable && ` (${result.remainder}${unit} short — no plate combo for that)`}
      </p>
    </div>
  );
}
