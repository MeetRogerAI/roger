"use client";

import { useSyncExternalStore } from "react";
import { hasSignedInHint } from "./hint-cookie";

/**
 * For the public header (spec A.3): true when the visitor appears to be
 * signed in, so the header can show "Open Roger" in place of "Sign in" and
 * "Start free".
 *
 * Renders as signed out on the server and on first paint, then reads a
 * readable hint cookie in the browser. It never blocks rendering and makes no
 * request. It is a hint only: use it to choose a link, never to show private
 * data.
 *
 *   const signedIn = useSignedInHint();
 *   return signedIn ? <Link href="/app">Open Roger</Link> : <SignedOutLinks />;
 */
export function useSignedInHint(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

function read(): boolean {
  try {
    return hasSignedInHint(document.cookie);
  } catch {
    return false;
  }
}

// Cookies fire no change events. Re-check when the tab regains focus, which
// covers signing in or out in another tab.
function subscribe(onChange: () => void) {
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}
