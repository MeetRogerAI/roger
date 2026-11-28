import Link from "next/link";
import { connection } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { when } from "@/lib/admin/format";
import { recentActions } from "@/lib/admin/log";
import { query } from "@/lib/db-query";
import { draftCount, pageStatus } from "@/lib/site/content/check";
import { REVIEW_ADDRESS, editorAddress, pageCovers } from "@/lib/site/content/labels";
import { siteRegistry } from "@/lib/site/content/registry";
import { getAmounts } from "@/lib/site/amounts";
import { asRead } from "@/lib/site/content/check";
import { releaseDifferences } from "@/lib/site/content/differs";
import { readStoredAsWritten } from "@/lib/site/content/store";
import { LaunchListNote } from "./launch-list";
import { Unreadable, count } from "./parts";
import { UndoPublish } from "./publish-controls";
import { ReleasePanel } from "./release-panel";

/**
 * Pages (plan U5, R5, R13): the pages of the marketing site whose words the
 * owner can change, each with whether it has drafts that are not published
 * and whether its wording differs from the original, and the way into the
 * review that publishes them.
 *
 * Who can open it: whoever the admin area lets in, which is the layout's
 * gate. The page checks again itself, and so does every action.
 */
const mark = "rounded-full border px-2.5 py-0.5 text-meta";

export default async function PagesScreen() {
  await connection();
  if (!(await isAdmin())) return null;
  let stored: Awaited<ReturnType<typeof readStoredAsWritten>>;
  let last: Awaited<ReturnType<typeof recentActions>>[number] | undefined;
  try {
    stored = await readStoredAsWritten(query);
    [last] = await recentActions(query, { actions: ["site_content_published", "site_content_publish_undone", "site_content_reset_to_release"], limit: 1 });
  } catch (error) {
    console.error("[pages] The stored site content could not be read.", error instanceof Error ? error.message : error);
    return <Unreadable />;
  }
  const status = pageStatus(stored);
  const waiting = draftCount(stored);
  const amounts = await getAmounts();
  const differences = releaseDifferences(stored.published, { written: stored.written, read: (text) => asRead(text, amounts) });

  return (
    <section className="max-w-[56rem] space-y-8">
      <header>
        <h1 className="text-h3">Pages</h1>
        <p className="mt-2 text-small text-ink-2">Change the words on the website, switch a page’s sections off or move them, and add to, remove from and reorder its lists. What you save is kept as a draft: visitors do not see it until you publish.</p>
      </header>

      <LaunchListNote />

      <div data-publish-panel className="space-y-4 rounded-[8px] border border-rule bg-surface p-5">
        <h2 className="text-title">Publish</h2>
        {waiting > 0 ? (
          <>
            <p className="text-small">
              <strong className="font-[620]">{count(waiting, "change is", "changes are")} saved as a draft</strong> and not on the site yet. Publishing sends every draft live at once, on all pages.
            </p>
            <Link href={REVIEW_ADDRESS} className="btn btn-m btn-ink">
              Review and publish
            </Link>
          </>
        ) : (
          <p className="text-small text-ink-2">Nothing is waiting. Everything you have saved is on the site.</p>
        )}
        {last && (
          <p data-last className="text-small text-ink-2">
            {last.action === "site_content_published" ? "Last publish" : last.action === "site_content_reset_to_release" ? "Last reset to the release" : "Last publish undone"}: {when(last.createdAt)}, by {last.adminEmail}.
          </p>
        )}
        <UndoPublish available={stored.previous !== null} />
      </div>

      <ReleasePanel differences={differences} stored={stored} drafts={waiting} amounts={amounts} />

      <div>
        <h2 className="text-title">The pages</h2>
        <ul className="mt-4 space-y-3">
          {siteRegistry.pages.map((page) => {
            const s = status.get(page.id) ?? { drafts: 0, edits: 0, ticks: 0, rearranged: false, relisted: false };
            return (
              <li key={page.id} data-page={page.id} className="rounded-[8px] border border-rule bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h3 className="text-small font-[620]">
                    <Link href={editorAddress(page.id)} className="underline underline-offset-4">
                      {page.label}
                    </Link>
                  </h3>
                  <p className="flex flex-wrap gap-2">
                    {s.drafts > 0 ? (
                      <span data-drafts className={`${mark} border-accent text-accent`}>
                        {count(s.drafts, "draft", "drafts")} not published
                      </span>
                    ) : (
                      <span className={`${mark} border-rule text-ink-2`}>No drafts waiting</span>
                    )}
                    {s.edits > 0 ? (
                      <span data-edits className={`${mark} border-rule-strong text-ink`}>
                        {count(s.edits, "text", "texts")} changed from the original
                      </span>
                    ) : (
                      <span className={`${mark} border-rule text-ink-2`}>Original wording</span>
                    )}
                    {s.ticks > 0 && (
                      <span data-ticks className={`${mark} border-rule-strong text-ink`}>
                        {count(s.ticks, "tick box", "tick boxes")} changed from the original
                      </span>
                    )}
                    {s.rearranged && (
                      <span data-rearranged className={`${mark} border-rule-strong text-ink`}>
                        Sections changed from the original
                      </span>
                    )}
                    {s.relisted && (
                      <span data-relisted className={`${mark} border-rule-strong text-ink`}>
                        Lists changed from the original
                      </span>
                    )}
                  </p>
                </div>
                <p className="mt-2 text-small text-ink-2">{pageCovers(page.id)}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
