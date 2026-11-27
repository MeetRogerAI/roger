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

// Not the real story (weeks 1, 2, 3, 26), and no count is its week times three.
vi.mock("@/data/site/compounding", () => ({
  bricksPerWeek: 3,
  compoundingSteps: [
    { week: 2, bricks: 7 },
    { week: 5, bricks: 16 },
    { week: 11, bricks: 40 },
  ],
  compoundingFinal: { week: 11, bricks: 40 },
}));

const { Compounding, storySteps, storyText } = await import("./compounding");

const words: BrickWords = { week: "Week", idea: "idea", setUp: "set up", empty: "not set up yet", caption: { week: "Week {week}", bricks: "{bricks} bricks" } };

const markup = renderToStaticMarkup(<Compounding copy={{ title: "It compounds.", line: "One line." }} words={words} />);

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("the compounding story on other data", () => {
  it("takes its steps from the data, ending on the finished stack", () => {
    expect(storySteps).toEqual([
      { week: 2, bricks: 7 },
      { week: 5, bricks: 16 },
      { week: 11, bricks: 40 },
    ]);
  });

  it("prints the data's weeks and counts on the visible labels", () => {
    const labels = [...markup.matchAll(/<li data-step-week="(\d+)"[^>]*>(.*?)<\/li>/g)];
    expect(labels.map((m) => text(m[2]))).toEqual(["Week 2 7 bricks", "Week 5 16 bricks", "Week 11 40 bricks"]);
  });

  it("gives each step the data's week as its data attribute, which the script reads", () => {
    const weeks = [...markup.matchAll(/data-step-week="(\d+)"/g)].map((m) => Number(m[1]));
    expect(weeks).toEqual([2, 5, 11]);
    // The stack is as tall as the finished week, and its last brick is that week's.
    expect(markup).toContain('data-bricks="33"');
    const brickWeeks = [...markup.matchAll(/<li data-week="(\d+)" data-brick="\d+"/g)].map((m) => Number(m[1]));
    expect(brickWeeks).toHaveLength(33);
    expect(Math.max(...brickWeeks)).toBe(11);
    // Every step's week has bricks to show.
    for (const week of weeks) expect(brickWeeks).toContain(week);
  });

  it("says the same in the sentence for a screen reader", () => {
    expect(storyText(words)).toBe("Week 2: 7 bricks. Week 5: 16 bricks. Week 11: 40 bricks.");
    expect(markup).toContain('<p class="sr-only">Week 2: 7 bricks. Week 5: 16 bricks. Week 11: 40 bricks.</p>');
  });

  it("prints none of the real story's numbers, and no number of its own", () => {
    const visible = text(markup.replace(/<span class="sr-only">.*?<\/span>/g, "").replace(/<p class="sr-only">.*?<\/p>/g, ""));
    expect(visible.match(/\d+/g)).toEqual(["2", "7", "5", "16", "11", "40"]);
    expect(text(markup)).not.toMatch(/\b(?:26|78)\b/);
  });

  it("marks the line to a step as a jump only where the data skips weeks", () => {
    // 2 to 5 and 5 to 11 both skip; the last step has no line after it.
    const lines = [...markup.matchAll(/<span class="absolute [^"]*"/g)].map((m) => m[0].includes("border-dashed"));
    expect(lines).toEqual([true, true]);
  });
});
