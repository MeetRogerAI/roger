"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { itemTitle } from "@/lib/site/content/caption";
import { listAction, type ListState } from "./actions";

/**
 * One list of a page, inside the page's form (plan U7, R8): its items in the
 * order the draft has them, each with Move up, Move down and Remove; the items
 * that were removed, each with Put back; a small form that adds a new item;
 * and one button that puts the whole list back to the original.
 *
 * EVERY PRESS IS SAVED AT ONCE, AS A DRAFT, like a press on the page's
 * sections (section-controls.tsx): the list on screen is always what the
 * server holds, and the line under it says what the last press did. The WORDS
 * of an item are not saved by a press: they are typed into the page's form and
 * saved with its Save draft, like every other text. The two do not disturb
 * each other. The form holds what is typed by field, not by place, so typing
 * that is not saved yet stays in its box when its item moves, and comes back
 * with its item when a removed one is put back.
 *
 * REMOVING ASKS NOTHING WHERE ONE PRESS UNDOES IT. An item of the original
 * list goes to "Removed", with Put back beside it, and its edited wording is
 * kept. An item that was added here has nothing to go back to: removing it
 * deletes its wording, so that one asks first.
 *
 * A NEW ITEM is typed into the form at the foot of the list and joins the
 * list, as its last item, when "Add" is pressed: an item with a text missing
 * is never stored. Until then it is called what it is ("New question"), then
 * by its wording as it is typed.
 *
 * THE KEYBOARD. Every control is a button and stays one: a control that has
 * nothing to do is aria-disabled, not disabled, so the focus is never thrown
 * off it. After a move the focus goes with the item, to the same button. After
 * a removal it goes to that item's Put back (or to the list's heading); after
 * Put back, to the item; after an addition, to the new item's first box. Once
 * per press: this screen can be hidden and shown again, and an effect that ran
 * again must not pull the focus a second time
 * (docs/solutions/ui-bugs/next16-hidden-page-runs-mount-effects-again-…).
 *
 * This file must not import the registry or the labels (they reach the
 * settings reader): every word, limit and id arrives as a prop.
 */
export type ListItem = {
  id: string;
  /** The item's place: "Question 3". */
  place: string;
  /** The wording that names it, as it stands in its first box. */
  wording: string;
  /** True for an item that is not in the original list: removing it cannot be undone. */
  added: boolean;
  /** What about this item is saved as a draft and not on the site yet: "New" or "Moved". Null when nothing is. */
  waiting: string | null;
  /** The item's fields, drawn by the page's form. */
  body: ReactNode;
};

export type NewItemField = {
  /** The field's key in the item: "q". */
  name: string;
  /** "Question". */
  label: string;
  kind: "text" | "toggle";
  rows: number;
  max: number;
  /** For a switch: what it does. */
  hint: string | null;
};

export type ListProps = {
  page: string;
  id: string;
  /** The id of the list's block in the markup, which the review links to. */
  anchor: string;
  /** "The questions of this group". */
  title: string;
  /** What one item is called in a sentence, and several: "question", "questions". */
  one: string;
  many: string;
  /** How many the list can hold, and why, in a sentence. */
  limits: string;
  /** False when the list holds as many as it can; false when it holds as few as it must; true when it can only be reordered. */
  canAdd: boolean;
  canRemove: boolean;
  fixed: boolean;
  items: ListItem[];
  /** The original items the draft has removed, each by its wording. `live`: still on the site until the removal is published. */
  removed: { id: string; wording: string; live: boolean }[];
  /** The fields a new item has. */
  fresh: NewItemField[];
  /** True when the draft has other items than the original, or another order: the reset button shows. */
  changed: boolean;
  /** How many changes to this list are saved as a draft and not published yet. */
  waiting: number;
  reviewAddress: string;
  /** What is typed for a new item and not added yet, by field key. Null while the form is closed. Held by the page's form, so leaving the page asks first. */
  adding: Record<string, string> | null;
  onAdding: (next: Record<string, string> | null) => void;
};

const idle: ListState = { status: "idle" };
const LOST = "That did not get through, so nothing was changed. Check your connection and press again. If it keeps happening, sign in again in another tab, then come back here.";

const clear = "scroll-mb-40";
const chip = "rounded-full border px-2 py-0.5 text-meta";
const control = `inline-flex min-h-10 items-center rounded-full border border-rule-strong px-3.5 text-small text-ink hover:bg-ground-2 aria-disabled:cursor-default aria-disabled:border-rule aria-disabled:text-ink-2 aria-disabled:opacity-60 aria-disabled:hover:bg-transparent ${clear}`;
const box = `mt-1.5 block w-full rounded-[var(--radius-control)] border bg-surface px-3 text-small focus:border-ink ${clear}`;
const wrap = "[overflow-wrap:anywhere]";

type Press = { op: "up" | "down" | "remove" | "back"; item: string } | { op: "add" } | { op: "reset" };
/** Where the focus goes once a press has landed: a control of an item, an item's Put back, a new item's first box, or the list's heading. */
type Back = { to: "control"; item: string; control: string } | { to: "removed"; item: string } | { to: "heading" } | { to: "new" };

export function ListBlock(props: ListProps) {
  const { page, id, anchor, title, one, many, limits, canAdd, canRemove, fixed, items, removed, fresh, changed, waiting, reviewAddress, adding, onAdding } = props;
  const [state, setState] = useState<ListState>(idle);
  const [pending, start] = useTransition();
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  /** Set by a press, used once its answer and the new list have arrived, and cleared when this screen is hidden. */
  const back = useRef<(Back & { from: string }) | null>(null);
  useEffect(
    () => () => {
      back.current = null;
    },
    [],
  );

  const shape = `${items.map((item) => item.id).join(" ")}|${removed.map((item) => item.id).join(" ")}`;
  const added = state.status === "ok" ? state.added : undefined;
  useEffect(() => {
    const to = back.current;
    if (!to || pending) return;
    // The answer and the new list can arrive in one render or in two. After the list has changed, this was the last
    // time. (A new item is only known by the answer: until that is here too, there is nothing to find.)
    if (shape !== to.from && (to.to !== "new" || added)) back.current = null;
    // Not when the owner has gone on to something outside this list meanwhile.
    const at = document.activeElement;
    if (at && at !== document.body && !panel.current?.contains(at)) {
      back.current = null;
      return;
    }
    // Only this list's own controls: another screen kept alive and hidden may hold controls with the same names.
    const find = (selector: string) => panel.current?.querySelector<HTMLElement>(selector) ?? null;
    let target: HTMLElement | null = null;
    if (to.to === "control") target = find(`[data-item-row="${to.item}"] [data-list-control="${to.control}"]`) ?? find(`[data-item-row="${to.item}"] [data-list-control]`);
    else if (to.to === "removed") target = find(`[data-removed-item="${to.item}"] [data-list-control="back"]`) ?? heading.current;
    else if (to.to === "new") target = added ? find(`[data-item-row="${added}"] input, [data-item-row="${added}"] textarea`) : null;
    else target = heading.current;
    if (!target || target === at) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  }, [shape, pending, added, changed]);

  const press = (what: Press, focus: Back) => {
    if (pending) return;
    back.current = { ...focus, from: shape };
    const fd = new FormData();
    fd.set("page", page);
    fd.set("list", id);
    fd.set("op", what.op);
    if (what.op === "add") for (const field of fresh) fd.set(`new:${field.name}`, adding?.[field.name] ?? "");
    else if (what.op !== "reset") fd.set("item", what.item);
    start(async () => {
      let next: ListState;
      try {
        next = await listAction(fd);
      } catch {
        next = { status: "error", message: LOST };
      }
      setState(next);
      // The new item is in the list now: its form closes, and what was typed is in the item's own boxes.
      if (what.op === "add" && next.status === "ok") onAdding(null);
      if (next.status !== "ok") back.current = null;
    });
  };

  const remove = (item: ListItem) => {
    if (!canRemove || pending) return;
    // Only where no press brings it back: an item that was added here has no original to return to.
    if (item.added && !window.confirm(`Remove this ${one} for good? It was added here, so its wording is deleted with it and “Put back” cannot bring it back.`)) return;
    press({ op: "remove", item: item.id }, item.added ? { to: "heading" } : { to: "removed", item: item.id });
  };

  const reset = () => {
    if (pending) return;
    const mine = items.filter((item) => item.added).length;
    // Only where no press brings it back: what was added here is deleted with its wording.
    if (mine > 0 && !window.confirm(`Put this list back to the original? The ${mine === 1 ? `${one} you added is` : `${mine} ${many} you added are`} deleted with ${mine === 1 ? "its" : "their"} wording, and cannot be put back.`)) return;
    press({ op: "reset" }, { to: "heading" });
  };

  const errors = state.status === "error" ? (state.errors ?? {}) : {};
  const newName = itemTitle(`New ${one}`, adding?.[fresh[0]?.name ?? ""] ?? "");
  const type = (name: string, text: string) => onAdding({ ...adding, [name]: text });

  return (
    <div ref={panel} id={anchor} data-list={id} role="group" aria-labelledby={`${anchor}-h`} className="min-w-0 scroll-mt-4 rounded-[8px] border border-rule-strong p-3 sm:p-4">
      <h3 ref={heading} id={`${anchor}-h`} tabIndex={-1} className="text-small font-[620]">
        {title}
      </h3>
      <p data-list-note className="mt-1 text-meta text-ink-2">
        {fixed ? "Move one up or down to change the order." : `Move one up or down, remove one, or add a new ${one} at the foot of the list.`} Each of those is saved straight away as a draft: visitors see no change until you publish. The words
        themselves are saved with Save draft. {limits}
      </p>

      <ol aria-busy={pending} className="mt-4 space-y-4">
        {items.map((item, i) => {
          const name = itemTitle(item.place, item.wording);
          return (
            <li key={item.id} data-item-row={item.id}>
              <fieldset className="min-w-0 rounded-[8px] border border-rule bg-surface p-4 sm:p-5">
                {/* The item's place and its wording as it stands in its first box: nobody has to count to know which one this is. */}
                <legend data-item className={`max-w-full px-1 text-small font-[620] ${wrap}`}>
                  {name}
                </legend>
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <button type="button" data-list-control="up" aria-disabled={i === 0 || pending || undefined} onClick={() => press({ op: "up", item: item.id }, { to: "control", item: item.id, control: "up" })} className={control}>
                    Move up<span className="sr-only">: {name}</span>
                  </button>
                  <button type="button" data-list-control="down" aria-disabled={i === items.length - 1 || pending || undefined} onClick={() => press({ op: "down", item: item.id }, { to: "control", item: item.id, control: "down" })} className={control}>
                    Move down<span className="sr-only">: {name}</span>
                  </button>
                  {!fixed && (
                    <button type="button" data-list-control="remove" aria-disabled={!canRemove || pending || undefined} onClick={() => remove(item)} className={control}>
                      Remove<span className="sr-only">: {name}</span>
                    </button>
                  )}
                  {item.waiting && (
                    <span data-mark="item-draft" className={`${chip} border-accent text-accent`}>
                      {item.waiting}
                    </span>
                  )}
                </div>
                <div className="space-y-6">{item.body}</div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      {items.length === 0 && (
        <p data-list-empty className="text-small text-ink-2">
          This list has no {one} in it. Once that is published, the page shows this section without the list.
        </p>
      )}

      {removed.length > 0 && (
        <div data-removed className="mt-4 rounded-[8px] border border-rule bg-ground-2 p-4">
          <p className="text-small font-[600]">Removed from this list</p>
          <p className="mt-1 text-meta text-ink-2">Not on the page once you publish. Each keeps its wording, and one press puts it back.</p>
          <ul className="mt-2 divide-y divide-rule">
            {removed.map((item) => (
              <li key={item.id} data-removed-item={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
                <span className={`min-w-0 text-small ${wrap}`}>
                  “{item.wording}”{item.live && <span className="text-ink-2"> (still on the site until you publish)</span>}
                </span>
                <button type="button" data-list-control="back" aria-disabled={!canAdd || pending || undefined} onClick={() => canAdd && press({ op: "back", item: item.id }, { to: "control", item: item.id, control: "up" })} className={control}>
                  Put back<span className="sr-only">: {item.wording}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!fixed && (
        <div className="mt-4">
          {adding === null ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                data-list-control="add"
                aria-disabled={!canAdd || pending || undefined}
                onClick={() => {
                  if (!canAdd || pending) return;
                  if (state.status === "error") setState(idle);
                  onAdding({});
                }}
                className={control}
              >
                Add a {one}
              </button>
              {!canAdd && (
                <span data-list-full className="text-meta text-ink-2">
                  This list is full. Remove one to add another.
                </span>
              )}
            </p>
          ) : (
            <fieldset data-new-item className="min-w-0 rounded-[8px] border border-dashed border-rule-strong bg-surface p-4 sm:p-5">
              <legend data-item className={`max-w-full px-1 text-small font-[620] ${wrap}`}>
                {newName}
              </legend>
              <p className="text-meta text-ink-2">
                Not in the list yet. Fill it in, then press “Add this {one}”: it joins the list as its last {one}, as a draft, and can be moved from there.
              </p>
              <div className="mt-4 space-y-6">
                {fresh.map((field, i) => {
                  const input = `new-${id}.${field.name}`;
                  const value = adding[field.name] ?? "";
                  const error = Object.hasOwn(errors, field.name) ? errors[field.name] : undefined;
                  if (field.kind === "toggle") {
                    return (
                      <div key={field.name} className="min-w-0">
                        <label className="flex min-h-10 items-center gap-3 text-small">
                          <input type="checkbox" id={input} checked={value === "yes"} onChange={(e) => type(field.name, e.target.checked ? "yes" : "")} className={`size-5 shrink-0 accent-ink ${clear}`} />
                          {field.label}
                        </label>
                        {field.hint && <p className="text-meta text-ink-2">{field.hint}</p>}
                      </div>
                    );
                  }
                  const over = value.length - field.max;
                  const shared = {
                    id: input,
                    value,
                    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => type(field.name, e.target.value),
                    "aria-describedby": [`${input}-count`, error ? `${input}-error` : ""].filter(Boolean).join(" "),
                    "aria-invalid": error ? true : undefined,
                    autoComplete: "off",
                    // The form was opened by a press: the first box is where the typing starts.
                    autoFocus: i === 0,
                    className: `${box} ${error ? "border-error" : "border-rule-strong"}`,
                  };
                  return (
                    <div key={field.name} data-new-field={field.name} className="min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <label htmlFor={input} className="text-meta font-[600] text-ink-2">
                          {field.label}
                        </label>
                        <span id={`${input}-count`} className={`text-meta tabular-nums ${over > 0 ? "font-[600] text-error" : "text-ink-2"}`}>
                          {value.length} of {field.max} characters{over > 0 ? `, ${over} too many` : ""}
                        </span>
                      </div>
                      {field.rows > 1 ? <textarea {...shared} rows={field.rows} className={`${shared.className} py-2`} /> : <input {...shared} type="text" className={`${shared.className} h-11`} />}
                      {error && (
                        <p id={`${input}-error`} data-error className="mt-1.5 text-small text-error">
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-5 flex flex-wrap items-center gap-2">
                <button type="button" data-list-control="add-confirm" aria-disabled={pending || undefined} onClick={() => press({ op: "add" }, { to: "new" })} className="btn btn-m btn-ink">
                  {pending ? "Adding…" : `Add this ${one}`}
                </button>
                <button
                  type="button"
                  data-list-control="add-cancel"
                  onClick={() => {
                    onAdding(null);
                    if (state.status === "error") setState(idle);
                    heading.current?.focus({ preventScroll: true });
                  }}
                  className={control}
                >
                  Cancel
                </button>
              </p>
            </fieldset>
          )}
        </div>
      )}

      {/* Always in the page, so a screen reader hears what a press did. */}
      <p role={state.status === "error" ? "alert" : "status"} data-list-message={state.status} className={`text-small ${wrap} ${state.status === "error" ? "text-error" : "text-ink"} ${state.message ? "mt-3" : ""}`}>
        {state.message}
      </p>

      {waiting > 0 && (
        <p data-list-waiting className="mt-3 text-small">
          {waiting === 1 ? "1 change to this list is" : `${waiting} changes to this list are`} saved as a draft and not on the site yet.{" "}
          <Link href={reviewAddress} className="tlink">
            Review and publish
          </Link>
        </p>
      )}

      {changed && (
        <p className="mt-4">
          <button type="button" data-list-control="reset" data-list-reset aria-disabled={pending || undefined} onClick={reset} className={control}>
            Put this list back to the original<span className="sr-only">: {title}</span>
          </button>
          <span className="mt-1 block text-meta text-ink-2">
            The original {many} in the original order. Any you added are taken out. Wording you changed stays: each text has its own reset.
          </span>
        </p>
      )}
    </div>
  );
}
