"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";

/**
 * The in-section navigation of "Cora Curation Examples" (Peter's third
 * homepage review, November 27, 2026): a row of short titles, and under it
 * the examples.
 *
 * What the server sends works with no script: every example is in the page,
 * one under another, and each short title is a link to its example.
 *
 * Once script is running the row is a set of tabs and one example shows at a
 * time (globals.css hides the others from the first paint, by the mark the
 * server puts on the first one, so nothing moves when this starts). The
 * roles are given only then, so a screen reader is never told of tabs that
 * do not switch anything. Left and Right move between the tabs and show the
 * one they land on, Home and End go to the first and the last, and Tab goes
 * from the row into the example.
 *
 * An example's own address ("#examples-prospects": what a short title links
 * to with no script, and what a press on one leaves in the address bar when
 * it lands before the page is alive) shows that example and brings it into
 * view. Without that the address would name an example that is hidden, and
 * the page would sit at its top showing the first one.
 *
 * Nothing here looks an element up by its id: a page left by a click stays in
 * the document, hidden, and may hold the same ids.
 */

/** The tab a key moves to from `current`, or null for a key that does not move. */
export function tabAfterKey(key: string, current: number, count: number): number | null {
  if (count < 1) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

const never = () => () => {};

/** The tab that shows, and the page's address after "#" when that was last worked out. */
export type Shown = { index: number; at: string };

export const firstShown: Shown = { index: 0, at: "" };

/** The tab the page's address names ("#examples-prospects"), or -1 when it names none of them. */
export function tabFromHash(hash: string, id: string, tabIds: readonly string[]): number {
  return tabIds.findIndex((tabId) => hash === `#${id}-${tabId}`);
}

/**
 * What shows once the page's address is `hash`. The first example shows until one is picked on the row or the
 * address names one, and whichever of the two happened last decides. An address that is new and names an example
 * shows that one. An address that names none ("#price", or nothing) changes nothing, and neither does the address
 * it was already worked out for, so a pick made since then stands.
 */
export function shownAfterAddress(shown: Shown, hash: string, id: string, tabIds: readonly string[]): Shown {
  if (shown.at === hash) return shown;
  const named = tabFromHash(hash, id, tabIds);
  return { index: named >= 0 ? named : shown.index, at: hash };
}

function watchHash(changed: () => void) {
  window.addEventListener("hashchange", changed);
  return () => window.removeEventListener("hashchange", changed);
}

export function ExampleTabs({ id, name, tabs, panels }: { /** The start of every element id here. */ id: string; /** The row's name for a screen reader. */ name: string; tabs: { id: string; label: string }[]; /** One for each tab, in the same order. */ panels: ReactNode[] }) {
  // False on the server and while the page is being brought to life, true from then on.
  const live = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
  // "" on the server and while the page is being brought to life, so the first example shows as the server sent it.
  const hash = useSyncExternalStore(
    watchHash,
    () => window.location.hash,
    () => "",
  );
  const tabIds = tabs.map((tab) => tab.id);
  const [stored, setShown] = useState<Shown>(firstShown);
  // State worked out from the address while rendering, which React allows for state that follows something outside it.
  const shown = shownAfterAddress(stored, hash, id, tabIds);
  if (shown !== stored) setShown(shown);
  const selected = shown.index < tabs.length ? shown.index : 0;
  const setSelected = (index: number) => setShown({ index, at: hash });
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  // The browser could not scroll to an example that was hidden when the address named it. Once for each address:
  // a page that is put away and shown again runs this again, and must not be scrolled a second time.
  const named = tabFromHash(hash, id, tabIds);
  const broughtIntoView = useRef("");
  useEffect(() => {
    if (named < 0 || broughtIntoView.current === hash) return;
    broughtIntoView.current = hash;
    panelRefs.current[named]?.scrollIntoView();
  }, [named, hash]);

  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key === " ") {
      // A link does nothing for Space; a tab is pressed by it.
      event.preventDefault();
      return;
    }
    const to = tabAfterKey(event.key, selected, tabs.length);
    if (to === null) return;
    event.preventDefault();
    setSelected(to);
    tabRefs.current[to]?.focus();
  };

  return (
    <>
      {tabs.length > 1 && (
        <div className="flex justify-center">
          <div data-example-tabs role={live ? "tablist" : undefined} aria-label={live ? name : undefined} className="flex w-full max-w-[44rem] flex-col gap-1 rounded-[24px] border border-rule bg-ground-2 p-1 sm:w-auto sm:flex-row sm:rounded-full">
            {tabs.map((tab, i) => (
              <a
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[i] = element;
                }}
                id={`${id}-tab-${tab.id}`}
                href={`#${id}-${tab.id}`}
                data-example-tab={tab.id}
                data-selected={i === selected ? "yes" : "no"}
                role={live ? "tab" : undefined}
                aria-selected={live ? i === selected : undefined}
                aria-controls={live ? `${id}-${tab.id}` : undefined}
                tabIndex={live && i !== selected ? -1 : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  setSelected(i);
                }}
                onKeyDown={onKeyDown}
                className="flex min-h-11 items-center justify-center rounded-full px-5 py-2 text-center text-small font-semibold text-ink-2 transition-colors duration-[180ms] hover:text-ink"
              >
                {tab.label}
              </a>
            ))}
          </div>
        </div>
      )}
      <div className={tabs.length > 1 ? "mt-10" : undefined}>
        {panels.map((panel, i) => (
          <div
            key={tabs[i].id}
            ref={(element) => {
              panelRefs.current[i] = element;
            }}
            id={`${id}-${tabs[i].id}`}
            data-example-panel={tabs[i].id}
            data-selected={i === selected ? "yes" : "no"}
            role={live && tabs.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={live && tabs.length > 1 ? `${id}-tab-${tabs[i].id}` : undefined}
            className="scroll-mt-20 [&+&]:mt-10"
          >
            {panel}
          </div>
        ))}
      </div>
    </>
  );
}
