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
 * THIS UNIT (U3) APPLIES TEXT ONLY. An overlay's `sections` and `lists` are
 * parsed and carried, and not yet applied: sections arrive in U6 and lists in
 * U7 and U8, behind these same functions. mergeOrder, the one rule both will
 * order by (plan KTD4), is here already.
 */
import releasedFile from "@/data/site/released.json";
import { v1Zack, type V1Copy, type V1ZackCopy } from "@/data/site/v1";
import { fillCopy, type Amounts } from "../amounts";
import { emptyOverlay, newOverlay, parseOverlay, type Overlay } from "./format";
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
  let out = model;
  for (const [id, text] of Object.entries(parseOverlay(overlay, registry).text)) out = withTextAt(out, registry.fields.get(id)!.path, text);
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
  return out;
}

/**
 * An overlay as it is stored and compared (plan KTD6): read leniently, and without any text entry that says what
 * `base` already says. An entry equal to the base is not an edit, so once a release makes a site's edit the
 * built-in wording, the entry stops counting and is gone the next time anything is saved.
 *
 * The same as diffToOverlay(base, applyOverlay(base, overlay)) for text. Section and list entries are carried as
 * they were read: comparing them with the base arrives with U6 and U7.
 */
export function normaliseOverlay(base: unknown, overlay: unknown, registry: Registry = siteRegistry): Overlay {
  const read = parseOverlay(overlay, registry);
  const out: Overlay = { ...read, text: {} };
  for (const [id, text] of Object.entries(read.text)) if (text !== valueAt(base, registry.fields.get(id)!.path)) out.text[id] = text;
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

/** The release file as an overlay on the code model. Read leniently here, so a bad file cannot take a page down; a test holds the file itself to the strict reading. */
export const releasedOverlay: Overlay = parseOverlay(releasedFile);

/** The built-in wording: the code model with the release file on it (plan KTD1). What "reset" goes back to, and what a site's own edits are compared with. */
export const baseline: SiteCopy = applyOverlay(codeModel, releasedOverlay);

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
export function v1Copy(amounts: Amounts, overlay: Overlay = emptyOverlay): { copy: V1Copy; letter: SiteCopy["letter"]; zack: V1ZackCopy } {
  const { letter, ...copy } = fillCopy(applyOverlay(codeModel, overlay), amounts);
  return { copy, letter, zack: fillCopy(v1Zack, amounts) };
}
