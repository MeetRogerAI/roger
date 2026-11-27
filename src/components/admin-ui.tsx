"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { addUseCase, runIngestAction, saveSecretAction, saveSettingsAction, signInAction, updateUseCase, type AdminState } from "@/app/admin/actions";
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

export function LoginForm() {
  const [s, action, pending] = useActionState(signInAction, idle);
  return (
    <form action={action} className="mx-auto mt-24 max-w-sm rounded-[var(--radius-object)] border border-rule bg-surface p-8">
      <h1 className="text-h3">Roger admin</h1>
      <p className="mt-2 text-small text-ink-2">Sign in to manage the library, sign-ups and settings.</p>
      <label htmlFor="pw" className={`${label} mt-6`}>
        Password
      </label>
      <input id="pw" name="password" type="password" required autoComplete="current-password" className={field} />
      <button type="submit" disabled={pending} className="btn btn-m btn-ink mt-5 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <div className="mt-3">
        <Msg s={s} />
      </div>
    </form>
  );
}

export type AdminScreen = { href: string; label: string };
export type AdminGroup = { heading: string; screens: readonly AdminScreen[] };

/**
 * Every admin screen, under the five headings the sidebar shows, in the order it shows them
 * (Peter's choice of November 27, 2026). This list is the only place a screen is named or placed.
 * "Pages" opens the questions editor until the Pages editor replaces it.
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
      { href: "/admin/questions", label: "Pages" },
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

/**
 * The admin's navigation. From the lg breakpoint it is a column that stays in view beside the page.
 * Below it, it folds behind one "Menu" button that stays under the site header, as the site's own phone menu does.
 * `children` is the foot of the list: the Stripe badge and "Sign out", which the layout renders on the server.
 */
export function AdminSidebar({ children }: { children?: React.ReactNode }) {
  const path = usePathname() || "/admin";
  const current = adminScreenAt(path);
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
    (panelRef.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]') ?? panelRef.current?.querySelector<HTMLAnchorElement>("a"))?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
        <nav aria-label="Admin" className="space-y-5">
          {adminGroups.map((group) => {
            const id = `admin-group-${group.heading.toLowerCase()}`;
            return (
              <div key={group.heading}>
                <h2 id={id} className="px-3 text-meta font-[620] uppercase tracking-[0.08em] text-ink-2">
                  {group.heading}
                </h2>
                <ul aria-labelledby={id} className="mt-1">
                  {group.screens.map((screen) => {
                    const on = screen === current;
                    return (
                      <li key={screen.href}>
                        <Link
                          href={screen.href}
                          aria-current={on ? "page" : undefined}
                          onClick={() => setOpenOn(null)}
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
