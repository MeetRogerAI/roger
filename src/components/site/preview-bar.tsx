/**
 * The bar on every page an admin previews (plan U9, R14): it says that the
 * page shows drafts, and holds the way back to Pages and the way out.
 *
 * It is rendered by the root layout, on the server, only when the content
 * reader says the page is an admin's preview (getSiteContentView): never for
 * a visitor, never from a cookie read of its own. It keeps no state, so the
 * markup the browser gets is the markup React hydrates. "Back to Pages" is
 * not prefetched: the admin's screens are rendered per request.
 *
 * "Exit preview" is a form, not a link: a link can be prefetched, and a
 * prefetch would end the preview before anyone pressed it (the Draft Mode
 * guide). It is a plain form post, answered with a full page load, so no
 * page rendered with the drafts stays in the browser's memory.
 *
 * It sticks to the foot of the window, above the page, and styles only its
 * own wrapper.
 */
import Link from "next/link";

export const PREVIEW_EXIT_ADDRESS = "/admin/pages/preview/exit";

export function PreviewBar() {
  return (
    <aside data-preview-bar aria-label="Preview" className="sticky bottom-0 z-50 border-t-2 border-accent-hover bg-accent text-accent-ink">
      <div className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
        <p role="status" className="min-w-0 text-small">
          <strong className="font-[650]">Preview:</strong> you are seeing unpublished drafts. Visitors see the published site.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/admin/pages" prefetch={false} className="inline-flex min-h-10 items-center text-small underline underline-offset-4">
            Back to Pages
          </Link>
          <form method="post" action={PREVIEW_EXIT_ADDRESS}>
            <button type="submit" data-exit-preview className="min-h-10 rounded-full border-2 border-accent-ink px-4 text-small font-[620] hover:bg-accent-hover">
              Exit preview
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
