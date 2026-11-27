/**
 * The words the Pages screens use for what the registry holds (plan U5): the
 * address of a page's editing screen, the name of a field as the owner reads
 * it, and what each name in braces stands for.
 *
 * The owner never reads an id. A field of a list item is named by the item's
 * place on the page and its current wording, "Step 2 — “Collect” · Headline"
 * (fieldLabelWith, ./caption.ts), and never by the item's id, so he never
 * has to count. The place is the built-in order; once lists can be reordered
 * (U7) it should follow the order the draft has. The admin log keeps the
 * place alone, "Step 2: Headline": it holds no wording.
 *
 * Pure. A client component must not import this file (it reaches the
 * registry, and through it the settings reader): a server component works
 * the words out and hands them over as props.
 */
import type { AmountName } from "../amounts";
import { fullName, itemTitle } from "./caption";
import { siteRegistry, type Field, type Page, type Registry } from "./registry";

/** Where the Pages screens live. */
export const PAGES_ADDRESS = "/admin/pages";
export const REVIEW_ADDRESS = "/admin/pages/review";

/** The last part of an editing screen's address, where a page's id would not read well in an address bar. */
const slugs: Record<string, string> = { howItWorks: "how-it-works", library: "use-cases" };

export const pageSlug = (pageId: string): string => (Object.hasOwn(slugs, pageId) ? slugs[pageId] : pageId);

/** The address of a page's editing screen. */
export const editorAddress = (pageId: string): string => `${PAGES_ADDRESS}/${pageSlug(pageId)}`;

/** The page an editing screen's address names, or null. */
export function pageBySlug(slug: string, registry: Registry = siteRegistry): Page | null {
  return registry.pages.find((page) => pageSlug(page.id) === slug) ?? null;
}

/** One line under a page's name on the Pages screen: what it covers. */
const covers: Record<string, string> = {
  home: "The homepage.",
  howItWorks: "The week, Zack, Cora, the anatomy of an idea and the first weeks.",
  library: "The page’s own headings and lines. The use cases themselves are on the Use cases screen.",
  faq: "Every question and answer. The homepage shows some of them too.",
  about: "The line above the letter, and the letter.",
  shared: "The header, the footer, the buttons, the price words and the page-not-found text. These show on every page.",
};

export const pageCovers = (pageId: string): string => (Object.hasOwn(covers, pageId) ? covers[pageId] : "");

/**
 * What the owner should know about a section before switching it off or moving it (plan U6), where its name does
 * not say it: what it is when it has no words of its own, when it shows, and what else follows it.
 */
export function sectionNotes(pageId: string, sectionId: string, registry: Registry = siteRegistry): string[] {
  if (sectionId === "startBand") return ["The start button with the line under it. Its words are under Shared."];
  if (pageId === "home" && sectionId === "testimonials") return ["Shows on the page only while at least one testimonial is cleared (Website, Testimonials)."];
  if (pageId === "home" && sectionId === "questions") return ["Shows the homepage’s questions from the FAQ page, in the FAQ page’s order. A group switched off on the FAQ page is left out here too."];
  if (pageId === "library" && sectionId === "rows") return ["The list of use cases, with its search. The use cases themselves are on the Use cases screen."];
  if (pageId === "library" && sectionId === "intro") return ["Holds the page’s main heading."];
  if (pageId === "home" && sectionId === "hero") return ["Holds the page’s main heading."];
  // /faq's own sections are the question groups.
  if (pageId === "faq" && registry.pages.find((page) => page.id === "faq")?.sections.some((section) => section.id === sectionId && !section.fixed)) {
    return ["Switched off, this group’s questions leave the FAQ page, and the homepage’s Questions section leaves them out too."];
  }
  return [];
}

/**
 * The ids of an editing screen's own parts: the block that holds a section's words, and the heading of the panel
 * that lists the page's sections. Each carries the page, because two editing screens can be in the document
 * together: Next keeps the screen a click has left, hidden, and several pages have a section with the same id
 * ("title"). An id that is there twice sends a link, a label or getElementById to whichever copy comes first
 * (docs/solutions/ui-bugs/next16-hidden-page-runs-mount-effects-again-…).
 */
export const sectionAnchor = (pageId: string, sectionId: string): string => `section-${pageSlug(pageId)}-${sectionId}`;
export const sectionsAnchor = (pageId: string): string => `sections-${pageSlug(pageId)}`;

/** The id a field's box has in the editing screen's markup, so that a link can land on it. */
export const fieldAnchor = (fieldId: string): string => `field-${fieldId}`;

export type FieldLabel = {
  /** The item the field belongs to, by its place: "Step 2". Null for a field that is not part of an item. */
  group: string | null;
  /** What the field is: "Headline". */
  name: string;
  /** Both, for a list of changes and for a screen reader: "Step 2: Headline". */
  full: string;
};

/** Every field's name as the owner reads it. An item is numbered by its place among the built-in items of its list. */
export function fieldLabels(registry: Registry = siteRegistry): Map<string, FieldLabel> {
  const places = new Map<string, string[]>();
  const out = new Map<string, FieldLabel>();
  for (const field of registry.fields.values()) {
    if (!field.item?.noun) {
      out.set(field.id, { group: null, name: field.name, full: field.name });
      continue;
    }
    const seen = places.get(field.item.array) ?? [];
    if (!seen.includes(field.item.id)) seen.push(field.item.id);
    places.set(field.item.array, seen);
    const group = `${field.item.noun} ${seen.indexOf(field.item.id) + 1}`;
    out.set(field.id, { group, name: field.name, full: `${group}: ${field.name}` });
  }
  return out;
}

const siteLabels = fieldLabels();

/** One field's name as the owner reads it. */
export function fieldLabel(field: Field, registry: Registry = siteRegistry): FieldLabel {
  const labels = registry === siteRegistry ? siteLabels : fieldLabels(registry);
  return labels.get(field.id) ?? { group: null, name: field.name, full: field.name };
}

/**
 * The field whose wording says which item a field belongs to: the first field of that item, in the order the owner
 * reads them (a question's Question, a step's Label, a point's Title). Null for a field outside a numbered item.
 * For the first field itself it is that field.
 */
export function captionField(field: Field, registry: Registry = siteRegistry): Field | null {
  if (!field.item?.noun) return null;
  for (const entry of registry.fields.values()) {
    if (entry.item && entry.item.array === field.item.array && entry.item.id === field.item.id) return entry;
  }
  return null;
}

/**
 * One field's name with the wording of its item beside the item's place, so the owner never has to count:
 * "Question 3 — “What do I have to do each week?” · Answer". `wordingOf` gives a field's wording as the screen
 * shows it (the draft, with or without its amounts filled in). `item` is the item alone, null outside one.
 */
export function fieldLabelWith(field: Field, wordingOf: (fieldId: string) => string, registry: Registry = siteRegistry): FieldLabel & { item: string | null } {
  const label = fieldLabel(field, registry);
  const caption = captionField(field, registry);
  if (label.group === null || !caption) return { ...label, item: null };
  const wording = wordingOf(caption.id);
  return { ...label, item: itemTitle(label.group, wording), full: fullName(label.group, wording, label.name) };
}

/** Where a field is, for a list that spans pages: "Home, Hero". */
export function fieldPlace(field: Field, registry: Registry = siteRegistry): { page: string; section: string } {
  const page = registry.pages.find((entry) => entry.id === field.page);
  const section = page?.sections.find((entry) => entry.id === field.section);
  return { page: page?.label ?? "", section: section?.label ?? "" };
}

/**
 * What each name in braces stands for, in the owner's words, to follow "{name} shows". Every amount a line may name
 * has an entry (the type holds this file to it), and so have the two names of a brick-stack caption.
 */
export const placeholderWords: Record<AmountName | "week" | "bricks", string> = {
  monthlyUsd: "the monthly price in US dollars",
  monthlyCad: "the monthly price in Canadian dollars",
  listUsd: "the price of one list at a time in US dollars",
  listCad: "the price of one list at a time in Canadian dollars",
  higherUsd: "the higher monthly price, with sharing off, in US dollars",
  higherCad: "the higher monthly price, with sharing off, in Canadian dollars",
  freeLists: "how many lists are free, as a word",
  firstPaidList: "which list is the first paid one, as a word",
  firstPaidWeek: "the number of the week payment starts in",
  lastFreeList: "which list is the last free one, as a word",
  trialCloseDays: "how many days an unused trial stays open",
  retentionDays: "how many days runs are kept",
  week: "the week number of the stack on screen",
  bricks: "the number of ideas in the stack on screen",
};

/** What a name in braces stands for, or null for a name that is none. */
export const wordsFor = (name: string): string | null => (Object.hasOwn(placeholderWords, name) ? placeholderWords[name as keyof typeof placeholderWords] : null);
