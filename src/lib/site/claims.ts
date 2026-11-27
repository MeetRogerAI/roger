/**
 * The claims and vocabulary rules, checked on the text a page really renders
 * (plan KTD15, R6; design guide Part E; design spec 0.4 and A.16).
 *
 * Pure: a page's markup goes in as a string, with its path, and a list of
 * violations comes out. Nothing here knows which site version made the markup,
 * so the same check runs on v1, v2 and v3.
 *
 * How it reads a page. `readPage` turns markup into runs of text. Script,
 * style and head content is left out; text hidden only by a class (sr-only,
 * or a streamed block waiting to be swapped in) is kept, because a reader or a
 * screen reader meets it. The accessible text in aria-label, alt, title and
 * placeholder is read too.
 *
 * Zones. A rule that has an exception needs to know where on the page it is.
 * An element says so with `data-claims="<zone>"`, and two existing marks are
 * read as zones as well:
 *
 *   data-verbatim    verbatim     a quotation the site must print word for word
 *   data-bricks      bricks       a brick stack: each brick's own label
 *   data-claims      compounding  the "It compounds" section
 *                    testimonial  a user's own words
 *                    sample       the sample idea: the play's own text and scores
 *                    letter       Peter's letter
 *                    legal        the privacy and terms documents
 *                    numeral      the number of a step in an ordered list
 *                    library      a public use case, read from the database
 *
 * Every exception is one entry in `allowed` below, with its reason. Nothing
 * else is excused.
 */
import type { Amounts } from "./amounts";

export type Zone = "verbatim" | "bricks" | "compounding" | "testimonial" | "sample" | "letter" | "legal" | "numeral" | "library";

export type Segment = {
  text: string;
  /** Every zone the text sits inside, sorted. */
  zones: string[];
  /** "attribute" for aria-label, alt, title and placeholder text. */
  via: "text" | "attribute";
};

export type PageText = { path: string; segments: Segment[] };

export type RuleId = "vocabulary" | "bare-dollar" | "time-saved" | "income" | "user-count" | "number" | "exclamation-emoji" | "hype" | "brokerage";

export type Violation = {
  rule: RuleId;
  path: string;
  /** The words that broke the rule. */
  found: string;
  /** The words around them. */
  context: string;
  zones: string[];
};

export type ClaimsContext = {
  /** The amounts the pages were rendered with: its prices and periods are the only ones a page may print. */
  amounts: Amounts;
  /** The week numbers and brick counts of "It compounds" (src/data/site/compounding.ts). */
  compounding: readonly number[];
  /**
   * Names that must never appear: the brokerage (spec 0.4). Peter decided on
   * November 26, 2026 that the brokerage's name is not recorded in the repo,
   * so this list stays empty by decision and the rule finds nothing. Do not
   * add the name here or anywhere else. The mechanism stays for a test, or a
   * caller outside the repo, that supplies names of its own. Matched as whole
   * words, whatever the case.
   */
  brokerages?: readonly string[];
};

// ---------------------------------------------------------------------------
// Reading a page
// ---------------------------------------------------------------------------

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** Elements whose content no reader meets. */
const UNSEEN = new Set(["script", "style", "template", "head"]);
const READ_ATTRIBUTES = ["aria-label", "alt", "title", "placeholder"];

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole: string, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return entities[name.toLowerCase()] ?? whole;
  });
}

/** An attribute's value, "" for one with no value, null when the tag does not have it. */
function attribute(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s/>])`).exec(tag);
  return m ? decodeEntities(m[1] ?? "") : null;
}

const tidy = (text: string) => text.replace(/[\s⁠]+/g, " ").trim();

export type ReadOptions = {
  /**
   * Zones for elements that cannot carry a mark, by tag name. /library uses
   * it: a use-case row is a component the Circles site renders too, and its
   * markup must not change (see zonesByTagFor).
   */
  zonesByTag?: Record<string, Zone>;
};

/**
 * The text of a page, as runs that share the same zones. Neighbouring text is
 * joined across tags, so "AI <b>agents</b>" reads "AI agents".
 */
export function readSegments(markup: string, { zonesByTag = {} }: ReadOptions = {}): Segment[] {
  const out: Segment[] = [];
  const stack: { tag: string; zones: string[]; unseen: boolean }[] = [];
  const zonesNow = () => [...new Set(stack.flatMap((s) => s.zones))].sort();
  const unseenNow = () => stack.some((s) => s.unseen);
  let open: { text: string; key: string; zones: string[] } | null = null;
  const flush = () => {
    const text = open ? tidy(open.text) : "";
    if (open && text) out.push({ text, zones: open.zones, via: "text" });
    open = null;
  };
  const addText = (raw: string) => {
    if (unseenNow() || !raw) return;
    const zones = zonesNow();
    const key = zones.join(" ");
    if (open && open.key !== key) flush();
    open ??= { text: "", key, zones };
    open.text += decodeEntities(raw);
  };

  const source = markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<!doctype[^>]*>/gi, "");
  const tags = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let at = 0;
  for (let m = tags.exec(source); m; m = tags.exec(source)) {
    addText(source.slice(at, m.index));
    at = m.index + m[0].length;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i !== -1) stack.length = i;
      addText(" ");
      continue;
    }
    const whole = m[0];
    const zones: string[] = (attribute(whole, "data-claims") ?? "").split(/\s+/).filter(Boolean);
    if (attribute(whole, "data-verbatim") !== null) zones.push("verbatim");
    if (attribute(whole, "data-bricks") !== null) zones.push("bricks");
    if (zonesByTag[tag]) zones.push(zonesByTag[tag]);
    const unseen = UNSEEN.has(tag);
    if (!unseenNow() && !unseen) {
      const here = [...new Set([...zonesNow(), ...zones])].sort();
      for (const name of READ_ATTRIBUTES) {
        const value = tidy(attribute(whole, name) ?? "");
        if (value) {
          flush();
          out.push({ text: value, zones: here, via: "attribute" });
        }
      }
    }
    if (!VOID.has(tag) && !/\/\s*>$/.test(whole)) stack.push({ tag, zones, unseen });
    addText(" ");
  }
  addText(source.slice(at));
  flush();
  return out;
}

/**
 * On /library every <article> is a public use case: a summary of someone's
 * public post, read from the database. The row component is shared with the
 * Circles site, whose markup is pinned, so the zone is given by tag here
 * instead of by a mark on the element.
 */
export function zonesByTagFor(path: string): Record<string, Zone> {
  return path === "/library" ? { article: "library" } : {};
}

export function readPage(path: string, markup: string): PageText {
  return { path, segments: readSegments(markup, { zonesByTag: zonesByTagFor(path) }) };
}

/** A page made of plain strings, such as a title and a description, or one line of copy. */
export function textPage(path: string, texts: readonly string[], zones: readonly Zone[] = []): PageText {
  return { path, segments: texts.map(tidy).filter(Boolean).map((text) => ({ text, zones: [...zones].sort(), via: "text" as const })) };
}

// ---------------------------------------------------------------------------
// The allow-list
// ---------------------------------------------------------------------------

type Where = { segment: Segment; path: string; context: ClaimsContext };

type Allowed = {
  rule: RuleId;
  /** Why the wording is not a violation. */
  why: string;
  /** The exact wording. A match of the rule is excused only when it lies wholly inside these words. */
  words: (where: Where) => RegExp | null;
};

const inZone = (segment: Segment, zone: Zone) => segment.zones.includes(zone);
const onZack = (path: string) => path === "/zack" || path.startsWith("/zack/");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anyOf = (texts: readonly string[], flags = "gi") => (texts.length > 0 ? new RegExp(texts.map(escape).join("|"), flags) : null);
/** The longest text a "numeral" mark may hold and still be read as a step's number. */
const NUMERAL_MAX = 16;
const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";

export const allowed: readonly Allowed[] = [
  // --- time saved -----------------------------------------------------------
  {
    rule: "time-saved",
    why: "Spec A.14, homepage step 1: how long the starter team takes to install. It is a setup time, not time saved.",
    words: () => /takes about half an hour to install/gi,
  },
  {
    rule: "time-saved",
    why: "Spec A.14, the answer to “I don’t use AI agents yet. Can I start?”: how long setup takes, not time saved.",
    words: () => /finish in about half an hour/gi,
  },
  {
    rule: "time-saved",
    why: "The name of one of Cora’s five scores (spec A.8, A.14). Only the two words: a figure in front of them is still a violation.",
    words: () => /\bhours saved\b/gi,
  },
  {
    rule: "time-saved",
    why: "Privacy text: how long a count of requests from one IP address is kept. A retention period, not time saved.",
    words: ({ segment }) => (inZone(segment, "legal") ? /Each count covers one hour/g : null),
  },
  {
    rule: "time-saved",
    why: "The bundled sample play’s own instructions, where “save” means store: “Save a skill called …”, “a saved note”, “saved context”.",
    words: ({ segment }) => (inZone(segment, "sample") ? /Save a skill called|\ba saved note\b|\bsaved context\b/g : null),
  },
  {
    rule: "time-saved",
    why: "The free Zack run stores the pasted report: the button, its pending label and the messages about storing it. “Save” means store.",
    words: ({ path }) => (onZack(path) ? /Save my report|Saving…|could not save this report|Your report is saved|It is saved all the same|Saving is not switched on/g : null),
  },
  {
    rule: "time-saved",
    why: "The free Zack run’s rate-limit and error messages: how long to wait before trying again.",
    words: ({ path }) => (onZack(path) ? /Try again in an hour|Try again in a minute/g : null),
  },
  // --- user counts ----------------------------------------------------------
  {
    rule: "user-count",
    why: "Spec A.14, the answer to “Who sees my plays?”: an example of how a play is described, not a count of Roger’s users.",
    words: () => /run by 3 users/g,
  },
  // --- numbers --------------------------------------------------------------
  {
    rule: "number",
    why: "A price from the settings (plan KTD8, R8): the monthly price, the one-list price and the higher rate, each with its country in front.",
    words: ({ context: { amounts } }) =>
      anyOf(
        (["USD", "CAD"] as const).flatMap((currency) => [amounts.monthly, amounts.list, amounts.higher].map((price) => `${currency === "CAD" ? "CA" : "US"}$${price[currency].toLocaleString("en-US")}`)),
        "g",
      ),
  },
  {
    rule: "number",
    why: "The two periods from the settings: the days before an unused trial closes, and the days runs are kept.",
    words: ({ context: { amounts } }) => new RegExp(`\\b(?:${amounts.trialCloseDays}|${amounts.retentionDays}) days\\b`, "g"),
  },
  {
    rule: "number",
    why: "Spec A.14, word for word: “A play is described as ‘run by 3 users’”.",
    words: () => /run by 3 users/g,
  },
  {
    rule: "number",
    why: "The footer’s copyright year, from the clock.",
    words: () => /© \d{4}\b/g,
  },
  {
    rule: "number",
    why: "Plan R10, the one settled exception to “no hard-coded numbers”: the week numbers and brick counts of “It compounds”, inside that section only.",
    words: ({ segment, context }) => (inZone(segment, "compounding") && context.compounding.length > 0 ? new RegExp(`(?<!\\d|\\d[.,])(?:${context.compounding.join("|")})(?!\\d|[.,]\\d)`, "g") : null),
  },
  {
    rule: "number",
    why: "Spec 0.7: every brick carries a text label, so colour is never the only signal. The label says which week and which of its ideas: “Week 2, idea 3: set up”.",
    words: ({ segment }) => (inZone(segment, "bricks") ? /\p{L}+ \d+, \p{L}+ \d+:/gu : null),
  },
  {
    rule: "number",
    why: "The sample idea is a real play printed as it is: its numbered parts, the sections its install prompt refers to, and Cora’s scores out of 10. Time figures in it are still caught by the time-saved rule.",
    words: ({ segment }) => (inZone(segment, "sample") ? /\d+(?:[.,:]\d+)*/g : null),
  },
  {
    rule: "number",
    why: "Peter’s approved letter, word for word: an age and spans of years (“at 17”, “35+ years later”, “18+ years”).",
    words: ({ segment }) => (inZone(segment, "letter") ? /\bat \d{2}\b|\b\d+\+? years\b/g : null),
  },
  {
    rule: "number",
    why: "The date a legal document was last updated.",
    words: ({ segment }) => (inZone(segment, "legal") ? new RegExp(`Last updated ${MONTH} \\d{4}`, "g") : null),
  },
  {
    rule: "number",
    why: "Spec A.13: the privacy text promises an answer to a data request within 30 days.",
    words: ({ segment }) => (inZone(segment, "legal") ? /within 30 days/g : null),
  },
  {
    rule: "number",
    why: "The number of a step in an ordered list (spec 0.7: numbered steps with a numeral). The mark holds numerals and at most a word or two, such as “02 Step 2:”, never a sentence.",
    words: ({ segment }) => (inZone(segment, "numeral") && segment.text.length <= NUMERAL_MAX ? /(?<!\d|\d[.,])\d{1,2}(?!\d|[.,]\d)/g : null),
  },
  {
    rule: "number",
    why: "The version a public Zack file states for itself, read from the file (/zack only).",
    words: ({ path }) => (onZack(path) ? /Version \d+(?:\.\d+)*/g : null),
  },
  {
    rule: "number",
    why: "Spec 0.4 allows the live count of public use cases, read from the database (/library only).",
    words: ({ path }) => (path === "/library" ? /[\d,]+ real things|(?:[\d,]+ of )?[\d,]+ use cases/g : null),
  },
];

/**
 * Zones a rule does not read at all.
 *
 * - verbatim: a quotation the site must print as it is (the line added to the
 *   top of every playbook says "my agent system"). Excused from the vocabulary
 *   rule and nothing else.
 * - testimonial: a user's own words, shown word for word (spec 0.4, A.16
 *   check 10). They may say "agent", state time saved, and carry their own
 *   numbers and punctuation. Income claims, user counts, a bare dollar sign
 *   and hype are still caught, so such a quote is looked at before it is cleared.
 * - library: a public use case, summarised from someone's public post and read
 *   from the database. The spec keeps the library as it is (A.12) and the page
 *   says none of these people are Roger clients. Only the brokerage rule reads it.
 */
const unread: Record<RuleId, readonly Zone[]> = {
  vocabulary: ["verbatim", "testimonial", "library"],
  "bare-dollar": ["library"],
  "time-saved": ["testimonial", "library"],
  income: ["library"],
  "user-count": ["library"],
  number: ["testimonial", "library"],
  "exclamation-emoji": ["testimonial", "library"],
  hype: ["library"],
  brokerage: [],
};

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

const NUMBER_WORD = "(?:half an?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|ninety|a few|few|several|many|a couple of)";
const FIGURE = `(?:\\d[\\d.,]*\\+?|\\b${NUMBER_WORD}\\b)`;
const SAVING = "(?:sav(?:e|es|ed|ing|ings)|faster|quicker|reclaim\\w*|free[sd]? up|gets? back|gives? (?:you )?back)";
const COUNT_WORD = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|fifty|a hundred|a thousand)";
const PEOPLE = "(?:users|customers|members|subscribers|professionals|realtors|brokers|teams|companies|people|agents)";

/**
 * A short, conservative list: words a plain sentence does not need (spec A.1,
 * "No hype words"). Ordinary words that are sometimes hype ("unlock", "powerful",
 * "magic", "simple") are left out, so the rule does not flag honest copy.
 */
export const hypeWords: readonly string[] = [
  "revolutionary",
  "revolutionize",
  "revolutionise",
  "game-changing",
  "game changer",
  "game-changer",
  "supercharge",
  "supercharged",
  "turbocharge",
  "skyrocket",
  "unleash",
  "effortless",
  "effortlessly",
  "seamless",
  "seamlessly",
  "cutting-edge",
  "world-class",
  "best-in-class",
  "next-level",
  "mind-blowing",
  "amazing",
  "incredible",
  "unbelievable",
  "10x",
];

const words = (list: readonly string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "giu");

/** The patterns of each rule. Every match is a violation unless an `allowed` entry covers it. */
function patterns(rule: RuleId, page: PageText, context: ClaimsContext): RegExp[] {
  switch (rule) {
    case "vocabulary":
      // "agent" or "agents" with no "AI" directly in front (spec 0.4). /agents and /zack may say it.
      return page.path === "/agents" || onZack(page.path) ? [] : [/(?<!\bAI )\bagents?\b/gi];
    case "bare-dollar":
      // A "$" without its country (spec A.4: never a bare dollar sign).
      return [/(?<!US|CA)\$[\d.,]*/g];
    case "time-saved":
      return [
        // A figure of hours or minutes: "5 hours", "2-3 hrs", "half an hour", "a few minutes".
        new RegExp(`${FIGURE}(?:\\s*(?:-|–|to)\\s*${FIGURE})?[\\s-]*(?:hours?|hrs?|minutes?|mins?)\\b`, "gi"),
        // A rate: "hours a week", "minutes per day".
        /\b(?:hours?|minutes?|days?)\s+(?:a|per|each|every)\s+(?:day|week|month|year)\b/gi,
        // Days, weeks or months said to be saved, either way round, inside one sentence.
        new RegExp(`${FIGURE}\\s+(?:days?|weeks?|months?)\\b[^.?!]{0,60}\\b${SAVING}\\b|\\b${SAVING}\\b[^.?!]{0,60}${FIGURE}\\s+(?:days?|weeks?|months?)\\b`, "gi"),
        // "save", "saves", "saved", "saving", "savings": a claim unless the wording is on the allow-list.
        /\bsav(?:e|es|ed|ing|ings)\b/gi,
        // Productivity, and how much more or faster: "10x", "40% faster", "twice as fast".
        /\bproductiv\w*/gi,
        /\b\d+(?:\.\d+)?\s?[x×](?![\p{L}\p{N}])/giu,
        /\b\d+(?:\.\d+)?\s?(?:%|percent)/gi,
        /\b(?:twice|three times|four times) as (?:fast|much|many)\b/gi,
      ];
    case "income":
      return [/\b(?:income|revenue|earn(?:s|ed|ing|ings)?|profits?|profitable|commissions?|GCI|ROI|return on investment|makes? (?:you )?(?:more )?money|more (?:deals|listings|sales|clients|leads)|close more|pays? for itself|payback)\b/gi];
    case "user-count":
      return [
        /\bjoin(?:s|ed|ing)?\b/gi,
        /\b(?:dozens|hundreds|thousands|millions)\b/gi,
        /\busers? love\b/gi,
        /\b(?:loved|trusted|chosen) by\b/gi,
        new RegExp(`(?:\\d[\\d.,]*\\+?\\s?[km]?|\\b${COUNT_WORD})\\s+(?:[\\p{L}-]+\\s+)?${PEOPLE}\\b`, "giu"),
      ];
    case "number":
      // Every run of digits must be explained by the allow-list.
      return [/\d+(?:[.,]\d+)*/g];
    case "exclamation-emoji":
      // ©, ® and ™ are "pictographic" to Unicode but are text, so emoji means: shown as emoji by default, or forced to it.
      return [/!/g, /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/gu];
    case "hype":
      return [words(hypeWords)];
    case "brokerage":
      return context.brokerages && context.brokerages.length > 0 ? [words(context.brokerages)] : [];
  }
}

export const ruleIds: readonly RuleId[] = ["vocabulary", "bare-dollar", "time-saved", "income", "user-count", "number", "exclamation-emoji", "hype", "brokerage"];

function spans(pattern: RegExp, text: string): [number, number][] {
  const global = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  return [...text.matchAll(global)].filter((m) => m[0].length > 0).map((m) => [m.index, m.index + m[0].length]);
}

/** One rule on one page. */
export function checkRule(rule: RuleId, page: PageText, context: ClaimsContext): Violation[] {
  const found: Violation[] = [];
  for (const segment of page.segments) {
    if (unread[rule].some((zone) => inZone(segment, zone))) continue;
    const where = { segment, path: page.path, context };
    const excused = allowed.filter((a) => a.rule === rule).flatMap((a) => {
      const pattern = a.words(where);
      return pattern ? spans(pattern, segment.text) : [];
    });
    const seen = new Set<string>();
    for (const pattern of patterns(rule, page, context)) {
      for (const [start, end] of spans(pattern, segment.text)) {
        if (excused.some(([from, to]) => from <= start && end <= to)) continue;
        // Two patterns of one rule can land on the same words; report them once.
        const key = `${start}-${end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          rule,
          path: page.path,
          found: segment.text.slice(start, end),
          context: segment.text.slice(Math.max(0, start - 40), Math.min(segment.text.length, end + 40)),
          zones: segment.zones,
        });
      }
    }
  }
  return found;
}

/** Every rule on one page. An empty list means the page passes. */
export function checkClaims(page: PageText, context: ClaimsContext): Violation[] {
  return ruleIds.flatMap((rule) => checkRule(rule, page, context));
}

/** One line per violation, for a test's failure message. */
export function describeViolations(violations: readonly Violation[]): string {
  return violations.map((v) => `${v.path} [${v.rule}] “${v.found}” in “…${v.context}…”${v.zones.length > 0 ? ` (zones: ${v.zones.join(", ")})` : ""}`).join("\n");
}
