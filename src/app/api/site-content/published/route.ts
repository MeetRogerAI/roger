import { connection } from "next/server";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { releaseExport } from "@/lib/site/content/export";
import { emptyOverlay } from "@/lib/site/content/format";
import { readPublishedForRelease } from "@/lib/site/content/store";

/**
 * The release export (plan U10, KTD9, R19): what this site shows a visitor, as
 * the overlay the next release's src/data/site/released.json should hold. The
 * release snapshot reads it (scripts/snapshot-content.mjs, `npm run
 * snapshot-content`), from preview, while a release is being prepared.
 *
 * PUBLIC, AND READ-ONLY. It needs no session, so the developer's command needs
 * no secret, and it holds nothing a visitor to the site cannot already read:
 * the published wording, sections and lists of the covered pages, and the
 * release file's wording for whatever the site does not show
 * (src/lib/site/content/export.ts). Never a draft, the previous published
 * content, an admin's name or a time. It reads only the published part of the
 * stored row (readPublishedForRelease), with no draft branch, so neither Draft
 * Mode nor an admin's session can turn it to the drafts. `GET` only: Next
 * answers every other method with 405.
 *
 * READ STRAIGHT FROM THE DATABASE, not through the pages' cached reader. That
 * cache is kept per server instance and from the build's prerender, and a
 * publish expires it only on the instance that ran it: a snapshot answered
 * from it could miss an edit published minutes earlier, without a word. A
 * release is taken a few times a year; one small query each time costs
 * nothing (the library's search reads the database on every request too).
 *
 * NEVER A PARTIAL ANSWER. When the published content cannot be read (the
 * database does not answer, or the row is not stored content at all), the
 * answer is 503 with no overlay, so a snapshot taken during an outage cannot
 * release the built-in wording over every unreleased edit. When what is
 * published cannot be released as it is (a wording longer than its field
 * allows today, or something stored that this code cannot read and a release
 * would lose), the answer is 409 with the list of what to fix.
 *
 * NEVER STORED. `connection()` keeps the build from prerendering it, and
 * `Cache-Control: no-store` keeps every cache between here and the script
 * from keeping an answer. No CORS header: the script runs in Node, and no
 * page of another site has any business reading this.
 */
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex",
  "x-content-type-options": "nosniff",
};

const answer = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(`${JSON.stringify(body, null, 2)}\n`, { status, headers: { ...HEADERS, ...extra } });

export async function GET(): Promise<Response> {
  await connection();
  let read: Awaited<ReturnType<typeof readPublishedForRelease>>;
  try {
    // "No database" is a true answer: the site shows its release file alone, and so does the export.
    read = hasDb() ? await readPublishedForRelease(query) : { published: emptyOverlay, lost: [] };
  } catch (error) {
    console.error("[site content] The release export could not read the published content.", error instanceof Error ? error.message : error);
    return answer(503, { error: "The published content could not be read just now, so there is nothing to release. Try again in a minute." }, { "retry-after": "60" });
  }
  const release = releaseExport(read.published, { lost: read.lost });
  if (!release.ok) return answer(409, { error: "What this site has published cannot be released as it is. Fix each of these in Pages, publish, and take the snapshot again.", problems: release.problems });
  return answer(200, release.overlay);
}
