interface LineChartProps {
  points: { x: number; y: number; label?: string }[];
  width?: number;
  height?: number;
  color?: string;
  unit?: string;
}

export function LineChart({ points, width = 320, height = 140, color = 'var(--plate-red)', unit = '' }: LineChartProps) {
  if (points.length === 0) {
    return <p style={{ fontSize: 13 }}>No data logged yet.</p>;
  }
  if (points.length === 1) {
    return (
      <p style={{ fontSize: 13 }}>
        One data point so far: <span className="mono-num">{points[0].y}{unit}</span>. Log another session to see a trend.
      </p>
    );
  }

  const padding = 24;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const yRange = maxY - minY || 1;
  const xRange = maxX - minX || 1;

  const scaleX = (x: number) => padding + ((x - minX) / xRange) * (width - padding * 2);
  const scaleY = (y: number) => height - padding - ((y - minY) / yRange) * (height - padding * 2);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.x)} ${scaleY(p.y)}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Progress over time">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border)" />
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={scaleX(p.x)} cy={scaleY(p.y)} r={3.5} fill={color} />
      ))}
      <text x={padding} y={14} fontSize={11} fill="var(--text-muted)">
        {maxY.toFixed(0)}
        {unit}
      </text>
      <text x={padding} y={height - padding + 16} fontSize={11} fill="var(--text-muted)">
        {minY.toFixed(0)}
        {unit}
      </text>
    </svg>
  );
}
