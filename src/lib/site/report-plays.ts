/**
 * "Your top plays" on /zack (plan KTD12, spec A.11): the titles of the plays
 * in a pasted Zack report, read from its headings. A fixed set of rules and no
 * model call, so the same report always gives the same titles.
 *
 * A title is all that is shown. A Zack heading often carries a time-saved
 * figure ("about 8.0 hours a week saved"), and the site shows no such number,
 * so everything after the title is cut, and a figure left inside it is removed
 * with the phrase it belongs to (see withoutTime). No word is ever added.
 *
 * Heading shapes seen in real reports (artifacts/Zack Runs):
 *   ## 1. Client email in two tones: about 1.6 hours a week saved (1.1 to 2.1)
 *   ## Play 1: Client email in two tones (Set A)
 *   ### Play 1 (Set A): Inbox-to-draft emails
 *   ## Set A · Daily prospect outreach drafts — about 37.4 hours a week saved
 *   ## 1. Appointment prep · Set A: top for you · about 0.5 hours a week saved · Medium confidence
 */

/** The most titles shown. Zack writes up to four plays. */
export const MAX_PLAY_TITLES = 6;
const MAX_TITLE_CHARS = 120;

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/;
const PLAY = /^play\s+\d{1,2}\b\s*(?:\([^)]*\))?\s*[:.·–—-]\s*(.+)$/i;
const NUMBERED = /^\d{1,2}[.)]\s+(.+)$/;
const SET = /^set\s+[ab]\b[^·:–—]*[·:–—]\s*(.+)$/i;

/** Numbered headings that are a report's or a playbook's own sections, never a play. */
const NOT_A_PLAY = new Set([
  "summary",
  "the plays",
  "plays",
  "play",
  "trigger",
  "setup first",
  "steps",
  "guardrails",
  "output",
  "pitfalls seen",
  "done when",
  "install notes",
  "paste to install",
  "runners-up",
  "runners up",
  "also runs",
  "review list",
]);

/**
 * A number with a unit of time after it: "8.0 hours", "25 minutes", "3-hourly",
 * "90 min", and a range such as "5-10 minutes". Groups: the number, what joins
 * it to the unit, the unit.
 */
const TIME_FIGURE = /(?:\d[\d.,]*\s*(?:-|–|to)\s*)?(\d[\d.,]*)(\s*-?\s*)(hours?|hourly|hrs?|minutes?|mins?)\b/i;

/** Words that soften a figure: "about 10 minutes", "up to 2 hours". */
const QUALIFIER = "about|around|roughly|nearly|almost|just|only|up to|under|over|less than|more than|at least|at most";
/** What may follow a figure to the end of a title: "a week saved (1.1 to 2.1)", "each time", "or less". */
const TAIL = /^(?:\s*(?:(?:a|per|each|every|this)\s+(?:week|day|month|year|time|run)|weekly|daily|monthly|saved|flat|total|each|or less|or more))*\s*(?:\([^)]*\))?\s*$/i;
/** A figure's own preposition, with any qualifier, at the end of what comes before it: "in", "every", "within about". */
const INTRODUCER = new RegExp(`(?:^|\\s)(?:in|within|every|each|after|for|per|under|over)(?:\\s+(?:${QUALIFIER}))*\\s*$`, "i");
const QUALIFIER_LAST = new RegExp(`(?:^|\\s)(?:${QUALIFIER})\\s*$`, "i");
/** A title reads on cleanly from one of these once "in 10 minutes" is taken out before it. */
const READS_ON = /^\s+(?:for|to|on|with|from|across|before|at|by|and|using|via|without)\b/i;
/** Words a title cannot end on once a figure after them is gone. */
const DANGLING = new Set(
  "a an the and or of on at by with from to in within every each after for per under over about around roughly nearly almost just only up than less more least most".split(" "),
);

/** Cuts the words and marks left hanging at the end: "A job done in" becomes "A job done". */
function trimDangling(text: string): string {
  let s = text;
  for (;;) {
    s = s.replace(/[\s:;,·–—~([-]+$/, "");
    const last = s.match(/(?:^|\s)([A-Za-z]+)$/);
    if (!last || !DANGLING.has(last[1].toLowerCase())) return s;
    s = s.slice(0, last.index);
  }
}

/**
 * Takes each figure of time out of a title together with the phrase it belongs
 * to, so that what is left still reads as a title. Words are only ever
 * removed. In order, for each figure:
 *   - inside brackets, the brackets go with it: "Inbox sweep (saves 2 hours)";
 *   - at the end of the title, it goes with its preposition: "A job done in 10 min";
 *   - describing the next word, it goes alone: "3-hourly check-ins", "a 2 hour job";
 *   - counting what follows, it goes with its "of": "from 10 minutes of notes";
 *   - a phrase of its own that the title reads on from: "Draft in 10 minutes from notes";
 *   - anything else: the title stops before the figure.
 */
function withoutTime(raw: string): string {
  let title = raw;
  for (let m = TIME_FIGURE.exec(title); m; m = TIME_FIGURE.exec(title)) {
    const before = title.slice(0, m.index);
    const after = title.slice(m.index + m[0].length);

    const open = Math.max(before.lastIndexOf("("), before.lastIndexOf("["));
    if (open > Math.max(before.lastIndexOf(")"), before.lastIndexOf("]"))) {
      const close = after.search(/[)\]]/);
      title = `${before.slice(0, open)} ${close < 0 ? "" : after.slice(close + 1)}`;
      continue;
    }
    if (TAIL.test(after)) return trimDangling(before);

    const [, number, joiner, unit] = m;
    const describes = joiner.includes("-") || /^hourly$/i.test(unit) || (/^(hour|minute)$/i.test(unit) && Number(number) !== 1);
    const next = after.match(/^\s+([A-Za-z][\w’'-]*)/);
    if (describes && next && !DANGLING.has(next[1].toLowerCase())) {
      title = `${before}${after}`;
      continue;
    }
    if (/^\s+of\s+\S/i.test(after)) {
      title = `${before.replace(QUALIFIER_LAST, "")} ${after.replace(/^\s+of\s+/i, "")}`;
      continue;
    }
    const introducer = before.match(INTRODUCER);
    if (introducer && READS_ON.test(after)) {
      title = `${before.slice(0, introducer.index)}${after}`;
      continue;
    }
    return trimDangling(before);
  }
  return title;
}

function clean(raw: string): string {
  let title = raw.replace(/[*_`]/g, "");
  // The title is the first part; set, time saved and confidence follow it after a dot.
  title = title.split(/\s+·\s+/)[0];
  // ": about 8.0 hours a week saved (5.5 to 10.5)", with a colon or a dash before it.
  title = title.replace(/\s*[:–—-]\s*about\b.*$/i, "");
  // "(Set A)" and "(Set B, my garbage, your treasure)".
  title = title.replace(/\s*\(\s*set\s+[ab]\b[^)]*\)\s*$/i, "");
  // Any figure of time still inside the title, with the phrase it belongs to.
  title = withoutTime(title);
  title = title
    .replace(/\s+/g, " ")
    .replace(/\s+([,;:.])/g, "$1")
    .replace(/^[\s:·–—-]+|[\s:·–—-]+$/g, "")
    .trim();
  return title.slice(0, MAX_TITLE_CHARS).trim();
}

type Heading = { level: number; text: string };

function headings(report: string): Heading[] {
  const found: Heading[] = [];
  let fenced = false;
  for (const line of report.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = line.match(HEADING);
    if (m) found.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, "").trim() });
  }
  return found;
}

/** Titles from the structured block a Zack 2.0 report ends with, when its headings gave none. */
function blockTitles(report: string): string[] {
  const block = report.match(/```\s*roger-run\s*\r?\n([\s\S]*?)```/);
  if (!block) return [];
  try {
    const plays = (JSON.parse(block[1]) as { plays?: unknown }).plays;
    if (!Array.isArray(plays)) return [];
    return plays.map((p) => (p && typeof p === "object" && typeof (p as { title?: unknown }).title === "string" ? (p as { title: string }).title : ""));
  } catch {
    return [];
  }
}

function matches(all: Heading[], shape: RegExp): Heading[] {
  return all.flatMap((h) => {
    const m = h.text.match(shape);
    return m ? [{ level: h.level, text: m[1] }] : [];
  });
}

/** The play titles in a report, in its own order. Empty when no heading reads as a play. */
export function playTitles(report: string): string[] {
  const all = headings(report);
  let raw = matches(all, PLAY).map((h) => h.text);
  if (raw.length === 0) {
    // Numbered headings, at the outermost level that has any: a playbook's own numbered parts sit deeper.
    const numbered = matches(all, NUMBERED).filter((h) => !NOT_A_PLAY.has(clean(h.text).toLowerCase()));
    const top = Math.min(...numbered.map((h) => h.level));
    raw = numbered.filter((h) => h.level === top).map((h) => h.text);
  }
  if (raw.length === 0) raw = matches(all, SET).map((h) => h.text);
  if (raw.length === 0) raw = blockTitles(report);

  const titles: string[] = [];
  for (const candidate of raw) {
    const title = clean(candidate);
    if (title && !NOT_A_PLAY.has(title.toLowerCase()) && !titles.includes(title)) titles.push(title);
    if (titles.length === MAX_PLAY_TITLES) break;
  }
  return titles;
}
