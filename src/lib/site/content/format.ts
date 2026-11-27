/**
 * The one shape every layer of stored site content has (plan KTD2): a site's
 * draft, what it has published, what it had published before, and the release
 * file src/data/site/released.json. An overlay says how its layer differs from
 * the one below, and nothing else.
 *
 *   format    the number below. A reader that meets another number reads nothing.
 *   text      field id -> the wording, amounts still written as {names}.
 *             The fields of an item added in the admin are here too, under
 *             that item's id.
 *   sections  page id -> { order, off }: the page's section ids in the order
 *             to show them, and the ones switched off.
 *   lists     list id -> { order, removed, added }: item ids. An added item's
 *             id starts with "x-".
 *
 * Field, section and list ids are the registry's (./registry.ts). Nothing in
 * an overlay is addressed by its place in a list (plan KTD3).
 *
 * Two readers. `parseOverlay` is lenient: it keeps what a page can use, drops
 * the rest, and never throws, so content written by older or newer code, or
 * by hand, cannot break a page (plan R18). `parseOverlayStrict` accepts only
 * what the code could have written itself, and says what is wrong: it is for
 * the release file, where a dropped entry would be a silent loss.
 */
import { z } from "zod";
import { ADDED_PREFIX, ID_MAX, ID_PATTERN, isId, siteRegistry, usableValue, type Registry } from "./registry";

export const OVERLAY_FORMAT = 1;

/** The most items one list, or one page's section order, may hold. A bound for storage, not for layout. */
export const LIST_MAX = 30;
/** The longest text any one entry may hold, whatever its field. A field's own limit is smaller (registry). */
export const TEXT_MAX = 20_000;
/** The most text entries an overlay may hold. */
export const TEXT_ENTRIES_MAX = 2_000;
/** The longest a field id or a list id may be. */
const PATH_MAX = 300;

export type SectionEdit = { order: string[]; off: string[] };
export type ListEdit = { order: string[]; removed: string[]; added: string[] };

export type Overlay = {
  format: number;
  text: Record<string, string>;
  sections: Record<string, SectionEdit>;
  lists: Record<string, ListEdit>;
};

/** An overlay that changes nothing. Frozen: it is the default wherever an overlay is optional, so it must not be written to. Use newOverlay for one to fill. */
export const emptyOverlay: Overlay = Object.freeze({ format: OVERLAY_FORMAT, text: Object.freeze({}), sections: Object.freeze({}), lists: Object.freeze({}) });

/** A new overlay that changes nothing, to add entries to. */
export const newOverlay = (): Overlay => ({ format: OVERLAY_FORMAT, text: {}, sections: {}, lists: {} });

/** True when the overlay changes nothing. */
export function isEmptyOverlay(overlay: Overlay): boolean {
  return Object.keys(overlay.text).length === 0 && Object.keys(overlay.sections).length === 0 && Object.keys(overlay.lists).length === 0;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The usable ids of a stored array, each once, in the order written, and no more than a list may hold. */
function idsOf(value: unknown, keep: (id: string) => boolean = () => true): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const id of value) {
    if (out.length >= LIST_MAX) break;
    if (isId(id) && keep(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * A stored value as an overlay: only what a page can use (plan R18). Never throws.
 *
 * Dropped: anything that is not an overlay of this format; a text entry for a field the registry does not have,
 * or whose value the field cannot print (not text, empty, a name in braces the field may not hold, an address a
 * link may not point at); a section entry for an unknown page, and in it any id that is not a section of that page
 * an admin may move; a list entry for an unknown list, and in it anything that is not an id. An item id in a list
 * entry is NOT checked against the built-in items here: the layer below may have added it, so that is decided
 * where the overlay is applied.
 */
export function parseOverlay(value: unknown, registry: Registry = siteRegistry): Overlay {
  const out = newOverlay();
  if (!isRecord(value) || value.format !== OVERLAY_FORMAT) return out;

  if (isRecord(value.text)) {
    let kept = 0;
    for (const [id, text] of Object.entries(value.text)) {
      if (kept >= TEXT_ENTRIES_MAX) break;
      const field = registry.fields.get(id);
      if (!field || !usableValue(field, text) || text.length > TEXT_MAX) continue;
      out.text[id] = text;
      kept++;
    }
  }

  if (isRecord(value.sections)) {
    for (const page of registry.pages) {
      const edit = Object.hasOwn(value.sections, page.id) ? value.sections[page.id] : undefined;
      if (!isRecord(edit)) continue;
      const movable = (id: string) => page.sections.some((section) => section.id === id && !section.fixed);
      const entry = { order: idsOf(edit.order, movable), off: idsOf(edit.off, movable) };
      if (entry.order.length + entry.off.length > 0) out.sections[page.id] = entry;
    }
  }

  if (isRecord(value.lists)) {
    for (const id of registry.lists.keys()) {
      const edit = Object.hasOwn(value.lists, id) ? value.lists[id] : undefined;
      if (!isRecord(edit)) continue;
      const entry = { order: idsOf(edit.order), removed: idsOf(edit.removed), added: idsOf(edit.added, (item) => item.startsWith(ADDED_PREFIX)) };
      if (entry.order.length + entry.removed.length + entry.added.length > 0) out.lists[id] = entry;
    }
  }
  return out;
}

const id = z.string().max(ID_MAX).regex(ID_PATTERN);
const ids = z
  .array(id)
  .max(LIST_MAX)
  .refine((list) => new Set(list).size === list.length, "holds an id twice");

/** The shape alone, with its bounds: every key present, no other key, nothing over its limit. */
export const overlaySchema = z.strictObject({
  format: z.literal(OVERLAY_FORMAT),
  text: z.record(z.string().max(PATH_MAX), z.string().max(TEXT_MAX)).refine((text) => Object.keys(text).length <= TEXT_ENTRIES_MAX, "holds too many entries"),
  sections: z.record(z.string().max(PATH_MAX), z.strictObject({ order: ids, off: ids })),
  lists: z.record(z.string().max(PATH_MAX), z.strictObject({ order: ids, removed: ids, added: ids })),
});

export type StrictResult = { ok: true; overlay: Overlay } | { ok: false; problems: string[] };

/**
 * A value as an overlay, or everything that is wrong with it (plan KTD13). It passes only when the shape is exact
 * and every part is known to the registry: each text entry is for a field that exists, is within that field's
 * limit and is something the field can print; each section entry is for a covered page and names only sections of
 * it that an admin may move; each list entry is for a list that exists, and each added item's id starts with "x-".
 */
export function parseOverlayStrict(value: unknown, registry: Registry = siteRegistry): StrictResult {
  const shape = overlaySchema.safeParse(value);
  if (!shape.success) return { ok: false, problems: shape.error.issues.map((issue) => `${issue.path.join(".") || "(the overlay)"}: ${issue.message}`) };
  const overlay: Overlay = shape.data;
  const problems: string[] = [];

  // The schema's records leave out a key named "__proto__" without a word. Here nothing is left out without one.
  const written = value as Record<"text" | "sections" | "lists", Record<string, unknown>>;
  for (const part of ["text", "sections", "lists"] as const) {
    for (const key of Object.keys(written[part])) if (!Object.hasOwn(overlay[part], key)) problems.push(`${part}.${key}: not a name anything can have`);
  }

  for (const [fieldId, text] of Object.entries(overlay.text)) {
    const field = registry.fields.get(fieldId);
    if (!field) problems.push(`text.${fieldId}: no such field`);
    else if (text.length > field.max) problems.push(`text.${fieldId}: ${text.length} characters, and the most is ${field.max}`);
    else if (!usableValue(field, text)) problems.push(`text.${fieldId}: not something this field can print (empty, a name in braces it may not hold, or an address a link may not point at)`);
  }
  for (const [pageId, edit] of Object.entries(overlay.sections)) {
    const page = registry.pages.find((entry) => entry.id === pageId);
    if (!page) {
      problems.push(`sections.${pageId}: no such page`);
      continue;
    }
    for (const sectionId of new Set([...edit.order, ...edit.off])) {
      if (!page.sections.some((section) => section.id === sectionId && !section.fixed)) problems.push(`sections.${pageId}: "${sectionId}" is not a section of this page that can be moved or switched off`);
    }
  }
  for (const [listId, edit] of Object.entries(overlay.lists)) {
    if (!registry.lists.has(listId)) problems.push(`lists.${listId}: no such list`);
    for (const item of edit.added) if (!item.startsWith(ADDED_PREFIX)) problems.push(`lists.${listId}: the added item "${item}" must have an id that starts with "${ADDED_PREFIX}"`);
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, overlay };
}
