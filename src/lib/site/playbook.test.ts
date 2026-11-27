/**
 * The sample card's steps (src/lib/site/playbook.ts), against the bundled
 * play and against playbooks of other shapes: a play chosen in the admin is
 * written by someone else's AI agent and need not look like the bundled one.
 */
import { describe, expect, it } from "vitest";
import { samplePlay } from "@/data/site/sample-play";
import { playbookSteps } from "./playbook";

describe("playbookSteps", () => {
  it("takes the bundled play apart into its eight parts, with every line of the playbook in a heading or a body", () => {
    const steps = playbookSteps(samplePlay.playbookMd)!;
    expect(steps.map((s) => s.heading)).toEqual(["1. Play", "2. Trigger", "3. Setup first", "4. Steps", "5. Guardrails", "6. Output", "7. Pitfalls seen", "8. Done when"]);
    expect(steps.map((s) => `## ${s.heading}\n${s.body}`).join("\n\n")).toBe(samplePlay.playbookMd);
    // The nine numbered lines of "4. Steps" stay inside that one step.
    expect(steps[3].body.split("\n")).toHaveLength(9);
  });

  it("reads Windows line ends the same way", () => {
    expect(playbookSteps(samplePlay.playbookMd.replace(/\n/g, "\r\n"))).toEqual(playbookSteps(samplePlay.playbookMd));
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
