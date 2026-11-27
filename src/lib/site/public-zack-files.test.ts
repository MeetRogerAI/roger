import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunBlock } from "@/lib/intake/parse-block";
import { playTitles } from "./report-plays";
import { fileVersion } from "./zack-files";

/**
 * The four public Zack files (public/zack), which /zack, /how-it-works and
 * /hampton serve and link to. Peter's decision of November 26, 2026: they
 * match Zack 2.0. They are the 2.0 instructions (content/zack) with the
 * Circles-era lines replaced by what is true of the free run, and with no
 * "Send to" section, so a run from one of them is a hand-run that sends
 * nothing. The visitor pastes the report at /zack themselves.
 */
const AGENTS = [
  { slug: "claude", name: "Claude" },
  { slug: "duet", name: "Duet" },
  { slug: "grok-bot", name: "Grok Bot" },
  { slug: "hark", name: "Hark" },
] as const;

const read = (dir: string, file: string) => readFileSync(path.join(process.cwd(), dir, file), "utf8").replace(/\r\n/g, "\n");
const publicFile = (slug: string) => read("public/zack", `zack-the-collector-${slug}.md`);

/** Statements that were true of Circles and are not true of the free run. */
const CIRCLES_ERA = [
  /\bcircle/i,
  /\bcollector \(Peter\)/i,
  /named collector/i,
  /for the collector/i,
  /shared collection/i,
  /receives the files by email/i,
  /confidentiality agreement/i,
  /12 months/i,
  /8[- ]person/i,
  /\bapplications?\b/i,
  /\bapply (to|for)\b/i,
  /45[- ]day/i,
  /guarantee/i,
  /Draft for Peter/i,
];

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

  it("keeps no Circles-era statement", () => {
    for (const phrase of CIRCLES_ERA) expect(text, String(phrase)).not.toMatch(phrase);
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
    // The version line (no draft note), the public-copy line, the sensitive-use test, the hand-run delivery line and the seven lines of the free-run section with its heading.
    expect(added).toHaveLength(12);
    expect(removed).toHaveLength(11);
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
