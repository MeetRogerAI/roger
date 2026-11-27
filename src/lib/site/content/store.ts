/**
 * Everything a site stores about its own words: ONE row of the `settings`
 * table, key "site.content" (plan KTD5). No table and no column was added.
 *
 *   { draft, published, previous }
 *
 *   draft      an overlay on the baseline: what the admin has saved. No
 *              visitor sees it until it is published (plan R13).
 *   published  an overlay on the baseline: what the public pages show.
 *   previous   what was published before the last publish, so that it can be
 *              undone (plan R15). null when there is nothing to go back to.
 *
 * Each of the three is the overlay of ./format.ts, and each is COMPLETE: the
 * draft is not a list of changes to what is published, it is the whole of
 * what the site would show. To publish is to make `published` the draft; to
 * reset a field is to take its entry out of the draft.
 *
 * THE DRAFT HOLDS ONE THING THE SITE WOULD NOT SHOW: the wording of an item
 * the draft has removed from a list, so that "Put back" brings the item back
 * as it was edited. A publish leaves that wording out of what it makes live
 * (shownOverlay), so what is published never holds the text of an item that
 * is not on a page, and keeps it in the draft, so that it is still there to
 * put back after an Undo.
 *
 * HOW A WRITE IS ONE STATEMENT. The database has no transactions over HTTP.
 * A write reads the row as text, works out the new value in code (where the
 * registry and the baseline are), and stores it with one statement that
 * applies only if the row is still exactly what was read:
 *
 *   update settings set value = $new where key = 'site.content' and value = $read
 *
 * or, when there was no row, `insert ... on conflict do nothing`. When that
 * statement changes nothing, someone else wrote in between: the write reads
 * again and tries again, a few times. So two admins saving two fields at
 * once both keep their change, a publish makes live exactly the draft that
 * was read (plan KTD11), and no state is ever half-written.
 *
 * WHAT IS STORED IS TIDY (plan KTD6). Whatever a write reads is read
 * leniently and without any entry that says what the baseline already says,
 * and that is what it stores back. So an edit a release has since made the
 * built-in wording is gone the next time anything is saved.
 *
 * THE QUESTIONS SAVED BEFORE THIS ROW EXISTED (plan R10). The Edit Questions
 * screen kept its edits in the row "site.questions". While "site.content"
 * does not exist, that row is what the site has published: the reader gives
 * those edits, and the first write stores them as both draft and published
 * together with its own change. The old row is never written or deleted
 * here, so going back to the release before this one still shows the edits
 * it had. Once "site.content" exists the old row is not read for anything.
 *
 * A write that changes what is live writes its admin log row after it
 * succeeds (src/lib/admin/log.ts).
 */
import { logAdminAction } from "@/lib/admin/log";
import type { Query } from "@/lib/db-query";
import { OVERLAY_FORMAT, newOverlay, type Overlay } from "./format";
import { applyOverlay, baseline, codeModel, diffListEdit, diffSectionEdit, layoutOn, listItems, normaliseOverlay, sectionLayout, shownOverlay, textAt, type Layout } from "./model";
import { fieldsOfItem, isAddedId, resolveField, siteRegistry, usableValue } from "./registry";

export const CONTENT_KEY = "site.content";
/** The row the Edit Questions screen wrote before "site.content" existed. Read to seed that row, never written. */
export const LEGACY_QUESTIONS_KEY = "site.questions";

export type StoredContent = { draft: Overlay; published: Overlay; previous: Overlay | null };

/** How often a write reads again when someone else wrote first. Admins are few: two tries would do. */
const TRIES = 6;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A value as text in which the order of an object's keys does not matter, so two overlays that say the same compare equal. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) => (isRecord(part) ? Object.fromEntries(Object.entries(part).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : part));
}

/** True when two overlays say the same: the same entries with the same values, lists in the same order. */
export function sameOverlay(a: Overlay, b: Overlay): boolean {
  return canonical(a) === canonical(b);
}

/** The most names one admin log row lists. A publish that changed more says how many. */
const LOGGED_MAX = 200;

/** What a log row says a write changed: the names, and the count when there are more than it lists. */
const logged = (names: string[]) => (names.length > LOGGED_MAX ? { changed: names.slice(0, LOGGED_MAX), changedCount: names.length } : { changed: names });

/**
 * What differs between two overlays, by name: a field's id, "sections.<page>", "lists.<list>". For the admin
 * log, which says what a publish changed without holding the text.
 */
export function changedBetween(a: Overlay, b: Overlay): string[] {
  const out: string[] = [];
  const compare = (prefix: string, x: Record<string, unknown>, y: Record<string, unknown>) => {
    for (const key of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) {
      const [left, right] = [Object.hasOwn(x, key) ? x[key] : undefined, Object.hasOwn(y, key) ? y[key] : undefined];
      if (canonical(left) !== canonical(right)) out.push(prefix + key);
    }
  };
  compare("", a.text, b.text);
  compare("sections.", a.sections, b.sections);
  compare("lists.", a.lists, b.lists);
  return out;
}

/**
 * The value of the "site.questions" row as an overlay: each stored question and answer under its field's id. A
 * row that is no object, an id that is no question's, and a part that is not text are left out. Never throws.
 * What the fields cannot print is dropped where the result is normalised.
 */
export function legacyQuestionOverlay(value: unknown): Overlay {
  const out = newOverlay();
  if (!isRecord(value)) return out;
  for (const group of codeModel.questions) {
    for (const item of group.items) {
      const edit = Object.hasOwn(value, item.id) ? value[item.id] : undefined;
      if (!isRecord(edit)) continue;
      for (const part of ["q", "a"] as const) {
        const text = edit[part];
        if (typeof text === "string") out.text[`questions.${group.id}.items.${item.id}.${part}`] = text;
      }
    }
  }
  return out;
}

/**
 * The value of the "site.content" row as stored content: each part read leniently and held against the baseline
 * (plan KTD6, R18). A row that is no object holds nothing. `previous` counts only when it is an overlay of this
 * format: anything else is "nothing to go back to", never "go back to no edits".
 */
export function parseStored(value: unknown, base: unknown = baseline): StoredContent {
  if (!isRecord(value)) return { draft: newOverlay(), published: newOverlay(), previous: null };
  const previous = isRecord(value.previous) && value.previous.format === OVERLAY_FORMAT ? normaliseOverlay(base, value.previous) : null;
  return { draft: normaliseOverlay(base, value.draft), published: normaliseOverlay(base, value.published), previous };
}

type Row = {
  content: StoredContent;
  /** The row's value exactly as the database holds it, for the statement that replaces it. null when there is no row. */
  raw: string | null;
};

/** One statement: the content row, and the old questions row for when there is none. Throws when the database does. */
async function readRow(q: Query, base: unknown): Promise<Row> {
  const rows = await q<{ key: string; raw: string }>(`select key, value::text as raw from settings where key in ($1, $2)`, [CONTENT_KEY, LEGACY_QUESTIONS_KEY]);
  const own = rows.find((row) => row.key === CONTENT_KEY);
  if (own) return { content: parseStored(JSON.parse(own.raw), base), raw: own.raw };
  const legacy = rows.find((row) => row.key === LEGACY_QUESTIONS_KEY);
  // Two objects, so that nothing written to one of them shows in the other.
  const seed = () => normaliseOverlay(base, legacy ? legacyQuestionOverlay(JSON.parse(legacy.raw)) : newOverlay());
  return { content: { draft: seed(), published: seed(), previous: null }, raw: null };
}

/**
 * What the site has stored, as it would be read by a write: the row, or with no row the questions saved before it
 * existed, as both draft and published. `stored` says whether the row exists. Not cached: the admin reads this.
 */
export async function readStored(q: Query, base: unknown = baseline): Promise<StoredContent & { stored: boolean }> {
  const row = await readRow(q, base);
  return { ...row.content, stored: row.raw !== null };
}

/** What the site has published, as an overlay on the baseline. Throws when the database cannot be read: the caller decides what a failure shows. */
export async function readPublished(q: Query, base: unknown = baseline): Promise<Overlay> {
  return (await readRow(q, base)).content.published;
}

type Written = { written: boolean; before: StoredContent; after: StoredContent };

/**
 * One change of state. `change` is given what is stored and returns what should be, or null for "leave it".
 * It may run more than once, each time on a fresh read. "busy" when other writes kept getting in first.
 */
async function transition(q: Query, base: unknown, change: (now: StoredContent) => StoredContent | null): Promise<Written | "busy"> {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const row = await readRow(q, base);
    const next = change(row.content);
    if (!next) return { written: false, before: row.content, after: row.content };
    const value = JSON.stringify({ draft: next.draft, published: next.published, previous: next.previous });
    const done =
      row.raw === null
        ? await q<{ key: string }>(`insert into settings (key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do nothing returning key`, [CONTENT_KEY, value])
        : await q<{ key: string }>(`update settings set value = $2::jsonb, updated_at = now() where key = $1 and value = $3::jsonb returning key`, [CONTENT_KEY, value, row.raw]);
    if (done.length > 0) return { written: true, before: row.content, after: next };
  }
  return "busy";
}

/** One field's wording for the draft. `text: null` takes the field's entry out, so it shows the built-in wording. */
export type DraftChange = { field: string; text: string | null };

export type SaveResult =
  | { ok: true; changed: boolean; content: StoredContent }
  /** `field` is the one that was refused. "busy": other writes kept getting in first, and nothing was stored. */
  | { ok: false; reason: "unknown-field" | "unusable" | "too-long" | "busy"; field?: string };

/**
 * Stores wording in the draft, all of `changes` or none. No visitor sees it until it is published.
 *
 * The caller tidies the text and says what is wrong with it in the admin's words. This refuses only what could
 * not be stored truthfully: a field the registry does not have, a text the field cannot print (which every reader
 * would drop without a word), and a text over the field's limit (which the release file may not hold). A text
 * equal to the built-in wording is no edit, and takes the entry out (plan KTD6).
 */
export async function saveDraft(q: Query, changes: readonly DraftChange[], base: unknown = baseline): Promise<SaveResult> {
  /** The fields of items added in the admin: each must be an item its list has when the write lands. */
  const ofAdded: { field: string; list: string; item: string }[] = [];
  for (const { field: id, text } of changes) {
    const field = resolveField(id);
    if (!field) return { ok: false, reason: "unknown-field", field: id };
    if (!siteRegistry.fields.has(id)) ofAdded.push({ field: id, list: field.item!.array, item: field.item!.id });
    if (text === null) continue;
    if (!usableValue(field, text)) return { ok: false, reason: "unusable", field: id };
    if (text.length > field.max) return { ok: false, reason: "too-long", field: id };
  }
  let missing: string | undefined;
  const done = await transition(q, base, (now) => {
    // An added item's text is stored only while the item is in its list: in the draft's, or removed there and so
    // waiting to be put back. For an item that is in neither, the text would be read by nothing.
    if (ofAdded.length > 0) {
      const model = applyOverlay(base, now.draft);
      const removedIn = (list: string) => (Object.hasOwn(now.draft.lists, list) ? now.draft.lists[list].removed : []);
      missing = ofAdded.find((entry) => !listItems(model, entry.list).includes(entry.item) && !removedIn(entry.list).includes(entry.item))?.field;
      if (missing) return null;
    }
    const text = { ...now.draft.text };
    for (const change of changes) {
      if (change.text === null || change.text === textAt(base, change.field)) delete text[change.field];
      else text[change.field] = change.text;
    }
    const draft = normaliseOverlay(base, { ...now.draft, text });
    return sameOverlay(draft, now.draft) ? null : { ...now, draft };
  });
  if (done === "busy") return { ok: false, reason: "busy" };
  if (missing) return { ok: false, reason: "unknown-field", field: missing };
  return { ok: true, changed: done.written, content: done.after };
}

/**
 * One press on a list's controls (plan R8): move an item one place up or down, remove it, put a removed one back,
 * add a new one with its texts, or put the list back as the baseline has it.
 *
 * `add`: `id` is the new item's id, made by the caller, starting with "x-". `fields` is each of the item's
 * fields by its key ("q", "a"), tidied: every text, and a switch where it is on.
 */
export type ListChange = { list: string } & ({ op: "up" | "down" | "remove" | "back"; item: string } | { op: "add"; id: string; fields: ReadonlyMap<string, string> } | { op: "reset" });

export type ListResult =
  | { ok: true; changed: boolean; content: StoredContent; items: string[] }
  /**
   * "unknown-list", "unknown-item": not a list, or not an item the press can be for. "full" and "too-few": the
   * list holds as many, or as few, as its page can draw. "missing-field", "unusable", "too-long": a new item's
   * text, with `field` the key. Nothing was stored.
   */
  | { ok: false; reason: "unknown-list" | "unknown-item" | "full" | "too-few" | "missing-field" | "unusable" | "too-long" | "busy"; field?: string };

/**
 * Stores one change to a list in the draft. No visitor sees it until it is published.
 *
 * Like a press on a page's sections, the change is made to the list AS THE DRAFT HAS IT WHEN THE WRITE LANDS. What
 * is stored is the list's one entry, written the one way diffListEdit writes it, and no entry at all for a list
 * that is as the baseline has it.
 *
 * - remove: an item the baseline has is named in the entry's `removed`, and its edited wording stays in the draft
 *   so that "back" restores it. An item added in this draft is taken out of the entry, and its texts with it.
 * - back: only for an item the baseline has and the draft has removed. It returns directly after the item it
 *   follows in the baseline.
 * - add: refused when a text is missing, cannot be printed or is over its limit, and when the list is full.
 * - reset: the entry goes, and with it the texts of the items the draft had added. Edited wording of the
 *   baseline's own items stays: each field has its own reset.
 *
 * A list never ends up with more items than its page can draw, or fewer (the registry's `max` and `min`): the
 * press that would do it is refused. Moving the first item up, or the last down, changes nothing.
 */
export async function saveList(q: Query, change: ListChange, base: unknown = baseline): Promise<ListResult> {
  const list = siteRegistry.lists.get(change.list);
  if (!list) return { ok: false, reason: "unknown-list" };
  const below = listItems(base, list.id);

  const texts = new Map<string, string>();
  if (change.op === "add") {
    if (!isAddedId(change.id)) return { ok: false, reason: "unknown-item" };
    for (const field of fieldsOfItem(list, change.id)) {
      const key = field.path.at(-1)!;
      const text = change.fields.get(key);
      if (text === undefined) {
        if (field.kind === "toggle") continue;
        return { ok: false, reason: "missing-field", field: key };
      }
      const empty = field.kind !== "toggle" && text.trim() === "";
      if (!usableValue(field, text)) return { ok: false, reason: empty ? "missing-field" : "unusable", field: key };
      if (text.length > field.max) return { ok: false, reason: "too-long", field: key };
      texts.set(field.id, text);
    }
  }

  let refused: "unknown-item" | "full" | "too-few" | undefined;
  let items = below;
  const done = await transition(q, base, (now) => {
    refused = undefined;
    const before = listItems(applyOverlay(base, now.draft), list.id);
    const text = { ...now.draft.text };
    const dropTexts = (item: string) => {
      for (const field of fieldsOfItem(list, item)) delete text[field.id];
    };
    let after = before;
    if (change.op === "reset") {
      after = below;
      for (const item of before) if (!below.includes(item)) dropTexts(item);
    } else if (change.op === "add") {
      if (before.includes(change.id) || below.includes(change.id)) refused = "unknown-item";
      else if (before.length >= list.max) refused = "full";
      else {
        after = [...before, change.id];
        for (const [id, value] of texts) text[id] = value;
      }
    } else if (change.op === "back") {
      if (!below.includes(change.item) || before.includes(change.item)) refused = "unknown-item";
      else if (before.length >= list.max) refused = "full";
      else {
        // Back where it was: directly after the nearest item before it in the baseline that the list still has,
        // wherever that item is now, or first when there is none (the rule mergeOrder places an unnamed item by).
        const earlier = below.slice(0, below.indexOf(change.item)).reverse().find((item) => before.includes(item));
        after = [...before];
        after.splice(earlier === undefined ? 0 : before.indexOf(earlier) + 1, 0, change.item);
      }
    } else {
      const at = before.indexOf(change.item);
      if (at === -1) refused = "unknown-item";
      else if (change.op === "remove") {
        if (before.length <= list.min) refused = "too-few";
        else {
          after = before.filter((item) => item !== change.item);
          if (!below.includes(change.item)) dropTexts(change.item);
        }
      } else {
        const to = change.op === "up" ? at - 1 : at + 1;
        if (to >= 0 && to < before.length) {
          after = [...before];
          [after[at], after[to]] = [after[to], after[at]];
        }
      }
    }
    if (refused) return null;
    items = after;
    const entry = diffListEdit(below, after);
    const lists = Object.fromEntries(Object.entries(now.draft.lists).filter(([id]) => id !== list.id));
    if (entry) lists[list.id] = entry;
    const draft = normaliseOverlay(base, { ...now.draft, text, lists });
    return sameOverlay(draft, now.draft) ? null : { ...now, draft };
  });
  if (done === "busy") return { ok: false, reason: "busy" };
  if (refused) return { ok: false, reason: refused };
  return { ok: true, changed: done.written, content: done.after, items };
}

/**
 * One press on a page's section controls (plan R7): switch a section off or on, move it one place up or down among
 * the page's sections, or put the page's sections back as the baseline has them.
 */
export type SectionChange = { page: string } & ({ op: "off" | "on" | "up" | "down"; section: string } | { op: "reset" });

export type SectionsResult =
  | { ok: true; changed: boolean; content: StoredContent; layout: Layout }
  /** "unknown-section": the page, or the section, is not one an admin may move or switch off. Nothing was stored. */
  | { ok: false; reason: "unknown-section" | "busy" };

/**
 * Stores one change to a page's sections in the draft. No visitor sees it until it is published.
 *
 * The change is made to the page's sections AS THE DRAFT HAS THEM WHEN THE WRITE LANDS, not as some screen last
 * showed them: "move Price up" pressed in two tabs moves it twice, and never puts back an order the other tab has
 * left. What is stored is the page's one entry, written the one way diffSectionEdit writes it. A page whose
 * sections are as the baseline has them has no entry at all: an empty one is never written.
 *
 * Moving the first section up, or the last one down, changes nothing, and so does switching off what is off.
 * A fixed section (a page's title, everything under Shared) and an id the page does not have are refused.
 */
export async function saveSections(q: Query, change: SectionChange, base: unknown = baseline): Promise<SectionsResult> {
  const page = siteRegistry.pages.find((entry) => entry.id === change.page);
  if (!page || !page.sections.some((section) => !section.fixed)) return { ok: false, reason: "unknown-section" };
  if (change.op !== "reset" && !page.sections.some((section) => section.id === change.section && !section.fixed)) return { ok: false, reason: "unknown-section" };
  const original = sectionLayout(base, page.id);
  let layout = original;
  const done = await transition(q, base, (now) => {
    const before = layoutOn(now.draft, page.id, base);
    layout = changedLayout(before, change, original);
    const entry = diffSectionEdit(original, layout);
    const sections = Object.fromEntries(Object.entries(now.draft.sections).filter(([id]) => id !== page.id));
    if (entry) sections[page.id] = entry;
    const draft = { ...now.draft, sections };
    return sameOverlay(draft, now.draft) ? null : { ...now, draft };
  });
  if (done === "busy") return { ok: false, reason: "busy" };
  return { ok: true, changed: done.written, content: done.after, layout };
}

/** A layout after one press. `original` is what "reset" goes back to. */
function changedLayout(before: Layout, change: SectionChange, original: Layout): Layout {
  if (change.op === "reset") return original;
  const { section } = change;
  if (change.op === "off") return { order: before.order, off: before.order.filter((id) => id === section || before.off.includes(id)) };
  if (change.op === "on") return { order: before.order, off: before.off.filter((id) => id !== section) };
  const at = before.order.indexOf(section);
  const to = change.op === "up" ? at - 1 : at + 1;
  if (at === -1 || to < 0 || to >= before.order.length) return before;
  const order = [...before.order];
  [order[at], order[to]] = [order[to], order[at]];
  return { order, off: before.off };
}

export type PublishResult =
  | { ok: true; changed: boolean; content: StoredContent }
  /** "draft-changed": the stored draft is not the one that was checked, so nothing was published. */
  | { ok: false; reason: "draft-changed" | "busy" };

/**
 * Makes the draft live (plan R15, KTD11): `published` becomes the draft and `previous` what was published, in one
 * statement. `checked` is the draft the admin was shown the warnings for. When the stored draft is no longer that
 * one, nothing changes and the answer says so: a save from another tab is never published unread.
 *
 * A draft equal to what is published publishes nothing, and leaves `previous` alone: `changed` is false.
 *
 * What goes live is what the draft SHOWS (shownOverlay): the wording the draft keeps for items it has removed from a
 * list is not published. It stays in the draft, so that after an Undo of this publish "Put back" still brings such
 * an item back as it was edited. "Nothing is waiting" is therefore `shownOverlay(draft)` equal to `published`, never
 * the two overlays equal.
 * `note` is added to the admin log row, which names what changed and not the text.
 *
 * `over` is what was on the site when the admin read the list of changes. When it is given and something else is
 * published now (an undo, or a publish, from another tab), nothing changes either, and the answer is the same
 * "draft-changed": the list the admin read is no longer what this publish would change.
 */
export async function publish(q: Query, by: string, checked: Overlay, o: { base?: unknown; note?: Record<string, unknown>; over?: Overlay } = {}): Promise<PublishResult> {
  const base = o.base ?? baseline;
  const want = normaliseOverlay(base, checked);
  const over = o.over ? normaliseOverlay(base, o.over) : null;
  let moved = false;
  const done = await transition(q, base, (now) => {
    const shown = shownOverlay(base, now.draft);
    const live = sameOverlay(shown, now.published);
    // A draft that is live already is nothing to publish, whoever published it: that is not "changed", it is done.
    moved = !sameOverlay(now.draft, want) || (over !== null && !live && !sameOverlay(now.published, over));
    if (moved || live) return null;
    // The draft keeps the wording of the items it removes: an Undo of this publish puts such an item back on the
    // site with that wording, and "Put back" in the editor must bring the same wording, not the original.
    return { draft: now.draft, published: shown, previous: now.published };
  });
  if (done === "busy") return { ok: false, reason: "busy" };
  if (moved) return { ok: false, reason: "draft-changed" };
  if (done.written) await logAdminAction(q, { by, action: "site_content_published", detail: { ...o.note, ...logged(changedBetween(done.before.published, done.after.published)) } });
  return { ok: true, changed: done.written, content: done.after };
}

/**
 * Undoes the last publish (plan R15): `published` becomes what it was before, `previous` is cleared, and the
 * draft stays as it is, to be fixed and published again. With nothing to go back to, nothing changes.
 */
export async function undoPublish(q: Query, by: string, base: unknown = baseline): Promise<{ ok: true; changed: boolean; content: StoredContent } | { ok: false; reason: "busy" }> {
  const done = await transition(q, base, (now) => (now.previous ? { draft: now.draft, published: now.previous, previous: null } : null));
  if (done === "busy") return { ok: false, reason: "busy" };
  if (done.written) await logAdminAction(q, { by, action: "site_content_publish_undone", detail: logged(changedBetween(done.before.published, done.after.published)) });
  return { ok: true, changed: done.written, content: done.after };
}
