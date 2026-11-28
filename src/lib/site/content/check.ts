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
 *   linkWarnings           the links the draft would draw that would land
 *                          nowhere: on a section it switches off, or an item
 *                          it removes (R17).
 *   headingWarnings        a page the draft leaves without its main heading.
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
import { siteConfig } from "@/data/config";
import { compoundingFinal, compoundingNumbers } from "@/data/site/compounding";
import { fillAmounts, type Amounts } from "../amounts";
import { checkClaims, textPage, type RuleId } from "../claims";
import { captionNames } from "../compounding";
import { shortened } from "./caption";
import type { Overlay } from "./format";
import { applyOverlay, baseline, layoutOn, listItems, readField, sameLayout, sectionLayout, textAt, type Layout } from "./model";
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
 * What a link may point at (plan KTD12), in the owner's words: the refusal of every other address. A page of this
 * site, another site's "https://" address, or an email address; nothing else, because whatever is typed here is
 * what a visitor's browser is told to open.
 */
export const DESTINATION_REFUSAL =
  "A link cannot point there. Pick a page from the list, or type an address that starts with “/” for a page of this site (such as /faq), with “https://” for another site, or with “mailto:” for an email address. It cannot hold spaces or braces.";

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
  if (field.kind === "destination") return usableDestination(text) ? null : DESTINATION_REFUSAL;
  const unknown = unknownPlaceholder(text, field.placeholders);
  if (unknown && field.placeholders.length === 0) return `${unknown} is not something this text can hold: a name in braces would be read as an amount, and this text has none. Take out the braces, or write it another way.`;
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
// Links that would go nowhere (plan R17, U9), and a page left without its main heading
// ---------------------------------------------------------------------------

/**
 * The links of the page bodies, as the code draws them. Each is named by the field that holds its words, and its
 * address is the copy's (`at`, a path in the model) or the page's code's. `from` is the section it is drawn in: a
 * link in a section that is not on the page is not on the site.
 *
 * Together with the header's and the footer's links (chromeLinks), which an admin edits and types, this is every
 * link the covered pages draw to a covered page. The start buttons go to sign-up, and Privacy and Terms to pages
 * Pages does not cover. A test holds this list to the copy: a link in the copy with an address that is not here
 * fails it.
 */
const bodyLinks: readonly { label: string; href: string | { at: string }; where: string; from: { page: string; section: string } | null }[] = [
  // v1.ts, control.link.
  { label: "control.link.label", href: { at: "control.link.href" }, where: "on the homepage, under “You decide what Zack shares”", from: { page: "home", section: "control" } },
  // v1.ts, questionsBlock.more.
  { label: "questionsBlock.more.label", href: { at: "questionsBlock.more.href" }, where: "on the homepage, under the questions", from: { page: "home", section: "questions" } },
  // v1.ts, howItWorks.noAgent.link.
  { label: "howItWorks.noAgent.link.label", href: { at: "howItWorks.noAgent.link.href" }, where: "on the How it works page, under “If you have no AI agent yet”", from: { page: "howItWorks", section: "noAgent" } },
  // src/app/library/page.tsx, "#watch".
  { label: "library.watchLink", href: "#watch", where: "at the top of the Use cases page", from: { page: "library", section: "intro" } },
  // src/app/not-found.tsx, "/".
  { label: "notFound.home", href: "/", where: "on the page a visitor sees for an address that does not exist", from: null },
];

/** The copy's own addresses that bodyLinks reads, for the test that holds the list to the copy. */
export const BODY_LINK_ADDRESSES: readonly string[] = bodyLinks.flatMap((link) => (typeof link.href === "string" ? [] : [link.href.at]));

/**
 * The places inside a list's items that a link can land on: the homepage's examples, each one's tab, panel and card
 * (src/components/site/v1/blocks/sections.tsx, ExamplesSection, and example-tabs.tsx). An address such as
 * "/#examples-paper" opens the homepage on that example.
 */
const itemAnchors: readonly { list: string; page: string; section: string; item: (anchor: string) => string | null }[] = [
  {
    list: "examples",
    page: "home",
    section: "examples",
    item: (anchor) => /^examples-(.+)-card$/.exec(anchor)?.[1] ?? /^examples-tab-(.+)$/.exec(anchor)?.[1] ?? /^examples-(.+)$/.exec(anchor)?.[1] ?? null,
  },
];

/** The sections that hold their page's main heading, its one "h1": without them the page has none. Every other covered page's title is fixed. */
export const MAIN_HEADINGS: readonly { page: string; section: string }[] = [
  // src/components/site/v1/home.tsx, "hero-title".
  { page: "home", section: "hero" },
  // src/app/library/page.tsx, "library-title".
  { page: "library", section: "intro" },
];

/** The header's and the footer's two lists of links, and where each is. */
const CHROME_LISTS = [
  { list: "nav", where: "in the header" },
  { list: "footer.links", where: "in the footer" },
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A value of the model by its path: "control.link.href". */
const pathIn = (model: unknown, path: string): unknown => path.split(".").reduce<unknown>((value, key) => (isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined), model);

/** A link the draft would draw: its words, its address, where it is, the section it is in, and the field the owner changes it in. */
type DrawnLink = { label: string; href: string; where: string; from: { page: string; section: string } | null; field: Field | undefined };

/** This site's own addresses written out in full: production, its www name and preview, whose content is released to it. */
const SITE_HOSTS: readonly string[] = (() => {
  const host = new URL(siteConfig.domain).hostname;
  return [host, `www.${host}`, `preview.${host}`];
})();

/**
 * The page and the place on it that an address lands on, for an address with a "#": "/#price", "/faq#cost",
 * "https://meetroger.ai/#price", "#watch" (on the page the link is on). Null for an address with no "#", for
 * another site's, and for a page Pages does not cover: those land where they say, whatever the drafts do.
 */
function landsOn(href: string, fromPage: Page | undefined, registry: Registry): { page: Page; anchor: string } | null {
  let pathname: string;
  let hash: string;
  if (href.startsWith("#")) {
    if (!fromPage) return null;
    [pathname, hash] = [fromPage.path, href.slice(1)];
  } else if ((href.startsWith("/") && !href.startsWith("//")) || href.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(href, "https://site.invalid");
    } catch {
      return null;
    }
    // The site's own pages written out in full ("https://meetroger.ai/#price") land where the short address does.
    if (href.startsWith("https://") && !SITE_HOSTS.includes(url.hostname)) return null;
    pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    hash = url.hash.slice(1);
  } else return null;
  try {
    hash = decodeURIComponent(hash);
  } catch {
    // Left as typed.
  }
  if (hash === "") return null;
  const page = registry.pages.find((entry) => entry.id !== "shared" && entry.path === pathname);
  return page ? { page, anchor: hash } : null;
}

/** What the draft does to a page's sections and lists, as the pages would draw them. */
function drawing(content: { draft: Overlay }, base: unknown, registry: Registry) {
  const model = applyOverlay(base, content.draft, registry);
  const layouts = new Map<string, Layout>();
  const layout = (pageId: string) => {
    if (!layouts.has(pageId)) layouts.set(pageId, layoutOn(content.draft, pageId, base, registry));
    return layouts.get(pageId)!;
  };
  const isOff = (pageId: string, sectionId: string) => layout(pageId).off.includes(sectionId);
  /**
   * True when a section that is on draws nothing at all, as its page's code has it: the examples with every example
   * removed, the homepage's questions with none ticked for it (or every group of them off on /faq), and a group of
   * /faq with no question left. Testimonials depend on quotes cleared elsewhere, and are taken to be there.
   */
  const isEmpty = (pageId: string, sectionId: string) => {
    if (pageId === "home" && sectionId === "examples") return listItems(model, "examples", registry).length === 0;
    const groups = (pathIn(model, "questions") as { id: string; items: { on: readonly string[] }[] }[] | undefined) ?? [];
    if (pageId === "home" && sectionId === "questions") {
      const faq = layout("faq");
      return !groups.some((group) => faq.order.includes(group.id) && !faq.off.includes(group.id) && group.items.some((item) => item.on.includes("home")));
    }
    if (pageId === "faq") {
      const group = groups.find((entry) => entry.id === sectionId);
      if (group) return group.items.length === 0;
    }
    return false;
  };
  const isShown = (at: { page: string; section: string } | null) => at === null || (!isOff(at.page, at.section) && !isEmpty(at.page, at.section));
  return { model, isOff, isEmpty, isShown };
}

/**
 * Every link the draft would draw that lands on a covered page: the header's and the footer's as the draft has
 * them, typed or picked, and the page bodies' own. A link with the same words and address in both of the chrome's
 * lists is one entry, "in the header and in the footer of every page", as it is for "Pricing" as built. A link in a
 * section the draft does not show is not drawn, and is not here.
 */
function drawnLinks(content: { draft: Overlay }, base: unknown, registry: Registry): DrawnLink[] {
  const { model, isShown } = drawing(content, base, registry);
  const chrome: { label: string; href: string; lists: string[]; field: Field | undefined }[] = [];
  for (const { list, where } of CHROME_LISTS) {
    if (!registry.lists.has(list)) continue;
    for (const item of listItems(model, list, registry)) {
      const [label, href] = ["label", "href"].map((key) => resolveField(`${list}.${item}.${key}`, registry));
      const words = label ? (readField(model, label) ?? "") : "";
      const address = href ? (readField(model, href) ?? "") : "";
      const same = chrome.find((entry) => entry.label === words && entry.href === address);
      if (same) {
        if (!same.lists.includes(where)) same.lists.push(where);
      } else chrome.push({ label: words, href: address, lists: [where], field: href });
    }
  }
  const out: DrawnLink[] = chrome.map((entry) => ({ label: entry.label, href: entry.href, where: `${entry.lists.join(" and ")} of every page`, from: null, field: entry.field }));
  for (const link of bodyLinks) {
    if (!isShown(link.from)) continue;
    const href = typeof link.href === "string" ? link.href : pathIn(model, link.href.at);
    if (typeof href !== "string") continue;
    out.push({ label: wordingOf(content.draft, link.label, base, registry), href, where: link.where, from: link.from, field: resolveField(link.label, registry) });
  }
  return out;
}

/** Each drawn link that lands on a place of a covered page: the section it lands in, and the item for an item's place. */
function linksToPlaces(content: { draft: Overlay }, base: unknown, registry: Registry) {
  const out: { link: DrawnLink; page: Page; section: Section; item: { list: List; id: string } | null }[] = [];
  for (const link of drawnLinks(content, base, registry)) {
    const lands = landsOn(link.href, registry.pages.find((page) => page.id === link.from?.page), registry);
    if (!lands) continue;
    const { page, anchor } = lands;
    const section = page.sections.find((entry) => entry.anchor === anchor);
    if (section) {
      out.push({ link, page, section, item: null });
      continue;
    }
    for (const spot of itemAnchors) {
      const list = registry.lists.get(spot.list);
      const id = spot.page === page.id ? spot.item(anchor) : null;
      const inSection = page.sections.find((entry) => entry.id === spot.section);
      // An id the list has never had (no built-in item, no item added here) is not an item's place: "examples-title" is the heading's.
      if (!list || !id || !inSection || (!listItems(base, list.id, registry).includes(id) && !isAddedId(id))) continue;
      out.push({ link, page, section: inSection, item: { list, id } });
      break;
    }
  }
  return out;
}

/** The site's own links that land on a section, each as words to follow "The": "“Pricing” link in the header and in the footer of every page". For the note beside the section's switch. */
export function linksInto(content: { draft: Overlay }, pageId: string, sectionId: string, base: unknown = baseline, registry: Registry = siteRegistry): string[] {
  return linksToPlaces(content, base, registry)
    .filter((place) => place.item === null && place.page.id === pageId && place.section.id === sectionId)
    .map((place) => `“${place.link.label}” link ${place.link.where}`);
}

export type LinkWarning = {
  /** The page the link lands on, and the section of it. */
  page: Page;
  section: Section;
  /**
   * Why it would go nowhere. "off": the section is switched off. "empty": the section is on but has nothing left to
   * show, so the page does not draw it. "removed": the item it lands on is not in its list.
   */
  kind: "off" | "empty" | "removed";
  /** For "removed", and for a link to an item's place: the list and the item. */
  item: { list: List; id: string } | null;
  /** Where the link lands, as the page's address and the place: "/#price", "/#examples-paper". */
  href: string;
  /** The link's words, as the draft has them. */
  link: string;
  /** The field the owner changes the link in: its address for a header or footer link, its words for one the code places. */
  field: Field | undefined;
  /** The whole of it, as a sentence the owner reads. */
  says: string;
};

/**
 * The links the draft would draw that would land nowhere (plan R17, AE3): on a section the draft switches off or
 * leaves with nothing to show, or on an item of a list that the draft removes. Every link the pages draw to a
 * covered page counts, built-in or added, picked from the list or typed ("/#price", "/library#watch",
 * "/#examples-paper"). A link to a page and not to a place on it, to another site, or to a page Pages does not
 * cover, never warns. A link whose own section is not on the page is not on the site, and is not listed either.
 *
 * A warning, like the wording ones: it never blocks a publish. It is not an override of a wording rule, and is not
 * written to the admin log.
 */
export function linkWarnings(content: { draft: Overlay }, base: unknown = baseline, registry: Registry = siteRegistry): LinkWarning[] {
  const { model, isOff, isEmpty } = drawing(content, base, registry);
  const out: LinkWarning[] = [];
  for (const { link, page, section, item } of linksToPlaces(content, base, registry)) {
    const removed = item !== null && !listItems(model, item.list.id, registry).includes(item.id);
    const kind = isOff(page.id, section.id) ? "off" : isEmpty(page.id, section.id) ? "empty" : removed ? "removed" : null;
    if (!kind) continue;
    const lands = page.id === "home" ? "the top of the homepage" : `the top of the ${page.label} page`;
    const anchor = item ? itemAnchorOf(link.href) : section.anchor;
    const noun = item?.list.item?.toLowerCase() ?? "item";
    const named = item ? shortened(wordingOf(content.draft, fieldsOfItem(item.list, item.id, registry)[0]?.id ?? "", base, registry)) : "";
    const what = item ? (named ? `the ${noun} “${named}”` : `an ${noun} that is no longer in the list`) : `the “${section.label}” section`;
    const why =
      kind === "off"
        ? item
          ? `which is in the “${section.label}” section, and that section is switched off`
          : "which is switched off"
        : kind === "empty"
          ? `${item ? `which is in the “${section.label}” section, and that section` : "which"} has nothing left to show, so the page leaves it out`
          : `which is removed from the list`;
    out.push({
      page,
      section,
      kind,
      item,
      href: `${page.path === "/" ? "/" : page.path}#${anchor}`,
      link: link.label,
      field: link.field,
      says: `The “${link.label}” link ${link.where} points at ${what} ${item ? "on" : "of"} ${page.label}, ${why}. A visitor who presses it lands at ${lands} instead.`,
    });
  }
  return out;
}

/** The place a link names after its "#". */
const itemAnchorOf = (href: string): string => {
  const at = href.indexOf("#");
  try {
    return decodeURIComponent(href.slice(at + 1));
  } catch {
    return href.slice(at + 1);
  }
};

export type HeadingWarning = {
  page: Page;
  /** The section that holds the page's main heading, which the draft switches off. */
  section: Section;
  says: string;
};

/**
 * The pages the draft leaves without a main heading (plan U9): the homepage with its Hero switched off, the Use
 * cases page with its Introduction switched off. The page still works, but nothing on it says what it is in the one
 * heading that search engines and screen readers go by. A warning: it never blocks a publish and is not logged.
 */
export function headingWarnings(content: { draft: Overlay }, base: unknown = baseline, registry: Registry = siteRegistry): HeadingWarning[] {
  const out: HeadingWarning[] = [];
  for (const spot of MAIN_HEADINGS) {
    const page = registry.pages.find((entry) => entry.id === spot.page);
    const section = page?.sections.find((entry) => entry.id === spot.section);
    if (!page || !section || !layoutOn(content.draft, page.id, base, registry).off.includes(section.id)) continue;
    const name = page.id === "home" ? "The homepage" : `The ${page.label} page`;
    out.push({
      page,
      section,
      says: `${name} would have no main heading: its “${section.label}” section, which holds the page’s headline, is switched off. Visitors still see the rest of the page, but search engines and screen readers use that headline to tell what the page is about.`,
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
