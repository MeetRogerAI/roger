/**
 * Line-anchored hunks for the review bot (B3 plan Unit 7, feasibility review
 * item 2). The model sees each instruction file with line numbers and answers
 * with `{ path, start_line, end_line, new_text }`; code fills in `old_text`
 * from the file, so a model's unreliable copying never decides what is
 * replaced. A stored hunk is a find-and-replace (`old_text` → `new_text`)
 * that can be applied again later to `main`'s text (Unit 9): exactly once,
 * or, failing that, exactly once on a quote- and dash-normalised form.
 *
 * Everything here works on LF text: git stores these files with LF, and a
 * Windows checkout has CRLF in the working tree. Only CRLF is folded: a lone
 * CR is an ordinary character inside its line, so applying hunks to `main`
 * never rewrites bytes outside them.
 *
 * Every match is line-aligned: it starts at the start of a line and ends at
 * the end of one, so "Plain text." never matches inside "Plain text. No tables.".
 */

export type ModelHunk = { path: string; start_line: number; end_line: number; new_text: string };
export type Hunk = { path: string; start_line: number; end_line: number; old_text: string; new_text: string };

const LF = String.fromCharCode(10);

export const toLf =(s: string): string => s.replace(/\r\n/g, "\n");

/** The file as the model sees it: `  12| text` per line (LF text, numbered from 1). */
export function numberLines(text: string): string {
  const lines = toLf(text).split("\n");
  const width = Math.max(4, String(lines.length).length);
  return lines.map((l, i) => `${String(i + 1).padStart(width)}| ${l}`).join("\n");
}

const NUMBER_PREFIX = /^\s*\d+\| ?/;

/** Removes `  14| ` prefixes the model copied from the numbered file, when every non-empty line carries one. */
export function stripLineNumbers(text: string): string {
  const lines = toLf(text).split("\n");
  const filled = lines.filter((l) => l.trim() !== "");
  if (!filled.length || !filled.every((l) => NUMBER_PREFIX.test(l))) return toLf(text);
  return lines.map((l) => l.replace(NUMBER_PREFIX, "")).join("\n");
}

/** The text of lines `start..end` (1-based, inclusive), or null when the range is not inside the file. */
export function linesOf(text: string, start: number, end: number): string | null {
  const lines = toLf(text).split("\n");
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) return null;
  return lines.slice(start - 1, end).join("\n");
}

export type ResolveFailure = "range" | "not_unique";

/**
 * Turns the model's hunks for one file into stored hunks, in line order.
 * Ranges must be in the file and must not overlap; each resolved `old_text` must occur
 * exactly once in the file (exact, then normalised, line-aligned), so it can be found again.
 * A range of blank lines alone has no text to find, so it is anchored: widened to the
 * nearest non-blank line above (and, if that is still not unique, below), with those
 * lines repeated unchanged in `new_text`.
 */
export function resolveHunks(fileText: string, hunks: ModelHunk[]): { ok: true; hunks: Hunk[] } | { ok: false; reason: ResolveFailure } {
  const lf = toLf(fileText);
  const lines = lf.split(LF);
  const blank = (i: number) => lines[i - 1].trim() === "";
  const out: Hunk[] = [];
  let lastEnd = 0;
  // Order does not matter to the model; overlap does.
  for (const h of [...hunks].sort((a, b) => a.start_line - b.start_line)) {
    if (typeof h.new_text !== "string" || linesOf(lf, h.start_line, h.end_line) === null || h.start_line <= lastEnd) return { ok: false, reason: "range" };
    let start = h.start_line;
    let end = h.end_line;
    let newText = stripLineNumbers(h.new_text);
    let old = linesOf(lf, start, end) as string;
    if (old.trim() === "") {
      let above = start - 1;
      while (above >= 1 && blank(above)) above--;
      let below = end + 1;
      while (below <= lines.length && blank(below)) below++;
      const widen = (s: number, e: number) => {
        const before = lines.slice(s - 1, start - 1);
        const after = lines.slice(end, e);
        newText = [...before, newText, ...after].join(LF);
        start = s;
        end = e;
        old = linesOf(lf, start, end) as string;
      };
      if (above >= 1) widen(above, end);
      if ((above < 1 || findOnce(lf, old).kind !== "found") && below <= lines.length) widen(start, below);
      if (old.trim() === "" || start <= lastEnd) return { ok: false, reason: "range" };
    }
    lastEnd = end;
    if (findOnce(lf, old).kind !== "found") return { ok: false, reason: "not_unique" };
    out.push({ path: h.path, start_line: start, end_line: end, old_text: old, new_text: newText });
  }
  return { ok: true, hunks: out };
}

/** The file after its hunks, spliced by line range (the hunks have been resolved against this text). */
export function spliceHunks(fileText: string, hunks: Hunk[]): string {
  const lines = toLf(fileText).split("\n");
  for (const h of [...hunks].sort((a, b) => b.start_line - a.start_line)) {
    lines.splice(h.start_line - 1, h.end_line - h.start_line + 1, ...h.new_text.split("\n"));
  }
  return lines.join("\n");
}

const ch = (...codes: number[]) => codes.map((c) => String.fromCharCode(c)).join("");
// Curly and straight single quotes, primes; curly and straight double quotes; hyphens and dashes.
const SINGLE = new Set(ch(0x2018, 0x2019, 0x201a, 0x201b, 0x2032));
const DOUBLE = new Set(ch(0x201c, 0x201d, 0x201e, 0x201f, 0x2033));
const DASH = new Set(ch(0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212));

function fold(c: string): string {
  if (SINGLE.has(c)) return "'";
  if (DOUBLE.has(c)) return '"';
  if (DASH.has(c)) return "-";
  return c;
}

/**
 * The normalised form used by the fallback match: quotes and dashes folded,
 * trailing spaces and tabs on each line dropped. `map[i]` is the index in the
 * original text of the normalised text's character i.
 */
export function normaliseForMatch(text: string): { text: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === " " || c === "\t") {
      let j = i;
      while (j < text.length && (text[j] === " " || text[j] === "\t")) j++;
      if (j === text.length || text[j] === "\n") {
        i = j - 1;
        continue;
      }
    }
    out += fold(c);
    map.push(i);
  }
  return { text: out, map };
}

/** Where `needle` starts in `hay` as whole lines (at 0 or after a newline, ending at the end or before one); at most 2. */
function occurrences(hay: string, needle: string): number[] {
  const at: number[] = [];
  if (!needle) return at;
  for (let i = hay.indexOf(needle); i !== -1 && at.length < 2; i = hay.indexOf(needle, i + 1)) {
    const end = i + needle.length;
    if ((i === 0 || hay[i - 1] === LF) && (end === hay.length || hay[end] === LF)) at.push(i);
  }
  return at;
}

export type Found = { kind: "found"; start: number; end: number; how: "exact" | "normalised" } | { kind: "missing" } | { kind: "not_unique" };

/** Where `needle` occurs in `text` as whole lines, if exactly once: exact first, then on the normalised forms, mapped back to the original span. */
export function findOnce(text: string, needle: string): Found {
  const exact = occurrences(text, needle);
  if (exact.length === 1) return { kind: "found", start: exact[0], end: exact[0] + needle.length, how: "exact" };
  if (exact.length > 1) return { kind: "not_unique" };
  const hay = normaliseForMatch(text);
  const n = normaliseForMatch(needle).text;
  const loose = occurrences(hay.text, n);
  if (loose.length === 1) return { kind: "found", start: hay.map[loose[0]], end: hay.map[loose[0] + n.length - 1] + 1, how: "normalised" };
  return loose.length ? { kind: "not_unique" } : { kind: "missing" };
}

/**
 * Applies stored hunks to a file's current text (for example `main`'s, at
 * approval): each `old_text` must be found exactly once, and the spans must
 * not overlap. Anything else is stale.
 */
export function applyHunks(text: string, hunks: Hunk[]): { ok: true; text: string; how: ("exact" | "normalised")[] } | { ok: false; reason: "missing" | "not_unique" | "overlap" } {
  const lf = toLf(text);
  const spans: { start: number; end: number; new_text: string; how: "exact" | "normalised" }[] = [];
  for (const h of hunks) {
    const f = findOnce(lf, h.old_text);
    if (f.kind !== "found") return { ok: false, reason: f.kind };
    spans.push({ start: f.start, end: f.end, new_text: h.new_text, how: f.how });
  }
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) return { ok: false, reason: "overlap" };
  let out = lf;
  for (const s of [...sorted].reverse()) out = out.slice(0, s.start) + s.new_text + out.slice(s.end);
  return { ok: true, text: out, how: spans.map((s) => s.how) };
}

type Op = { op: " " | "-" | "+"; line: string };

/** A line diff (longest common subsequence). The files are a few hundred lines, so the table is small. */
export function lineDiff(before: string, after: string): Op[] {
  const a = toLf(before).split("\n");
  const b = toLf(after).split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: " ", line: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) ops.push({ op: "-", line: a[i++] });
    else ops.push({ op: "+", line: b[j++] });
  }
  while (i < n) ops.push({ op: "-", line: a[i++] });
  while (j < m) ops.push({ op: "+", line: b[j++] });
  return ops;
}

/** Lines added and removed, and the characters on added lines (joined with newlines). */
export function changeSize(before: string, after: string): { added: number; removed: number; addedChars: number; addedText: string } {
  const ops = lineDiff(before, after);
  const added = ops.filter((o) => o.op === "+").map((o) => o.line);
  const addedText = added.join("\n");
  return { added: added.length, removed: ops.filter((o) => o.op === "-").length, addedChars: [...addedText].length, addedText };
}

/** A unified diff of one file with 3 lines of context (`--- a/path`, `+++ b/path`). Empty when nothing changed. */
export function unifiedDiff(path: string, before: string, after: string, context = 3): string {
  const ops = lineDiff(before, after);
  const changed = ops.map((o, i) => (o.op === " " ? -1 : i)).filter((i) => i >= 0);
  if (!changed.length) return "";
  // Group changes whose context windows touch.
  const groups: [number, number][] = [];
  for (const i of changed) {
    const last = groups[groups.length - 1];
    if (last && i - last[1] <= 2 * context + 1) last[1] = i;
    else groups.push([i, i]);
  }
  const out = [`--- a/${path}`, `+++ b/${path}`];
  // Line numbers before each op.
  const aLine: number[] = [];
  const bLine: number[] = [];
  let x = 1;
  let y = 1;
  for (const o of ops) {
    aLine.push(x);
    bLine.push(y);
    if (o.op !== "+") x++;
    if (o.op !== "-") y++;
  }
  for (const [s, e] of groups) {
    const from = Math.max(0, s - context);
    const to = Math.min(ops.length - 1, e + context);
    const slice = ops.slice(from, to + 1);
    const aCount = slice.filter((o) => o.op !== "+").length;
    const bCount = slice.filter((o) => o.op !== "-").length;
    const aStart = aCount ? aLine[from] : aLine[from] - 1;
    const bStart = bCount ? bLine[from] : bLine[from] - 1;
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    for (const o of slice) out.push(`${o.op}${o.line}`);
  }
  return out.join("\n");
}

/** The `## ` heading each line is under (code fences skipped), indexed by line number - 1. "" before the first heading. */
export function sectionsByLine(text: string): string[] {
  let fence = false;
  let current = "";
  return toLf(text)
    .split("\n")
    .map((l) => {
      if (/^\s*```/.test(l)) fence = !fence;
      else if (!fence && /^## /.test(l)) current = l.trim();
      return current;
    });
}

/** The sections lines `start..end` touch. */
export function sectionsTouched(text: string, start: number, end: number): string[] {
  const by = sectionsByLine(text);
  return [...new Set(by.slice(start - 1, end))].filter(Boolean);
}

/**
 * Lines code depends on: `buildInstructions` splits on `## Setting it up`, and
 * the run and profile block labels are what Zack writes and intake reads.
 */
export const LOAD_BEARING_LINES = ["## Setting it up", "## The structured blocks", "```roger-run", "```roger-profile"] as const;

/** A load-bearing line the file had is gone, renamed or duplicated after the edit. Returns the line, or null. */
export function brokenHeading(before: string, after: string): string | null {
  const count = (t: string, l: string) => toLf(t).split("\n").filter((x) => x.trim() === l).length;
  for (const l of LOAD_BEARING_LINES) {
    const n = count(before, l);
    if (n > 0 && count(after, l) !== n) return l;
  }
  return null;
}

/**
 * The stored hunks re-anchored to another text of the file (`main`'s, at
 * approval): each `old_text` found exactly once (exact, then normalised), its
 * line range and `old_text` taken from that text, so the safety checks and
 * the guardrail sections read `main`'s lines. Splicing the result gives the
 * same text as applyHunks.
 */
export function rebaseHunks(text: string, hunks: Hunk[]): { ok: true; hunks: Hunk[]; text: string } | { ok: false; reason: "missing" | "not_unique" | "overlap" } {
  const applied = applyHunks(text, hunks);
  if (!applied.ok) return applied;
  const lf = toLf(text);
  const lineAt = (offset: number) => lf.slice(0, offset).split(LF).length;
  const out = hunks.map((h) => {
    const f = findOnce(lf, h.old_text) as Extract<Found, { kind: "found" }>;
    const old = lf.slice(f.start, f.end);
    const start = lineAt(f.start);
    return { ...h, start_line: start, end_line: start + old.split(LF).length - 1, old_text: old };
  });
  return { ok: true, hunks: out.sort((a, b) => a.start_line - b.start_line), text: applied.text };
}
