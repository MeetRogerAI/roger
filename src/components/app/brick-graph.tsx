import { brickSummary, SEASON_WEEKS, type BrickSeries } from "@/lib/app/week";

const W = 320;
const H = 150;
const PAD = { left: 12, right: 12, top: 14, bottom: 26 };

/**
 * The 26-week compounding graph (spec B.15): bricks set up so far this
 * Season, the line in the Season's colour, a larger marker on this week.
 * The numbers live once, in the paragraph above the graph, so colour is
 * never the only signal and a screen reader doesn't hear them twice.
 */
export function BrickGraph({ series }: { series: BrickSeries | null }) {
  if (!series) {
    return (
      <section aria-labelledby="bricks-title" className="rounded-object border border-rule bg-surface p-5">
        <h2 id="bricks-title" className="text-title">
          Your bricks
        </h2>
        <p className="mt-2 text-small text-ink-2">Your graph starts with your first list. Each idea you set up adds a brick.</p>
      </section>
    );
  }

  const summary = brickSummary(series);
  const colour = `var(--color-season-${series.season})`;
  const top = Math.max(4, series.seasonBricks);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (week: number) => PAD.left + ((week - 1) / (SEASON_WEEKS - 1)) * plotW;
  const y = (count: number) => PAD.top + plotH - (count / top) * plotH;
  const line = series.points.map((n, i) => `${x(i + 1).toFixed(1)},${y(n).toFixed(1)}`).join(" ");
  const now = { x: x(series.weekOfSeason), y: y(series.seasonBricks) };
  const baseY = y(0);

  return (
    <section aria-labelledby="bricks-title" className="rounded-object border border-rule bg-surface p-5">
      <h2 id="bricks-title" className="text-title">
        Your bricks
      </h2>
      <p className="mt-2 text-small text-ink-2" data-testid="brick-summary">
        {summary}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bricks per week this Season" className="mt-4 block h-auto w-full" data-season={series.season}>
        <line x1={x(1)} x2={x(SEASON_WEEKS)} y1={baseY} y2={baseY} stroke="var(--color-rule-strong)" strokeWidth="1" />
        {Array.from({ length: SEASON_WEEKS }, (_, i) => (
          <circle key={i} cx={x(i + 1)} cy={baseY} r="1.5" fill="var(--color-rule-strong)" />
        ))}
        {series.points.length > 1 && (
          <polyline points={line} fill="none" stroke={colour} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        )}
        <circle cx={now.x} cy={now.y} r="7" fill="var(--color-marker)" stroke="var(--color-surface)" strokeWidth="2" data-current-week={series.weekOfSeason} />
        <text x={x(1)} y={H - 6} fontSize="12" fill="var(--color-ink-2)" textAnchor="start">
          Week 1
        </text>
        <text x={x(SEASON_WEEKS)} y={H - 6} fontSize="12" fill="var(--color-ink-2)" textAnchor="end">
          Week {SEASON_WEEKS}
        </text>
      </svg>
    </section>
  );
}
