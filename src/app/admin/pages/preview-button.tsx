/**
 * "Preview" on the Pages screens (plan U9, R14): opens the real page, at its
 * real address, with every draft on it, in a new tab. A plain form post to
 * the preview route, which checks the admin, switches on Draft Mode and sends
 * the tab to the page. The form carries the page's id only: where it goes is
 * the registry's to say (src/app/admin/pages/preview/route.ts).
 *
 * No script: it works the moment the screen is drawn, and draws the same on
 * the server and in the browser.
 */
export const PREVIEW_ADDRESS = "/admin/pages/preview";

export function PreviewButton({ page, label = "Preview", note }: { page: string; label?: string; note?: string }) {
  return (
    <form method="post" action={PREVIEW_ADDRESS} target="_blank" rel="noopener" data-preview={page} className="inline">
      <input type="hidden" name="page" value={page} />
      <button type="submit" className="min-h-10 rounded-full border border-rule-strong px-4 text-small text-ink hover:bg-ground-2">
        {label}
        <span className="sr-only"> (opens in a new tab{note ? `: ${note}` : ""})</span>
      </button>
    </form>
  );
}
