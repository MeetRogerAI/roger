"use client";

import { useEffect } from "react";

/**
 * "Only one + at a time should be open. Opening one closes the other" (Peter,
 * November 26, 2026).
 *
 * The rows that fold (the questions, and the sample idea's rows and steps) are
 * native details elements that share a `name`. A browser that knows the
 * attribute closes the others by itself, with no script: Chrome and Edge from
 * 120, Safari from 17.2, Firefox from 130. This is only for a browser older
 * than those, where a shared name does nothing and every row would stay open.
 * It does the same thing by hand, and does nothing where the browser already
 * does it.
 *
 * It renders nothing. A block that has such rows includes it, and however many
 * blocks do, one listener is added for the page.
 */
let listeners = 0;

/** The other open rows that share `opened`'s name within the same document: the ones to close. */
export function othersToClose(opened: { name: string; open: boolean }, all: readonly { name: string; open: boolean }[]): number[] {
  if (!opened.open || opened.name === "") return [];
  return all.flatMap((other, i) => (other !== opened && other.open && other.name === opened.name ? [i] : []));
}

function onToggle(event: Event) {
  const opened = event.target;
  if (!(opened instanceof HTMLDetailsElement)) return;
  const name = opened.getAttribute("name") ?? "";
  if (!opened.open || name === "") return;
  const all = [...document.querySelectorAll<HTMLDetailsElement>("details[name]")];
  const rows = all.map((d) => (d === opened ? { name, open: true } : { name: d.getAttribute("name") ?? "", open: d.open }));
  for (const i of othersToClose(rows[all.indexOf(opened)], rows)) all[i].open = false;
}

export function OneOpen() {
  useEffect(() => {
    // The browser does it by itself where details has `name`.
    if ("name" in HTMLDetailsElement.prototype) return;
    // "toggle" does not bubble, so it is caught on the way down.
    if (listeners++ === 0) document.addEventListener("toggle", onToggle, true);
    return () => {
      if (--listeners === 0) document.removeEventListener("toggle", onToggle, true);
    };
  }, []);
  return null;
}
