"use client";

import { useEffect, useRef } from "react";

/**
 * Presses the confirm page's button for the reader, once, when the page is
 * really being looked at. A mail scanner that only fetches the link runs no
 * script, so it still changes nothing and the link still works afterwards.
 * The button stays on the page for a browser with no script, or if this fails.
 *
 * It waits until the tab is visible: a browser that loads the page ahead of
 * time, in the background, has not been asked to sign anyone in yet.
 */
export function AutoConfirm() {
  const marker = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const press = () => {
      if (done.current || document.visibilityState !== "visible") return;
      const form = marker.current?.closest("form");
      if (!form) return;
      done.current = true;
      form.requestSubmit();
    };
    press();
    document.addEventListener("visibilitychange", press);
    return () => document.removeEventListener("visibilitychange", press);
  }, []);
  return <span ref={marker} hidden />;
}
