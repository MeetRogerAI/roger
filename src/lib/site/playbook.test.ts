/**
 * The example card's steps (src/lib/site/playbook.ts), against the bundled
 * examples and against playbooks of other shapes: a play is written by
 * someone's AI agent and need not look like the bundled ones.
 */
import { describe, expect, it } from "vitest";
import { examples } from "@/data/site/examples";
import { playbookSteps } from "./playbook";

describe("playbookSteps", () => {
  it("takes each bundled example apart into its eight parts, with every line of the playbook in a heading or a body", () => {
    expect(examples.length).toBeGreaterThanOrEqual(2);
    for (const { id, play } of examples) {
      const steps = playbookSteps(play.playbookMd)!;
      const headings = steps.map((s) => s.heading);
      // The play written by us heads its seventh part "Pitfalls to watch for": nobody has seen them yet.
      // "3. Setup first" carries the source's own "(answer once)" in one of the plays.
      expect(headings.map((h) => h.replace(" (answer once)", "").replace("Pitfalls to watch for", "Pitfalls seen")), id).toEqual(["1. Play", "2. Trigger", "3. Setup first", "4. Steps", "5. Guardrails", "6. Output", "7. Pitfalls seen", "8. Done when"]);
      expect(steps.map((s) => `## ${s.heading}\n${s.body}`).join("\n\n"), id).toBe(play.playbookMd);
      // The eight numbered lines of "4. Steps" stay inside that one step.
      expect(steps[3].body.split("\n"), id).toHaveLength(8);
    }
  });

  it("reads Windows line ends the same way", () => {
    const md = examples[0].play.playbookMd;
    expect(playbookSteps(md.replace(/\n/g, "\r\n"))).toEqual(playbookSteps(md));
  });

  it("takes parts with no numbers, and any heading level, as long as the parts share it", () => {
    expect(playbookSteps("# What it does\nDrafts a reply.\n\n# How\nRead the note.")).toEqual([
      { heading: "What it does", body: "Drafts a reply." },
      { heading: "How", body: "Read the note." },
    ]);
  });

  it("keeps a smaller heading inside its step, so the count is the count of the playbook's own parts", () => {
    const steps = playbookSteps("## Setup\nAsk first.\n\n### If there is no file\nSay so.\n\n## Steps\n1. Read.")!;
    expect(steps.map((s) => s.heading)).toEqual(["Setup", "Steps"]);
    expect(steps[0].body).toBe("Ask first.\n\n### If there is no file\nSay so.");
  });

  it("does not take a # line inside a fenced code block for a heading", () => {
    const steps = playbookSteps("## Setup\n```\n# install it\nnpm i\n```\n\n## Steps\n~~~\n## not a heading\n~~~\nDone.")!;
    expect(steps.map((s) => s.heading)).toEqual(["Setup", "Steps"]);
    expect(steps[0].body).toContain("# install it");
  });

  it("is null, so the card shows the text whole, for any playbook that would give a wrong count or an empty row", () => {
    for (const [why, md] of [
      ["empty", ""],
      ["blank", " \n\n "],
      ["no heading", "Read the message.\n\nWrite two replies."],
      ["one heading only", "## Steps\n1. Read.\n2. Write."],
      ["words before the first heading", "Before any heading.\n\n## One\ntext\n\n## Two\ntext"],
      ["a heading with nothing under it", "## One\ntext\n\n## Two"],
      ["a title over the parts", "# Client email\n\n## One\ntext\n\n## Two\ntext"],
      ["only headings", "## One\n## Two"],
    ] as const) {
      expect(playbookSteps(md), why).toBeNull();
    }
  });
});
