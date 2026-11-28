"use client";

import Link from "next/link";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Toque } from "./toque";
import { ActionLink, type ActionKind } from "./action-link";
import { StartLink } from "./site/shared/start-link";
import { useSignedInHint } from "@/lib/auth/signed-in-hint";
// Types only: the served site and a version's chrome are resolved on the server and arrive as props.
import type { SiteChrome } from "@/lib/site/chrome";
import type { NavRow } from "@/lib/site/header-fit";
import type { ServedSite } from "@/lib/site/version";

/** `id`: a site version's link has one, from its copy, and is keyed by it (two links may share their words or their address). */
type NavLink = { href: string; label: string; id?: string };

type NavSet = {
  links: NavLink[];
  cta: { kind?: ActionKind; href?: string; label: string; short: string; picksFor?: "work" | "home" } | null;
  /** A site version only (spec A.3): "Sign in" beside the start button, and what a signed-in visitor sees in place of both. */
  account?: { signIn: NavLink; openApp: NavLink };
  /** A site version only: where its links are shown in a row (SiteChrome.navRow). Left out, from 1024 pixels. */
  row?: NavRow;
};

/**
 * The classes that say where the links are a row and where they are in the menu (src/lib/site/header-fit.ts). "lg"
 * is the header as it was built, class for class. With "menu" the row is never drawn.
 */
const rowClasses: Record<NavRow, { nav: string | null; right: string; button: string; menu: string }> = {
  lg: { nav: "ml-auto hidden lg:block", right: "lg:ml-0", button: "lg:hidden", menu: "lg:hidden" },
  xl: { nav: "ml-auto hidden xl:block", right: "xl:ml-0", button: "xl:hidden", menu: "xl:hidden" },
  menu: { nav: null, right: "", button: "", menu: "" },
};

/**
 * A link of the header, the phone's menu or the footer. A path on this site goes through the router. An address an
 * admin typed for another site, or an email address, is a plain link in the same tab, like every other link of the
 * site: the visitor's Back button brings them back.
 */
export function SiteLink({ href, current, className, onClick, children }: { href: string; current?: "page"; className?: string; onClick?: () => void; children: React.ReactNode }) {
  // The attributes in the order the header has always printed them: the markup of a page nobody edited does not change.
  if (!href.startsWith("/")) {
    return (
      <a href={href} aria-current={current} className={className} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} aria-current={current} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

const library: NavSet = {
  links: [
    { href: "/library", label: "Use cases" },
    { href: "/packs/solopreneur", label: "Starter packs" },
    { href: "/setup", label: "Setup" },
    { href: "/companies", label: "For companies" },
  ],
  cta: { href: "/packs/solopreneur", label: "Get the free pack", short: "Free pack" },
};

const company: NavSet = {
  links: [
    { href: "/companies#map", label: "The Map" },
    { href: "/companies#how", label: "How it works" },
    { href: "/companies#pricing", label: "Pricing" },
    { href: "/library", label: "Use cases" },
  ],
  cta: { kind: "companyCall", label: "Book an intro call", short: "Book a call" },
};

const circles: NavSet = {
  links: [
    { href: "/#how", label: "How it works" },
    { href: "/zack", label: "Run Zack" },
    { href: "/library", label: "Use cases" },
    { href: "/#questions", label: "FAQ" },
    { href: "/#letter", label: "About" },
  ],
  cta: { href: "/apply", label: "Apply for a founding Circle", short: "Apply" },
};

/** A site version's header (spec A.3): its five links, "Sign in" and the start button, in the version's own words. */
function built(chrome: SiteChrome | null | undefined): NavSet {
  if (!chrome) throw new Error("A site version's header needs its chrome: pass getSiteChrome() from the root layout.");
  return { links: chrome.links, cta: chrome.start, account: { signIn: chrome.signIn, openApp: chrome.openApp }, row: chrome.navRow };
}

/** Sign-up, sign-in and the member app (spec A.3): no header button, and nothing pointing back at the Circles pages. */
const accountPages = ["/start", "/signin", "/auth", "/app"];

/**
 * A page prepared for one company or group. /hampton, /rlp and /founders were three more until
 * November 26, 2026: they now redirect to /zack (next.config.ts), which is a public page like any other.
 */
export function isUnlisted(path: string) {
  return path.startsWith("/for/") || path === "/rlpsignature";
}

/** The route an address that matches no page is answered with: one stored shell for every such address. */
export const NOT_FOUND_ROUTE = "/_not-found";

/**
 * The path the header and the footer are drawn for. On the not-found page it is the not-found route, whatever the
 * address: that page is one stored shell, regenerated by whichever unknown address asks for it once it is stale, so
 * a header drawn for the address put one visitor's mistyped `/start/…` header (no links, no button) on every other
 * visitor's not-found page, and React failed to hydrate it under any address of another kind (error 418,
 * docs/solutions/runtime-errors/not-found-shell-hydrates-with-the-browsers-path-2026-11-27.md). The root's selected
 * segment comes from the stored render itself, so the server and the browser agree on it. Every other page is drawn
 * for its own path, as before.
 */
export function shownPath(pathname: string | null, rootSegment: string | null): string {
  return rootSegment === NOT_FOUND_ROUTE || rootSegment === NOT_FOUND_ROUTE.slice(1) ? NOT_FOUND_ROUTE : pathname || "/";
}

/** shownPath for the component it is called in, which must be rendered by the root layout. */
export function useShownPath(): string {
  const pathname = usePathname();
  const segment = useSelectedLayoutSegment();
  return shownPath(pathname, segment);
}

/** `chrome` is a site version's own header content; Circles, the legacy site and the pages that keep their header need none. */
export function navFor(path: string, site: ServedSite, chrome?: SiteChrome | null): NavSet {
  if (accountPages.some((p) => path === p || path.startsWith(`${p}/`))) return { links: [], cta: null };
  // The admin's own sidebar is its navigation: the site header is the logo alone, whichever site is served (Peter, November 28, 2026).
  if (path === "/admin" || path.startsWith("/admin/")) return { links: [], cta: null };
  if (site === "legacy") {
    if (path.startsWith("/companies")) return company;
    // A page prepared for one company or group: no navigation, nothing to sell around it
    if (isUnlisted(path)) return { links: [], cta: null };
    // After paying, the only job left is booking: no button competing with it
    if (path.startsWith("/thanks")) return { ...library, cta: null };
    return library;
  }
  if (isUnlisted(path)) return { links: [], cta: null };
  if (site === "circles") return path.startsWith("/apply") ? { ...circles, cta: null } : circles;
  return built(chrome);
}

/**
 * The right of a site version's header. The page is prerendered signed out,
 * with "Open Roger" in place but invisible, so no page waits on a session
 * check. A signed-in visitor sees "Open Roger" from the first frame: the head
 * script marks `<html>` from the hint cookie before paint and the stylesheet
 * swaps the two under that mark; React then renders the same from the same
 * cookie. The signed-out pair stays in place, hidden, to hold its width:
 * nothing beside it moves on the swap.
 */
function AccountLinks({ cta, account }: { cta: NonNullable<NavSet["cta"]>; account: NonNullable<NavSet["account"]> }) {
  const signedIn = useSignedInHint();
  return (
    <span className="grid items-center justify-items-end">
      {/* The pair stretches to one height: on a phone the start button's words take two lines, and "Sign in" grows to match. */}
      <span className={`col-start-1 row-start-1 flex items-stretch gap-2 sm:gap-3 ${signedIn ? "invisible" : ""}`} aria-hidden={signedIn || undefined} data-account="out">
        {/*
          Under 375 pixels there is no room beside the button: the menu carries it there. At 360, a common
          phone width, the button's words took three lines beside it and the button filled the header's height.
          At 375 both fit, with about 10 pixels to spare before the button's words need a third line (measured
          with these labels). "Sign in" never shrinks, because a button's words may wrap on a phone and these
          two would: the start button gives way first.
        */}
        <Link href={account.signIn.href} className="btn btn-m btn-outline shrink-0 max-sm:px-2.5 max-sm:text-[0.8125rem] max-[374px]:hidden">
          {account.signIn.label}
        </Link>
        <span className="header-cta flex">
          {/* The same words at every width (Peter, November 26, 2026). On a phone they take two lines, in a smaller size, so the row still fits. */}
          <StartLink className="btn btn-m max-sm:max-w-[8.5rem] max-sm:px-3 max-sm:text-[0.8125rem] max-sm:leading-[1.15]">{cta.label}</StartLink>
        </span>
      </span>
      {/*
        Always in the markup, invisible while signed out, so the stylesheet can show it from the first frame
        when the head script has marked a signed-in visitor (`html[data-signed-in]`, globals.css). Invisible,
        it is out of the tab order and hidden from screen readers too.
      */}
      <Link href={account.openApp.href} className={`btn btn-m col-start-1 row-start-1${signedIn ? "" : " invisible"}`} data-account="in">
        {account.openApp.label}
      </Link>
    </span>
  );
}

/** The last row of a site version's menu on a phone: "Sign in", or "Open Roger" for a signed-in visitor. */
function MenuAccountLink({ account, onClick }: { account: NonNullable<NavSet["account"]>; onClick: () => void }) {
  const link = useSignedInHint() ? account.openApp : account.signIn;
  return (
    <li>
      <Link href={link.href} className="flex min-h-12 items-center text-title" onClick={onClick}>
        {link.label}
      </Link>
    </li>
  );
}

/** The rows of the menu on a phone: the header's links, then a site version's account row. Exported for its test: the menu opens on a click, so no static render shows it. */
export function PhoneMenu({ nav, onNavigate }: { nav: NavSet; onNavigate: () => void }) {
  return (
    <nav aria-label="Main" className="wrap py-3">
      <ul>
        {nav.links.map((l) => (
          <li key={l.id ?? l.href}>
            {/* A label an admin typed may be one long word: it breaks inside the row, and never widens the page. */}
            <SiteLink href={l.href} className="flex min-h-12 items-center text-title [overflow-wrap:anywhere]" onClick={onNavigate}>
              {l.label}
            </SiteLink>
          </li>
        ))}
        {nav.account && <MenuAccountLink account={nav.account} onClick={onNavigate} />}
      </ul>
    </nav>
  );
}

export function SiteHeader({ site, chrome }: { site: ServedSite; chrome?: SiteChrome | null }) {
  const path = useShownPath();
  const nav = navFor(path, site, chrome);
  const row = rowClasses[nav.row ?? "lg"];
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (next: boolean) => setOpenOn(next ? path : null);
  const menuRef = useRef<HTMLDivElement>(null);
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
    menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 bg-ground">
      <a href="#main" className="sr-only-focusable absolute left-4 top-2 z-50 rounded-full bg-ink px-4 py-2 text-small text-ground">
        Skip to content
      </a>
      {/* The narrower gap on a phone is what lets "Sign in" sit beside the start button at 375 pixels. */}
      <div className="wrap flex h-[60px] items-center gap-4 sm:gap-6">
        <Link href="/" className="-ml-1 flex items-center gap-2 rounded-md px-1 py-1 text-[1.0625rem] font-[620] tracking-[-0.015em]">
          <Toque className="size-[22px] text-accent" />
          Roger
        </Link>

        {row.nav && (
          <nav aria-label="Main" className={row.nav}>
            <ul className="flex items-center gap-5 whitespace-nowrap text-small text-ink-2 lg:gap-7">
              {nav.links.map((l) => {
                const active = l.href === path;
                return (
                  <li key={l.id ?? l.href}>
                    <SiteLink
                      href={l.href}
                      current={active ? "page" : undefined}
                      className={`rounded px-0.5 py-1 transition-colors duration-[180ms] hover:text-ink ${active ? "text-ink" : ""}`}
                    >
                      {l.label}
                    </SiteLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div className={`ml-auto flex items-center gap-2 ${row.right ? `${row.right} ` : ""}${nav.cta ? "" : "lg:hidden"}`}>
          {nav.cta && nav.account && <AccountLinks cta={nav.cta} account={nav.account} />}
          {nav.cta && !nav.account && (
            <span className="header-cta">
              {nav.cta.href ? (
                <Link href={nav.cta.href} className="btn btn-m">
                  <span className="hidden xl:inline">{nav.cta.label}</span>
                  <span className="xl:hidden">{nav.cta.short}</span>
                </Link>
              ) : (
                <ActionLink kind={nav.cta.kind!} location="header" size="m" picksFor={nav.cta.picksFor}>
                  <span className="hidden xl:inline">{nav.cta.label}</span>
                  <span className="xl:hidden">{nav.cta.short}</span>
                </ActionLink>
              )}
            </span>
          )}
          {nav.links.length > 0 && (
            <button
              ref={buttonRef}
              type="button"
              className={`-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink${row.button ? ` ${row.button}` : ""}`}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen(!open)}
            >
              <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
              <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 7h14M3 13h14" />}
              </svg>
            </button>
          )}
        </div>
      </div>

      {open && (
        <div id="mobile-menu" ref={menuRef} className={`bg-ground-2${row.menu ? ` ${row.menu}` : ""}`}>
          <PhoneMenu nav={nav} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </header>
  );
}
