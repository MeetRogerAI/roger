"use client";

/**
 * Part of the preview bar (plan U9): when the admin comes back to a tab that shows the preview, the page is drawn
 * again by the server. The root layout, which holds the bar and the header's drafted labels, is not drawn again on
 * a click from page to page, so without this a second tab kept the bar and the drafted labels after the admin
 * ended the preview or signed out in another one, until a reload. Drawn again, the server leaves the bar out and
 * the header goes back to the published labels when the preview is over, and shows the latest drafts while it is
 * not. It renders nothing.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Calls `refresh` whenever the window gets focus back or the tab is shown again, once for the two events a switch
 * of tabs usually fires together. Returns what removes the listeners.
 */
export function onReturn(
  win: Pick<Window, "addEventListener" | "removeEventListener">,
  doc: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">,
  refresh: () => void,
  now: () => number = Date.now,
): () => void {
  let last = -Infinity;
  const once = () => {
    if (now() - last < 1000) return;
    last = now();
    refresh();
  };
  const shown = () => {
    if (doc.visibilityState === "visible") once();
  };
  win.addEventListener("focus", once);
  doc.addEventListener("visibilitychange", shown);
  return () => {
    win.removeEventListener("focus", once);
    doc.removeEventListener("visibilitychange", shown);
  };
}

export function PreviewRefresh() {
  const router = useRouter();
  // A listener only: it runs again each time a hidden page is shown (Next keeps pages left by a click), which is fine.
  useEffect(() => onReturn(window, document, () => router.refresh()), [router]);
  return null;
}
