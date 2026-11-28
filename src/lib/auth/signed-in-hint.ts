"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { hasSignedInHint, SIGNED_IN_MARK } from "./hint-cookie";

/**
 * For the public header (spec A.3): true when the visitor appears to be
 * signed in, so the header can show "Open Roger" in place of "Sign in" and
 * "Start free".
 *
 * Renders as signed out on the server, then reads a readable hint cookie in
 * the browser. It never blocks rendering and makes no request. It is a hint
 * only: use it to choose a link, never to show private data.
 *
 * Before React arrives, the root layout's head script has already marked
 * `<html>` from the same cookie, and the stylesheet shows the signed-in
 * header under that mark. After every render this hook sets the mark again
 * from the cookie as it is now, before the browser paints, so the mark can
 * only ever agree with what React renders: it goes when the hint goes (sign
 * out here, in another tab, or by a server action), and comes with it (sign
 * in by a redirect or a client navigation). It is never removed on the strength of
 * the server's "signed out" snapshot that hydration renders with first, which
 * would flash the signed-out pair for one frame.
 *
 *   const signedIn = useSignedInHint();
 *   return signedIn ? <Link href="/app">Open Roger</Link> : <SignedOutLinks />;
 */
export function useSignedInHint(): boolean {
  const signedIn = useSyncExternalStore(subscribe, read, () => false);
  useLayoutEffect(() => {
    try {
      document.documentElement.toggleAttribute(SIGNED_IN_MARK, read());
    } catch {
      // No DOM to mark: nothing styled by the mark either.
    }
  });
  return signedIn;
}

function read(): boolean {
  try {
    return hasSignedInHint(document.cookie);
  } catch {
    return false;
  }
}

// Cookies fire no change events. Re-check when the tab regains focus, which
// covers signing in or out in another tab, and when the page comes back from
// the back-forward cache.
function subscribe(onChange: () => void) {
  window.addEventListener("focus", onChange);
  window.addEventListener("pageshow", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    window.removeEventListener("pageshow", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}
