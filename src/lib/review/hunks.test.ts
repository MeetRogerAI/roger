import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyHunks,
  brokenHeading,
  changeSize,
  findOnce,
  linesOf,
  numberLines,
  resolveHunks,
  sectionsTouched,
  spliceHunks,
  stripLineNumbers,
  toLf,
  unifiedDiff,
} from "./hunks";

const RSQ = String.fromCharCode(0x2019);
const LDQ = String.fromCharCode(0x201c);
const RDQ = String.fromCharCode(0x201d);
const EM = String.fromCharCode(0x2014);

const claude = toLf(readFileSync(path.join(process.cwd(), "content/zack/claude.md"), "utf8"));
const lines = claude.split("\n");

const file = ["# Title", "", "## One", "alpha line", "beta line", "same", "gamma line", "same", "", "## Setting it up", "setup text"].join("\n");

describe("numberLines and stripLineNumbers", () => {
  it("numbers each LF line from 1, and strips copied prefixes from new_text", () => {
    const n = numberLines("a\r\nb");
    expect(n).toBe("   1| a\n   2| b");
    expect(stripLineNumbers("  14| Keep this.\n  15| And this.")).toBe("Keep this.\nAnd this.");
    expect(stripLineNumbers("  14| Keep this.\n\n  16| And this.")).toBe("Keep this.\n\nAnd this.");
  });

  it("leaves text alone unless every line carries a prefix", () => {
    expect(stripLineNumbers("Step 1| a\nplain")).toBe("Step 1| a\nplain");
  });
});

describe("resolveHunks", () => {
  it("fills old_text from the file's lines 12 to 13 and the diff shows exactly that change", () => {
    const r = resolveHunks(claude, [{ path: "content/zack/claude.md", start_line: 12, end_line: 13, new_text: `${lines[11]}\nA clearer second line.` }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hunks[0].old_text).toBe(`${lines[11]}\n${lines[12]}`);
    const after = spliceHunks(claude, r.hunks);
    const diff = unifiedDiff("content/zack/claude.md", claude, after);
    expect(diff.split("\n").filter((l) => /^[-+][^-+]/.test(l) || l === "+" || l === "-")).toEqual([`-${lines[12]}`, "+A clearer second line."]);
    expect(diff).toMatch(/^--- a\/content\/zack\/claude\.md\n\+\+\+ b\/content\/zack\/claude\.md\n@@ -10,7 \+10,7 @@/);
  });

  it("strips copied line-number prefixes from new_text", () => {
    const r = resolveHunks(file, [{ path: "p", start_line: 4, end_line: 4, new_text: "   4| alpha line, reworded" }]);
    expect(r.ok && r.hunks[0].new_text).toBe("alpha line, reworded");
  });

  it("refuses a range past the end of the file, an inverted range and overlapping ranges", () => {
    expect(resolveHunks(file, [{ path: "p", start_line: 11, end_line: 12, new_text: "x" }])).toEqual({ ok: false, reason: "range" });
    expect(resolveHunks(file, [{ path: "p", start_line: 0, end_line: 1, new_text: "x" }])).toEqual({ ok: false, reason: "range" });
    expect(resolveHunks(file, [{ path: "p", start_line: 5, end_line: 4, new_text: "x" }])).toEqual({ ok: false, reason: "range" });
    expect(
      resolveHunks(file, [
        { path: "p", start_line: 4, end_line: 5, new_text: "x" },
        { path: "p", start_line: 5, end_line: 5, new_text: "y" },
      ]),
    ).toEqual({ ok: false, reason: "range" });
  });

  it("refuses lines whose text also occurs elsewhere in the file", () => {
    expect(resolveHunks(file, [{ path: "p", start_line: 6, end_line: 6, new_text: "x" }])).toEqual({ ok: false, reason: "not_unique" });
    // Widened to a unique span, it resolves.
    expect(resolveHunks(file, [{ path: "p", start_line: 5, end_line: 6, new_text: "x" }]).ok).toBe(true);
  });

  it("anchors a range of blank lines to the nearest non-blank line, repeated unchanged, instead of refusing it", () => {
    // Line 9 is blank, between the second "same" and "## Setting it up": anchored to line 8 ("same" + the blank is unique).
    const r = resolveHunks(file, [{ path: "p", start_line: 9, end_line: 9, new_text: "A new line." }]);
    expect(r).toEqual({ ok: true, hunks: [{ path: "p", start_line: 8, end_line: 9, old_text: "same\n", new_text: "same\nA new line." }] });
    if (!r.ok) return;
    expect(spliceHunks(file, r.hunks).split("\n").slice(6, 10)).toEqual(["gamma line", "same", "A new line.", "## Setting it up"]);
    expect(applyHunks(file, r.hunks).ok).toBe(true);
    // Line 2, under the title.
    expect(resolveHunks(file, [{ path: "p", start_line: 2, end_line: 2, new_text: "Intro." }])).toEqual({ ok: true, hunks: [{ path: "p", start_line: 1, end_line: 2, old_text: "# Title\n", new_text: "# Title\nIntro." }] });
    // A file of blank lines has nothing to anchor to.
    expect(resolveHunks("\n\n", [{ path: "p", start_line: 2, end_line: 2, new_text: "x" }])).toEqual({ ok: false, reason: "range" });
    // Anchoring that would overlap the previous hunk is a range error.
    expect(resolveHunks(file, [{ path: "p", start_line: 7, end_line: 8, new_text: "gamma\nsame" }, { path: "p", start_line: 9, end_line: 9, new_text: "x" }])).toEqual({ ok: false, reason: "range" });
  });

  it("accepts hunks in any order and stores them in line order", () => {
    const r = resolveHunks(file, [
      { path: "p", start_line: 7, end_line: 7, new_text: "G" },
      { path: "p", start_line: 4, end_line: 4, new_text: "A" },
    ]);
    expect(r.ok && r.hunks.map((h) => h.start_line)).toEqual([4, 7]);
  });
});

describe("findOnce and applyHunks", () => {
  const main = `Say it plainly${EM}don${RSQ}t ${LDQ}guess${RDQ}.   \nNext line.`;

  it("finds an exact match once", () => {
    expect(findOnce(main, "Next line.")).toEqual({ kind: "found", start: main.indexOf("Next"), end: main.length, how: "exact" });
  });

  it("falls back to the quote- and dash-normalised match and replaces the original span", () => {
    const old = `Say it plainly-don't "guess".`;
    const f = findOnce(main, old);
    expect(f).toMatchObject({ kind: "found", how: "normalised", start: 0 });
    const r = applyHunks(main, [{ path: "p", start_line: 1, end_line: 1, old_text: old, new_text: "Say it plainly." }]);
    expect(r).toEqual({ ok: true, text: "Say it plainly.   \nNext line.", how: ["normalised"] });
  });

  it("is stale when the text is missing, or found more than once either way", () => {
    expect(applyHunks(main, [{ path: "p", start_line: 1, end_line: 1, old_text: "Not there", new_text: "x" }])).toEqual({ ok: false, reason: "missing" });
    const twice = `a${EM}b\na-b`;
    expect(findOnce(twice, "a-b")).toEqual({ kind: "found", start: 4, end: 7, how: "exact" });
    expect(findOnce(`a${EM}b\na${EM}b`, "a-b")).toEqual({ kind: "not_unique" });
    expect(applyHunks("x\nx", [{ path: "p", start_line: 1, end_line: 1, old_text: "x", new_text: "y" }])).toEqual({ ok: false, reason: "not_unique" });
  });

  it("refuses overlapping spans", () => {
    expect(
      applyHunks("one\ntwo\nthree", [
        { path: "p", start_line: 1, end_line: 2, old_text: "one\ntwo", new_text: "x" },
        { path: "p", start_line: 2, end_line: 3, old_text: "two\nthree", new_text: "y" },
      ]),
    ).toEqual({ ok: false, reason: "overlap" });
  });

  it("matches whole lines only: a line that became longer on main is stale, not patched mid-line", () => {
    const h = { path: "p", start_line: 1, end_line: 1, old_text: "Plain text.", new_text: "Plain words." };
    expect(findOnce("Plain text. No tables.\nNext.", "Plain text.")).toEqual({ kind: "missing" });
    expect(applyHunks("Plain text. No tables.\nNext.", [h])).toEqual({ ok: false, reason: "missing" });
    expect(applyHunks(`Plain text${EM}no tables.`, [{ ...h, old_text: "Plain text-" }])).toEqual({ ok: false, reason: "missing" });
    // Uniqueness counts aligned matches only: "Plain text." inside a longer line is not a second copy.
    expect(applyHunks("Plain text. No tables.\nPlain text.", [h])).toEqual({ ok: true, text: "Plain text. No tables.\nPlain words.", how: ["exact"] });
  });

  it("applies several hunks, reading CRLF text as LF", () => {
    const r = applyHunks("a\r\nb\r\nc", [
      { path: "p", start_line: 1, end_line: 1, old_text: "a", new_text: "A" },
      { path: "p", start_line: 3, end_line: 3, old_text: "c", new_text: "C" },
    ]);
    expect(r.ok && r.text).toBe("A\nb\nC");
  });

  it("resolves a CRLF working copy and applies its hunks to LF main; a lone CR stays inside its line", () => {
    const crlf = "# T\r\n\r\nalpha\r\nbeta\r\n";
    const r = resolveHunks(crlf, [{ path: "p", start_line: 3, end_line: 3, new_text: "ALPHA\r\nmore" }]);
    expect(r).toEqual({ ok: true, hunks: [{ path: "p", start_line: 3, end_line: 3, old_text: "alpha", new_text: "ALPHA\nmore" }] });
    if (!r.ok) return;
    expect(spliceHunks(crlf, r.hunks)).toBe("# T\n\nALPHA\nmore\nbeta\n");
    expect(applyHunks("# T\n\nalpha\nbeta\n", r.hunks)).toEqual({ ok: true, text: "# T\n\nALPHA\nmore\nbeta\n", how: ["exact"] });
    const cr = "a\rb\nc";
    expect(toLf(cr)).toBe(cr);
    expect(linesOf(cr, 1, 1)).toBe("a\rb");
    expect(applyHunks(cr, [{ path: "p", start_line: 2, end_line: 2, old_text: "c", new_text: "C" }])).toEqual({ ok: true, text: "a\rb\nC", how: ["exact"] });
  });
});

describe("changeSize and unifiedDiff", () => {
  it("counts added and removed lines like git, and the characters added", () => {
    expect(changeSize("a\nb\nc", "a\nB\nc\nd")).toEqual({ added: 2, removed: 1, addedChars: 3, addedText: "B\nd" });
  });

  it("is empty when nothing changed, and groups nearby changes into one hunk", () => {
    expect(unifiedDiff("p", "a\nb", "a\nb")).toBe("");
    const before = Array.from({ length: 30 }, (_, i) => `l${i + 1}`).join("\n");
    const after = before.replace("l5", "L5").replace("l8", "L8").replace("l25", "L25");
    const d = unifiedDiff("p", before, after);
    expect(d.match(/^@@/gm)).toHaveLength(2);
    expect(d).toContain("@@ -2,10 +2,10 @@");
    expect(d).toContain("@@ -22,7 +22,7 @@");
  });
});

describe("sections and load-bearing headings", () => {
  it("names the sections a range touches, skipping headings inside code fences", () => {
    const security = lines.findIndex((l) => l.startsWith("## Security rules")) + 1;
    expect(sectionsTouched(claude, security + 2, security + 3)).toEqual([lines[security - 1]]);
    expect(sectionsTouched(claude, security - 1, security)).toEqual(["## The two ways Zack runs", lines[security - 1]]);
    const fenced = "## A\n```\n## not a heading\n```\ntext";
    expect(sectionsTouched(fenced, 5, 5)).toEqual(["## A"]);
  });

  it("finds a removed or renamed ## Setting it up, and allows edits around it", () => {
    expect(brokenHeading(file, file.replace("## Setting it up", "## Setting up"))).toBe("## Setting it up");
    expect(brokenHeading(file, file.replace("## Setting it up\n", ""))).toBe("## Setting it up");
    expect(brokenHeading(file, file.replace("setup text", "better setup text"))).toBeNull();
    expect(brokenHeading(claude, claude.replace("```roger-run", "```run"))).toBe("```roger-run");
  });

  it("linesOf returns null outside the file", () => {
    expect(linesOf("a\nb", 2, 3)).toBeNull();
    expect(linesOf("a\nb", 1, 2)).toBe("a\nb");
  });
});
