"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { addUseCase, runIngestAction, saveSecretAction, saveSettingsAction, updateUseCase, type AdminState } from "@/app/admin/actions";
import { categories } from "@/data/library";

const idle: AdminState = { status: "idle" };
const field = "mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 text-small outline-none focus:border-ink";
const label = "block text-meta font-[600] text-ink-2";

function Msg({ s }: { s: AdminState }) {
  if (s.status === "idle" || !s.message) return null;
  return (
    <p role={s.status === "error" ? "alert" : "status"} className={`text-small ${s.status === "error" ? "text-error" : "text-ink"}`}>
      {s.message}
    </p>
  );
}

export type AdminScreen = { href: string; label: string };
export type AdminGroup = { heading: string; screens: readonly AdminScreen[] };

/**
 * Every admin screen, under the five headings the sidebar shows, in the order it shows them
 * (Peter's choice of November 27, 2026). This list is the only place a screen is named or placed.
 */
export const adminGroups: readonly AdminGroup[] = [
  {
    heading: "Today",
    screens: [
      { href: "/admin", label: "This week" },
      { href: "/admin/ops", label: "Needs attention" },
      { href: "/admin/flags", label: "Flags" },
    ],
  },
  {
    heading: "People",
    screens: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/leads", label: "Sign-ups" },
      { href: "/admin/interest", label: "Interest" },
    ],
  },
  {
    heading: "Cora",
    screens: [
      { href: "/admin/cora", label: "This week’s run" },
      { href: "/admin/runs", label: "Runs" },
    ],
  },
  {
    heading: "Website",
    screens: [
      { href: "/admin/pages", label: "Pages" },
      { href: "/admin/testimonials", label: "Testimonials" },
      { href: "/admin/use-cases", label: "Use cases" },
      { href: "/admin/watches", label: "Watches" },
    ],
  },
  {
    heading: "Setup",
    screens: [
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/connections", label: "Connections" },
      { href: "/admin/setup-file", label: "Setup file" },
    ],
  },
];

/**
 * The screen an address belongs to: /admin itself only by exact match, the rest also for anything beneath them (/admin/users/abc is Users).
 * `path` is a pathname, with no query string. A slash at its end changes nothing.
 */
export function adminScreenAt(path: string): AdminScreen | null {
  const at = path.replace(/\/+$/, "");
  for (const group of adminGroups) {
    for (const screen of group.screens) {
      if (screen.href === "/admin" ? at === "/admin" : at === screen.href || at.startsWith(`${screen.href}/`)) return screen;
    }
  }
  return null;
}

/** Where this browser keeps the headings the owner has folded: a JSON list of heading names, such as ["People","Setup"]. */
export const adminFoldedKey = "roger-admin-folded";

/**
 * The folded headings a stored value names, in the sidebar's order. Every group starts folded (Peter, November 28,
 * 2026): nothing stored means the owner has never chosen, and so does anything that is not a list (broken JSON, another
 * shape), so every heading is folded. A stored list is the owner's choice, `[]` included (they opened everything); names
 * in it that are not current headings (one since renamed, another case, not a string) fold nothing.
 */
export function parseFolded(stored: string | null | undefined): string[] {
  const all = adminGroups.map((group) => group.heading);
  if (!stored) return all;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return all;
  }
  if (!Array.isArray(value)) return all;
  return adminGroups.map((group) => group.heading).filter((heading) => value.includes(heading));
}

/** The folded headings after one of them is pressed: a folded one opens, an open one folds. */
export function toggleFolded(folded: readonly string[], heading: string): string[] {
  const next = folded.includes(heading) ? folded.filter((h) => h !== heading) : [...folded, heading];
  return adminGroups.map((group) => group.heading).filter((h) => next.includes(h));
}

/**
 * Whether a heading carries the "you are here" mark: only when it is folded and the current screen is inside it.
 * A folded group is not opened by going to one of its screens (the owner folded it on purpose); the mark says where they are.
 */
export function headingMarked(group: AdminGroup, current: AdminScreen | null, folded: readonly string[]): boolean {
  return current !== null && folded.includes(group.heading) && group.screens.includes(current);
}

const groupId = (group: AdminGroup) => `admin-group-${group.heading.toLowerCase()}`;

// Storage can be switched off (private browsing, blocked site data); the choice then lasts until the page is reloaded.
let unsavedFolded: string | null = null;
const foldedEvent = "roger-admin-folded";

/** What is stored now, as text. Exported with the two below for the tests. */
export function storedFolded(): string {
  if (unsavedFolded !== null) return unsavedFolded;
  try {
    return localStorage.getItem(adminFoldedKey) ?? "";
  } catch {
    return "";
  }
}

export function subscribeFolded(listener: () => void) {
  const reread = () => {
    unsavedFolded = null;
    listener();
  };
  // Another tab changed it (a null key: it cleared everything). A change to some other key is not a reason to drop a choice that could not be saved.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === adminFoldedKey) reread();
  };
  // A page brought back by Back or Forward heard no storage events while it was put away.
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) reread();
  };
  window.addEventListener(foldedEvent, listener);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    window.removeEventListener(foldedEvent, listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", onPageShow);
  };
}

export function saveFolded(folded: readonly string[]) {
  unsavedFolded = JSON.stringify(folded);
  try {
    localStorage.setItem(adminFoldedKey, unsavedFolded);
  } catch {
    /* Optional persistence. */
  }
  window.dispatchEvent(new Event(foldedEvent));
}

/**
 * Runs as the server's markup is read, before the page's scripts load: folds what parseFolded would fold (every group when
 * nothing usable is stored, a first visit included), so no visit shows every group open and then closes some. It only sets what React sets a moment later
 * (`hidden` on a list, `aria-expanded` on its heading). Every other look of a folded group follows from those two in CSS.
 *
 * Until React takes over, the headings have no handler of React's. If the page's scripts are slow or never load, a group this
 * script folded would be shut for good, so the script also opens a folded group when its heading is pressed, and takes it out
 * of the stored list so React agrees when it arrives. It only ever opens: a list it left hidden that React believed open would
 * never be put right. It stops once its own tag has left the page, which is when React has read the stored choice.
 *
 * Nothing stored reaches the page as markup or code: stored names are only compared with the headings. The text is fixed.
 */
const foldBeforeScripts = `(function(){try{var k=${JSON.stringify(adminFoldedKey)},s=document.currentScript,p=s.parentNode,b=p.querySelectorAll("button[data-admin-fold]"),a=[],get=function(){var v=localStorage.getItem(k),f;if(!v)return a.slice();try{f=JSON.parse(v)}catch(e){return a.slice()}return Array.isArray(f)?f:a.slice()},set=function(b,o){var l=document.getElementById(b.getAttribute("aria-controls"));if(l){l.hidden=!o;b.setAttribute("aria-expanded",o?"true":"false")}};for(var i=0;i<b.length;i++)a.push(b[i].getAttribute("data-admin-fold"));var f=get();for(var i=0;i<b.length;i++)if(f.indexOf(b[i].getAttribute("data-admin-fold"))>=0)set(b[i],false);p.addEventListener("click",function(e){if(!s.isConnected)return;var h=e.target.closest("button[data-admin-fold]");if(!h||h.getAttribute("aria-expanded")!=="false")return;set(h,true);try{var n=h.getAttribute("data-admin-fold");localStorage.setItem(k,JSON.stringify(get().filter(function(x){return x!==n})))}catch(e){}})}catch(e){}})()`;

/**
 * The five headings and their screens. Each heading is a button that folds its list away.
 * A folded list is `hidden`: its links leave the tab order and are not read out.
 */
export function AdminNavList({ current, folded, onToggle, onNavigate }: { current: AdminScreen | null; folded: readonly string[]; onToggle?: (heading: string) => void; onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin" className="space-y-2">
      {adminGroups.map((group) => {
        const id = groupId(group);
        const isFolded = folded.includes(group.heading);
        const here = current !== null && group.screens.includes(current);
        return (
          <div key={group.heading}>
            <h2 id={id}>
              {/* suppressHydrationWarning here and on the list: the script above may already have folded this group when React first reads the markup. */}
              <button
                type="button"
                data-admin-fold={group.heading}
                aria-expanded={!isFolded}
                aria-controls={`${id}-screens`}
                suppressHydrationWarning
                onClick={() => onToggle?.(group.heading)}
                className={`group flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 text-left text-meta font-[620] uppercase tracking-[0.08em] text-ink-2 hover:bg-ground-2 hover:text-ink lg:min-h-8 ${here ? "aria-[expanded=false]:text-ink" : ""}`}
              >
                {group.heading}
                {/* Shown only while the group is folded: the screen that is open is inside it. The second set of classes is for a group the script folded before React knew. */}
                {here && (
                  <span data-admin-here className={`items-center ${headingMarked(group, current, folded) ? "inline-flex" : "hidden group-aria-[expanded=false]:inline-flex"}`}>
                    <span aria-hidden="true" className="size-2 rounded-full bg-ink" />
                    <span className="sr-only">, you are on {current.label}</span>
                  </span>
                )}
                <svg viewBox="0 0 20 20" className="ml-auto size-4 shrink-0 transition-transform group-aria-expanded:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7.5 4.5L13 10l-5.5 5.5" />
                </svg>
              </button>
            </h2>
            <ul id={`${id}-screens`} aria-labelledby={id} hidden={isFolded} suppressHydrationWarning>
              {group.screens.map((screen) => {
                const on = screen === current;
                return (
                  <li key={screen.href}>
                    <Link
                      href={screen.href}
                      aria-current={on ? "page" : undefined}
                      onClick={onNavigate}
                      className={`flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-small lg:min-h-8 ${on ? "bg-ink font-[620] text-ground" : "text-ink hover:bg-ground-2"}`}
                    >
                      {screen.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * The admin's navigation. From the lg breakpoint it is a column that stays in view beside the page.
 * Below it, it folds behind one "Menu" button that stays under the site header, as the site's own phone menu does.
 * `children` is the foot of the list: the Stripe badge and "Sign out", which the layout renders on the server.
 */
export function AdminSidebar({ children }: { children?: React.ReactNode }) {
  const path = usePathname() || "/admin";
  const current = adminScreenAt(path);
  // Null on the server and while React first reads the server's markup: every group open, so with no script every link can be reached.
  const stored = useSyncExternalStore<string | null>(subscribeFolded, storedFolded, () => null);
  // The server's snapshot (null) is every group open; anything read in the browser, nothing stored included, goes through parseFolded.
  const folded = useMemo(() => (stored === null ? [] : parseFolded(stored)), [stored]);
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Focus goes to the current screen's link. Inside a folded group that link cannot take it, so its heading does.
    const link = panelRef.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
    const heading = link?.closest("ul[hidden]")?.parentElement?.querySelector<HTMLButtonElement>("button[data-admin-fold]");
    (heading ?? link ?? panelRef.current?.querySelector<HTMLButtonElement>("button[data-admin-fold]"))?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // A group can be folded from elsewhere (another tab) while the focus is on one of its links. A hidden link cannot keep
  // the focus, and the browser would drop it to the top of the page; the group's heading takes it instead.
  useLayoutEffect(() => {
    const list = document.activeElement?.closest("ul[hidden]");
    if (list && panelRef.current?.contains(list)) list.parentElement?.querySelector<HTMLButtonElement>("button[data-admin-fold]")?.focus();
  }, [folded]);

  return (
    // data-admin-nav: globals.css gives the page more scroll-padding below lg while this bar is pinned over it.
    <div
      data-admin-nav
      // Tabbing past the foot of the open menu closes it: left open, it would cover the field the focus has moved to.
      onBlur={(e) => {
        if (open && e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) setOpenOn(null);
      }}
      className="sticky top-[60px] z-30 -mx-4 bg-ground px-4 py-2 sm:-mx-6 sm:px-6 lg:top-[76px] lg:z-auto lg:mx-0 lg:max-h-[calc(100dvh-92px)] lg:self-start lg:overflow-y-auto lg:p-1"
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="admin-menu"
        onClick={() => setOpenOn(open ? null : path)}
        className="flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-control)] border border-rule-strong bg-surface px-4 text-left text-small lg:hidden"
      >
        <svg viewBox="0 0 20 20" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
        </svg>
        <span className="font-[620]">{open ? "Close menu" : "Menu"}</span>
        {current && (
          <span className="ml-auto min-w-0 truncate text-ink-2">
            <span className="sr-only">You are on: </span>
            {current.label}
          </span>
        )}
      </button>

      <div id="admin-menu" ref={panelRef} className={`${open ? "block max-h-[calc(100dvh-140px)] overflow-y-auto px-1 pb-3 pt-4" : "hidden"} lg:block lg:max-h-none lg:overflow-visible lg:p-0`}>
        {/* A press changes what is stored now, not what this render read: a press handled before the stored choice was rendered would otherwise store that one heading and forget the rest. */}
        <AdminNavList current={current} folded={folded} onToggle={(heading) => saveFolded(toggleFolded(parseFolded(storedFolded()), heading))} onNavigate={() => setOpenOn(null)} />
        {/* Only in the server's markup. It is gone once React has read the stored choice itself, and is never rendered in the browser. */}
        {stored === null && <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: foldBeforeScripts }} />}
        {children && <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule px-3 pt-4 lg:flex-col lg:items-start">{children}</div>}
      </div>
    </div>
  );
}

export function RunIngest() {
  const [s, action, pending] = useActionState(runIngestAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-4">
      <button type="submit" disabled={pending} className="btn btn-m btn-ink">
        {pending ? "Reading new posts…" : "Run the daily intake now"}
      </button>
      <Msg s={s} />
    </form>
  );
}

type Uc = { id: string; title: string; summary: string; category: string; persona: string; for_: string; tool: string; handle: string; url: string; outcome: string | null };

function CaseFields({ u }: { u?: Uc }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={label}>Title (our words, max 70)</label>
        <input name="title" defaultValue={u?.title} maxLength={80} required className={field} />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Summary (our words, one or two sentences)</label>
        <textarea name="summary" defaultValue={u?.summary} maxLength={300} rows={3} required className={`${field} h-auto py-2`} />
      </div>
      <div>
        <label className={label}>Category</label>
        <select name="category" defaultValue={u?.category ?? "solo"} className={field}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label}>Persona</label>
        <select name="persona" defaultValue={u?.persona ?? "solopreneur"} className={field}>
          {["solopreneur", "household", "caregiving", "business", "everyone"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label}>Agent</label>
        <input name="tool" defaultValue={u?.tool} placeholder="Grok Bot, Muse, Hark…" className={field} />
      </div>
      <div>
        <label className={label}>Author handle</label>
        <input name="handle" defaultValue={u?.handle} placeholder="@handle" required className={field} />
      </div>
      {!u && (
        <div className="sm:col-span-2">
          <label className={label}>Link to the original post</label>
          <input name="url" type="url" placeholder="https://x.com/…/status/…" required className={field} />
        </div>
      )}
      <div>
        <label className={label}>Home or work</label>
        <select name="for" defaultValue={u?.for_ ?? "work"} className={field}>
          <option value="work">Work</option>
          <option value="home">Home</option>
        </select>
      </div>
      <div>
        <label className={label}>Outcome</label>
        <select name="outcome" defaultValue={u?.outcome ?? "win"} className={field}>
          <option value="win">Worked</option>
          <option value="honest-miss">Didn’t go as planned</option>
        </select>
      </div>
    </div>
  );
}

export function EditCase({ u }: { u: Uc }) {
  const [s, action, pending] = useActionState(updateUseCase, idle);
  return (
    <form action={action} className="mt-4 space-y-4 rounded-[var(--radius-inner)] bg-ground-2 p-5">
      <input type="hidden" name="id" value={u.id} />
      <CaseFields u={u} />
      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="btn btn-s btn-ink">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Msg s={s} />
      </div>
    </form>
  );
}

export function AddCase() {
  const [s, action, pending] = useActionState(addUseCase, idle);
  return (
    <form action={action} className="space-y-4">
      <CaseFields />
      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="btn btn-m btn-ink">
          {pending ? "Adding…" : "Add to the library"}
        </button>
        <Msg s={s} />
      </div>
    </form>
  );
}

export type SettingsForm = {
  founderFullName: string;
  founderPhone: string;
  founderPhoto: string;
  founderBio: string[];
  bioApproved: boolean;
  setupPrice: number;
  planPrice: number;
  setupCall: string;
  setupCheckout: string;
  planCheckout: string;
  companyCall: string;
  companyTermsConfirmed: boolean;
};

export function SettingsEditor({ s }: { s: SettingsForm }) {
  const [state, action, pending] = useActionState(saveSettingsAction, idle);
  const group = "rounded-[var(--radius-object)] border border-rule bg-surface p-6 sm:p-8";
  return (
    <form action={action} className="space-y-6">
      <fieldset className={group}>
        <legend className="px-1 text-title">About Peter</legend>
        <p className="text-small text-ink-2">Shown in “Who you’ll work with” on the company pages.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Full name</label>
            <input name="founderFullName" defaultValue={s.founderFullName} placeholder="Peter …" className={field} />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input name="founderPhone" defaultValue={s.founderPhone} placeholder="+1 416 …" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Photo link (https://, square or 4:5)</label>
            <input name="founderPhoto" defaultValue={s.founderPhoto} placeholder="https://…" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Bio, one true line per row (up to 6)</label>
            <textarea name="founderBio" defaultValue={s.founderBio.join("\n")} rows={4} className={`${field} h-auto py-2`} />
          </div>
          <label className="flex items-center gap-2 text-small sm:col-span-2">
            <input type="checkbox" name="bioApproved" defaultChecked={s.bioApproved} className="size-4 accent-[var(--color-accent)]" />
            Show the bio on the site
          </label>
        </div>
      </fieldset>

      <fieldset className={group}>
        <legend className="px-1 text-title">The ladder</legend>
        <p className="text-small text-ink-2">Prices on the home and setup pages. An empty payment link shows “Add it on your setup call” instead of a button.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Custom setup price ($)</label>
            <input name="setupPrice" inputMode="numeric" defaultValue={s.setupPrice} className={field} />
          </div>
          <div>
            <label className={label}>Monthly plan price ($)</label>
            <input name="planPrice" inputMode="numeric" defaultValue={s.planPrice} className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Setup booking link (Cal.com)</label>
            <input name="setupCall" defaultValue={s.setupCall} className={field} />
          </div>
          <div>
            <label className={label}>Setup payment link (Stripe)</label>
            <input name="setupCheckout" defaultValue={s.setupCheckout} placeholder="https://buy.stripe.com/…" className={field} />
          </div>
          <div>
            <label className={label}>Monthly plan payment link (Stripe)</label>
            <input name="planCheckout" defaultValue={s.planCheckout} placeholder="https://buy.stripe.com/…" className={field} />
          </div>
        </div>
      </fieldset>

      <fieldset className={group}>
        <legend className="px-1 text-title">Companies</legend>
        <div className="mt-3 grid gap-4">
          <div>
            <label className={label}>Company intro-call link</label>
            <input name="companyCall" defaultValue={s.companyCall} className={field} />
          </div>
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" name="companyTermsConfirmed" defaultChecked={s.companyTermsConfirmed} className="size-4 accent-[var(--color-accent)]" />
            The $10,000/month terms are confirmed (removes “Terms to confirm together on Wednesday” on prospect pages)
          </label>
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="btn btn-l">
          {pending ? "Saving…" : "Save settings"}
        </button>
        <Msg s={state} />
      </div>
    </form>
  );
}

/** Paste one API key. The page never shows a saved key, only its last four characters. */
export function SecretForm({ name, label: title, set }: { name: string; label: string; set: boolean }) {
  const [s, action, pending] = useActionState(saveSecretAction, idle);
  return (
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="name" value={name} />
      <div className="min-w-0 flex-1 basis-64">
        <label htmlFor={`k-${name}`} className="sr-only">
          {title}
        </label>
        <input id={`k-${name}`} name="value" type="password" autoComplete="off" spellCheck={false} placeholder={set ? "Paste a new key to replace it" : "Paste the key"} className={`${field} mt-0 font-mono`} />
      </div>
      <button type="submit" disabled={pending} className="btn btn-m btn-ink">
        {pending ? "Saving…" : "Save"}
      </button>
      <div className="basis-full">
        <Msg s={s} />
      </div>
    </form>
  );
}
