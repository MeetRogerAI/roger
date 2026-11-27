import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sitePrivacy } from "@/data/site/legal";
import { parseRunBlock } from "@/lib/intake/parse-block";
import { playTitles } from "./report-plays";
import { fileVersion } from "./zack-files";

/**
 * The twelve copies of Zack 2.0: the four public files (public/zack), which
 * /zack and /how-it-works serve and link to; the four connected instructions
 * (content/zack), which a signed-up user's AI agent fetches; and the four 2.0
 * source documents (artifacts/Zack).
 *
 * Peter's decisions of November 26, 2026: the public files match Zack 2.0;
 * no copy keeps a Circles-era statement; and no copy says version 2.0 has not
 * been run on an account, because 2.0 runs on every account of every AI agent.
 *
 * A public file is the 2.0 instructions with the lines about where a report
 * goes written for the free run, and with no "Send to" section, so a run from
 * one of them is a hand-run that sends nothing. The visitor pastes the report
 * at /zack themselves. The connected instructions say what happens to a run
 * sent to Roger, from the privacy text in src/data/site/legal.ts.
 */
const AGENTS = [
  { slug: "claude", name: "Claude" },
  { slug: "duet", name: "Duet" },
  { slug: "grok-bot", name: "Grok Bot" },
  { slug: "hark", name: "Hark" },
] as const;

const read = (dir: string, file: string) => readFileSync(path.join(process.cwd(), dir, file), "utf8").replace(/\r\n/g, "\n");
const publicFile = (slug: string) => read("public/zack", `zack-the-collector-${slug}.md`);
const connectedFile = (slug: string) => read("content/zack", `${slug}.md`);
const sourceFile = (name: string) => read("artifacts/Zack", `Zack The Collector (for ${name}) v2.0.md`);

/** Statements that were true of Circles and are true of no run now. */
const CIRCLES_ERA = [
  /\bcircle/i,
  /\bcollector \(Peter\)/i,
  /named collector/i,
  /for the collector/i,
  /asking the collector/i,
  /shared collection/i,
  /in the collection/i,
  /receives the files by email/i,
  /the member emails/i,
  /confidentiality agreement/i,
  /12 months/i,
  /within 7 days/i,
  /8[- ]person/i,
  /\bapplications?\b/i,
  /\bapply (to|for)\b/i,
  /45[- ]day/i,
  /guarantee/i,
];

/** The notice that version 2.0 had not been run on the AI agent's account, and the section it opened. */
const NOT_RUN = [/has not been run/i, /not been (run|tested)/i, /Not confirmed about/i, /first test run/i, /untested/i, /not yet (run|tested|verified)/i];

/** The section of the connected instructions that stands where the Circles-era collector section stood. */
const SENT_HEADING = "## What happens to a run sent to Roger";

/** One "## " section of a file, from its heading to the blank line before the next heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  expect(start, heading).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf("\n## ", start + 1)).trimEnd();
}

/** One section of the privacy text, as one string. */
const privacyBody = (id: string) => sitePrivacy.sections.find((s) => s.id === id)!.body.join(" ");

/** Anything that would have the visitor's AI agent send the report itself, or need a Zack key to run. */
const SENDS = [
  /^## Send to/m,
  /https?:\/\//i,
  /\/api\//,
  /\bmailto:/i,
  /@meetroger\.ai/i,
  /the member emails/i,
  /email (it|the (run file|report|output file)) to/i,
  /\bzk_[a-z0-9]/i,
];

describe.each(AGENTS)("public/zack/zack-the-collector-$slug.md", ({ slug, name }) => {
  const text = publicFile(slug);

  it("states version 2.0, as the 2.0 instructions do", () => {
    expect(text.split("\n")[0]).toBe(`# Zack The Collector (for ${name})`);
    expect(text).toMatch(/^Version 2\.0 · /m);
    expect(fileVersion(text)).toBe("2.0");
    expect(fileVersion(read("content/zack", `${slug}.md`))).toBe("2.0");
    expect(text).toContain(`"Zack The Collector (for ${name}) v2.0"`);
    expect(text).toContain('"zack_version": "2.0"');
  });

  it("keeps no Circles-era statement, and no draft note in its version line", () => {
    for (const phrase of CIRCLES_ERA) expect(text, String(phrase)).not.toMatch(phrase);
    expect(text).not.toMatch(/Draft for Peter/i);
  });

  it("does not say version 2.0 has not been run on an account", () => {
    for (const phrase of NOT_RUN) expect(text, String(phrase)).not.toMatch(phrase);
    // The section went whole: the file ends with its setup instructions.
    expect(text.slice(text.lastIndexOf("\n## "))).toMatch(/^\n## Setting it up\n/);
  });

  it("never tells the AI agent to send or email the report, and needs no Zack key", () => {
    for (const phrase of SENDS) expect(text, String(phrase)).not.toMatch(phrase);
    expect(text).toContain('It has no "Send to" section, so every run from it is a hand-run: Zack sends nothing to Roger or to anyone else.');
    expect(text).toContain("If Zack cannot tell which applies, it is a hand-run.");
    expect(text).toContain("Hand-run: he delivers them to the member and sends nothing.");
    expect(text).toContain("Zack never sends it anywhere; the member shares the run file themselves, for example by pasting it at meetroger.ai/zack.");
  });

  it("says what is true of a report pasted at /zack, with no typed number of days", () => {
    const start = text.indexOf("## What happens to a hand-run report pasted at meetroger.ai/zack");
    const section = text.slice(start, text.indexOf("\n## ", start + 1));
    expect(start).toBeGreaterThan(-1);
    expect(section).toContain("Zack and the member's agent never send it.");
    expect(section).toContain("Roger's team and Cora");
    expect(section).toContain("only if the member goes on to sign up from that run with the same email");
    expect(section).toContain("deleted after the retention period stated at meetroger.ai/privacy");
    expect(section).not.toMatch(/\d/);
  });

  it("reads and skips exactly what the 2.0 instructions do", () => {
    const connected = read("content/zack", `${slug}.md`);
    const part = (source: string, from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to));
    // Security rule 3 and "What Zack reads", "What Zack writes", the picking rules, the ban list and the method: word for word.
    expect(part(text, "3. **Zack reads across", "4. **Outside content")).toBe(part(connected, "3. **Zack reads across", "4. **Outside content"));
    expect(part(text, "## What Zack reads", "## Sensitive uses")).toBe(part(connected, "## What Zack reads", "## Sensitive uses"));
    expect(part(text, "## Time-saved method", "## How the run is delivered")).toBe(part(connected, "## Time-saved method", "## How the run is delivered"));
    expect(text).toContain("email, calendar and Drive are skipped");
  });

  it("differs from the 2.0 instructions only in the lines about where a report goes", () => {
    const connected = read("content/zack", `${slug}.md`).split("\n");
    const own = text.split("\n");
    const added = own.filter((line) => !connected.includes(line));
    const removed = connected.filter((line) => !own.includes(line));
    // The public-copy line, and the free-run section's heading and seven lines, which stand where the
    // connected instructions have the heading and seven lines on a run sent to Roger. The version lines match.
    expect(added).toHaveLength(9);
    expect(removed).toHaveLength(8);
    expect(removed).toEqual(section(connected.join("\n"), SENT_HEADING).split("\n"));
    expect(connected.join("\n")).not.toMatch(/Draft for Peter/i);
  });

  it("still asks for the report shape the title reader and the sign-up claim read", () => {
    expect(text).toContain('"Zack Run - YYYY-MM-DD.md"');
    expect(text).toContain("## How the run file reads");
    expect(text).toContain("3. **Each play:** heading,");
    expect(text).toContain("6. **The `roger-run` block,** last.");
    // The example block is the one the reader falls back on and intake parses: its keys must stay.
    const block = text.match(/```roger-run\n([\s\S]*?)\n```/);
    expect(block).not.toBeNull();
    const example = JSON.parse(block![1]) as { plays: { title: string; set: string; playbook_md: string }[] };
    expect(Object.keys(example.plays[0])).toEqual(expect.arrayContaining(["set", "title", "category", "job", "description", "playbook_md", "install_notes"]));
  });
});

describe.each(AGENTS)("content/zack/$slug.md and its 2.0 source document", ({ slug, name }) => {
  const connected = connectedFile(slug);
  const source = sourceFile(name);

  it("are the same text (src/lib/zack/instructions.test.ts holds this too)", () => {
    expect(source).toBe(connected);
  });

  it("keep no Circles-era statement", () => {
    for (const phrase of CIRCLES_ERA) {
      expect(connected, String(phrase)).not.toMatch(phrase);
      expect(source, String(phrase)).not.toMatch(phrase);
    }
    expect(connected).not.toContain("## How the shared collection is handled");
  });

  it("do not say version 2.0 has not been run on an account", () => {
    for (const phrase of NOT_RUN) {
      expect(connected, String(phrase)).not.toMatch(phrase);
      expect(source, String(phrase)).not.toMatch(phrase);
    }
    // buildInstructions places the member's rules above this heading and "Send to" after the file's last line.
    expect(connected.slice(connected.lastIndexOf("\n## "))).toMatch(/^\n## Setting it up\n/);
  });

  it("say what is true of a run sent to Roger, in the privacy page's words, with no typed number of days", () => {
    const part = section(connected, SENT_HEADING);
    expect(part.split("\n")).toHaveLength(8);
    // Each of these is a sentence of the privacy text (src/data/site/legal.ts), with "you" written as "the member".
    const runs = privacyBody("runs");
    expect(runs).toContain("When a run reaches Roger it is stored as it arrived. It is then checked again for private details before any of its plays are shared.");
    expect(part).toContain("the run is stored as it arrived. It is then checked again for private details before any of its plays are shared.");
    expect(runs).toContain("Roger’s team can read a run, and reviews any play the check flags before it is shared.");
    expect(part).toContain("Roger's team can read a run, and reviews any play the check flags before it is shared.");
    expect(runs).toContain("Cora scores plays and picks the ideas each user receives.");
    expect(part).toContain("Cora scores the plays and picks the ideas each user receives.");
    expect(privacyBody("other-users")).toBe("Other Roger users see anonymous plays only. Roger never shows who a play came from.");
    expect(part).toContain("- **What other users see:** anonymous plays only. Roger never shows who a play came from.");
    const zack = privacyBody("zack");
    expect(zack).toContain("because you agreed to that when you signed up");
    expect(part).toContain("because the member agreed to that at sign-up");
    expect(zack).toContain("Roger uses it to match ideas to you. It is not shared with other users.");
    expect(part).toContain("Roger uses it to match ideas to the member. It is not shared with other users.");
    expect(zack).toContain("change what it collects and turn sharing off, all in your dashboard");
    const retention = privacyBody("retention");
    expect(retention).toContain("We keep your runs while you have access to Roger, and for {retentionDays} days after your access ends.");
    expect(retention).toContain("You can delete any run from your dashboard.");
    expect(part).toContain("in their Roger dashboard the member can delete any run, change what Zack collects and turn sharing off.");
    expect(part).toContain("while the member has access to Roger, and after that access ends for the period stated at meetroger.ai/privacy.");
    // The period is a setting: the instructions point to the page and type no number.
    expect(part).not.toMatch(/\d/);
  });

  it("keep the hand-run path: nothing is sent, and the member shares the run file themselves", () => {
    expect(section(connected, SENT_HEADING)).toContain("A hand-run sends nothing: the member shares the run file themselves, for example by pasting it at meetroger.ai/zack.");
    expect(connected).toContain("Zack never sends it anywhere; the member shares the run file themselves, for example by pasting it at meetroger.ai/zack.");
    expect(connected).toContain("If Zack cannot tell which applies, it is a hand-run.");
    // The file itself carries no "Send to" section and no address: Roger adds them for a signed-up user.
    expect(connected).not.toMatch(/^## Send to/m);
    expect(connected).not.toMatch(/https?:\/\//i);
  });
});

describe("a report written to the public file's format", () => {
  const report = [
    "# Zack The Collector (for Claude) v2.0",
    "Hand-run. Days reviewed: the past 7.",
    "## Summary",
    "| Play | Set | Minutes saved each time |",
    "## Play 1: Client email in two tones (Set A)",
    "The member pastes a rough note and gets two replies.",
    "## Also runs",
    "## Review list",
    "```roger-run",
    JSON.stringify({ zack_version: "2.0", agent: "claude", mode: "hand-run", week_ending: "2026-11-22", plays: [{ set: "A", title: "Client email in two tones" }], also_runs: [], counts: {} }),
    "```",
  ].join("\n");

  it("gives its play titles from the headings, and from the block when the headings give none", () => {
    expect(playTitles(report)).toEqual(["Client email in two tones"]);
    expect(playTitles(report.replace("## Play 1: Client email in two tones (Set A)", "Client email in two tones"))).toEqual(["Client email in two tones"]);
  });

  it("carries a block intake can find", () => {
    expect(parseRunBlock(report)).not.toBeNull();
  });
});
