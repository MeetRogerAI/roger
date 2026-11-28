import { CORA_METHOD_FILE, INSTRUCTION_FILES, type InstructionFile } from "@/lib/instructions/version";
import { harmFlags, normalise, replacePatterns } from "@/lib/intake/privacy-patterns";
import { changeSize, type Hunk, lineDiff, sectionsTouched } from "./hunks";

/**
 * The review bot's safety checks (B3 plan Unit 7, origin R19). Every check
 * is code: nothing the model says about its own proposal is trusted. The
 * caller runs them in the plan's order: allowlist, evidence, ranges, size and
 * headings discard a proposal (counted by reason); harm, scrub, names and
 * quotes keep it but block it; guardrail sections mark it for a second read.
 */

/** The allowlist is code, not configuration (shared with Unit 2's versions). */
export const ALLOWLIST: readonly InstructionFile[] = INSTRUCTION_FILES;

/** Exact match only: no `./`, no backslashes, no `..`, no case folding. */
export function isAllowlisted(p: unknown): p is InstructionFile {
  return typeof p === "string" && (ALLOWLIST as readonly string[]).includes(p);
}

/** Per proposal, and per run (proposals). Lines and characters are counted on the line diff, as git counts them. */
export const LIMITS = { files: 4, hunks: 6, sideChars: 1_500, addedChars: 3_000, changedLines: 40, proposals: 5, rationale: 800, why: 200 } as const;

export type DiscardReason = "allowlist" | "evidence" | "range" | "not_unique" | "size" | "heading" | "harm";

/** Over any size limit: files, hunks, characters per side of a hunk, added characters or changed lines in all. */
export function overSize(hunks: Hunk[]): boolean {
  if (new Set(hunks.map((h) => h.path)).size > LIMITS.files || hunks.length > LIMITS.hunks) return true;
  let added = 0;
  let changed = 0;
  for (const h of hunks) {
    if ([...h.old_text].length > LIMITS.sideChars || [...h.new_text].length > LIMITS.sideChars) return true;
    const s = changeSize(h.old_text, h.new_text);
    added += s.addedChars;
    changed += s.added + s.removed;
  }
  return added > LIMITS.addedChars || changed > LIMITS.changedLines;
}

const ch = (...codes: number[]) => codes.map((c) => String.fromCharCode(c)).join("");

/** Shown on every proposal that edits cora.md: no code reads it (Built as recommended 12). */
export const DOCUMENT_ONLY_LABEL = `Document only ${ch(0x2014)} needs a matching code change`;

export function documentOnly(paths: readonly string[]): boolean {
  return paths.includes(CORA_METHOD_FILE);
}

// ---------------------------------------------------------------- harm, scrub and secrets

// ---------------------------------------------------------------- hidden and look-alike characters

const FORMAT = /[\p{Cf}\p{Co}\p{Cn}]/u;

/**
 * A character that hides or disguises text: controls (other than tab and
 * newline), format characters (zero-width, bidi controls and isolates, soft
 * hyphen), private-use and unassigned code points, tag characters, the
 * combining grapheme joiner and variation selectors.
 */
function hiddenChar(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a) return false;
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return true;
  if (cp === 0xad || cp === 0x34f || (cp >= 0x2066 && cp <= 0x206f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return true;
  if ((cp >= 0xe0000 && cp <= 0xe007f) || (cp >= 0xe0100 && cp <= 0xe01ef)) return true;
  return FORMAT.test(String.fromCodePoint(cp));
}

const SCRIPTS: [string, RegExp][] = [
  "Latin", "Greek", "Cyrillic", "Armenian", "Hebrew", "Arabic", "Syriac", "Thaana", "Devanagari", "Bengali", "Gurmukhi", "Gujarati", "Oriya", "Tamil",
  "Telugu", "Kannada", "Malayalam", "Sinhala", "Thai", "Lao", "Tibetan", "Myanmar", "Georgian", "Hangul", "Ethiopic", "Cherokee", "Canadian_Aboriginal",
  "Ogham", "Runic", "Khmer", "Mongolian", "Hiragana", "Katakana", "Bopomofo", "Han", "Coptic", "Glagolitic", "Tifinagh", "Vai", "Lisu", "Adlam", "Osage",
].map((s) => [s, new RegExp(`\\p{Script=${s}}`, "u")]);
const LETTER = /\p{L}/u;
const scriptCache = new Map<string, string>();

/** A letter's script; "Other" for anything not listed (mathematical letters, which are Common, among them). */
function scriptOf(c: string): string {
  if (/[A-Za-z]/.test(c)) return "Latin";
  let s = scriptCache.get(c);
  if (s === undefined) {
    s = SCRIPTS.find(([, re]) => re.test(c))?.[0] ?? "Other";
    scriptCache.set(c, s);
  }
  return s;
}

const baseScripts = new Map<string, Set<string>>();
function scriptsOf(base: string): Set<string> {
  let set = baseScripts.get(base);
  if (!set) {
    set = new Set();
    for (const c of base) if (LETTER.test(c)) set.add(scriptOf(c));
    if (baseScripts.size > 16) baseScripts.clear();
    baseScripts.set(base, set);
  }
  return set;
}

/**
 * Why added text is discarded outright (step 6, counted as `harm`): it holds
 * a hidden or format character, or a letter from a script the base file
 * never uses (a Cyrillic or Greek look-alike in a Latin file). These defeat
 * every word check after them, so they are never stripped and let through.
 */
export function hiddenOrForeign(added: string, base: string): string | null {
  const scripts = scriptsOf(base);
  for (const c of added) {
    const cp = c.codePointAt(0) as number;
    if (hiddenChar(cp)) return "hidden or format character";
    if (LETTER.test(c) && !scripts.has(scriptOf(c))) return "letter from another script";
  }
  return null;
}

/** Removes hidden and format characters (for model text kept on a proposal, which is never applied). */
export function stripHidden(text: string): string {
  return [...text].filter((c) => !hiddenChar(c.codePointAt(0) as number)).join("");
}

const SECRET = new RegExp(
  [
    String.raw`\brgr_zk_[A-Za-z0-9_-]{4,}`,
    String.raw`\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}`,
    String.raw`\bwhsec_[A-Za-z0-9]{8,}`,
    String.raw`\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}`,
    String.raw`\bgithub_pat_[A-Za-z0-9_]{20,}`,
    String.raw`\bxox[abprs]-[A-Za-z0-9-]{8,}`,
    String.raw`\bAKIA[0-9A-Z]{16}\b`,
    String.raw`-----BEGIN [A-Z ]*PRIVATE KEY`,
    String.raw`\bBearer\s+[A-Za-z0-9._~+/-]{12,}`,
    // A long opaque token: letters and digits mixed, 32 or more.
    String.raw`\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b`,
  ].join("|"),
);
const SECRET_ALL = new RegExp(SECRET.source, "g");

/** Every secret-like token replaced with "[removed]", so none is stored, even on a blocked proposal. */
export function removeSecrets(text: string): string {
  return text.replace(SECRET_ALL, "[removed]");
}

/** Spelled-out email addresses: "jane at acme dot com", "jane [at] acme", "jane (at) acme.com". */
const OBFUSCATED_EMAIL = /[\p{L}\p{N}._%+-]+\s*(?:[[({<]\s*at\s*[\])}>])\s*[\p{L}\p{N}-]+(?:\s*(?:\.|[[({<]\s*dot\s*[\])}>]|\s+dot\s+)\s*[\p{L}\p{N}-]+)*|[\p{L}\p{N}._%+-]+\s+at\s+[\p{L}\p{N}-]+(?:\s*(?:\.|[[({<]\s*dot\s*[\])}>]|\s+dot\s+)\s*[\p{L}\p{N}-]+)*\s*(?:[[({<]\s*dot\s*[\])}>]|\s+dot\s+)\s*(?:com|net|org|edu|gov|io|co|ca|us|uk|ai|app|dev|me|info|biz|xyz)(?![\p{L}\p{N}])/giu;

/** Replaces spelled-out email addresses with the scrub's placeholder. */
export function replaceObfuscatedEmails(text: string): string {
  return text.replace(OBFUSCATED_EMAIL, "[an email address]");
}

const SCRUB_LABEL: Record<string, string> = {
  email: "an email address",
  link: "a link",
  phone: "a phone number",
  postal_code: "a postal code",
  street_address: "an address",
  long_number: "a long number",
};

/**
 * Harm flags, scrub findings and secrets in a hunk's added text. Strings the
 * base file already holds (its own links and addresses) are not new, so they
 * do not count. A harm flag that the replaced text raises too (a security
 * rule that quotes "ignore these rules") is not new either: it is `kept`, and
 * the caller marks the proposal for a second read instead of blocking it.
 */
export function harmCheck(hunk: Pick<Hunk, "old_text" | "new_text">, base: string): { blocked: string[]; kept: string[] } {
  const blocked: string[] = [];
  const baseNorm = normalise(base);
  const added = changeSize(hunk.old_text, hunk.new_text).addedText;
  let text = normalise(added);
  for (const f of replacePatterns(added).findings) {
    if (baseNorm.includes(f.found)) text = text.split(f.found).join("[existing]");
    else blocked.push(`contains ${SCRUB_LABEL[f.kind] ?? f.kind}`);
  }
  for (const m of text.match(OBFUSCATED_EMAIL) ?? []) if (!baseNorm.includes(m)) blocked.push("contains an email address");
  if (SECRET.test(text)) blocked.push("contains what looks like a secret");
  const before = new Set(harmFlags(hunk.old_text));
  const kept: string[] = [];
  for (const f of harmFlags(text)) (before.has(f) ? kept : blocked).push(f);
  return { blocked: [...new Set(blocked)], kept };
}

// ---------------------------------------------------------------- words, names and quotes

const SQ = ch(0x2018, 0x2019, 0x201a, 0x201b);
const WORD = new RegExp(`[\\p{L}\\p{N}]+(?:['${SQ}][\\p{L}\\p{N}]+)*`, "gu");
const APOS = new RegExp(`['${SQ}]`, "g");

type Word = { w: string; start: number; end: number };

/** Words with their positions, lower-cased and apostrophes dropped ("Don't" and "dont" are one word). */
export function words(text: string): Word[] {
  return [...normalise(text).matchAll(WORD)].map((m) => ({ w: m[0].toLowerCase().replace(APOS, ""), start: m.index, end: m.index + m[0].length }));
}

/** Member-written text, as a padded word string: a run of words is in it when " w1 w2 … " is. One line per item. */
export function wordCorpus(texts: string[]): string {
  return texts.map((t) => ` ${words(t).map((x) => x.w).join(" ")} `).join("\n");
}

/** A quote: at least 8 words, or at least 40 characters of words, in a row. */
export const QUOTE_WORDS = 8;
export const QUOTE_CHARS = 40;

/**
 * Spans of `text` (character ranges, merged) that repeat a run of words from
 * member text. A run the base file also holds is the file's own wording, not
 * a quote.
 */
export function quoteSpans(text: string, corpus: string, baseCorpus = ""): [number, number][] {
  const ws = words(text);
  const has = (c: string, i: number, j: number) => c.includes(` ${ws.slice(i, j).map((x) => x.w).join(" ")} `);
  const spans: [number, number][] = [];
  for (let i = 0; i < ws.length; i++) {
    let j = i;
    while (j < ws.length && has(corpus, i, j + 1)) j++;
    if (j === i) continue;
    const len = ws.slice(i, j).map((x) => x.w).join(" ").length;
    if (j - i < QUOTE_WORDS && len < QUOTE_CHARS) continue;
    if (baseCorpus && has(baseCorpus, i, j)) continue;
    spans.push([ws[i].start, ws[j - 1].end]);
  }
  return merge(spans);
}

function merge(spans: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const s of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([...s]);
  }
  return out;
}

/** Replaces each span of the (normalised) text with a placeholder. */
export function replaceSpans(text: string, spans: [number, number][], placeholder: string): string {
  let out = normalise(text);
  for (const [s, e] of [...spans].sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + placeholder + out.slice(e);
  return out;
}

export type NameSource = { name?: string | null; displayName?: string | null; email?: string | null; label?: string | null };
export type NameTerm = { term: string; caseSensitive: boolean };

/**
 * What counts as a member's name: their name, display name, email and email
 * local part, seed contributor labels and sponsor names, whole and case
 * insensitive; and each capitalised word of a name or display name, case
 * sensitive (so "Jane" is caught, and "will" is not caught for "Will"). A
 * first name is also caught in lower case ("jane"), unless it is an everyday
 * word ("will", "mark"). Terms shorter than 3 characters are left out.
 */
export function nameTerms(sources: NameSource[]): NameTerm[] {
  const out = new Map<string, NameTerm>();
  const add = (term: string | null | undefined, caseSensitive = false) => {
    const t = normalise(term ?? "").trim();
    if ([...t].length < 3) return;
    const key = `${caseSensitive}:${caseSensitive ? t : t.toLowerCase()}`;
    if (!out.has(key)) out.set(key, { term: t, caseSensitive });
  };
  for (const s of sources) {
    for (const n of [s.name, s.displayName, s.label]) {
      add(n);
      const parts = normalise(n ?? "")
        .split(/\s+/)
        .map((part) => part.replace(/[^\p{L}\p{N}'-]/gu, ""))
        .filter(Boolean);
      for (const part of parts) if (/^\p{Lu}/u.test(part)) add(part, true);
      if (parts[0] && !COMMON_WORDS.has(lc(parts[0]))) add(parts[0]);
    }
    add(s.email);
    add(s.email?.split("@")[0]);
  }
  return [...out.values()];
}

function termPattern(t: NameTerm): RegExp {
  const body = t.term
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, t.caseSensitive ? "gu" : "giu");
}

/** Spans of names in `text`. A term the base file already holds (a product name, "Roger") is not a member's name there. */
export function nameSpans(text: string, terms: NameTerm[], base = ""): [number, number][] {
  const flat = normalise(text);
  const baseFlat = normalise(base);
  const spans: [number, number][] = [];
  for (const t of terms) {
    const re = termPattern(t);
    if (base && new RegExp(re.source, re.flags.replace("g", "")).test(baseFlat)) continue;
    for (const m of flat.matchAll(re)) spans.push([m.index, m.index + m[0].length]);
  }
  return merge(spans);
}

// ---------------------------------------------------------------- names from the evidence

/**
 * Everyday English words: a capitalised one at the start of a sentence is not
 * a name, and a first name that is one ("Will", "Mark") is not matched in
 * lower case.
 */
export const COMMON_WORDS = new Set(
  (
    "a an the this that these those it its i we you he she they my our your his her their me us them and but or nor so if when while then also just only " +
    "every each all some any no not never always often sometimes usually please ask keep make use do does did dont is are was were be been being has have had " +
    "can could would should will may might must shall what which who whom whose why how where there here after before for from in on at to of with without by " +
    "as about above below into onto over under instead prefer avoid give let list write read pick add skip tell try say see show find choose check note " +
    "one two three first second next last now today tomorrow yesterday yes more most less least many much very too again still even because since though although " +
    "however honestly really maybe perhaps thanks thank hi hello hey dear ok okay well actually overall also anyway lately recently mostly " +
    "members member plays play ideas idea agent agents week weeks lists runs run set sets roger zack cora " +
    "mark bill max rose grace hope faith joy june april august dawn art ray sky pat sue rich frank chase hunter page summer autumn amber ruby jack guy don gene " +
    "jean lane dale glen rob will victor sunny penny angel august bob dot eve ivy jay kit lily neil sandy terry"
  ).split(/\s+/),
);

const CAP = /^\p{Lu}/u;
const NAME_TOKEN = new RegExp(`[\\p{L}\\p{N}]+(?:['${SQ}][\\p{L}\\p{N}]+)*`, "gu");
const POSSESSIVE = new RegExp(`['${SQ}]s$`, "u");
const key = (w: string) => w.replace(POSSESSIVE, "");
const lc = (w: string) => w.toLowerCase().replace(APOS, "");
const OPENERS = new RegExp(`["'(*_\\[${SQ}${ch(0x201c, 0x201d)}]*$`, "u");

/** A token at the start of a line (after list or heading marks), or after a sentence's end. */
function sentenceInitial(flat: string, at: number): boolean {
  const lineStart = flat.lastIndexOf("\n", at - 1) + 1;
  const before = flat.slice(lineStart, at).replace(OPENERS, "");
  return /^\s*(?:(?:[-*+>]|\d+[.)]|#{1,6})\s+)*$/.test(before) || /[.!?:;]\s+$/.test(before);
}

export type EvidenceNames = { words: Set<string>; seqs: string[][] };

/**
 * Capitalised words in member-written evidence, and runs of two or more of
 * them: a third party's name ("Acme", "Dana Whitfield") is caught by its shape,
 * whoever it belongs to. Leading everyday words are dropped from a run.
 */
export function evidenceNames(memberTexts: string[]): EvidenceNames {
  const words = new Set<string>();
  const seqs: string[][] = [];
  for (const t of memberTexts) {
    const flat = normalise(t);
    let run: string[] = [];
    let lastEnd = -1;
    const flush = () => {
      while (run.length && COMMON_WORDS.has(lc(run[0]))) run.shift();
      if (run.length >= 2) seqs.push(run);
      run = [];
    };
    for (const m of flat.matchAll(NAME_TOKEN)) {
      const w = key(m[0]);
      if (!CAP.test(w) || [...w].length < 2) {
        flush();
        continue;
      }
      words.add(w);
      if (run.length && !/^[ \t]+$/.test(flat.slice(lastEnd, m.index))) flush();
      run.push(w);
      lastEnd = m.index + m[0].length;
    }
    flush();
  }
  return { words, seqs };
}

const baseWordCache = new Map<string, Set<string>>();
function baseWords(base: string): Set<string> {
  let set = baseWordCache.get(base);
  if (!set) {
    set = new Set([...normalise(base).matchAll(NAME_TOKEN)].map((m) => lc(key(m[0]))));
    if (baseWordCache.size > 16) baseWordCache.clear();
    baseWordCache.set(base, set);
  }
  return set;
}

/**
 * Spans of `text` (normalised) holding a capitalised word, or a run of them,
 * that member evidence holds and the base file never does, in any case. A
 * capitalised everyday word at the start of a sentence is not a name.
 */
export function thirdPartySpans(text: string, ev: EvidenceNames, base: string): [number, number][] {
  const flat = normalise(text);
  const known = baseWords(base);
  const spans: [number, number][] = [];
  for (const m of flat.matchAll(NAME_TOKEN)) {
    const w = key(m[0]);
    if (!CAP.test(w) || !ev.words.has(w) || known.has(lc(w))) continue;
    if (COMMON_WORDS.has(lc(w)) && sentenceInitial(flat, m.index)) continue;
    spans.push([m.index, m.index + m[0].length]);
  }
  const baseFlat = normalise(base);
  for (const seq of ev.seqs) {
    const body = seq.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    if (new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu").test(baseFlat)) continue;
    for (const m of flat.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "gu"))) spans.push([m.index, m.index + m[0].length]);
  }
  return merge(spans);
}

// ---------------------------------------------------------------- guardrails

/** Sections whose edits need a second read, by the start of their `## ` heading. */
export const GUARDRAIL_SECTIONS: Record<InstructionFile, string[]> = Object.fromEntries(
  INSTRUCTION_FILES.map((f) => [
    f,
    f === CORA_METHOD_FILE
      ? // "What Cora does" is two sentences, one of them the privacy promise; "Privacy" is the rest of it.
        ["## Which plays count", "## What Cora does", "## Privacy"]
      : [
          "## Security rules",
          "## Ban list",
          "## Sensitive uses",
          "## The private matching profile",
          "## The member's own rules",
          "## How the run is delivered",
          "## How the shared collection is handled",
        ],
  ]),
) as Record<InstructionFile, string[]>;

const GUARD_WORDS: [RegExp, string][] = [
  [/\b(?:privacy|private|anonymi[sz]\w*|personal)\b/i, "privacy"],
  [/\b(?:secur\w*|safety|guardrails?)\b/i, "security"],
  [/\b(?:keys?|passwords?|credentials?|tokens?|secrets?)\b/i, "keys"],
  [/\b(?:send|sends|sending|sent|deliver\w*|upload\w*|post|posts|posting)\b/i, "sending"],
  [/\b(?:share|shares|shared|sharing|consent\w*)\b/i, "sharing"],
  [/\b(?:names?|e-?mails?|clients?|identif\w*|anonym\w*|redact\w*)\b/i, "identities"],
  [/\b(?:verbatim|word for word|full text|raw|quot(?:e|es|ed|ing))\b/i, "verbatim text"],
];

/**
 * Why a hunk needs a second read: the guardrail sections its range touches,
 * what its added text mentions, a removed line that mentions any of it
 * (anywhere in the file), and a new markdown heading.
 */
export function guardrailReasons(path: InstructionFile, fileText: string, hunk: Hunk): string[] {
  const reasons: string[] = [];
  for (const s of sectionsTouched(fileText, hunk.start_line, hunk.end_line)) {
    if (GUARDRAIL_SECTIONS[path].some((g) => s.startsWith(g))) reasons.push(`${path}: edits the section "${s.replace(/^## /, "")}"`);
  }
  const ops = lineDiff(hunk.old_text, hunk.new_text);
  const added = ops.filter((o) => o.op === "+").map((o) => o.line);
  const removed = ops.filter((o) => o.op === "-").map((o) => o.line);
  for (const [re, what] of GUARD_WORDS) if (re.test(added.join("\n"))) reasons.push(`${path}: the added text mentions ${what}`);
  for (const [re, what] of GUARD_WORDS) if (removed.some((l) => re.test(l))) reasons.push(`${path}: removes a line that mentions ${what}`);
  if (added.some((l) => /^\s{0,3}#{1,6}\s/.test(l))) reasons.push(`${path}: adds a heading`);
  return reasons;
}
