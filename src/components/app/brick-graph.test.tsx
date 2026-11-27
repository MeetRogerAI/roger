import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BrickSeries } from "@/lib/app/week";
import { BrickGraph } from "./brick-graph";

/** Plan B2 Unit 2: the Season brick graph on /app/history (spec B.15). */
describe("BrickGraph", () => {
  const series: BrickSeries = { weekIndex: 33, season: 2, weekOfSeason: 7, points: [0, 1, 1, 2, 3, 3, 5], thisWeek: 2, seasonBricks: 5, lifetime: 12, confirmed: 0 };
  const html = renderToStaticMarkup(<BrickGraph series={series} />);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const summary = "Season 2 · week 7 of 26 · 5 bricks this Season · 12 in all";

  it("draws the line in the Season's colour", () => {
    expect(html).toMatch(/<polyline[^>]*stroke="var\(--color-season-2\)"/);
    expect(html.match(/<polyline[^>]*points="([^"]+)"/)![1].split(" ")).toHaveLength(7);
  });

  it("puts a larger marker on the current week", () => {
    expect(html).toMatch(/<circle[^>]*r="7"[^>]*fill="var\(--color-marker\)"[^>]*data-current-week="7"/);
  });

  it("shows the numbers once, in the paragraph; the graph's label is short and doesn't repeat them", () => {
    expect(text).toContain(summary);
    expect(html.split(summary)).toHaveLength(2);
    expect(html).toContain('role="img" aria-label="Bricks per week this Season"');
  });

  it("says 1 brick, not 1 bricks, and caps colour with the Season", () => {
    const one = renderToStaticMarkup(<BrickGraph series={{ ...series, weekIndex: 200, season: 5, weekOfSeason: 18, points: Array(18).fill(1), seasonBricks: 1, lifetime: 9 }} />);
    expect(one).toContain("Season 5 · week 18 of 26 · 1 brick this Season · 9 in all");
    expect(one).toContain("var(--color-season-5)");
  });

  it("never says Level", () => {
    expect(html).not.toMatch(/level/i);
  });

  it("shows an empty state with no graph before the first list", () => {
    const empty = renderToStaticMarkup(<BrickGraph series={null} />);
    expect(empty).not.toContain("<svg");
    expect(empty).toContain("Your graph starts with your first list.");
  });
});
