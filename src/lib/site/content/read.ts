/**
 * What a public page reads of the stored site content (plan KTD8): one
 * cached, tagged read of what the site has published, and the function
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
 */
import { cacheLife, cacheTag } from "next/cache";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { emptyOverlay, type Overlay } from "./format";
import { composeOverlays, releasedOverlay } from "./model";
import { readPublished } from "./store";

export const CONTENT_TAG = "site-content";

/**
 * The site's own published edits, as an overlay on the baseline. "No database" is a true answer and is returned
 * here. "The database did not answer" is not one: it is thrown, so it is never what the cache keeps.
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
 * Everything stored that a public page should show, as ONE overlay on the code copy: the release file with the
 * site's published edits on it. With no database, or when the read fails, it is the release file alone, which is
 * the built-in wording (plan R18). It never throws.
 */
export async function getSiteContent(): Promise<Overlay> {
  let published = emptyOverlay;
  try {
    published = await cachedPublished();
  } catch (error) {
    console.error("[site content] The published content could not be read. Pages show the built-in wording.", error instanceof Error ? error.message : error);
  }
  return composeOverlays(releasedOverlay, published);
}
