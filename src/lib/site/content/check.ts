/**
 * What the Pages screens work out from the stored content before anything is
 * saved or published (plan U5, KTD10, KTD11):
 *
 *   tidyFor, saveRefusal   what a save does to typed text, and the few things
 *                          it refuses: only what would break a page.
 *   draftChanges           every field whose draft wording is not what the
 *                          site shows now. This is what a publish would change.
 *   pageStatus             the same, counted per page, for the Pages screen.
 *   wordingWarnings        the wording rules those changes break. A warning
 *                          never blocks: the owner may publish anyway, and
 *                          each one published is written to the admin log.
 *   reviewKey              a fingerprint of the draft and its warnings, so a
 *                          publish goes through only for the review the owner
 *                          actually read.
 *
 * The wording rules run on ONE FIELD AT A TIME, on its text with the amounts
 * filled in, under its page's address and the zones the page prints it in
 * (src/lib/site/claims.ts). A page is not rendered here: react-dom/server may
 * not be imported into the app's server layer.
 *
 * Pure but for the fingerprint's hash. Nothing here reads the database.
 */
import { createHash } from "node:crypto";
import { compoundingFinal, compoundingNumbers } from "@/data/site/compounding";
import { fillAmounts, type Amounts } from "../amounts";
import { checkClaims, textPage, type RuleId } from "../claims";
import { captionNames } from "../compounding";
import type { Overlay } from "./format";
import { baseline, textAt } from "./model";
import { siteRegistry, type Field, type Registry } from "./registry";
import { canonical } from "./store";
import { asPlaceholder, placeholdersIn, plainBlock, plainLine, unknownPlaceholder, usableDestination } from "./text";

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

/** What was typed, as it is stored: one line for a line, tidy paragraphs for a block, and an address without the spaces around it. */
export function tidyFor(field: Field, typed: string): string {
  if (field.kind === "block") return plainBlock(typed);
  if (field.kind === "destination") return typed.trim();
  return plainLine(typed);
}

/**
 * The longest typed text a save reads. Far over any field's limit, so a text that is too long is refused by its
 * length and never cut. A text longer than this is refused unread (tooLongToRead): its length is not measured, so
 * no message may state one.
 */
export const TYPED_MAX = 50_000;

/** The refusal for a text over TYPED_MAX, which the editing screen never sends (it refuses far below that itself). */
export const tooLongToRead = (field: Field): string => `This is far longer than fits here: the most is ${field.max} characters. Shorten it and save again.`;

/**
 * Why a tidied text cannot be saved in this field, in the owner's words, or null when it can (plan KTD10). Only
 * what would break a page is refused: no words at all, more than the field holds, a name in braces that does not
 * exist, and an address a link may not point at. Whether the wording is wise is a warning at publish, not this.
 */
export function saveRefusal(field: Field, text: string): string | null {
  if (plainLine(text) === "") return "This cannot be left empty. To get the first wording back, use “Reset to the original wording”.";
  if (text.length > field.max) return `This is ${text.length} characters long, and the most that fits here is ${field.max}. Shorten it by ${text.length - field.max}.`;
  if (field.kind === "destination") return usableDestination(text) ? null : "This is not an address a link can use. Start it with “/” for a page of this site, or with “https://”.";
  const unknown = unknownPlaceholder(text, field.placeholders);
  if (unknown) return `${unknown} is not a name this text can use, so it would show on the page as typed. Check the spelling. The names that work here: ${field.placeholders.map(asPlaceholder).join(", ")}.`;
  return null;
}

// ---------------------------------------------------------------------------
// What a publish would change
// ---------------------------------------------------------------------------

/** A field's wording under an overlay on the baseline: the overlay's entry, or the original wording. */
export function wordingOf(overlay: Overlay, fieldId: string, base: unknown = baseline, registry: Registry = siteRegistry): string {
  return Object.hasOwn(overlay.text, fieldId) ? overlay.text[fieldId] : (textAt(base, fieldId, registry) ?? "");
}

export type Change = {
  field: Field;
  /** What the site shows now. */
  from: string;
  /** What the draft would make it show. */
  to: string;
  /** True when the draft goes back to the original wording. */
  toOriginal: boolean;
};

/** Every field whose draft wording differs from what is published, in the order the pages and their sections are listed. */
export function draftChanges(content: { draft: Overlay; published: Overlay }, base: unknown = baseline, registry: Registry = siteRegistry): Change[] {
  const touched = new Set([...Object.keys(content.draft.text), ...Object.keys(content.published.text)]);
  const out: Change[] = [];
  for (const field of registry.fields.values()) {
    if (!touched.has(field.id)) continue;
    const from = wordingOf(content.published, field.id, base, registry);
    const to = wordingOf(content.draft, field.id, base, registry);
    if (from !== to) out.push({ field, from, to, toOriginal: !Object.hasOwn(content.draft.text, field.id) });
  }
  return out;
}

export type PageStatus = {
  /** Fields whose draft is not published yet. */
  drafts: number;
  /** Fields whose draft wording differs from the original. */
  edits: number;
};

/** For each page, how many fields have a draft waiting and how many differ from the original wording. */
export function pageStatus(content: { draft: Overlay; published: Overlay }, base: unknown = baseline, registry: Registry = siteRegistry): Map<string, PageStatus> {
  const out = new Map<string, PageStatus>(registry.pages.map((page) => [page.id, { drafts: 0, edits: 0 }]));
  for (const change of draftChanges(content, base, registry)) out.get(change.field.page)!.drafts++;
  for (const id of Object.keys(content.draft.text)) {
    const field = registry.fields.get(id);
    if (field && content.draft.text[id] !== textAt(base, id, registry)) out.get(field.page)!.edits++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The wording rules
// ---------------------------------------------------------------------------

/** Each rule in plain words, to follow "it" or "this text": moved here from the Edit Questions screen, which refused on them. */
export const ruleWords: Record<RuleId, string> = {
  vocabulary: "it says “agent” without “AI” in front",
  "bare-dollar": "it has a dollar sign without its country (write an amount as {monthlyUsd} or {monthlyCad})",
  "time-saved": "it makes a claim about time saved",
  income: "it makes a claim about income",
  "user-count": "it makes a claim about how many people use Roger",
  number: "it has a number that does not come from the settings",
  "exclamation-emoji": "it has an exclamation mark or an emoji",
  hype: "it uses a hype word",
  brokerage: "it names a brokerage",
};

export type WordingWarning = {
  field: Field;
  rule: RuleId;
  /** The rule in plain words: ruleWords. */
  says: string;
  /** Each place the text breaks it: the words, and the words around them. */
  found: { words: string; around: string }[];
};

/** A text as a page prints it: amounts filled, and a caption's two names given the numbers of the last stack. Null when it names something that does not exist. */
function printed(text: string, amounts: Amounts): string | null {
  try {
    return fillAmounts(text, amounts).replaceAll("{week}", String(compoundingFinal.week)).replaceAll("{bricks}", String(compoundingFinal.bricks));
  } catch {
    return null;
  }
}

/**
 * A text as a visitor reads it, for the review: every name in braces replaced by what the page prints there. The
 * owner types "{monthlyUsd}" and reads "US$200". A text that names something that does not exist stays as typed.
 */
export function asRead(text: string, amounts: Amounts): string {
  return printed(text, amounts) ?? text;
}

/**
 * What each name in braces of a text was filled with by asRead, in the order written: the name as typed, what it
 * shows, and whether that is an amount from Settings (a caption's two names are the last picture's numbers instead).
 */
export function namesFilled(text: string, amounts: Amounts): { name: string; shows: string; fromSettings: boolean }[] {
  const out: { name: string; shows: string; fromSettings: boolean }[] = [];
  for (const name of placeholdersIn(text)) {
    const typed = asPlaceholder(name);
    const shows = printed(typed, amounts);
    if (shows !== null && shows !== typed) out.push({ name: typed, shows, fromSettings: !captionNames.includes(name) });
  }
  return out;
}

/**
 * The wording rules the changes break, one entry for each field and rule (plan KTD10, R16). Only text that differs
 * from what is published is checked, so a wording the owner has already published over a warning is not listed
 * again. A field going back to its original wording is not checked: that wording is the site's own.
 */
export function wordingWarnings(changes: readonly Change[], amounts: Amounts): WordingWarning[] {
  const out: WordingWarning[] = [];
  for (const change of changes) {
    if (change.toOriginal || change.field.kind === "destination") continue;
    const text = printed(change.to, amounts);
    if (text === null) continue;
    const found = checkClaims(textPage(change.field.claims.path, [text], change.field.claims.zones), { amounts, compounding: compoundingNumbers });
    // The text as the rules read it: one line.
    const read = text.replace(/\s+/g, " ").trim();
    const mine: WordingWarning[] = [];
    for (const violation of found) {
      const place = { words: violation.found, around: around(read, violation.context.trim(), violation.found) };
      const entry = mine.find((warning) => warning.rule === violation.rule);
      if (entry) entry.found.push(place);
      else mine.push({ field: change.field, rule: violation.rule, says: ruleWords[violation.rule], found: [place] });
    }
    // A rule's patterns can find one claim several times over ("5 hours", "hours a week", "save 5 hours a week").
    // The longest wording says it, once. A shorter one stays only when the text has it somewhere else as well:
    // "agent" in one sentence and "agents" in the next are two places.
    for (const warning of mine) {
      warning.found = warning.found.filter((place) => {
        const inside = warning.found.filter((other) => other.words.length > place.words.length && other.words.includes(place.words));
        return inside.length === 0 || times(read, place.words) > inside.reduce((sum, other) => sum + times(other.words, place.words), 0);
      });
    }
    out.push(...mine);
  }
  return out;
}

/**
 * The words around a find, for the owner to read. The rules hand back a fixed number of characters either side, which
 * can start or end inside a word: a cut end loses its broken word and gets "…" in its place.
 */
function around(text: string, context: string, words: string): string {
  let out = context;
  if (!text.startsWith(context)) out = `… ${out.replace(/^\S*\s+/, "")}`;
  if (!text.endsWith(context)) out = `${out.replace(/\s+\S*$/, "")} …`;
  return out.includes(words) ? out : context;
}

/** How often `part` is in `text`. */
const times = (text: string, part: string) => text.split(part).length - 1;

/**
 * A fingerprint of what a review shows: the draft, what is on the site now, and the warnings the draft raises. The
 * publish button carries it, and the publish goes through only when all three still give the same one (plan
 * KTD11): a save from another tab, or a price changed in Settings, sends the owner back to read the list again.
 *
 * What is on the site now is part of it because the list is "what will change": after an undo in another tab the
 * same draft would change more texts than the list the owner read.
 */
export function reviewKey(content: { draft: Overlay; published: Overlay }, warnings: readonly WordingWarning[]): string {
  const listed = warnings.map((warning) => [warning.field.id, warning.rule, warning.found.map((place) => place.words)]);
  return createHash("sha256").update(canonical(content.draft)).update("\n").update(canonical(content.published)).update("\n").update(JSON.stringify(listed)).digest("hex");
}
