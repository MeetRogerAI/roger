"use server";

import { randomBytes } from "node:crypto";
import { refresh, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin/log";
import { query } from "@/lib/db-query";
import { getAmounts } from "@/lib/site/amounts";
import { shortened } from "@/lib/site/content/caption";
import { TYPED_MAX, asRead, draftChanges, reviewKey, saveRefusal, tidyFor, tooLongToRead, wordingOf, wordingWarnings } from "@/lib/site/content/check";
import { fieldLabel, fieldPlace, listWords, placesIn } from "@/lib/site/content/labels";
import { applyOverlay, baseline, listItems, shownOverlay, textAt } from "@/lib/site/content/model";
import { CONTENT_TAG } from "@/lib/site/content/read";
import { ADDED_PREFIX, TOGGLE_ON, fieldsOfItem, isId, resolveField, siteRegistry } from "@/lib/site/content/registry";
import { publish, readStored, sameOverlay, saveDraft, saveList, saveSections, undoPublish, type DraftChange } from "@/lib/site/content/store";

/**
 * The actions of the Pages screens (plan U5). Server actions are public
 * endpoints, so each checks the admin itself, before it reads anything it was
 * sent: only someone the admin area lets in can change a word, whatever page
 * the call came from.
 *
 *   savePageAction      stores typed wording as a DRAFT, or takes one field's
 *                       draft out. No visitor sees a draft, so nothing public
 *                       is expired.
 *   sectionsAction      one press on a page’s section controls: a section
 *                       switched off or on, moved up or down, or all of the
 *                       page’s put back. A draft too.
 *   listAction          one press on a list’s controls: an item moved up or
 *                       down, removed, put back or added with its texts, or
 *                       the whole list put back. A draft too.
 *   publishAction       makes every draft on the site live, for the review the
 *                       owner read (KTD11), and logs each wording warning that
 *                       was published over.
 *   undoPublishAction   puts back what was live before the last publish.
 *
 * The two that change what is live expire the public pages' cached copy with
 * updateTag(CONTENT_TAG): after every call that got as far as the write,
 * whatever it reports, and also when the call throws, because the statement
 * may have landed before what failed (its log row is written after it).
 */

export type SaveState = {
  status: "idle" | "ok" | "error";
  message?: string;
  /** Field id to what is wrong with it, for the message beside that field. */
  errors?: Record<string, string>;
  /** Field id to the wording now stored for it, tidied. */
  saved?: Record<string, string>;
  /** The field whose draft was taken out. */
  reset?: string;
  at?: number;
};

export type PublishState = { status: "idle" | "ok" | "error"; message?: string; at?: number };

const sent = (fd: FormData, name: string): string => {
  const value = fd.get(name);
  return typeof value === "string" ? value.slice(0, TYPED_MAX) : "";
};

const SAVE_BUSY = "Someone else saved at the same moment, so this was not saved. Nothing you typed is lost: press Save draft again.";
const STALE = "This page has changed since you opened it, so nothing was saved. Reload the page and try again.";

/** Saves the fields the form sends (those the owner changed) into the draft, all or none, or resets one field. */
export async function savePageAction(fd: FormData): Promise<SaveState> {
  await requireAdmin();
  const failed = (message: string, errors?: Record<string, string>): SaveState => ({ status: "error", message, ...(errors ? { errors } : {}), at: Date.now() });
  const page = siteRegistry.pages.find((entry) => entry.id === sent(fd, "page"));
  if (!page) return failed(STALE);
  // A built-in field, or a field of an item added in the admin (whether that item exists is the store's to say).
  const onPage = (id: string) => {
    const field = resolveField(id);
    return field && field.page === page.id ? field : null;
  };
  /** False for a text of an item added here: it has no original wording, so it can be neither reset nor left empty. */
  const hasOriginal = (id: string) => textAt(baseline, id) !== undefined;

  const reset = sent(fd, "reset");
  if (reset) {
    const field = onPage(reset);
    // A text with no original has nothing to go back to. (A switch does: off.)
    if (!field || (!hasOriginal(field.id) && field.kind !== "toggle")) return failed(STALE);
    const done = await saveDraft(query, [{ field: field.id, text: null }]);
    if (!done.ok) return failed(SAVE_BUSY);
    refresh();
    return { status: "ok", reset: field.id, message: "Back to the original wording, saved as a draft.", at: Date.now() };
  }

  const changes: DraftChange[] = [];
  const errors: Record<string, string> = {};
  for (const [name, value] of fd.entries()) {
    if (!name.startsWith("text:") || typeof value !== "string") continue;
    const field = onPage(name.slice("text:".length));
    if (!field) return failed(STALE);
    // A text over what a save reads is refused unread. Cut to that length first, it would be refused with a count that is not its own.
    const text = value.length > TYPED_MAX ? "" : tidyFor(field, value);
    const refusal = value.length > TYPED_MAX ? tooLongToRead(field) : saveRefusal(field, text, hasOriginal(field.id));
    if (refusal) errors[field.id] = refusal;
    else changes.push({ field: field.id, text });
  }
  const wrong = Object.keys(errors).length;
  if (wrong > 0) return failed(`Not saved yet. ${wrong === 1 ? "One field needs" : `${wrong} fields need`} fixing first. Nothing you typed is lost.`, errors);
  if (changes.length === 0) return { status: "ok", message: "Nothing to save: no wording was changed.", at: Date.now() };

  const done = await saveDraft(query, changes);
  if (!done.ok) {
    if (done.reason === "busy" || !done.field) return failed(SAVE_BUSY);
    // A text of an added item that is no longer in its list: another tab removed it.
    if (done.reason === "unknown-field") return failed(STALE);
    return failed("Not saved yet. One field needs fixing first. Nothing you typed is lost.", { [done.field]: "This wording cannot be stored as it is. Change it and save again." });
  }
  refresh();
  return {
    status: "ok",
    saved: Object.fromEntries(changes.map((change) => [change.field, change.text ?? ""])),
    message: "Saved as a draft. Visitors do not see it until you publish.",
    at: Date.now(),
  };
}

export type SectionsState = { status: "idle" | "ok" | "error"; message?: string; at?: number };

const DRAFT = "Saved as a draft: visitors see no change until you publish.";
const SECTIONS_BUSY = "Someone else saved at the same moment, so this was not changed. Press again.";

/**
 * One press on a page's section controls (plan U6, R7): `op` is "off", "on", "up", "down" or "reset", and
 * `section` the section it is for. Stored in the draft, so no visitor sees it and nothing public is expired.
 *
 * The page and the section are looked up in the registry: a page with no sections to move (Shared), a fixed
 * section (a page's title) and an id the page does not have are refused, whatever the form says.
 */
export async function sectionsAction(fd: FormData): Promise<SectionsState> {
  await requireAdmin();
  const failed = (message: string): SectionsState => ({ status: "error", message, at: Date.now() });
  const done = (message: string): SectionsState => ({ status: "ok", message, at: Date.now() });
  const page = siteRegistry.pages.find((entry) => entry.id === sent(fd, "page"));
  const op = sent(fd, "op");
  if (!page || !page.sections.some((entry) => !entry.fixed)) return failed(STALE);

  if (op === "reset") {
    const saved = await saveSections(query, { page: page.id, op });
    if (!saved.ok) return failed(saved.reason === "busy" ? SECTIONS_BUSY : STALE);
    refresh();
    return done(saved.changed ? `The sections of this page are back as they were originally. ${DRAFT}` : "The sections of this page are already as they were originally.");
  }

  const section = page.sections.find((entry) => entry.id === sent(fd, "section") && !entry.fixed);
  if (!section || (op !== "off" && op !== "on" && op !== "up" && op !== "down")) return failed(STALE);
  const saved = await saveSections(query, { page: page.id, op, section: section.id });
  if (!saved.ok) return failed(saved.reason === "busy" ? SECTIONS_BUSY : STALE);
  refresh();
  const name = (id: string) => `“${page.sections.find((entry) => entry.id === id)?.label ?? ""}”`;
  const at = saved.layout.order.indexOf(section.id);
  if (!saved.changed) {
    if (op === "up") return done(`${name(section.id)} is already the first section.`);
    if (op === "down") return done(`${name(section.id)} is already the last section.`);
    return done(`${name(section.id)} is already switched ${op}.`);
  }
  if (op === "off") return done(`${name(section.id)} is switched off. ${DRAFT}`);
  if (op === "on") return done(`${name(section.id)} is switched back on. ${DRAFT}`);
  return done(`${name(section.id)} is now ${op === "up" ? `above ${name(saved.layout.order[at + 1])}` : `below ${name(saved.layout.order[at - 1])}`}. ${DRAFT}`);
}

export type ListState = {
  status: "idle" | "ok" | "error";
  message?: string;
  /** For a refused "add": the new item's field (by its key, "q") to what is wrong with it. */
  errors?: Record<string, string>;
  /** After "add": the new item's id, so the screen can take the focus to it. */
  added?: string;
  at?: number;
};

const LIST_BUSY = "Someone else saved at the same moment, so this was not changed. Press again.";

/** A new item's id: "x-" and twelve characters nobody chose. Unique among everything ever added, which is all it has to be. */
const newItemId = () => `${ADDED_PREFIX}${randomBytes(6).toString("hex")}`;

/**
 * One press on a list's controls (plan U7, R8). `op` is "up", "down", "remove" or "back" with `item`; "add" with
 * the new item's fields as `new:<key>`; or "reset". Stored in the draft, so no visitor sees it and nothing public
 * is expired.
 *
 * The page, the list and the item are looked up, never trusted: a list of another page, an item the list does not
 * have, and more or fewer items than the list's page can draw are refused, whatever the form says. A new item's
 * texts are tidied and held to the same limits as a built-in item's, and its id is made here.
 */
export async function listAction(fd: FormData): Promise<ListState> {
  await requireAdmin();
  const failed = (message: string, errors?: Record<string, string>): ListState => ({ status: "error", message, ...(errors ? { errors } : {}), at: Date.now() });
  const done = (message: string, added?: string): ListState => ({ status: "ok", message, ...(added ? { added } : {}), at: Date.now() });
  const page = siteRegistry.pages.find((entry) => entry.id === sent(fd, "page"));
  const list = siteRegistry.lists.get(sent(fd, "list"));
  if (!page || !list || list.page !== page.id) return failed(STALE);
  const op = sent(fd, "op");
  const words = listWords(list);
  const Noun = list.item;
  const amounts = await getAmounts();
  /** An item by its wording in a draft, as a visitor reads it: “What does it cost?”. */
  const named = (draft: Parameters<typeof wordingOf>[0], item: string) => `“${shortened(asRead(wordingOf(draft, fieldsOfItem(list, item)[0]?.id ?? ""), amounts))}”`;
  const refusedBy = (reason: string): ListState => {
    if (reason === "busy") return failed(LIST_BUSY);
    if (reason === "full") return failed(`Not added: this list already has ${list.max} ${words.many}, which is the most it can hold. ${words.limits} Remove one first.`);
    if (reason === "too-few") return failed(`Not removed: this list needs at least ${list.min} ${words.many}. ${words.limits}`);
    return failed(STALE);
  };
  // A list that can only be reordered refuses the rest here, before anything is read.
  if (list.min === list.max && (op === "add" || op === "remove" || op === "back")) return failed(words.limits);

  if (op === "reset") {
    const saved = await saveList(query, { list: list.id, op });
    if (!saved.ok) return refusedBy(saved.reason);
    refresh();
    return done(saved.changed ? `This list is back to the original ${words.many}, in the original order. ${DRAFT}` : "This list is already the original one.");
  }

  if (op === "add") {
    const id = newItemId();
    const fields = new Map<string, string>();
    const errors: Record<string, string> = {};
    for (const field of fieldsOfItem(list, id)) {
      const key = field.path.at(-1)!;
      const value = fd.get(`new:${key}`);
      if (field.kind === "toggle") {
        if (value === TOGGLE_ON) fields.set(key, TOGGLE_ON);
        continue;
      }
      const typed = typeof value === "string" ? value : "";
      const text = typed.length > TYPED_MAX ? "" : tidyFor(field, typed);
      const refusal = typed.length > TYPED_MAX ? tooLongToRead(field) : saveRefusal(field, text, false);
      if (refusal) errors[key] = refusal;
      else fields.set(key, text);
    }
    const wrong = Object.keys(errors).length;
    if (wrong > 0) return failed(`Not added yet. ${wrong === 1 ? "One field needs" : `${wrong} fields need`} filling in or fixing first. Nothing you typed is lost.`, errors);
    const saved = await saveList(query, { list: list.id, op, id, fields });
    if (!saved.ok) {
      if (saved.field) return failed("Not added yet. One field needs fixing first. Nothing you typed is lost.", { [saved.field]: "This wording cannot be stored as it is. Change it and add again." });
      return refusedBy(saved.reason);
    }
    refresh();
    return done(`Added: ${Noun.toLowerCase()} ${named(saved.content.draft, id)} is number ${saved.items.indexOf(id) + 1} of ${saved.items.length}. ${DRAFT}`, id);
  }

  const item = sent(fd, "item");
  if (!isId(item) || (op !== "up" && op !== "down" && op !== "remove" && op !== "back")) return failed(STALE);
  // Named before it goes: a removed item's wording is read from the draft that still has it.
  const before = op === "remove" ? await readStored(query) : null;
  const saved = await saveList(query, { list: list.id, op, item });
  if (!saved.ok) return refusedBy(saved.reason);
  refresh();
  const at = saved.items.indexOf(item);
  const name = named(before?.draft ?? saved.content.draft, item);
  if (op === "remove") {
    const original = listItems(baseline, list.id).includes(item);
    return done(`${Noun} ${name} is removed from the list. ${DRAFT}${original ? " “Put back” under the list brings it back." : ""}`);
  }
  if (op === "back") return done(`${Noun} ${name} is back in the list, as number ${at + 1} of ${saved.items.length}. ${DRAFT}`);
  if (!saved.changed) return done(`${Noun} ${name} is already the ${op === "up" ? "first" : "last"} one.`);
  return done(`${Noun} ${name} is now number ${at + 1} of ${saved.items.length}, ${op === "up" ? `above ${named(saved.content.draft, saved.items[at + 1])}` : `below ${named(saved.content.draft, saved.items[at - 1])}`}. ${DRAFT}`);
}

const MOVED = "The drafts, the site or the warnings have changed since this list was made, so nothing was published. The list on this screen is the new one: read it, then publish.";
const NOTHING = "Nothing was waiting to be published. Everything you have saved is on the site.";
const PUBLISH_BUSY = "Someone else changed the site’s words at the same moment, so nothing was published. Press the button again.";

/**
 * Makes every draft on the site live. `review` is the fingerprint of the list the owner was shown: the draft, what
 * was on the site, and the warnings. Anything else than that list is not published (KTD11).
 */
export async function publishAction(fd: FormData): Promise<PublishState> {
  const by = await requireAdmin();
  const shown = sent(fd, "review");
  const failed = (message: string): PublishState => ({ status: "error", message, at: Date.now() });

  const stored = await readStored(query);
  // Nothing is waiting: the button was pressed a second time, or on a review the browser's Back button brought back
  // after its publish. That is no change to warn about. The cached copy is expired all the same: an earlier try may
  // have published and then failed.
  // What counts is what the draft SHOWS: wording it keeps for an item it has removed from a list is nothing to publish.
  if (sameOverlay(shownOverlay(baseline, stored.draft), stored.published)) {
    updateTag(CONTENT_TAG);
    refresh();
    return { status: "ok", message: NOTHING, at: Date.now() };
  }
  const warnings = wordingWarnings(draftChanges(stored), await getAmounts());
  if (!shown || reviewKey(stored, warnings) !== shown) {
    refresh();
    return failed(MOVED);
  }

  let done: Awaited<ReturnType<typeof publish>>;
  try {
    done = await publish(query, by, stored.draft, { over: stored.published, note: { from: "pages", ...(warnings.length > 0 ? { publishedOverWarnings: warnings.length } : {}) } });
    if (done.ok && done.changed) {
      // One row for each warning the owner published over (plan R16): the rule, the field and the words. Never the whole text.
      const places = placesIn(applyOverlay(baseline, stored.draft));
      for (const warning of warnings) {
        const place = fieldPlace(warning.field);
        await logAdminAction(query, {
          by,
          action: "site_content_wording_override",
          detail: { field: warning.field.id, where: `${place.page}, ${place.section}: ${fieldLabel(warning.field, siteRegistry, places).full}`, rule: warning.rule, says: warning.says, words: warning.found.map((found) => found.words) },
        });
      }
    }
  } catch (failure) {
    updateTag(CONTENT_TAG);
    throw failure;
  }
  if (!done.ok) {
    refresh();
    return failed(done.reason === "busy" ? PUBLISH_BUSY : MOVED);
  }
  updateTag(CONTENT_TAG);
  refresh();
  return { status: "ok", message: done.changed ? "Published. Visitors see the changes from their next page view." : NOTHING, at: Date.now() };
}

/** Puts back what the site showed before the last publish. The drafts stay as they are. */
export async function undoPublishAction(): Promise<PublishState> {
  const by = await requireAdmin();
  let done: Awaited<ReturnType<typeof undoPublish>>;
  try {
    done = await undoPublish(query, by);
  } catch (failure) {
    updateTag(CONTENT_TAG);
    throw failure;
  }
  if (!done.ok) return { status: "error", message: "Someone else changed the site’s words at the same moment, so nothing was undone. Press the button again.", at: Date.now() };
  updateTag(CONTENT_TAG);
  refresh();
  return {
    status: "ok",
    message: done.changed ? "Undone. The site shows what it showed before the last publish. Your drafts are still here, to fix and publish again." : "There is no publish to undo.",
    at: Date.now(),
  };
}
