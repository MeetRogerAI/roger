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
 * TEXT, SECTIONS AND LISTS ARE APPLIED, each merged by id (plan KTD4).
 * mergeOrder is the one rule sections and lists are ordered by.
 *
 * WHERE A LIST IS KEPT. In the model itself: a list is an array of the copy,
 * each item with its `id`, so "which items, in which order" is what the array
 * holds. An overlay's entry for a list removes items, adds items (whose ids
 * start with "x-", and whose texts are in the overlay's `text` under
 * `<list>.<item>.<key>`), and orders them (applyListEdit). An item a layer
 * removes is gone for every layer above it, like an item taken out of the
 * code. diffListEdit writes the entry between two arrays, the one way it is
 * ever stored.
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
import { emptyOverlay, isEmptyOverlay, newOverlay, parseOverlay, type ListEdit, type Overlay, type SectionEdit } from "./format";
import { TOGGLE_OFF, TOGGLE_ON, codeModel, fieldsOfItem, isAddedId, resolveField, siteRegistry, type Field, type List, type Registry, type SiteCopy } from "./registry";

export { codeModel, type SiteCopy };

const isItem = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

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

/**
 * What a field holds in a model: its text, or for a toggle "yes" or "no" (an item's switch is kept in the copy as a
 * list that holds a value or does not: Field.toggle). Undefined where the model has no such place: an item that is
 * not in its list, a key the copy does not have.
 */
export function readField(model: unknown, field: Field): string | undefined {
  if (!field.toggle) {
    const text = valueAt(model, field.path);
    return typeof text === "string" ? text : undefined;
  }
  const item = valueAt(model, field.path.slice(0, -1));
  if (!isItem(item)) return undefined;
  const held = Object.hasOwn(item, field.toggle.key) ? item[field.toggle.key] : undefined;
  return Array.isArray(held) && held.includes(field.toggle.value) ? TOGGLE_ON : TOGGLE_OFF;
}

/** A field's wording in a model, by the field's id: a built-in field's, or an added item's. Undefined for an id that is no field's, or where the model has no text there. */
export function textAt(model: unknown, fieldId: string, registry: Registry = siteRegistry): string | undefined {
  const field = resolveField(fieldId, registry);
  return field ? readField(model, field) : undefined;
}

/**
 * The model with what is at the path changed by `change`, sharing everything off the path with the model it came
 * from. Where the model has no such place, or `change` gives back what it was handed, the model comes back as it is.
 */
function withAt<T>(node: T, path: readonly string[], change: (value: unknown) => unknown): T {
  if (path.length === 0) return change(node) as T;
  const [part, ...rest] = path;
  if (Array.isArray(node)) {
    const at = node.findIndex((item: unknown) => typeof item === "object" && item !== null && (item as { id?: unknown }).id === part);
    if (at === -1) return node;
    const next = withAt(node[at], rest, change);
    return next === node[at] ? node : (node.map((item: unknown, i: number) => (i === at ? next : item)) as T);
  }
  if (typeof node === "object" && node !== null && Object.hasOwn(node, part)) {
    const current = (node as Record<string, unknown>)[part];
    const next = withAt(current, rest, change);
    return next === current ? node : ({ ...node, [part]: next } as T);
  }
  return node;
}

/** The model with a field holding `text`. Only a string is ever replaced by a string, and only an item's own list is switched. */
function writeField<T>(model: T, field: Field, text: string): T {
  const { toggle } = field;
  if (!toggle) return withAt(model, field.path, (value) => (typeof value === "string" ? text : value));
  return withAt(model, field.path.slice(0, -1), (item) => (isItem(item) ? switched(item, toggle, text) : item));
}

/** An item with one of its switches set: the same item when it already is. */
function switched(item: Record<string, unknown>, toggle: { key: string; value: string }, text: string): Record<string, unknown> {
  const held: unknown[] = Object.hasOwn(item, toggle.key) && Array.isArray(item[toggle.key]) ? (item[toggle.key] as unknown[]) : [];
  const on = text === TOGGLE_ON;
  if (held.includes(toggle.value) === on) return item;
  return { ...item, [toggle.key]: on ? [...held, toggle.value] : held.filter((value) => value !== toggle.value) };
}

/** The ids of an array of the copy, in its order. Empty for anything that is not one. */
const idsIn = (array: unknown): string[] => (Array.isArray(array) ? array.flatMap((item: unknown) => (isItem(item) && typeof item.id === "string" ? [item.id] : [])) : []);

/** The items of a list in a model, as ids, in the order the model has them. Empty for a list the model does not have. */
export function listItems(model: unknown, listId: string, registry: Registry = siteRegistry): string[] {
  const list = registry.lists.get(listId);
  return list ? idsIn(valueAt(model, list.path)) : [];
}

/**
 * An item added in the admin, from the texts an overlay holds for it: its id, each text of the list's items, and
 * whatever else an item of the list has (a question's `on`). Null when one of its texts is missing, since the page
 * would have nothing to print there: such an item is not shown at all.
 */
function addedItem(list: List, id: string, text: Record<string, string>, registry: Registry): Record<string, unknown> | null {
  const fields = fieldsOfItem(list, id, registry);
  let item: Record<string, unknown> = { id };
  for (const field of fields) {
    if (field.toggle) continue;
    if (!Object.hasOwn(text, field.id)) return null;
    item[field.path.at(-1)!] = text[field.id];
  }
  item = { ...item, ...structuredClone(list.blank) };
  for (const field of fields) if (field.toggle && Object.hasOwn(text, field.id)) item = switched(item, field.toggle, text[field.id]);
  return item;
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

  // The lists first (plan KTD4): each entry removes, adds and orders the items the model has. An item it adds is
  // made from the overlay's own texts. Then the texts, which reach every item the lists have left, whichever layer
  // added it: a text for an item that is not there changes nothing.
  for (const [listId, edit] of Object.entries(read.lists)) {
    const list = registry.lists.get(listId)!;
    const array: unknown = valueAt(out, list.path);
    if (!Array.isArray(array)) continue;
    const below = idsIn(array);
    const made = new Map<string, unknown>();
    for (const id of edit.added) {
      const item = below.includes(id) ? null : addedItem(list, id, read.text, registry);
      if (item) made.set(id, item);
    }
    const ids = applyListEdit(below, { ...edit, added: [...made.keys()] }, list);
    if (sameIds(ids, below)) continue;
    const items = ids.map((id) => made.get(id) ?? (array as unknown[]).find((item) => isItem(item) && item.id === id));
    out = withAt(out, list.path, () => items);
  }
  for (const [id, text] of Object.entries(read.text)) out = writeField(out, resolveField(id, registry)!, text);

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
 * What `model` changes in `base`, as an overlay on `base`: every registered field whose text differs, each page's
 * sections, and each list's items with the texts of the ones added in the admin. Applied to `base` again it gives
 * `model`'s wording, sections and lists, wherever the wording is something its field can print.
 *
 * Only what `model` SHOWS is in it: the wording of an item `model` does not have is not (see normaliseOverlay for
 * the one place such wording is kept).
 */
export function diffToOverlay(base: unknown, model: unknown, registry: Registry = siteRegistry): Overlay {
  const out = newOverlay();
  for (const field of registry.fields.values()) {
    const text = readField(model, field);
    if (text !== undefined && text !== readField(base, field)) out.text[field.id] = text;
  }
  for (const list of registry.lists.values()) {
    const [from, to]: unknown[] = [valueAt(base, list.path), valueAt(model, list.path)];
    if (!Array.isArray(from) || !Array.isArray(to)) continue;
    const below = idsIn(from);
    const ids = idsIn(to);
    const edit = diffListEdit(below, ids);
    if (edit) out.lists[list.id] = edit;
    // The texts of the items added in the admin, which are in no table of built-in fields. A new item's every text
    // is written; one the layer below already has, only where it differs.
    for (const id of ids) {
      if (!isAddedId(id)) continue;
      const isNew = !below.includes(id);
      for (const field of fieldsOfItem(list, id, registry)) {
        const text = readField(model, field);
        const was = isNew ? (field.toggle ? TOGGLE_OFF : undefined) : readField(base, field);
        if (text !== undefined && text !== was) out.text[field.id] = text;
      }
    }
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
 * It is diffToOverlay(base, applyOverlay(base, overlay)): what the overlay amounts to on `base`, written the one
 * way it is ever written. So a page's sections and a list's items are each one minimal entry, an entry that
 * changes nothing is gone (no empty entry is ever stored), and so is whatever `base` gives no place to: a text for
 * a field that does not exist, for an item that is in no list, or for an added item missing one of its texts.
 *
 * ONE THING MORE IS KEPT: the wording of an item this overlay itself removes. A removed item is not shown, but
 * "Put back" in the editor should bring it back as it was edited, so its texts stay in the draft while it is
 * removed. shownOverlay is the same without them, which is what a publish makes live (./store.ts); the draft
 * keeps them through the publish.
 */
export function normaliseOverlay(base: unknown, overlay: unknown, registry: Registry = siteRegistry): Overlay {
  const read = parseOverlay(overlay, registry);
  const out = diffToOverlay(base, applyOverlay(base, read, registry), registry);
  for (const [listId, edit] of Object.entries(out.lists)) {
    const list = registry.lists.get(listId)!;
    for (const id of edit.removed) {
      for (const field of fieldsOfItem(list, id, registry)) {
        if (Object.hasOwn(read.text, field.id) && read.text[field.id] !== readField(base, field)) out.text[field.id] = read.text[field.id];
      }
    }
  }
  return out;
}

/**
 * An overlay with only what it SHOWS on `base`: normaliseOverlay without the wording kept for removed items. What a
 * publish makes live, and what "is anything waiting to be published" compares.
 */
export function shownOverlay(base: unknown, overlay: unknown, registry: Registry = siteRegistry): Overlay {
  return diffToOverlay(base, applyOverlay(base, parseOverlay(overlay, registry), registry), registry);
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
// A list's items (plan R8, KTD4)
// ---------------------------------------------------------------------------

/**
 * A list's items with one layer's entry on them, MERGED BY ID (plan KTD4). `below` is the list as the layer below
 * has it, as ids in order. The entry:
 *
 * - removed: an item of `below` it names is gone. A name that is no item of `below` is ignored.
 * - added: an id that starts with "x-" and is not in `below` joins the list, after everything else, in the
 *   entry's order. (An id `below` already has is not added twice.)
 * - order: the entry's order for the ids it names; every other item stays directly after the item it follows
 *   (mergeOrder), so an item added in code later appears in its code position, and added items stay last.
 *
 * WHAT THE PAGE CAN DRAW WINS. The list never ends up with more items than `max` (the items added last are left
 * out) or fewer than `min` (the first of the removed ones stay). A list whose `min` is its `max` can only be
 * reordered: nothing is added or removed.
 */
export function applyListEdit(below: readonly string[], edit: ListEdit | undefined, bounds: { min: number; max: number } = { min: 0, max: Infinity }): string[] {
  if (!edit) return [...below];
  const fixed = bounds.min === bounds.max;
  const removed = fixed ? [] : below.filter((id) => edit.removed.includes(id));
  const addable = fixed ? [] : [...new Set(edit.added)].filter((id) => isAddedId(id) && !below.includes(id) && !edit.removed.includes(id));
  // Never fewer than the page can draw: the first of the removed ones stay. The added ones count: a header whose
  // built-in links are all removed and that has one added keeps that one alone, as the editor's count says.
  const stay = removed.slice(0, Math.max(0, bounds.min - (below.length - removed.length) - addable.length));
  const kept = below.filter((id) => !removed.includes(id) || stay.includes(id));
  const room = Math.max(0, bounds.max - kept.length);
  const added = addable.slice(0, room);
  return mergeOrder([...kept, ...added], edit.order);
}

/**
 * The entry that turns the list `below` into `items`, written the one way it is ever stored, or null when the two
 * are the same: an entry that changes nothing is never written.
 *
 * The entry names as little as it can, so that a later change in the layer below still shows through: `removed`
 * and `added` are what differs, and `order` is empty unless the items are in another order than "what is left of
 * the layer below, then the added ones", in which case it is the whole order.
 */
export function diffListEdit(below: readonly string[], items: readonly string[]): ListEdit | null {
  const removed = below.filter((id) => !items.includes(id));
  const added = [...new Set(items)].filter((id) => !below.includes(id) && isAddedId(id));
  const natural = [...below.filter((id) => items.includes(id)), ...added];
  const order = mergeOrder(natural, items);
  const named = sameIds(order, natural) ? [] : order;
  return removed.length + added.length + named.length === 0 ? null : { order: named, removed, added };
}

/**
 * A list's items under an overlay on `base`, as ids in the order shown. For the Pages screens, the overlay is a
 * site's draft or what it has published, and `base` is the baseline.
 */
export function itemsOn(overlay: Overlay, listId: string, base: unknown = baseline, registry: Registry = siteRegistry): string[] {
  if (!Object.hasOwn(overlay.lists, listId)) return listItems(base, listId, registry);
  return listItems(applyOverlay(base, overlay, registry), listId, registry);
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
 * Everything is resolved through the models, so an entry either layer cannot print is not in the result. A page's
 * sections are the release's with the site's own changes merged in by id (applySectionEdit), and so are a list's
 * items (applyListEdit): the code's items, less what the release removes and plus what it adds, then the same for
 * the site, each item once. The wording of an item that is not shown is not in the result.
 */
export function composeOverlays(released: Overlay, own: Overlay, registry: Registry = siteRegistry): Overlay {
  if (isEmptyOverlay(released) && isEmptyOverlay(own)) return emptyOverlay;
  const below = parseOverlay(released, registry);
  const above = parseOverlay(own, registry);
  return diffToOverlay(codeModel, applyOverlay(applyOverlay(codeModel, below, registry), above, registry), registry);
}

/**
 * The copy a page prints, with every amount filled in. `overlay` is everything stored that the page should show,
 * as ONE overlay on the code model (the release file and the site's published edits together). Left out, the page
 * prints the code copy alone, which is what the tests that pin the wording render (plan KTD13). Amounts named in
 * an edit are filled like any other.
 *
 * `copy` is the version's copy file. `letter` is Peter's letter as /about prints it, which is his wording and not
 * the site's, so it is handed over beside the copy and not inside it. `examples` are the homepage's examples, in
 * their order (src/data/site/examples.ts, examplesFrom, makes them plays again). `zack` is the free Zack run's copy,
 * which Pages does not cover.
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

export function v1Copy(amounts: Amounts, overlay: Overlay = emptyOverlay): { copy: V1Copy; letter: SiteCopy["letter"]; examples: SiteCopy["examples"]; zack: V1ZackCopy } {
  const { letter, examples, ...copy } = fillCopy(applyOverlay(codeModel, overlay), amounts);
  return { copy, letter, examples, zack: fillCopy(v1Zack, amounts) };
}
