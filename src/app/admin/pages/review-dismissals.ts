import { useSyncExternalStore } from "react";

/**
 * Which wording warnings the owner has dismissed on the review (Peter, November 28, 2026). Dismissing says "I have
 * read it, it is fine": it changes no text, and every warning the review showed is still written to the admin log
 * as an override when the owner publishes (the server reads the warnings again; ./actions.ts).
 *
 * Kept for one review only: the value names the review's fingerprint (reviewKey), so a changed draft, which makes a
 * new review, brings every warning back. In sessionStorage, so a reload of the same review keeps them dismissed and
 * nothing outlasts the tab. Storage that is switched off keeps them until the page is left.
 */
export const DISMISSED_KEY = "roger-review-dismissed";
const changed = "roger-review-dismissed";

let unsaved: string | null = null;

/** What is stored now, as text: "" when nothing is. */
export function storedDismissals(): string {
  if (unsaved !== null) return unsaved;
  try {
    return sessionStorage.getItem(DISMISSED_KEY) ?? "";
  } catch {
    return "";
  }
}

/** The warnings dismissed on this review: none for another review's value, or for anything that is not one. */
export function dismissedFor(stored: string | null, review: string): string[] {
  if (!stored) return [];
  try {
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object") return [];
    const { review: of, ids } = value as { review?: unknown; ids?: unknown };
    return of === review && Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function dismissWarning(review: string, id: string) {
  const ids = dismissedFor(storedDismissals(), review);
  const next = JSON.stringify({ review, ids: ids.includes(id) ? ids : [...ids, id] });
  try {
    sessionStorage.setItem(DISMISSED_KEY, next);
    unsaved = null;
  } catch {
    // Kept in the page only.
    unsaved = next;
  }
  window.dispatchEvent(new Event(changed));
}

function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  return () => window.removeEventListener(changed, listener);
}

/**
 * `ready` is false on the server and while React first reads the server's markup: every warning shows and none has
 * a Dismiss button, as with no script at all.
 */
export function useDismissed(review: string): { ready: boolean; ids: string[] } {
  const stored = useSyncExternalStore<string | null>(subscribe, storedDismissals, () => null);
  return stored === null ? { ready: false, ids: [] } : { ready: true, ids: dismissedFor(stored, review) };
}
