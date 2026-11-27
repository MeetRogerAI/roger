import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { examples, firstExample } from "@/data/site/examples";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { exampleViews, publicIdeaView } = await import("./sample");
const readdirNames = (dir: string): string[] => readdirSync(dir);

/**
 * The plays under "Cora Curation Examples" (Peter's third homepage review,
 * November 27, 2026): bundled with the site, real, cleaned, and the only
 * plays a public page shows.
 */
describe("the bundled examples", () => {
  it("are the three plays Peter named, under their short titles, in his order", () => {
    expect(examples.map((e) => [e.id, e.label])).toEqual([
      ["video", "On-demand video creation"],
      ["prospects", "20 new prospects every day"],
      ["paper", "A printed daily paper for the family"],
    ]);
    expect(examples.map((e) => e.play.title)).toEqual(["Phone camera roll to styled Reels", "Daily prospect outreach drafts", "Printable one-page daily paper for the kitchen table"]);
    expect(firstExample).toBe(examples[0]);
    // Each has a summary, a playbook and an install prompt of its own, so each card can be opened all the way down.
    for (const { id, play } of examples) {
      expect(play.description.length, id).toBeGreaterThan(100);
      expect(play.playbookMd.length, id).toBeGreaterThan(1500);
      expect(play.pasteToInstall, id).toMatch(/^(?:Written by another member\. Read sections 1 to 8 before pasting this\. )?Save this as a skill called/);
    }
    expect(new Set(examples.map((e) => e.id)).size).toBe(examples.length);
    expect(new Set(examples.map((e) => e.play.id)).size).toBe(examples.length);
  });

  it("carry no figure about time or money, no score, and no “heavy use for” line", () => {
    for (const { id, play } of examples) {
      expect(play.figures, id).toEqual({});
      expect(play.heavyUseFor, id).toBe("");
      expect(play.score, id).toBeNull();
      expect(Object.values(play.scores), id).toEqual([null, null, null, null, null]);
      const text = `${play.title} ${play.description} ${play.playbookMd} ${play.pasteToInstall}`;
      expect(text, id).not.toMatch(/hours? (?:a|per) week|minutes saved|time saved|by hand|Confidence|Over a year|\bhours saved\b|\$/i);
      // "agent" never stands alone (spec 0.4).
      expect(text, id).not.toMatch(/(?<!AI )\bagents?\b/i);
    }
  });

  it("name nobody: no contributor's name is in the data file, in its comments or in any example", () => {
    const file = readFileSync(path.join(process.cwd(), "src/data/site/examples.ts"), "utf8");
    // The first names in the file names of artifacts/Zack Runs, read from the folder so no name is typed here.
    const runs = path.join(process.cwd(), "artifacts/Zack Runs");
    const names = new Set<string>();
    for (const entry of readdirNames(runs)) {
      const name = /^Zack[ _]Run - ([A-Za-z]+)/.exec(entry)?.[1];
      // The owner is named in the file's comments as the one who asked for the section. He is not an example's source.
      if (name && name !== "Peter") names.add(name);
    }
    expect(names.size).toBeGreaterThan(3);
    for (const name of names) expect(file, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    expect(file).not.toMatch(/https?:\/\/|@[a-z0-9_]{3,}/i);
  });

  it("are word for word the playbooks of their Zack runs, except the one written by us: every line of each is a line of its source, less the layout", () => {
    const sources: Record<string, string> = { video: "2026-11-15", prospects: "2026-11-12" };
    const runs = path.join(process.cwd(), "artifacts/Zack Runs");
    // "paper" has no source playbook: its run names it in one line, and the rest was written on November 27, 2026.
    expect(examples.map((e) => e.id).filter((id) => !(id in sources))).toEqual(["paper"]);
    for (const { id, play } of examples.filter((e) => e.id in sources)) {
      // The source is found by its date and the play's title, so no file name with a person's name is typed here.
      const source = readdirNames(runs)
        .filter((name) => name.includes(sources[id]))
        .map((name) => readFileSync(path.join(runs, name), "utf8"))
        .find((text) => text.includes(play.title));
      expect(source, id).toBeDefined();
      const flat = (text: string) => text.replace(/\*\*/g, "").replace(/\s+/g, " ");
      const sourceText = flat(source!);
      for (const line of play.playbookMd.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("## "))) {
        expect(sourceText, `${id}: ${line.slice(0, 60)}`).toContain(flat(line).trim());
      }
      expect(sourceText, id).toContain(flat(play.description).trim());
    }
  });
});

describe("what a public card is given", () => {
  it("drops a play's figures whatever it carries, so no time figure reaches a page", () => {
    const view = publicIdeaView({ ...firstExample.play, figures: { current_hours_week: 9, minutes_saved_each: 40, math: "40 × 13" } }, "Preface.");
    expect(view.timeLine).toBeNull();
    expect(view.howWorkedOut).toBeNull();
    expect(view.tiles.hours.headline).toBeNull();
    expect(view.tiles.eachTime.headline).toBeNull();
  });

  it("builds one view for each example, in order, with the preface at the top of what the button copies", () => {
    const views = exampleViews(examples, "The preface line.");
    expect(views.map((v) => [v.id, v.label, v.idea.title])).toEqual(examples.map((e) => [e.id, e.label, e.play.title]));
    for (const view of views) {
      expect(view.idea.copyText.startsWith("The preface line.")).toBe(true);
      expect(view.idea.copyText).toContain(view.idea.pasteToInstall);
      expect(view.idea.copyText).toContain(view.idea.playbookMd);
    }
  });
});
