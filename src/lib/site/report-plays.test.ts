import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_PLAY_TITLES, playTitles } from "./report-plays";

/** A number followed by a unit of time, which the site never shows from a report. */
const TIME = /\d[\d.,]*\s*-?\s*(hour|minute|hr\b|min\b)/i;

describe("playTitles", () => {
  it("reads three numbered play headings as three titles, without their time figures", () => {
    const report = [
      "# Zack Run - 2026-11-12",
      "## Summary",
      "| Play | Minutes saved each time |",
      "## 1. Twice-daily store performance report: about 25.3 hours a week saved (2.5 to 32.9)",
      "### This week",
      "### Playbook",
      "**1. Play**",
      "## 2. Meeting prep from notes, chat and email: about 3.1 hours a week saved (2.2 to 4.1)",
      "## 3. Find a past file, draft the reply: about 1.6 hours a week saved (1.1 to 2.1)",
      "## Runners-up",
    ].join("\n");
    expect(playTitles(report)).toEqual(["Twice-daily store performance report", "Meeting prep from notes, chat and email", "Find a past file, draft the reply"]);
  });

  it("reads 'Play 1:' headings, with the set named before or after the title", () => {
    expect(playTitles("## Play 1: Client email in two tones (Set A)\n### Playbook\n## Play 2: Zoning lookup in plain words (Set A)\n## Play 3: Sales tracker workbook (Set B, my garbage, your treasure)")).toEqual([
      "Client email in two tones",
      "Zoning lookup in plain words",
      "Sales tracker workbook",
    ]);
    // A numbered section holding the plays is not itself a play.
    expect(playTitles("## 1. Summary\n## 2. The plays\n### Play 1 (Set A): Inbox-to-draft emails\n#### Playbook\n### Play 2 (Set A): Copied-thread digest")).toEqual(["Inbox-to-draft emails", "Copied-thread digest"]);
  });

  it("reads headings that open with the set, and ones that carry set and confidence after a dot", () => {
    expect(playTitles("## Set A · Daily prospect outreach drafts — about 37.4 hours a week saved (5.2 to 48.7)\n## Set B · Meeting prep brief before outside calls — about 1.0 hours a week saved (0.7 to 1.3)")).toEqual([
      "Daily prospect outreach drafts",
      "Meeting prep brief before outside calls",
    ]);
    expect(playTitles("## 1. Appointment and event prep · Set A: top for you · about 0.5 hours a week saved (0.3 to 0.6) · Medium confidence")).toEqual(["Appointment and event prep"]);
  });

  /** One heading in, its one title out. */
  const titleOf = (heading: string) => playTitles(`## ${heading}`)[0] ?? "";

  it("reads real headings, word for word from the reports in artifacts/Zack Runs, into clean titles", () => {
    const real: [string, string][] = [
      ["1. Turn long talks into ready draft reels: about 8.0 hours a week saved (5.5 to 10.5)", "Turn long talks into ready draft reels"],
      ["2. Morning brief and 3-hourly check-ins: about 8.1 hours a week saved (0.26 to 10.7)", "Morning brief and check-ins"],
      ["3. Hourly read-only client chat watch: about 6.7 hours a week saved (0.66 to 8.8)", "Hourly read-only client chat watch"],
      ["1. Twice-daily Slack issue and wins digest: about 16.2 hours a week saved (0.8 to 21.2)", "Twice-daily Slack issue and wins digest"],
      ["2. Daily top-5 X digest on one topic: about 6.6 hours a week saved (0.6 to 8.6)", "Daily top-5 X digest on one topic"],
      ["2. Draft an agreement from a form — about 0.8 hours a week saved (0.6 to 1.1)", "Draft an agreement from a form"],
      ["4. Rebuild a pitch deck from a teaser — about 0.3 hours a week saved (0.2 to 0.4)", "Rebuild a pitch deck from a teaser"],
      ["1. Daily AI use-case scan + draft post · Set A: top for you · about 7.8 hours a week saved (0.8 to 10.2) · Medium confidence", "Daily AI use-case scan + draft post"],
      ["4. Finding old emails on request · Set B: my garbage, your treasure · about 0.2 hours a week saved (0.1 to 0.2) · Low confidence", "Finding old emails on request"],
      ['Set B · Daily "waiting on you" tracker digest — about 4.5 hours a week saved (0.6 to 5.9)', 'Daily "waiting on you" tracker digest'],
      ["Set A · Twice-daily inbox triage sweep — about 8.0 hours a week saved (0.6 to 10.4)", "Twice-daily inbox triage sweep"],
    ];
    for (const [heading, title] of real) expect(titleOf(heading), heading).toBe(title);
  });

  it("takes a figure of time out of a title with the phrase it belongs to, and leaves a title that reads cleanly", () => {
    const cases: [string, string][] = [
      // Describing the next word: the figure goes alone.
      ["1. A 2 hour job done in 10 min", "A job done"],
      ["1. Prep for a 30-minute client call", "Prep for a client call"],
      // Counting what follows: it goes with its "of".
      ["1. Listing sheet from 10 minutes of notes", "Listing sheet from notes"],
      ["1. Recap from about 90 minutes of call recordings", "Recap from call recordings"],
      // At the end: it goes with its preposition and anything said of it.
      ["1. Reply to new leads within 5 minutes", "Reply to new leads"],
      ["1. Check the inbox every 3 hours", "Check the inbox"],
      ["1. Inbox sweep in under 5-10 minutes a day", "Inbox sweep"],
      ["1. Weekly numbers: 8 hours a week saved", "Weekly numbers"],
      // In brackets: the brackets go with it.
      ["1. Inbox sweep (saves about 2 hours a week)", "Inbox sweep"],
      ["1. Offer letters [15 min each] from a template", "Offer letters from a template"],
      // A phrase of its own that the title reads on from.
      ["1. Draft the listing in 10 minutes from rough notes", "Draft the listing from rough notes"],
      ["1. Inbox check every 2 hours for new leads", "Inbox check for new leads"],
    ];
    for (const [heading, title] of cases) {
      expect(titleOf(heading), heading).toBe(title);
      expect(titleOf(heading), heading).not.toMatch(TIME);
    }
  });

  it("stops a title before a figure it cannot take out cleanly, and adds no word of its own", () => {
    // Taking the figure alone would leave "Save on every listing" and "Draft replies instead of by hand".
    expect(titleOf("1. Save 45 minutes on every listing")).toBe("Save");
    expect(titleOf("1. Draft replies in 5 minutes instead of by hand")).toBe("Draft replies");
    // Nothing is left of a heading that opens with the figure, so it gives no title.
    expect(playTitles("## 1. 45 minutes back on every listing\n## 2. Sort the inbox")).toEqual(["Sort the inbox"]);
    // Every word of a title is a word of its heading, in the same order.
    for (const heading of ["1. A 2 hour job done in 10 min", "1. Listing sheet from 10 minutes of notes", "1. Draft the listing in 10 minutes from rough notes", "1. Save 45 minutes on every listing"]) {
      const words = heading.split(/\s+/);
      let at = 0;
      for (const word of titleOf(heading).split(/\s+/)) {
        at = words.indexOf(word, at) + 1;
        expect(at, `${heading}: ${word}`).toBeGreaterThan(0);
      }
    }
  });

  it("ignores headings inside a code block, and a playbook's own numbered parts", () => {
    const report = "## 1. Draft replies\n```\n## 2. Not a heading\n```\n### 1. Play\n### 2. Trigger\n### 4. Steps\n## 2. Sort the inbox";
    expect(playTitles(report)).toEqual(["Draft replies", "Sort the inbox"]);
  });

  it("falls back to the titles in the report's own structured block", () => {
    const report = 'Some prose with no headings.\n\n```roger-run\n{ "zack_version": "2.0", "plays": [{ "title": "Draft replies" }, { "title": "Sort the inbox: about 2 hours a week saved" }] }\n```';
    expect(playTitles(report)).toEqual(["Draft replies", "Sort the inbox"]);
    expect(playTitles("```roger-run\nnot json\n```")).toEqual([]);
  });

  it("gives nothing for a report with no play headings", () => {
    expect(playTitles("")).toEqual([]);
    expect(playTitles("Here is what I did this week.\n\n## Summary\n\nNothing much.\n\n## Review list")).toEqual([]);
  });

  it("gives each title once, and no more than the most it shows", () => {
    const many = Array.from({ length: 12 }, (_, i) => `## ${i + 1}. Play number ${"abcdefghijkl"[i]}`).join("\n");
    expect(playTitles(many)).toHaveLength(MAX_PLAY_TITLES);
    expect(playTitles("## 1. Same\n## 2. Same")).toEqual(["Same"]);
  });

  it("is the same every time", () => {
    const report = "## Play 1: A\n## Play 2: B";
    expect(playTitles(report)).toEqual(playTitles(report));
  });

  // The real reports in the repo: every one gives titles, and none carries a time figure.
  const dir = path.join(process.cwd(), "artifacts", "Zack Runs");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    it(`reads the plays of "${file}" and shows no time figure from it`, () => {
      const titles = playTitles(readFileSync(path.join(dir, file), "utf8"));
      expect(titles.length).toBeGreaterThanOrEqual(2);
      for (const t of titles) {
        expect(t, t).not.toMatch(TIME);
        expect(t, t).not.toMatch(/saved|confidence|\bset [ab]\b/i);
      }
    });
  }
});
