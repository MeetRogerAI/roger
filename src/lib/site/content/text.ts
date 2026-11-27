/**
 * What every piece of stored site text goes through (plan KTD10, KTD12): the
 * tidy applied to what an admin typed, the check on the names it holds in
 * braces, and the check on an address a link may point at.
 *
 * Pure, and with no knowledge of which field a text belongs to: the registry
 * (./registry.ts) says which names a field may hold and which tidy it takes.
 */
import { amountNames } from "../amounts";

/**
 * Characters that print nothing, written as escapes so that this file shows what it removes. Text pasted from a
 * document can carry them. Left in, one inside a word hides that word from the claims check while the page still
 * reads the same, and a direction mark can show a line's words in another order than the one that was checked.
 *
 *   00AD            the soft hyphen
 *   034F            the combining grapheme joiner
 *   061C            the Arabic letter mark
 *   115F 1160       the Hangul fillers, and 3164 and FFA0 below
 *   17B4 17B5       the Khmer vowels that print nothing
 *   180B-180F       the Mongolian variation selectors and vowel separator
 *   200B-200F       zero-width spaces and joiners, and the two direction marks
 *   202A-202E       the direction embeddings and overrides
 *   2060-206F       the word joiner, the unseen operators and the direction isolates
 *   FE00-FE0F       the variation selectors (the site prints no emoji, which is all they would be needed for)
 *   FEFF            the byte order mark
 *   FFF9-FFFB       the annotation marks
 *   1D173-1D17A     the musical format marks
 *   E0000-E0FFF     the tag characters and the other variation selectors
 *   \p{Cs}          half of a pair: with the "u" flag this matches only a surrogate that has lost its other half,
 *                   which no page can print and which Postgres refuses inside JSON
 */
const UNSEEN = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB\u{1D173}-\u{1D17A}\u{E0000}-\u{E0FFF}\p{Cs}]/gu;

const LINE_FEED = 10;

/** A control character: the first block (tab and the line breaks included), delete, and the second block. */
const isControl = (code: number) => code < 32 || (code >= 127 && code < 160);

/** The two separators Unicode has for a line and a paragraph, which a document can carry in place of a line break. */
const isSeparator = (code: number) => code === 0x2028 || code === 0x2029;

/**
 * A letter and its accent as one character where Unicode has one (NFC), so that the same word typed on two
 * keyboards, or pasted from a document, is the same text: equal to the built-in wording when it reads the same
 * (plan KTD6), and found by the wording rules either way.
 */
const composed = (text: string) => text.normalize("NFC");
// Both tidies remove the unseen characters BEFORE composing: one left between a letter and its accent would keep
// the two apart, and a second tidy would then give another text than the first.

/**
 * One line of text: line breaks and runs of spaces become one space, and characters no page should print are
 * removed. Every built-in wording is already what this gives (a test holds the copy to it), so a field saved
 * without a change is equal to its baseline.
 */
export function plainLine(text: string): string {
  let out = "";
  for (const ch of composed(text.replace(UNSEEN, ""))) out += isControl(ch.codePointAt(0) ?? 0) ? " " : ch;
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Several lines of text, for a field printed as paragraphs or as a playbook: the same characters are removed, line
 * breaks are kept as "\n" whatever the keyboard sent, the spaces at the end of a line go, and more than one empty
 * line in a row becomes one. The spaces at the start of a line and inside it stay, because a playbook's lists are
 * indented.
 */
export function plainBlock(text: string): string {
  let out = "";
  for (const ch of composed(text.replace(UNSEEN, "")).replace(/\r\n?/g, "\n")) {
    const code = ch.codePointAt(0) ?? 0;
    if (isSeparator(code)) out += "\n";
    else out += code !== LINE_FEED && isControl(code) ? " " : ch;
  }
  return out
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "")
    .trimEnd();
}

/**
 * Every amount a line of copy may name, as fillAmounts knows them. The names do not depend on the settings, only
 * the values do, so they are read once from amounts that are all zero.
 */
export const amountPlaceholderNames: readonly string[] = Object.keys(
  amountNames({ monthly: { USD: 0, CAD: 0 }, list: { USD: 0, CAD: 0 }, higher: { USD: 0, CAD: 0 }, freeLists: 0, trialCloseDays: 0, retentionDays: 0 }),
);

/** A name as it is written in copy: "{monthlyUsd}". */
export const asPlaceholder = (name: string): string => `{${name}}`;

/** Every amount as an admin types it, for the line that lists them: "{monthlyUsd}", "{monthlyCad}" and the rest. */
export const amountPlaceholders: readonly string[] = amountPlaceholderNames.map(asPlaceholder);

/** The names a text holds in braces, in the order written, each once. The pattern is fillAmounts' own. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
}

/** The first name in braces that is not one of `allowed`, as written ("{monthlyUsdd}"), or null when every name is. */
export function unknownPlaceholder(text: string, allowed: readonly string[]): string | null {
  const bad = placeholdersIn(text).find((name) => !allowed.includes(name));
  return bad === undefined ? null : asPlaceholder(bad);
}

/** The longest address a link may hold. */
export const DESTINATION_MAX = 500;

const BACKSLASH = 92;

/**
 * True for an address a link may point at (plan KTD12): a path on this site, which starts with exactly one "/";
 * an "https://" address with a host; or a "mailto:" address. Everything else is refused where it is typed and
 * dropped where it is read, because the address is printed into an href and "javascript:" must never reach one.
 *
 * No space, control character or backslash anywhere: a browser reads "/\evil.test" and "/<tab>/evil.test" as
 * another site's address. The scheme is matched as written, in lower case.
 */
export function usableDestination(value: unknown): value is string {
  if (typeof value !== "string" || value === "" || value.length > DESTINATION_MAX) return false;
  if (/\s/.test(value) || value.replace(UNSEEN, "") !== value) return false;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (isControl(code) || code === BACKSLASH) return false;
  }
  if (value.startsWith("/")) return !value.startsWith("//");
  if (value.startsWith("mailto:")) return value.length > "mailto:".length;
  if (!value.startsWith("https://")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "";
  } catch {
    return false;
  }
}
