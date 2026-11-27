"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { sectionsAction, type SectionsState } from "./actions";

/**
 * A page's sections, each with a switch and two buttons (plan U6, R7): on or
 * off, move up, move down, and one button that puts them all back.
 *
 * EVERY PRESS IS SAVED AT ONCE, AS A DRAFT. There is nothing to type here, so
 * there is no Save button: the list on screen is always what the server
 * holds, and the line under it says what the last press did. No visitor sees
 * any of it until the owner publishes, which the panel says where it says
 * what the controls do.
 *
 * THE LIST IS THE SERVER'S. A press calls the action, the action refreshes
 * the page's data, and the rows arrive in their new order as props. Nothing
 * is guessed ahead of the answer, so a press that did not get through leaves
 * the list as it is, with the reason under it.
 *
 * THE KEYBOARD. Every control is a button and stays one: a control that has
 * nothing to do (move the first section up) is marked aria-disabled, not
 * disabled, so the focus is never thrown off it and a second press cannot be
 * lost. After a move the row is somewhere else in the list, and the focus
 * goes with it, to the same button of the same section, so "Move up, Move
 * up" on the keyboard moves one section twice. The focus is given back once
 * per press: this screen can be hidden and shown again (Next keeps it alive),
 * and an effect that ran again must not pull the focus a second time
 * (docs/solutions/ui-bugs/next16-hidden-page-runs-mount-effects-again-…).
 *
 * This file must not import the registry or the labels (they reach the
 * settings reader): every word arrives as a prop.
 */
export type SectionRow = {
  id: string;
  label: string;
  off: boolean;
  /** True when this section's switch or its place is saved as a draft and not published yet. */
  waiting: boolean;
  /** Where its words are on this screen, or null for a section with no words of its own. */
  jump: string | null;
  /** What the owner should know about it, one sentence each. */
  notes: string[];
};

const idle: SectionsState = { status: "idle" };
const LOST = "That did not get through, so nothing was changed. Check your connection and press again. If it keeps happening, sign in again in another tab, then come back here.";

const chip = "rounded-full border px-2 py-0.5 text-meta";
const control = "inline-flex min-h-10 items-center rounded-full border border-rule-strong px-3.5 text-small text-ink hover:bg-ground-2 aria-disabled:cursor-default aria-disabled:border-rule aria-disabled:text-ink-2 aria-disabled:opacity-60 aria-disabled:hover:bg-transparent";

type Press = { op: "on" | "off" | "up" | "down"; section: string } | { op: "reset" };

export function SectionControls({
  page,
  headingId,
  rows,
  rearranged,
  resetLabel,
  waiting,
  reviewAddress,
}: {
  page: string;
  /** The id of the panel's heading, which the review links to. The page's own: two editing screens can be in the document together, one of them hidden. */
  headingId: string;
  /** The page's sections in the order the draft has them. */
  rows: SectionRow[];
  /** True when the draft has the sections otherwise than the original: the reset button shows. */
  rearranged: boolean;
  resetLabel: string;
  /** How many section changes are saved as a draft and not published yet. */
  waiting: number;
  reviewAddress: string;
}) {
  const [state, setState] = useState<SectionsState>(idle);
  const [pending, start] = useTransition();
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  /**
   * The control that was pressed, to give the focus back to when the rows have moved under it. `from` is the order
   * of the rows at the press. Cleared once the new order has arrived, and when this screen is hidden: an effect that
   * runs again when the screen is shown must find nothing here.
   */
  const back = useRef<{ section: string | null; control: string; from: string } | null>(null);
  useEffect(
    () => () => {
      back.current = null;
    },
    [],
  );

  const order = rows.map((row) => row.id).join(" ");
  useEffect(() => {
    const to = back.current;
    if (!to || pending) return;
    // The answer and the new rows can arrive in one render or in two. After the rows have changed, this was the last time.
    if (order !== to.from) back.current = null;
    // Not when the owner has gone on to something outside the panel meanwhile.
    const at = document.activeElement;
    if (at && at !== document.body && !panel.current?.contains(at)) {
      back.current = null;
      return;
    }
    // Only this panel's own controls: another screen kept alive and hidden may hold controls with the same names.
    const buttons = [...(panel.current?.querySelectorAll<HTMLElement>(`[data-control="${to.control}"]`) ?? [])];
    const button = to.section === null ? buttons[0] : buttons.find((el) => el.closest("[data-section-row]")?.getAttribute("data-section-row") === to.section);
    // The reset button goes away once the sections are back: the focus goes to the panel's heading, not to nowhere.
    const target = button ?? (to.section === null ? heading.current : null);
    if (!target || target === at) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  }, [order, pending, rearranged]);

  const press = (what: Press, controlName: string) => {
    if (pending) return;
    // A switch stays where it is, and keeps the focus by itself.
    if (controlName !== "switch") back.current = { section: what.op === "reset" ? null : what.section, control: controlName, from: order };
    const fd = new FormData();
    fd.set("page", page);
    fd.set("op", what.op);
    if (what.op !== "reset") fd.set("section", what.section);
    start(async () => {
      try {
        setState(await sectionsAction(fd));
      } catch {
        setState({ status: "error", message: LOST });
      }
    });
  };

  return (
    <section ref={panel} data-sections aria-labelledby={headingId} className="rounded-[8px] border border-rule bg-surface p-4 sm:p-5">
      <h2 ref={heading} id={headingId} tabIndex={-1} className="text-title">
        Sections of this page
      </h2>
      <p className="mt-2 text-small text-ink-2">
        The page shows these from top to bottom. Switch one off to take it off the page, or move it up or down. Each press is saved straight away as a draft: visitors see no change until you publish.
      </p>

      <ol aria-busy={pending} className="mt-4 divide-y divide-rule border-y border-rule">
        {rows.map((row, i) => {
          const first = i === 0;
          const last = i === rows.length - 1;
          return (
            <li key={row.id} data-section-row={row.id} data-off={row.off ? "" : undefined} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
              <div className="min-w-0 flex-1 basis-[16rem]">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-small">
                  <span aria-hidden="true" className="w-5 shrink-0 tabular-nums text-ink-2">
                    {i + 1}
                  </span>
                  <span data-name className={`min-w-0 font-[620] [overflow-wrap:anywhere] ${row.off ? "text-ink-2" : ""}`}>
                    {row.label}
                  </span>
                  {row.off && (
                    <span data-mark="off" className={`${chip} border-rule-strong text-ink-2`}>
                      Switched off: not on the page
                    </span>
                  )}
                  {row.waiting && (
                    <span data-mark="draft" className={`${chip} border-accent text-accent`}>
                      Draft, not published yet
                    </span>
                  )}
                </p>
                {(row.notes.length > 0 || row.jump) && (
                  <p className="mt-1 pl-[1.875rem] text-meta text-ink-2">
                    {row.notes.join(" ")}
                    {row.jump && (
                      <>
                        {row.notes.length > 0 ? " " : ""}
                        <a href={`#${row.jump}`} className="tlink">
                          Go to its words<span className="sr-only">: {row.label}</span>
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-[1.875rem] sm:pl-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!row.off}
                  aria-label={`Show “${row.label}” on the page`}
                  aria-disabled={pending || undefined}
                  data-control="switch"
                  onClick={() => press({ op: row.off ? "on" : "off", section: row.id }, "switch")}
                  className="group inline-flex min-h-10 items-center gap-2 rounded-full pr-1 text-small"
                >
                  <span aria-hidden="true" className="relative inline-block h-6 w-11 shrink-0 rounded-full border border-rule-strong bg-ground-2 transition-colors group-aria-checked:border-ink group-aria-checked:bg-ink motion-reduce:transition-none">
                    <span className="absolute left-0.5 top-0.5 size-[1.125rem] rounded-full bg-ink-2 transition-transform group-aria-checked:translate-x-5 group-aria-checked:bg-surface motion-reduce:transition-none" />
                  </span>
                  <span aria-hidden="true" className="w-7 font-[600]">
                    {row.off ? "Off" : "On"}
                  </span>
                </button>
                <button type="button" data-control="up" aria-disabled={first || pending || undefined} onClick={() => press({ op: "up", section: row.id }, "up")} className={control}>
                  Move up<span className="sr-only">: {row.label}</span>
                </button>
                <button type="button" data-control="down" aria-disabled={last || pending || undefined} onClick={() => press({ op: "down", section: row.id }, "down")} className={control}>
                  Move down<span className="sr-only">: {row.label}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Always in the page, so a screen reader hears what a press did. */}
      <p role={state.status === "error" ? "alert" : "status"} data-message={state.status} className={`text-small ${state.status === "error" ? "text-error" : "text-ink"} ${state.message ? "mt-3" : ""}`}>
        {state.message}
      </p>

      {waiting > 0 && (
        <p data-sections-waiting className="mt-3 text-small">
          {waiting === 1 ? "1 change to these sections is" : `${waiting} changes to these sections are`} saved as a draft and not on the site yet.{" "}
          <Link href={reviewAddress} className="tlink">
            Review and publish
          </Link>
        </p>
      )}

      {rearranged && (
        <p className="mt-4">
          <button type="button" data-control="reset" data-sections-reset aria-disabled={pending || undefined} onClick={() => press({ op: "reset" }, "reset")} className={control}>
            {resetLabel}
          </button>
        </p>
      )}
    </section>
  );
}
