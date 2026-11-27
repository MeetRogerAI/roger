"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { fullName, itemTitle } from "@/lib/site/content/caption";
import { savePageAction, type SaveState } from "./actions";

/**
 * One page's words, as one form with one Save (plan U5).
 *
 * WHAT IS ON SCREEN. Each field shows the draft wording (what the last save
 * stored, or the original wording when nothing was saved), with its count of
 * characters against its limit, a mark when it differs from the original
 * wording, and what each name in braces it holds stands for.
 *
 * NOTHING TYPED IS LOST. The boxes are held by this component, not by the
 * form: a refused save, a save that could not reach the server and a refresh
 * of the page's data all leave the typing where it is. Only the fields the
 * owner changed are sent, so a save never writes back a field another tab
 * has changed since. Leaving with typing that is not saved asks first. The
 * browser's Back button cannot be asked. Next keeps a screen it navigates
 * away from alive and hidden, so going back usually finds the typing still
 * in its boxes; for when it does not (a reload, a closed tab reopened, a
 * sign-in that ran out), unsaved typing is also kept in this tab's own
 * storage and put back, once, when the screen is opened afresh. Because the
 * screen can be hidden and shown again, its effects run more than once:
 * docs/solutions/ui-bugs/next16-hidden-page-runs-mount-effects-again-….
 *
 * WHICH ITEM. A field of a list item is headed by the item's place and its
 * wording as it stands in the box, "Question 3 — “What do I have to do each
 * week?”", so the owner never has to count.
 *
 * A REFUSED SAVE moves the focus to the first field that needs fixing, whose
 * box is described by the reason.
 *
 * This file must not import the registry or the text rules (they reach the
 * settings reader): limits, labels and the names in braces arrive as props.
 */
export type EditorField = {
  id: string;
  /** The id of the field's box in the markup, which a link from the review lands on. */
  anchor: string;
  /** "Headline". */
  name: string;
  /** A paragraph's box, or one line's. */
  rows: number;
  max: number;
  /** The draft wording: what a save last stored, or the original. */
  value: string;
  original: string;
  /** True when the draft wording is not on the site yet. */
  waiting: boolean;
  /** Which of `names` this field may hold. */
  names: number;
};
/** `title` is an item's place, "Question 3", or null for fields outside any item. The item's first field holds the wording that names it. */
export type EditorGroup = { title: string | null; fields: EditorField[] };
export type EditorSection = { id: string; label: string; groups: EditorGroup[] };
/** A name a text may hold in braces: as typed, what it shows, and what it shows today (null when that depends on where it is printed). */
export type NameHint = { name: string; shows: string; now: string | null };

const idle: SaveState = { status: "idle" };
const LOST = "The save did not get through, so nothing was saved. Nothing you typed is lost: check your connection and press Save draft again. If it keeps happening, sign in again in another tab, then come back here.";
const LEAVE = "You have typing on this page that is not saved yet. Leave without saving it?";
const PUT_BACK = "The typing you had not saved on this page is back in its boxes, marked “Not saved yet”. Press Save draft to keep it.";
/** Far over every field's limit and far under what one save may carry: a text longer than this is refused here, unsent. */
const SEND_MAX = 20_000;
/** Where this tab keeps a page's unsaved typing. It never leaves the browser, and goes when the tab is closed. */
const keptUnder = (page: string) => `pages-typing:${page}`;

// scroll-mb: the Save bar is pinned to the foot of the window. Without the room, a field or button reached with Tab would sit under it.
const clear = "scroll-mb-40";
const box = `mt-1.5 block w-full rounded-[var(--radius-control)] border bg-surface px-3 text-small focus:border-ink ${clear}`;
/** A long word with no space in it breaks where the box ends and never widens the page. */
const wrap = "[overflow-wrap:anywhere]";
const chip = "rounded-full border px-2 py-0.5 text-meta";
const quiet = `min-h-10 rounded-full border border-rule-strong px-4 text-small text-ink-2 hover:text-ink ${clear}`;

/** The names in braces a text holds, as typed, each once. */
const namesIn = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[0]))];

export function PageEditor({ page, sections, names, reviewAddress }: { page: string; sections: EditorSection[]; names: NameHint[][]; reviewAddress: string }) {
  /** What the owner has typed and not saved, by field. */
  const [typed, setTyped] = useState<Record<string, string>>({});
  /** What a save or a reset just stored, shown until the page's own data says the same: `over` is the wording it replaced. */
  const [stored, setStored] = useState<Record<string, { text: string; over: string }>>({});
  /** The wording a reset took away, so it can be put back. */
  const [taken, setTaken] = useState<{ id: string; text: string } | null>(null);
  const [state, setState] = useState<SaveState>(idle);
  const [pending, start] = useTransition();
  /** Counts the saves this screen refused by itself. Each gives the refusal a new `at`, as the server's do, which is what moves the focus. */
  const refusals = useRef(0);

  const fields = sections.flatMap((section) => section.groups.flatMap((group) => group.fields));
  /** The wording the server holds for a field, as far as this screen knows. */
  const held = (field: EditorField) => (Object.hasOwn(stored, field.id) && stored[field.id].over === field.value ? stored[field.id].text : field.value);
  const shown = (field: EditorField) => (Object.hasOwn(typed, field.id) ? typed[field.id] : held(field));
  const unsaved = fields.filter((field) => shown(field) !== held(field));
  const dirty = unsaved.length > 0;
  /** Each field's whole name, with its item's wording as it stands in the item's first box. */
  const full = new Map<string, string>();
  for (const section of sections) for (const group of section.groups) for (const field of group.fields) full.set(field.id, fullName(group.title, shown(group.fields[0]), field.name));

  // Typing that was not saved when this screen was last left in this tab (the Back button, a reload, a sign-in that
  // ran out) is put back, once, after the first render. Only into a field that still holds the wording it was typed
  // over: a draft saved since from another tab is never covered by old typing.
  const fieldsAtFirst = useRef(fields);
  /** What the tab's storage held when the screen opened. Read once: the effect below this one clears the storage on the first render. */
  const keptAtFirst = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (keptAtFirst.current === undefined) {
      try {
        keptAtFirst.current = sessionStorage.getItem(keptUnder(page));
      } catch {
        keptAtFirst.current = null;
      }
    }
    const raw = keptAtFirst.current;
    if (!raw) return;
    // After the first render on purpose: the server's markup cannot know what this tab holds.
    const timer = setTimeout(() => {
      // Once. The router can keep this screen alive while another is shown and run this effect again on the way
      // back: by then what was read here is old, and would cover what has been typed or saved since.
      keptAtFirst.current = null;
      let kept: unknown;
      try {
        kept = JSON.parse(raw);
      } catch {
        return;
      }
      if (typeof kept !== "object" || kept === null) return;
      const back: Record<string, string> = {};
      for (const field of fieldsAtFirst.current) {
        const was: unknown = Object.hasOwn(kept, field.id) ? (kept as Record<string, unknown>)[field.id] : null;
        if (typeof was !== "object" || was === null) continue;
        const { text, over } = was as { text?: unknown; over?: unknown };
        if (typeof text === "string" && over === field.value && text !== field.value) back[field.id] = text;
      }
      if (Object.keys(back).length === 0) return;
      setTyped((now) => ({ ...back, ...now }));
      setState({ status: "ok", message: PUT_BACK });
    }, 0);
    return () => clearTimeout(timer);
  }, [page]);

  // Declared after the effect above, so on the first render it runs after the kept typing was read.
  const keep = JSON.stringify(Object.fromEntries(unsaved.map((field) => [field.id, { text: shown(field), over: field.value }])));
  useEffect(() => {
    try {
      if (keep === "{}") sessionStorage.removeItem(keptUnder(page));
      else sessionStorage.setItem(keptUnder(page), keep);
    } catch {
      // Storage that is full or switched off: the typing is still in the boxes, and leaving still asks.
    }
  }, [keep, page]);

  // A refused save puts the focus in the first field that needs fixing. Its box is described by the reason.
  const refusedAt = state.status === "error" && state.errors ? state.at : undefined;
  const firstWrong = state.status === "error" && state.errors ? fields.find((field) => Object.hasOwn(state.errors ?? {}, field.id))?.id : undefined;
  useEffect(() => {
    if (refusedAt === undefined || firstWrong === undefined) return;
    const input = document.getElementById(`input-${firstWrong}`);
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ block: "center" });
    // Only when a save was refused, which gives a new `at`: not when the fields change under the same refusal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refusedAt]);

  // Leaving with unsaved typing asks first: closing or reloading the tab, and a press on any link of the page.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const to = new URL(link.href, location.href);
      // A link to another part of this same page leaves nothing behind.
      if (to.origin === location.origin && to.pathname === location.pathname && to.search === location.search) return;
      if (!window.confirm(LEAVE)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Left on purpose: this typing is not put back when the screen is next opened afresh. (While the router still
      // holds this screen as it was, going back to it shows the typing, still marked as not saved.)
      try {
        sessionStorage.removeItem(keptUnder(page));
      } catch {}
    };
    window.addEventListener("beforeunload", onUnload);
    // On the window, before the page's own handlers: a link that is cancelled here never reaches the router.
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, [dirty, page]);

  const send = (fd: FormData, done: (next: SaveState) => void) =>
    start(async () => {
      let next: SaveState;
      try {
        next = await savePageAction(fd);
      } catch {
        next = { status: "error", message: LOST };
      }
      setState(next);
      if (next.status === "ok") done(next);
    });

  const save = () => {
    // A paste of a whole document is refused here, with its true length. Sent, it could be more than one save may carry.
    const huge = unsaved.filter((field) => shown(field).length > SEND_MAX);
    if (huge.length > 0) {
      setState({
        status: "error",
        message: `Not saved yet. ${huge.length === 1 ? "One field needs" : `${huge.length} fields need`} fixing first. Nothing you typed is lost.`,
        errors: Object.fromEntries(huge.map((field) => [field.id, `This is ${shown(field).length} characters long, and the most that fits here is ${field.max}. Shorten it by ${shown(field).length - field.max}.`])),
        at: (refusals.current += 1),
      });
      return;
    }
    const sentNow = new Map(unsaved.map((field) => [field.id, { typed: shown(field), over: field.value }]));
    const fd = new FormData();
    fd.set("page", page);
    for (const [id, was] of sentNow) fd.set(`text:${id}`, was.typed);
    setTaken(null);
    send(fd, (next) => {
      const saved = next.saved ?? {};
      setStored((now) => ({ ...now, ...Object.fromEntries(Object.entries(saved).map(([id, text]) => [id, { text, over: sentNow.get(id)?.over ?? "" }])) }));
      // Typing done while the save was on its way stays: only what was sent is taken as saved.
      setTyped((now) => Object.fromEntries(Object.entries(now).filter(([id, text]) => !(Object.hasOwn(saved, id) && sentNow.get(id)?.typed === text))));
    });
  };

  const reset = (field: EditorField) => {
    const before = shown(field);
    // Nothing is stored for it: the box only goes back.
    if (held(field) === field.original) {
      setTyped((now) => Object.fromEntries(Object.entries(now).filter(([id]) => id !== field.id)));
      setTaken({ id: field.id, text: before });
      setState({ status: "ok", reset: field.id, message: "Back to the original wording." });
      return;
    }
    const fd = new FormData();
    fd.set("page", page);
    fd.set("reset", field.id);
    send(fd, () => {
      setStored((now) => ({ ...now, [field.id]: { text: field.original, over: field.value } }));
      setTyped((now) => Object.fromEntries(Object.entries(now).filter(([id]) => id !== field.id)));
      setTaken({ id: field.id, text: before });
    });
  };

  const errors = state.status === "error" ? (state.errors ?? {}) : {};
  const wrong = fields.filter((field) => Object.hasOwn(errors, field.id));
  const type = (id: string, text: string) => {
    setTyped((now) => ({ ...now, [id]: text }));
    // "Saved as a draft" is no longer the whole truth once something new is typed. A refusal stays until the next save.
    if (state.status === "ok") setState(idle);
  };
  const fieldBox = (field: EditorField) => (
    <FieldBox
      key={field.id}
      field={field}
      full={full.get(field.id) ?? field.name}
      value={shown(field)}
      held={held(field)}
      hints={names[field.names] ?? []}
      error={Object.hasOwn(errors, field.id) ? errors[field.id] : undefined}
      taken={taken?.id === field.id ? taken.text : null}
      pending={pending}
      onType={(text) => type(field.id, text)}
      onReset={() => reset(field)}
      onPutBack={(text) => {
        type(field.id, text);
        setTaken(null);
      }}
    />
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) save();
      }}
      // A browser brings a paragraph's box into view only as far as its first line, which can be under the Save bar
      // pinned to the foot of the window. After a Tab, whatever took the focus is brought clear of it (scroll-mb above).
      onKeyUp={(e) => {
        if (e.key === "Tab" && e.target instanceof HTMLElement) e.target.scrollIntoView({ block: "nearest" });
      }}
      className="space-y-10"
    >
      {sections.map((section) => (
        <section key={section.id} id={`section-${section.id}`} aria-labelledby={`section-${section.id}-h`} className="scroll-mt-4">
          <h2 id={`section-${section.id}-h`} className="text-title">
            {section.label}
          </h2>
          <div className="mt-4 space-y-4">
            {section.groups.map((group, g) =>
              group.title ? (
                <fieldset key={group.title} className="min-w-0 rounded-[8px] border border-rule bg-surface p-4 sm:p-5">
                  {/* The item's place and its wording as it stands in its first box: nobody has to count to know which one this is. */}
                  <legend data-item className={`max-w-full px-1 text-small font-[620] ${wrap}`}>
                    {itemTitle(group.title, shown(group.fields[0]))}
                  </legend>
                  <div className="space-y-6">
                    {group.fields.map(fieldBox)}
                  </div>
                </fieldset>
              ) : (
                <div key={`plain-${g}`} className="space-y-6 rounded-[8px] border border-rule bg-surface p-4 sm:p-5">
                  {group.fields.map(fieldBox)}
                </div>
              ),
            )}
          </div>
        </section>
      ))}

      {/* Stays at the foot of the window, so Save is one press away wherever the owner is on a long page. */}
      <div data-save-bar className="sticky bottom-0 z-20 -mx-4 border-t border-rule bg-ground px-4 py-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" disabled={pending} className="btn btn-m btn-ink">
            {pending ? "Saving…" : "Save draft"}
          </button>
          <p data-unsaved className="text-small text-ink-2">
            {dirty ? `${unsaved.length === 1 ? "1 field has" : `${unsaved.length} fields have`} typing that is not saved yet.` : "Nothing waiting to be saved."}
          </p>
        </div>
        {/* Always in the page, so a screen reader hears a message when it arrives. */}
        {/* No taller than a third of the window: a long list of fields to fix scrolls inside the bar and never covers the page. */}
        <div role={state.status === "error" ? "alert" : "status"} data-message={state.status} className={`max-h-[33vh] overflow-y-auto text-small ${wrap} ${state.status === "error" ? "text-error" : "text-ink"} ${state.message ? "mt-2" : ""}`}>
          {state.message && (
            <p>
              {state.message}{" "}
              {state.status === "ok" && state.saved && (
                <Link href={reviewAddress} className="tlink">
                  Review and publish
                </Link>
              )}
            </p>
          )}
          {wrong.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {wrong.map((field) => (
                <li key={field.id}>
                  <a href={`#${field.anchor}`} className="underline underline-offset-4" onClick={() => document.getElementById(`input-${field.id}`)?.focus({ preventScroll: true })}>
                    {full.get(field.id)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </form>
  );
}

function FieldBox({
  field,
  full,
  value,
  held,
  hints,
  error,
  taken,
  pending,
  onType,
  onReset,
  onPutBack,
}: {
  field: EditorField;
  /** The field's whole name, with its item: "Question 3 — “What do I have to do each week?” · Answer". For a screen reader, where the visible label is "Answer". */
  full: string;
  /** What the box shows. */
  value: string;
  /** What the server holds for the field. */
  held: string;
  hints: NameHint[];
  error?: string;
  /** The wording a reset just took away from this field, or null. */
  taken: string | null;
  pending: boolean;
  onType: (text: string) => void;
  onReset: () => void;
  onPutBack: (text: string) => void;
}) {
  const input = `input-${field.id}`;
  const over = value.length - field.max;
  const differs = value !== field.original;
  const unsaved = value !== held;
  const used = namesIn(value);
  // The text as a visitor reads it today: each name that stands for an amount replaced by that amount.
  const reads = value.replace(/\{(\w+)\}/g, (typedName) => hints.find((entry) => entry.name === typedName)?.now ?? typedName);
  const described = [`${input}-count`, used.length > 0 ? `${input}-names` : "", error ? `${input}-error` : ""].filter(Boolean).join(" ");
  const shared = {
    id: input,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onType(e.target.value),
    "aria-describedby": described,
    "aria-invalid": error ? true : undefined,
    autoComplete: "off",
    className: `${box} ${error ? "border-error" : "border-rule-strong"}`,
  };

  return (
    // The room above is for a link that lands here: clear of the header, and of the Menu button on a phone (globals.css).
    <div id={field.anchor} data-field data-edited={differs ? "" : undefined} className="min-w-0 scroll-mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <label htmlFor={input} className="text-meta font-[600] text-ink-2">
          {field.name}
        </label>
        <span id={`${input}-count`} data-count className={`text-meta tabular-nums ${over > 0 ? "font-[600] text-error" : "text-ink-2"}`}>
          {value.length} of {field.max} characters{over > 0 ? `, ${over} too many` : ""}
        </span>
      </div>
      {field.rows > 1 ? <textarea {...shared} rows={field.rows} className={`${shared.className} py-2`} /> : <input {...shared} type="text" className={`${shared.className} h-11`} />}

      {error && (
        <p id={`${input}-error`} data-error className="mt-1.5 text-small text-error">
          {error}
        </p>
      )}

      {used.length > 0 && (
        <ul id={`${input}-names`} data-names className="mt-1.5 space-y-0.5 text-meta text-ink-2">
          {used.map((name) => {
            const hint = hints.find((entry) => entry.name === name);
            return (
              <li key={name}>
                {hint ? (
                  <>
                    <span className="font-mono text-ink">{name}</span> shows {hint.shows}
                    {hint.now ? ` (${hint.now} today)` : ""}.
                  </>
                ) : (
                  <span className="text-error">
                    <span className="font-mono">{name}</span> is not a name this text can use. It would show on the page as typed.
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {reads !== value && (
        <p data-reads className={`mt-1.5 text-meta text-ink-2 ${wrap}`}>
          Visitors read: <span className="text-ink">{reads}</span>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {unsaved ? (
          <span data-mark="unsaved" className={`${chip} border-ink text-ink`}>
            Not saved yet
          </span>
        ) : (
          field.waiting && (
            <span data-mark="draft" className={`${chip} border-accent text-accent`}>
              Draft, not published yet
            </span>
          )
        )}
        {differs && (
          <>
            <span data-mark="edited" className={`${chip} border-rule-strong text-ink-2`}>
              Changed from the original
            </span>
            <button type="button" data-reset disabled={pending} onClick={onReset} className={quiet}>
              Reset to the original wording<span className="sr-only">: {full}</span>
            </button>
          </>
        )}
        {taken !== null && !differs && (
          <button type="button" data-put-back onClick={() => onPutBack(taken)} className={quiet}>
            Put my wording back<span className="sr-only">: {full}</span>
          </button>
        )}
      </div>

      {differs && (
        <details className="mt-2 text-small text-ink-2">
          <summary className={`cursor-pointer ${clear}`}>Show the original wording</summary>
          <p data-original className={`mt-1 whitespace-pre-wrap ${wrap}`}>
            {field.original}
          </p>
        </details>
      )}
    </div>
  );
}
