"use server";

import { refresh, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin/log";
import { query } from "@/lib/db-query";
import { getAmounts } from "@/lib/site/amounts";
import { TYPED_MAX, draftChanges, reviewKey, saveRefusal, tidyFor, tooLongToRead, wordingWarnings } from "@/lib/site/content/check";
import { fieldLabel, fieldPlace } from "@/lib/site/content/labels";
import { CONTENT_TAG } from "@/lib/site/content/read";
import { siteRegistry } from "@/lib/site/content/registry";
import { publish, readStored, sameOverlay, saveDraft, undoPublish, type DraftChange } from "@/lib/site/content/store";

/**
 * The actions of the Pages screens (plan U5). Server actions are public
 * endpoints, so each checks the admin itself, before it reads anything it was
 * sent: only someone the admin area lets in can change a word, whatever page
 * the call came from.
 *
 *   savePageAction      stores typed wording as a DRAFT, or takes one field's
 *                       draft out. No visitor sees a draft, so nothing public
 *                       is expired.
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
  const onPage = (id: string) => {
    const field = siteRegistry.fields.get(id);
    return field && field.page === page.id ? field : null;
  };

  const reset = sent(fd, "reset");
  if (reset) {
    const field = onPage(reset);
    if (!field) return failed(STALE);
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
    const refusal = value.length > TYPED_MAX ? tooLongToRead(field) : saveRefusal(field, text);
    if (refusal) errors[field.id] = refusal;
    else changes.push({ field: field.id, text });
  }
  const wrong = Object.keys(errors).length;
  if (wrong > 0) return failed(`Not saved yet. ${wrong === 1 ? "One field needs" : `${wrong} fields need`} fixing first. Nothing you typed is lost.`, errors);
  if (changes.length === 0) return { status: "ok", message: "Nothing to save: no wording was changed.", at: Date.now() };

  const done = await saveDraft(query, changes);
  if (!done.ok) {
    if (done.reason === "busy" || !done.field) return failed(SAVE_BUSY);
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
  if (sameOverlay(stored.draft, stored.published)) {
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
      for (const warning of warnings) {
        const place = fieldPlace(warning.field);
        await logAdminAction(query, {
          by,
          action: "site_content_wording_override",
          detail: { field: warning.field.id, where: `${place.page}, ${place.section}: ${fieldLabel(warning.field).full}`, rule: warning.rule, says: warning.says, words: warning.found.map((found) => found.words) },
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
  return { status: "ok", message: done.changed ? "Published. Visitors see the new wording from their next page view." : NOTHING, at: Date.now() };
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
