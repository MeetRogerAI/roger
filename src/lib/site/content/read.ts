/**
 * What a public page reads of the stored site content (plan KTD8): one
 * cached, tagged read of what the site has published, and the functions
 * around it. Nothing else lives here. Anything worked out from the content
 * belongs to the callers: a function in this file that called getSiteContent
 * by its local name would not see a test's mock of it
 * (docs/solutions/best-practices/feature-switch-module-holds-only-the-read-…).
 *
 * The catch is OUTSIDE the cached function. Caught inside it, one dropped
 * connection would be stored as "this site has no edits", and the built-in
 * wording would be back on the site for the cache's whole hour
 * (docs/solutions/runtime-errors/catch-inside-use-cache-stores-the-fallback-…).
 * A call that throws stores nothing, so the next render reads again.
 *
 * Every write to the content is a server action, and calls
 * updateTag(CONTENT_TAG) so the next view is rendered with it.
 *
 * PREVIEW (plan U9, KTD7, R14). An admin previews the drafts on the real
 * pages through Next's Draft Mode. The function around the cached read asks
 * whether Draft Mode is on; only when it is does it ask whether the viewer is
 * an admin, and only for an admin does it read the draft, with a plain query
 * outside every cache. So:
 *
 * - While a page is prerendered, Draft Mode is always off (Next gives a
 *   prerender an empty Draft Mode, and reading it there makes nothing
 *   dynamic): the admin check and its cookies are never reached, and every
 *   page keeps its static shell.
 * - A visitor without the Draft Mode cookie never reaches them either.
 * - With the cookie, Next renders the page for that request alone, stores
 *   nothing of it, and sends it as `private, no-store`.
 * - The cookie alone shows nothing: the admin check runs on every previewed
 *   render, so a copied cookie, a member who is not an admin and an admin
 *   whose session has ended all get what is published.
 *
 * WHY DRAFT MODE IS NOT READ INSIDE THE CACHED FUNCTION, as the plan's sketch
 * had it. On a client-side navigation to a partially prerendered page ("/"),
 * Next resumes the render from the stored prerender's resume data cache, even
 * in Draft Mode (build/templates/app-page-runtime.js, "RDC for
 * Navigations"): a cached function is answered from what the prerender
 * stored, which says Draft Mode is off. A preview would then lose the drafts
 * at the first click on the homepage's link. Asked here, per request, the
 * answer is the request's own.
 *
 * publishedOverlay is the reader with no draft branch at all, for the
 * release snapshot (U10): Draft Mode cannot turn it to the draft.
 */
import { draftMode } from "next/headers";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { isAdmin } from "@/lib/admin-auth";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { emptyOverlay, type Overlay } from "./format";
import { baseline, composeOverlays, releasedOverlay, shownOverlay } from "./model";
import { readPublished, readStored } from "./store";

export const CONTENT_TAG = "site-content";

/**
 * The site's own published edits, as an overlay on the baseline. "No database" is a true answer and is returned
 * here. "The database did not answer" is not one: it is thrown, so it is never what the cache keeps. It knows
 * nothing of Draft Mode or of who is asking.
 *
 * The lifetime is the questions reader's, which this replaces: over five minutes, so a page can await it outside
 * Suspense and keep its static shell.
 */
async function cachedPublished(): Promise<Overlay> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(CONTENT_TAG);
  if (!hasDb()) return emptyOverlay;
  return readPublished(query);
}

/**
 * The site's published edits, as an overlay on the baseline, read through the same cache as the pages. It has no
 * draft branch: Draft Mode, an admin's session, or both together cannot make it give a draft. It THROWS when the
 * published content cannot be read, so a caller that must not answer with a partial result (the release export,
 * plan KTD9) can say so. "No database" is an empty overlay, which is true.
 */
export async function publishedOverlay(): Promise<Overlay> {
  return cachedPublished();
}

/** What a page is handed: everything stored that it should show, and whether that is an admin's preview of the drafts. */
export type SiteContentView = { content: Overlay; preview: boolean };

/**
 * The drafts as the site would show them once published, for an admin, or null for anyone else and whenever they
 * cannot be read. Asked only in Draft Mode. Read once per request (React's cache), however many parts of the page
 * ask, and never from a shared cache: readStored is a plain query.
 */
const draftForAdmin = cache(async (): Promise<Overlay | null> => {
  try {
    if (!(await isAdmin())) return null;
    if (!hasDb()) return null;
    const stored = await readStored(query);
    // What the draft SHOWS: the wording it keeps for an item it has removed is on no page.
    return shownOverlay(baseline, stored.draft);
  } catch (error) {
    console.error("[site content] The drafts could not be read for the preview. It shows what is published.", error instanceof Error ? error.message : error);
    return null;
  }
});

/**
 * Whether this request is in Draft Mode. Called where there is no request (a script, a test rendering a component
 * on its own), Next throws: that is no preview. Not cached, so that answer is never kept for anyone.
 */
async function previewAsked(): Promise<boolean> {
  try {
    return (await draftMode()).isEnabled;
  } catch {
    return false;
  }
}

/**
 * Everything stored that a public page should show, as ONE overlay on the code copy, and whether it is a preview.
 *
 * For a visitor: the release file with the site's published edits on it. With no database, or when the read
 * fails, it is the release file alone, which is the built-in wording (plan R18).
 *
 * For an admin in Draft Mode: the release file with the site's DRAFTS on it, `preview` true. When the drafts
 * cannot be read, what is published, `preview` false: a bar saying "you are seeing drafts" would not be true.
 *
 * It never throws.
 */
export async function getSiteContentView(): Promise<SiteContentView> {
  let published: Overlay = emptyOverlay;
  try {
    published = await cachedPublished();
  } catch (error) {
    console.error("[site content] The published content could not be read. Pages show the built-in wording.", error instanceof Error ? error.message : error);
  }
  // This request's own Draft Mode, never a cached answer. Always off while a page is prerendered.
  if (await previewAsked()) {
    const draft = await draftForAdmin();
    if (draft) return { content: composeOverlays(releasedOverlay, draft), preview: true };
  }
  return { content: composeOverlays(releasedOverlay, published), preview: false };
}

/** Everything stored that a public page should show, as ONE overlay on the code copy: getSiteContentView's content. It never throws. */
export async function getSiteContent(): Promise<Overlay> {
  return (await getSiteContentView()).content;
}
