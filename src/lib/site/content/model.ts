/**
 * The words a page prints, as layers (plan KTD1). Pure: nothing here reads
 * the database or the clock.
 *
 *   the code model     src/data/site/v1.ts and letter.ts, as written (./registry.ts)
 *   the release file   src/data/site/released.json, an overlay on the code model
 *   a site's own edits an overlay on those two together, from its database
 *
 * "Built-in wording" means the first two together: the BASELINE. One function,
 * applyOverlay, puts an overlay on a model, and it is used for both steps.
 * diffToOverlay goes the other way: what one model changes in another, as an
 * overlay. With the two, any stack of layers can be written as one overlay on
 * the code model, which is what a page's view is handed.
 *
 * TEXT AND SECTIONS ARE APPLIED. An overlay's `lists` are parsed and carried,
 * and not yet applied: they arrive in U7 and U8, behind these same functions.
 * mergeOrder is the one rule sections and lists are ordered by (plan KTD4).
 *
 * WHERE A PAGE'S SECTIONS ARE KEPT. A model is the copy's shape, and the copy
 * has no place for "which sections, in which order". So each model has its
 * pages' LAYOUTS beside it, held here by the model object itself (a WeakMap):
 * applyOverlay gives the model it returns the layouts its overlay asks for,
 * and diffToOverlay and normaliseOverlay read them from the models they are
 * handed. A model nothing was applied to has the code's layout: every section
 * on, in the registry's order. A COPY of a model ({ ...model }) is a new
 * object and has the code's layout again: read a layout from the model
 * applyOverlay returned, never from a copy of it.
 */
import releasedFile from "@/data/site/released.json";
import { v1Zack, type V1Copy, type V1ZackCopy } from "@/data/site/v1";
import { fillCopy, type Amounts } from "../amounts";
import { emptyOverlay, isEmptyOverlay, newOverlay, parseOverlay, type Overlay, type SectionEdit } from "./format";
import { codeModel, siteRegistry, type Registry, type SiteCopy } from "./registry";

export { codeModel, type SiteCopy };

/** What is at a field's path in a model: an object's key, or the item of a list that has that id. Undefined when the model has no such place. */
function valueAt(model: unknown, path: readonly string[]): unknown {
  let node = model;
  for (const part of path) {
    if (Array.isArray(node)) node = node.find((item: unknown) => typeof item === "object" && item !== null && (item as { id?: unknown }).id === part);
    else if (typeof node === "object" && node !== null && Object.hasOwn(node, part)) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return node;
}

/** A field's wording in a model, by the field's id. Undefined for an id the registry does not have, or where the model has no text there. */
export function textAt(model: unknown, fieldId: string, registry: Registry = siteRegistry): string | undefined {
  const field = registry.fields.get(fieldId);
  const text = field ? valueAt(model, field.path) : undefined;
  return typeof text === "string" ? text : undefined;
}

/**
 * The model with `text` at the path, sharing everything off the path with the model it came from. Only a string
 * is ever replaced: where the model has no such place, or holds something else there, the model comes back as it is.
 */
function withTextAt<T>(node: T, path: readonly string[], text: string): T {
  if (path.length === 0) return (typeof node === "string" ? text : node) as T;
  const [part, ...rest] = path;
  if (Array.isArray(node)) {
    const at = node.findIndex((item: unknown) => typeof item === "object" && item !== null && (item as { id?: unknown }).id === part);
    if (at === -1) return node;
    const next = withTextAt(node[at], rest, text);
    return next === node[at] ? node : (node.map((item: unknown, i: number) => (i === at ? next : item)) as T);
  }
  if (typeof node === "object" && node !== null && Object.hasOwn(node, part)) {
    const current = (node as Record<string, unknown>)[part];
    const next = withTextAt(current, rest, text);
    return next === current ? node : ({ ...node, [part]: next } as T);
  }
  return node;
}

/**
 * A model with an overlay on it (plan KTD1). The overlay is read leniently first, so only what a page can print
 * is applied: an entry for a field the registry does not have, for an item the model does not have, or with a
 * value the field cannot print, changes nothing, and the wording below shows through (plan R18).
 *
 * The model is not changed. With nothing to apply, the same model comes back.
 */
export function applyOverlay<M>(model: M, overlay: Overlay, registry: Registry = siteRegistry): M {
  const read = parseOverlay(overlay, registry);
  let out = model;
  for (const [id, text] of Object.entries(read.text)) out = withTextAt(out, registry.fields.get(id)!.path, text);

  // The sections of each page (plan KTD4): the model's own layouts are carried, with the overlay's entries on them.
  const below = isModel(model) ? layouts.get(model) : undefined;
  const next: Record<string, Layout> = { ...below };
  let moved = false;
  for (const [pageId, edit] of Object.entries(read.sections)) {
    const before = sectionLayout(model, pageId, registry);
    const after = applySectionEdit(before, edit);
    if (sameLayout(before, after)) continue;
    next[pageId] = after;
    moved = true;
  }
  if (!isModel(out) || (!moved && (out === model || !below))) return out;
  // A layout is held by the object: one that changes needs an object of its own, so the model handed in keeps its.
  if (out === model) out = { ...out };
  layouts.set(out as object, next);
  return out;
}

/**
 * What `model` changes in `base`, as an overlay on `base`: every registered field whose text differs. Applied to
 * `base` again it gives `model`'s wording, wherever that wording is something its field can print.
 */
export function diffToOverlay(base: unknown, model: unknown, registry: Registry = siteRegistry): Overlay {
  const out = newOverlay();
  for (const field of registry.fields.values()) {
    const text = valueAt(model, field.path);
    if (typeof text === "string" && text !== valueAt(base, field.path)) out.text[field.id] = text;
  }
  for (const page of registry.pages) {
    const edit = diffSectionEdit(sectionLayout(base, page.id, registry), sectionLayout(model, page.id, registry));
    if (edit) out.sections[page.id] = edit;
  }
  return out;
}

/**
 * An overlay as it is stored and compared (plan KTD6): read leniently, and without any text entry that says what
 * `base` already says. An entry equal to the base is not an edit, so once a release makes a site's edit the
 * built-in wording, the entry stops counting and is gone the next time anything is saved.
 *
 * The same as diffToOverlay(base, applyOverlay(base, overlay)) for text and for sections: a page's entry is
 * written the one way diffSectionEdit writes it, and an entry that leaves the page's sections as `base` has them
 * is gone, so no empty entry is ever stored. List entries are carried as they were read: comparing them with the
 * base arrives with U7.
 */
export function normaliseOverlay(base: unknown, overlay: unknown, registry: Registry = siteRegistry): Overlay {
  const read = parseOverlay(overlay, registry);
  const out: Overlay = { ...read, text: {}, sections: {} };
  for (const [id, text] of Object.entries(read.text)) if (text !== valueAt(base, registry.fields.get(id)!.path)) out.text[id] = text;
  for (const [pageId, stored] of Object.entries(read.sections)) {
    const below = sectionLayout(base, pageId, registry);
    const edit = diffSectionEdit(below, applySectionEdit(below, stored));
    if (edit) out.sections[pageId] = edit;
  }
  return out;
}

/**
 * The order of a list or of a page's sections, from the ids the base has and a stored order (plan KTD4). The
 * stored order is kept for the ids it names; an id the base no longer has is dropped; and a base id the stored
 * order does not name goes directly after its predecessor in the base, or first when it is the base's first.
 * So an item added in code later appears where the code put it, on a site whose stored order is older.
 */
export function mergeOrder(base: readonly string[], order: readonly string[]): string[] {
  const out = [...new Set(order)].filter((id) => base.includes(id));
  base.forEach((id, i) => {
    if (out.includes(id)) return;
    // The predecessor is already in `out`: it was named, or it was placed one step ago.
    out.splice(i === 0 ? 0 : out.indexOf(base[i - 1]) + 1, 0, id);
  });
  return out;
}

// ---------------------------------------------------------------------------
// A page's sections (plan R7, KTD4)
// ---------------------------------------------------------------------------

/**
 * A page's sections as a layer leaves them: every section an admin may move, in the order the page shows them,
 * and the ones among them that are switched off. A page's title, and everything under Shared, is in neither.
 */
export type Layout = { order: string[]; off: string[] };

/** Each model's layouts, by page id. A page that is not in it, and a model that is not, has the code's layout. */
const layouts = new WeakMap<object, Record<string, Layout>>();

const isModel = (value: unknown): value is object => typeof value === "object" && value !== null;

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
export const sameLayout = (a: Layout, b: Layout) => sameIds(a.order, b.order) && sameIds(a.off, b.off);

/** The code's layout of a page: the registry's sections an admin may move, in the registry's order, all on. Empty for a page the registry does not have. */
export function codeLayout(pageId: string, registry: Registry = siteRegistry): Layout {
  const page = registry.pages.find((entry) => entry.id === pageId);
  return { order: page ? page.sections.filter((section) => !section.fixed).map((section) => section.id) : [], off: [] };
}

/** A page's layout in a model: what the overlays applied to it have left, or the code's. */
export function sectionLayout(model: unknown, pageId: string, registry: Registry = siteRegistry): Layout {
  const held = isModel(model) ? layouts.get(model) : undefined;
  return held && Object.hasOwn(held, pageId) ? held[pageId] : codeLayout(pageId, registry);
}

/**
 * A layout with one layer's entry on it, MERGED BY ID (plan KTD4). The entry speaks for the sections it names and
 * for no other:
 *
 * - order: the entry's order for the ids it names; every other section stays directly after the section it follows
 *   in the layout below (mergeOrder). So a section added in code later appears in its code position, and an id the
 *   page no longer has is ignored.
 * - on or off: a section the entry names, in `order` or in `off`, is off when `off` holds it and on when it does
 *   not. A section the entry does not name is as the layout below has it.
 *
 * So `{ order: [], off: ["price"] }` switches Price off and leaves everything else to the layer below, and
 * `{ order: ["price"], off: [] }` switches Price back on where the layer below has it off, without moving anything.
 */
export function applySectionEdit(below: Layout, edit: SectionEdit | undefined): Layout {
  if (!edit) return below;
  const order = mergeOrder(below.order, edit.order);
  return { order, off: order.filter((id) => edit.off.includes(id) || (below.off.includes(id) && !edit.order.includes(id))) };
}

/**
 * The entry that turns the layout `below` into `layout`, written the one way it is ever stored, or null when the
 * two are the same: an entry that changes nothing is never written (`{ order: [], off: [] }` is not an edit).
 *
 * The entry names as little as it can, so that a later change in the layer below still shows through: the whole
 * order only when the order differs, and otherwise just the sections switched back on. `off` holds the sections
 * that would not be off without it.
 */
export function diffSectionEdit(below: Layout, layout: Layout): SectionEdit | null {
  // Held to the ids the layer below has, so the answer is an entry for this page whatever was handed in.
  const order = mergeOrder(below.order, layout.order);
  const named = sameIds(order, below.order) ? order.filter((id) => below.off.includes(id) && !layout.off.includes(id)) : order;
  const off = order.filter((id) => layout.off.includes(id) && (named.includes(id) || !below.off.includes(id)));
  return named.length + off.length === 0 ? null : { order: named, off };
}

/** The release file as an overlay on the code model. Read leniently here, so a bad file cannot take a page down; a test holds the file itself to the strict reading. */
export const releasedOverlay: Overlay = parseOverlay(releasedFile);

/** The built-in wording: the code model with the release file on it (plan KTD1). What "reset" goes back to, and what a site's own edits are compared with. */
export const baseline: SiteCopy = applyOverlay(codeModel, releasedOverlay);

/**
 * Two layers as ONE overlay on the code model, which is what a page's view is handed (plan U4): `released` is the
 * release file, an overlay on the code model, and `own` is a site's published edits, an overlay on those two
 * together. Where both hold a field, the site's edit wins. With no edits of the site's own, the result is the
 * release file alone, which is the baseline a page shows when the database cannot be read (plan R18).
 *
 * Text and sections are resolved through the models, so an entry either layer cannot print is not in the result,
 * and a page's sections are the release's with the site's own changes merged in by id (applySectionEdit). List
 * entries are not applied by anything yet (U7): they are carried, the site's entry for a list in place of the
 * release's.
 */
export function composeOverlays(released: Overlay, own: Overlay, registry: Registry = siteRegistry): Overlay {
  if (isEmptyOverlay(released) && isEmptyOverlay(own)) return emptyOverlay;
  const below = parseOverlay(released, registry);
  const above = parseOverlay(own, registry);
  const out = diffToOverlay(codeModel, applyOverlay(applyOverlay(codeModel, below, registry), above, registry), registry);
  out.lists = { ...below.lists, ...above.lists };
  return out;
}

/**
 * The copy a page prints, with every amount filled in. `overlay` is everything stored that the page should show,
 * as ONE overlay on the code model (the release file and the site's published edits together). Left out, the page
 * prints the code copy alone, which is what the tests that pin the wording render (plan KTD13). Amounts named in
 * an edit are filled like any other.
 *
 * `copy` is the version's copy file. `letter` is Peter's letter as /about prints it, which is his wording and not
 * the site's, so it is handed over beside the copy and not inside it. `zack` is the free Zack run's copy, which
 * Pages does not cover.
 */
/** An overlay's section entries alone, read leniently like everything stored. */
const sectionEdits = (overlay: Overlay, registry: Registry) => (Object.keys(overlay.sections).length === 0 ? {} : parseOverlay({ ...emptyOverlay, sections: overlay.sections }, registry).sections);

/**
 * A page's layout under an overlay on `base`. For a page's view, the overlay is everything stored as ONE overlay on
 * the code model, and `base` is the code model. For the Pages screens, the overlay is a site's draft or what it
 * has published, and `base` is the baseline.
 */
export function layoutOn(overlay: Overlay, pageId: string, base: unknown = baseline, registry: Registry = siteRegistry): Layout {
  const edits = sectionEdits(overlay, registry);
  return applySectionEdit(sectionLayout(base, pageId, registry), Object.hasOwn(edits, pageId) ? edits[pageId] : undefined);
}

/**
 * The sections of a page that are on, in the order the page shows them, as ids of the registry. `overlay` is what a
 * page's view is handed: everything stored, as ONE overlay on the code model. Left out, it is the code's order with
 * every section on. Fixed sections (a page's title) are not among them: the page prints those where it always has.
 */
export function sectionsShown(pageId: string, overlay: Overlay = emptyOverlay, registry: Registry = siteRegistry): string[] {
  const layout = layoutOn(overlay, pageId, codeModel, registry);
  return layout.order.filter((id) => !layout.off.includes(id));
}

/**
 * The question groups /faq shows, in its order: the copy's groups that are switched on as sections of /faq. The
 * homepage takes its questions from these too, so a group switched off on /faq is off on both pages, and the
 * homepage's questions keep the order of /faq.
 */
export function questionGroupsShown<G extends { id: string }>(groups: readonly G[], overlay: Overlay = emptyOverlay): G[] {
  return sectionsShown("faq", overlay).flatMap((id) => groups.filter((group) => group.id === id));
}

export function v1Copy(amounts: Amounts, overlay: Overlay = emptyOverlay): { copy: V1Copy; letter: SiteCopy["letter"]; zack: V1ZackCopy } {
  const { letter, ...copy } = fillCopy(applyOverlay(codeModel, overlay), amounts);
  return { copy, letter, zack: fillCopy(v1Zack, amounts) };
}
