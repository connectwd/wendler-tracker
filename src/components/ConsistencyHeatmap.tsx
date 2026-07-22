import { useEffect, useMemo, useRef } from 'react';
import { buildHeatmapWeeks, tonnageBucket, type DailyStat } from '../lib/stats';

interface ConsistencyHeatmapProps {
  dailyStats: Map<string, DailyStat>;
  units: string;
  weeksBack?: number;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

export function ConsistencyHeatmap({ dailyStats, units, weeksBack = 26 }: ConsistencyHeatmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weeks = useMemo(() => buildHeatmapWeeks(dailyStats, weeksBack), [dailyStats, weeksBack]);

  // Scoped to the *visible* grid, not all-time history - otherwise one
  // exceptionally heavy day that's since scrolled out of the 26-week window
  // would permanently dim every cell currently on screen relative to a
  // maximum you can't even see.
  const maxTonnage = useMemo(() => {
    let max = 0;
    for (const week of weeks) {
      for (const cell of week) {
        if (cell.stat && cell.stat.tonnage > max) max = cell.stat.tonnage;
      }
    }
    return max;
  }, [weeks]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [weeks]);

  const monthChangeIndices = new Set<number>();
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const month = new Date(`${week[0].date}T00:00:00.000Z`).getUTCMonth();
    if (month !== lastMonth) {
      monthChangeIndices.add(i);
      lastMonth = month;
    }
  });

  return (
    <div>
      <div className="heatmap-scroll" ref={scrollRef}>
        <div className="heatmap-months">
          <div style={{ width: 15, flexShrink: 0 }} />
          {weeks.map((week, i) => (
            <div className="heatmap-month-label" key={i}>
              {monthChangeIndices.has(i) ? MONTH_LABELS[new Date(`${week[0].date}T00:00:00.000Z`).getUTCMonth()] : ''}
            </div>
          ))}
        </div>
        <div className="heatmap-body">
          <div className="heatmap-daylabels">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <div className="heatmap-daylabel" key={d}>
                {DAY_LABELS[d] ?? ''}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div className="heatmap-week" key={wi}>
              {week.map((cell) => {
                const bucket = cell.stat ? tonnageBucket(cell.stat.tonnage, maxTonnage) : 0;
                const isSkip = !!cell.stat?.hasSkip && !cell.stat?.hasCompleted;
                const title = cell.isFuture
                  ? cell.date
                  : cell.stat?.hasCompleted
                  ? `${cell.date}: ${Math.round(cell.stat.tonnage)}${units} moved`
                  : cell.stat?.hasSkip
                  ? `${cell.date}: rest/skip`
                  : `${cell.date}: no session`;
                return (
                  <div
                    key={cell.date}
                    className="heatmap-cell"
                    data-bucket={bucket}
                    data-skip={isSkip}
                    data-future={cell.isFuture}
                    title={title}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        <div className="heatmap-cell" data-bucket="0" />
        <div className="heatmap-cell" data-bucket="1" />
        <div className="heatmap-cell" data-bucket="2" />
        <div className="heatmap-cell" data-bucket="3" />
        <div className="heatmap-cell" data-bucket="4" />
        <span>More</span>
        <span style={{ marginLeft: 10 }}>
          <span className="heatmap-cell" data-skip="true" style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Rest
        </span>
      </div>
    </div>
  );
}
