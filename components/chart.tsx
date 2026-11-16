import { daysBetween, fmtDay, hrs, isWorkday, weekday } from "@/lib/dates";
import type { Entry } from "@/lib/types";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Hours logged per day, drawn as an SVG bar chart. */
export function DailyChart({ entries, from, to }: { entries: Entry[]; from: string; to: string }) {
  const days = daysBetween(from, to);
  const by: Record<string, number> = {};
  for (const e of entries) by[e.date] = (by[e.date] || 0) + (Number(e.hours) || 0);
  const top = Math.ceil(Math.max(8, ...Object.values(by)) / 4) * 4;
  const bw = Math.max(6, Math.min(22, Math.floor(560 / Math.max(1, days.length)) - 2));
  const gap = 2, left = 30, height = 150, bottom = 22;
  const width = left + days.length * (bw + gap) + 8;
  const plotH = height - bottom - 8;
  return (
    <div className="chart chart-scroll">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hours logged per day">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (top * i) / 4;
          const y = height - bottom - plotH * (v / top);
          return (
            <g key={i}>
              <line className="grid" x1={left} x2={width} y1={y} y2={y} />
              <text x={left - 6} y={y + 3} textAnchor="end">{hrs(v)}</text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const v = by[d] || 0;
          const x = left + i * (bw + gap);
          const h = plotH * (v / top);
          const [, m, dd] = d.split("-").map(Number);
          const edge = i === 0 || i === days.length - 1;
          const periodic = days.length <= 31 ? weekday(d) === 1 : dd === 1;
          const nearEdge = i < 3 || i > days.length - 4;
          return (
            <g key={d}>
              {v > 0 && (
                <rect className={isWorkday(d) ? "bar" : "bar wk"} x={x} y={height - bottom - h} width={bw} height={h} rx={1.5}>
                  <title>{`${fmtDay(d)}: ${hrs(v)} h`}</title>
                </rect>
              )}
              {(edge || (periodic && !nearEdge)) && (
                <text x={x + bw / 2} y={height - 6} textAnchor="middle">{`${dd} ${MON[m - 1]}`}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
