/**
 * The "It compounds" labels come from the data file (plan KTD11: "Counts and
 * week labels live in one data file"). Here src/data/site/compounding.ts is
 * swapped for different weeks and counts, none of them the real ones, and
 * everything the section prints has to follow. A week or a count typed into
 * the component would fail this.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BrickWords } from "@/data/site/copy-types";

// Not the real loop (weeks 1, 2, 3, 4, 10, 17, 26), and no count is its week times three.
vi.mock("@/data/site/compounding", () => ({
  bricksPerWeek: 3,
  compoundingSteps: [
    { week: 2, bricks: 7 },
    { week: 5, bricks: 16 },
    { week: 11, bricks: 40 },
  ],
  compoundingFinal: { week: 11, bricks: 40 },
}));

const { Compounding } = await import("./compounding");

const words: BrickWords = { week: "Week", idea: "idea", setUp: "set up", empty: "not set up yet", caption: { week: "Week {week}", bricks: "{bricks} bricks" } };

const markup = renderToStaticMarkup(<Compounding copy={{ title: "It compounds.", line: "One line.", loop: { name: "The stack, week by week", pause: "Pause", play: "Play" } }} words={words} />);

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("the compounding loop on other data", () => {
  it("prints the data's weeks and counts as its lines of text, one for each state, in order", () => {
    const lines = [...markup.matchAll(/<li data-loop-state="(\d+)"[^>]*>(.*?)<\/li>/g)];
    expect(lines.map((m) => text(m[2]))).toEqual(["Week 2 7 bricks", "Week 5 16 bricks", "Week 11 40 bricks"]);
    expect(lines.map((m) => Number(m[1]))).toEqual([2, 5, 11]);
  });

  it("is on the data's last state as the server sends it: its week and count in large type, and its line marked", () => {
    expect(text(/<p aria-hidden="true" data-loop-caption[^>]*>(.*?)<\/p>/.exec(markup)![1])).toBe("Week 11 40 bricks");
    expect(markup).toContain('data-state="2"');
    const active = [...markup.matchAll(/data-loop-state="(\d+)" data-active="(yes|no)"/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(active).toEqual(["2:no", "5:no", "11:yes"]);
  });

  it("draws the stack of the data's last week, with a brick for every state's week and none marked out", () => {
    expect(markup).toContain('data-bricks="33"');
    const brickWeeks = [...markup.matchAll(/<li data-week="(\d+)" data-brick="\d+"/g)].map((m) => Number(m[1]));
    expect(brickWeeks).toHaveLength(33);
    expect(Math.max(...brickWeeks)).toBe(11);
    for (const week of [2, 5, 11]) expect(brickWeeks).toContain(week);
    expect(markup).not.toContain("data-out=");
  });

  it("prints none of the real loop's numbers, and no number of its own", () => {
    const visible = text(markup.replace(/<span class="sr-only">.*?<\/span>/g, ""));
    // The large caption, then the three lines.
    expect(visible.match(/\d+/g)).toEqual(["11", "40", "2", "7", "5", "16", "11", "40"]);
    expect(text(markup)).not.toMatch(/\b(?:26|78)\b/);
  });
});
