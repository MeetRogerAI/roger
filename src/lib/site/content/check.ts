/**
 * What the Pages screens work out from the stored content before anything is
 * saved or published (plan U5, KTD10, KTD11):
 *
 *   tidyFor, saveRefusal   what a save does to typed text, and the few things
 *                          it refuses: only what would break a page.
 *   draftChanges           every field whose draft wording is not what the
 *                          site shows now. This is what a publish would change.
 *   listChanges            the same for a list's items (U7): each one added,
 *                          removed, put back or moved, as a plain sentence.
 *   sectionChanges         the same for a page's sections (U6): each one
 *                          switched off or on, or moved, as a plain sentence.
 *   pageStatus             both, counted per page, for the Pages screen.
 *   linkWarnings           the site's own links that would point at a section
 *                          the draft has switched off (R17).
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
import { shortened } from "./caption";
import type { Overlay } from "./format";
import { applyOverlay, baseline, layoutOn, listItems, readField, sameLayout, sectionLayout, textAt } from "./model";
import { TOGGLE_OFF, TOGGLE_ON, fieldsOfItem, isAddedId, resolveField, siteRegistry, type Field, type List, type Page, type Registry, type Section } from "./registry";
import { canonical } from "./store";
import { asPlaceholder, placeholdersIn, plainBlock, plainLine, unknownPlaceholder, usableDestination } from "./text";

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

/** What was typed, as it is stored: one line for a line, tidy paragraphs for a block, and an address without the spaces around it. */
export function tidyFor(field: Field, typed: string): string {
  if (field.kind === "block") return plainBlock(typed);
  if (field.kind === "destination" || field.kind === "toggle") return typed.trim();
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
 *
 * `hasOriginal` is false for a text of an item added in the admin, which has no first wording to go back to.
 */
export function saveRefusal(field: Field, text: string, hasOriginal = true): string | null {
  if (field.kind === "toggle") return text === TOGGLE_ON || text === TOGGLE_OFF ? null : "This can only be switched on or off. Reload the page and try again.";
  if (plainLine(text) === "") return hasOriginal ? "This cannot be left empty. To get the first wording back, use “Reset to the original wording”." : "This cannot be left empty.";
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
  /** What the site shows now. Empty when `fresh`. */
  from: string;
  /** What the draft would make it show. */
  to: string;
  /** True when the draft goes back to the original wording. */
  toOriginal: boolean;
  /**
   * True when the field's ITEM is not on the site now: the draft adds it to its list, or puts it back. Its wording
   * is new to the site, so the wording rules read it, but it is told as part of the item's own sentence
   * (listChanges) and not as a text that changes.
   */
  fresh: boolean;
};

/** The two things a publish would swap, as what the pages would print: what the site shows now, and what the draft would make it show. */
function sides(content: { draft: Overlay; published: Overlay }, base: unknown, registry: Registry) {
  return { site: applyOverlay(base, content.published, registry), draft: applyOverlay(base, content.draft, registry) };
}

/** The lists of the registry in the order the pages and their sections are listed. */
function listsInOrder(registry: Registry): { list: List; page: Page; section: Section }[] {
  const out: { list: List; page: Page; section: Section }[] = [];
  for (const page of registry.pages) {
    for (const section of page.sections) {
      for (const list of registry.lists.values()) if (list.page === page.id && list.section === section.id) out.push({ list, page, section });
    }
  }
  return out;
}

/**
 * Every field whose wording the draft would change on the site, in the order the pages and their sections are
 * listed; an added item's fields come after its section's own.
 *
 * What is compared is what the pages would PRINT (the draft applied, against what is published applied), so a
 * field of an item the draft has removed is not here, and a field of an item the draft adds or puts back is, marked
 * `fresh`. Count the texts that change with `!change.fresh`; hand all of them to wordingWarnings.
 */
export function draftChanges(content: { draft: Overlay; published: Overlay }, base: unknown = baseline, registry: Registry = siteRegistry): Change[] {
  const touched = (overlay: Overlay) => Object.keys(overlay.text).length + Object.keys(overlay.lists).length > 0;
  if (!touched(content.draft) && !touched(content.published)) return [];
  const { site, draft } = sides(content, base, registry);
  const out: Change[] = [];
  const compare = (field: Field) => {
    const to = readField(draft, field);
    const from = readField(site, field);
    if (to === undefined || from === to) return;
    // A switch a new item leaves off is nothing to tell.
    if (from === undefined && field.toggle && to === TOGGLE_OFF) return;
    out.push({ field, from: from ?? "", to, toOriginal: to === readField(base, field), fresh: from === undefined });
  };
  for (const page of registry.pages) {
    for (const section of page.sections) {
      for (const field of section.fields) compare(field);
      for (const list of registry.lists.values()) {
        if (list.page !== page.id || list.section !== section.id) continue;
        for (const item of listItems(draft, list.id, registry)) if (isAddedId(item)) for (const field of fieldsOfItem(list, item, registry)) compare(field);
      }
    }
  }
  return out;
}

/** One thing a publish would change about a list's items, as a sentence the owner reads. */
export type ListChange = {
  page: Page;
  section: Section;
  list: List;
  /** The item's id. */
  item: string;
  /** "added": a new item. "back": an item of the original list that the site does not show now. "removed", and "moved": it changes its place among the items that stay. */
  kind: "added" | "back" | "removed" | "moved";
  /** The whole of it, with the page and the section: "FAQ, Getting started: a new question “…” is added, as number 3 of 6." */
  says: string;
  /** For "added" and "back": each text the item will show, in the order the owner reads them. */
  fields: { field: Field; text: string }[];
};

/**
 * What a publish would change about each list's items (plan R8), in the order the pages are listed: first the
 * items removed, then the ones added or put back, then the ones that move, each in the order the page shows them.
 *
 * An item is named by its wording (its first field: a question's question, a step's label), shortened, as a
 * visitor reads it: `read` fills the amounts in. A move is told for as few items as explain the new order, as for
 * sections, and only among the items that are on the site both before and after.
 */
export function listChanges(content: { draft: Overlay; published: Overlay }, base: unknown = baseline, registry: Registry = siteRegistry, read: (text: string) => string = (text) => text): ListChange[] {
  if (Object.keys(content.draft.lists).length + Object.keys(content.published.lists).length === 0) return [];
  const { site, draft } = sides(content, base, registry);
  const out: ListChange[] = [];
  for (const { list, page, section } of listsInOrder(registry)) {
    if (!Object.hasOwn(content.draft.lists, list.id) && !Object.hasOwn(content.published.lists, list.id)) continue;
    const from = listItems(site, list.id, registry);
    const to = listItems(draft, list.id, registry);
    const original = listItems(base, list.id, registry);
    const noun = list.item.toLowerCase();
    const where = `${page.label}, ${section.label}`;
    const fieldsIn = (model: unknown, item: string) => fieldsOfItem(list, item, registry).flatMap((field) => {
      const text = readField(model, field);
      return text === undefined ? [] : [{ field, text }];
    });
    const name = (model: unknown, item: string) => `“${shortened(read(fieldsIn(model, item)[0]?.text ?? ""))}”`;
    for (const [at, item] of from.entries()) {
      if (!to.includes(item)) out.push({ page, section, list, item, kind: "removed", says: `${where}: ${noun} ${at + 1} ${name(site, item)} is removed.`, fields: [] });
    }
    for (const [at, item] of to.entries()) {
      if (from.includes(item)) continue;
      const place = `as number ${at + 1} of ${to.length}`;
      const back = original.includes(item);
      out.push({ page, section, list, item, kind: back ? "back" : "added", says: back ? `${where}: ${noun} ${name(draft, item)} is put back, ${place}.` : `${where}: a new ${noun} ${name(draft, item)} is added, ${place}.`, fields: fieldsIn(draft, item) });
    }
    const before = from.filter((item) => to.includes(item));
    const after = to.filter((item) => from.includes(item));
    const still = kept(before, after);
    for (const [at, item] of after.entries()) {
      if (still.has(item)) continue;
      const up = at < before.indexOf(item);
      const says = up ? `${where}: ${noun} ${name(draft, item)} moves up, above ${name(draft, after[at + 1])}.` : `${where}: ${noun} ${name(draft, item)} moves down, below ${name(draft, after[at - 1])}.`;
      out.push({ page, section, list, item, kind: "moved", says, fields: [] });
    }
  }
  return out;
}

/** One thing a publish would change about a page's sections, as a sentence the owner reads. */
export type SectionChange = {
  page: Page;
  section: Section;
  /** "off" and "on": the section is switched. "moved": it changes its place among the page's sections. */
  kind: "off" | "on" | "moved";
  /** The whole of it, with the page: "Home: the “Price” section will be switched off." */
  says: string;
};

/** The longest run of ids that is in both orders, in the same order: the sections that keep their places relative to each other. */
function kept(a: readonly string[], b: readonly string[]): Set<string> {
  const run: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) run[i][j] = a[i] === b[j] ? run[i + 1][j + 1] + 1 : Math.max(run[i + 1][j], run[i][j + 1]);
  const out = new Set<string>();
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      out.add(a[i]);
      i++;
      j++;
      // On a tie (two neighbours changed places) the one that went up is the one said to move.
    } else if (run[i + 1][j] > run[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/**
 * What a publish would change about each page's sections (plan R7), in the order the pages are listed: first the
 * sections switched off or back on, then the ones that move, each in the order the draft shows them.
 *
 * A move is told for as few sections as explain the new order: where "Questions" and "Price" have changed places,
 * "Questions" moves up, and "Price" is not also listed as moving down. Each is placed by its new neighbour.
 */
export function sectionChanges(content: { draft: Overlay; published: Overlay }, base: unknown = baseline, registry: Registry = siteRegistry): SectionChange[] {
  const out: SectionChange[] = [];
  for (const page of registry.pages) {
    if (!Object.hasOwn(content.draft.sections, page.id) && !Object.hasOwn(content.published.sections, page.id)) continue;
    const from = layoutOn(content.published, page.id, base, registry);
    const to = layoutOn(content.draft, page.id, base, registry);
    const section = (id: string) => page.sections.find((entry) => entry.id === id)!;
    const name = (id: string) => `“${section(id).label}”`;
    for (const id of to.order) {
      const [was, is] = [from.off.includes(id), to.off.includes(id)];
      if (was !== is) out.push({ page, section: section(id), kind: is ? "off" : "on", says: `${page.label}: the ${name(id)} section will be switched ${is ? "off" : "back on"}.` });
    }
    const still = kept(from.order, to.order);
    for (const [at, id] of to.order.entries()) {
      if (still.has(id)) continue;
      const up = at < from.order.indexOf(id);
      const says = up ? `${page.label}: ${name(id)} moves up, above ${name(to.order[at + 1])}.` : `${page.label}: ${name(id)} moves down, below ${name(to.order[at - 1])}.`;
      out.push({ page, section: section(id), kind: "moved", says });
    }
  }
  return out;
}

export type PageStatus = {
  /** What is saved as a draft and not published yet: fields whose wording would change, changes to the page's sections, and changes to its lists. */
  drafts: number;
  /** Texts whose draft wording differs from the original, among those the draft shows (not those of an item it removes). */
  edits: number;
  /** Tick boxes of items ("Show on the homepage") the draft has the other way from the original. Not texts. */
  ticks: number;
  /** True when the draft has the page's sections in another order than the original, or one of them switched the other way. */
  rearranged: boolean;
  /** True when the draft has one of the page's lists with other items than the original, or in another order. */
  relisted: boolean;
};

/** For each page, how many changes have a draft waiting, how many fields differ from the original wording, and whether its sections do. */
export function pageStatus(content: { draft: Overlay; published: Overlay }, base: unknown = baseline, registry: Registry = siteRegistry): Map<string, PageStatus> {
  const out = new Map<string, PageStatus>(registry.pages.map((page) => [page.id, { drafts: 0, edits: 0, ticks: 0, rearranged: false, relisted: false }]));
  for (const change of draftChanges(content, base, registry)) if (!change.fresh) out.get(change.field.page)!.drafts++;
  for (const change of sectionChanges(content, base, registry)) out.get(change.page.id)!.drafts++;
  for (const change of listChanges(content, base, registry)) out.get(change.page.id)!.drafts++;
  const drafted = Object.keys(content.draft.text).length > 0 ? applyOverlay(base, content.draft, registry) : base;
  for (const id of Object.keys(content.draft.text)) {
    const field = resolveField(id, registry);
    // A text of an item the draft itself added has no original to differ from: the item is counted with its list.
    const original = textAt(base, id, registry);
    // And the wording the draft keeps for an item it removes is on no page: that item is counted with its list too.
    const shows = field ? readField(drafted, field) : undefined;
    if (!field || original === undefined || shows === undefined || shows === original) continue;
    if (field.kind === "toggle") out.get(field.page)!.ticks++;
    else out.get(field.page)!.edits++;
  }
  for (const page of registry.pages) out.get(page.id)!.rearranged = !sameLayout(layoutOn(content.draft, page.id, base, registry), sectionLayout(base, page.id, registry));
  for (const list of registry.lists.values()) if (Object.hasOwn(content.draft.lists, list.id)) out.get(list.page)!.relisted = true;
  return out;
}

/** How many changes are saved as a draft and not published yet, on all pages: the count the Pages screens show, and the number of rows in the review's list. */
export function draftCount(content: { draft: Overlay; published: Overlay }, base: unknown = baseline, registry: Registry = siteRegistry): number {
  let count = 0;
  for (const status of pageStatus(content, base, registry).values()) count += status.drafts;
  return count;
}

// ---------------------------------------------------------------------------
// Links that would point at a section that is switched off (plan R17)
// ---------------------------------------------------------------------------

/**
 * The links the site's own code draws to a section of a covered page, as they are today. Each is named by the
 * field that holds its words, so the warning can quote the link as the owner has worded it.
 *
 * THIS IS THE WHOLE OF WHAT THIS UNIT WARNS ABOUT. Links an admin types, links to an item of a list, and a page
 * left without its main heading are U9's, which replaces this table with the links the draft would render.
 */
const builtInLinks: readonly { label: string; where: string; from: { page: string; section: string } | null; to: { page: string; section: string } }[] = [
  // chrome.ts, PRICE_SECTION_HREF: the header and the footer, on every page.
  { label: "nav.pricing", where: "in the header and in the footer of every page", from: null, to: { page: "home", section: "price" } },
  // v1.ts, control.link.href.
  { label: "control.link.label", where: "on the homepage, under “You decide what Zack shares”", from: { page: "home", section: "control" }, to: { page: "howItWorks", section: "zack" } },
  // src/app/library/page.tsx, "#watch".
  { label: "library.watchLink", where: "at the top of the Use cases page", from: { page: "library", section: "intro" }, to: { page: "library", section: "watch" } },
];

/** The site's own links that land on a section, each as words to follow "The": "“Pricing” link in the header and in the footer of every page". For the note beside the section's switch. */
export function linksInto(content: { draft: Overlay }, pageId: string, sectionId: string, base: unknown = baseline, registry: Registry = siteRegistry): string[] {
  return builtInLinks.filter((link) => link.to.page === pageId && link.to.section === sectionId).map((link) => `“${wordingOf(content.draft, link.label, base, registry)}” link ${link.where}`);
}

export type LinkWarning = {
  /** The page and the section that is switched off. */
  page: Page;
  section: Section;
  /** The address the link has: "/#price". */
  href: string;
  /** The link's words, as the draft has them. */
  link: string;
  /** The whole of it, as a sentence the owner reads. */
  says: string;
};

/**
 * The links that would point at a section the draft has switched off (plan R17, AE3). A warning, like the wording
 * ones: it never blocks a publish. It is not an override of a wording rule, and is not written to the admin log.
 * A link whose own section is switched off too is not on the site, and is not listed.
 */
export function linkWarnings(content: { draft: Overlay }, base: unknown = baseline, registry: Registry = siteRegistry): LinkWarning[] {
  const out: LinkWarning[] = [];
  const isOff = (at: { page: string; section: string }) => layoutOn(content.draft, at.page, base, registry).off.includes(at.section);
  for (const link of builtInLinks) {
    const page = registry.pages.find((entry) => entry.id === link.to.page);
    const section = page?.sections.find((entry) => entry.id === link.to.section);
    if (!page || !section || section.anchor === null || !isOff(link.to) || (link.from && isOff(link.from))) continue;
    const words = wordingOf(content.draft, link.label, base, registry);
    const lands = page.id === "home" ? "the top of the homepage" : `the top of the ${page.label} page`;
    out.push({
      page,
      section,
      href: `${page.path === "/" ? "/" : page.path}#${section.anchor}`,
      link: words,
      says: `The “${words}” link ${link.where} points at the “${section.label}” section of ${page.label}, which is switched off. A visitor who presses it lands at ${lands} instead.`,
    });
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
    if (change.toOriginal || change.field.kind === "destination" || change.field.kind === "toggle") continue;
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
