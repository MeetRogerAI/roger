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
import { baseline, codeModel, normaliseOverlay, textAt } from "./model";
import { siteRegistry, usableValue } from "./registry";

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
  for (const { field: id, text } of changes) {
    const field = siteRegistry.fields.get(id);
    if (!field) return { ok: false, reason: "unknown-field", field: id };
    if (text === null) continue;
    if (!usableValue(field, text)) return { ok: false, reason: "unusable", field: id };
    if (text.length > field.max) return { ok: false, reason: "too-long", field: id };
  }
  const done = await transition(q, base, (now) => {
    const text = { ...now.draft.text };
    for (const change of changes) {
      if (change.text === null || change.text === textAt(base, change.field)) delete text[change.field];
      else text[change.field] = change.text;
    }
    const draft = { ...now.draft, text };
    return sameOverlay(draft, now.draft) ? null : { ...now, draft };
  });
  if (done === "busy") return { ok: false, reason: "busy" };
  return { ok: true, changed: done.written, content: done.after };
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
    const live = sameOverlay(now.draft, now.published);
    // A draft that is live already is nothing to publish, whoever published it: that is not "changed", it is done.
    moved = !sameOverlay(now.draft, want) || (over !== null && !live && !sameOverlay(now.published, over));
    if (moved || live) return null;
    return { draft: now.draft, published: now.draft, previous: now.published };
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
