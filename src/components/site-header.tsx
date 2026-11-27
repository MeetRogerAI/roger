"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Toque } from "./toque";
import { ActionLink, type ActionKind } from "./action-link";
import { StartLink } from "./site/shared/start-link";
import { useSignedInHint } from "@/lib/auth/signed-in-hint";
// Types only: the served site and a version's chrome are resolved on the server and arrive as props.
import type { SiteChrome } from "@/lib/site/chrome";
import type { ServedSite } from "@/lib/site/version";

type NavLink = { href: string; label: string };

type NavSet = {
  links: NavLink[];
  cta: { kind?: ActionKind; href?: string; label: string; short: string; picksFor?: "work" | "home" } | null;
  /** A site version only (spec A.3): "Sign in" beside the start button, and what a signed-in visitor sees in place of both. */
  account?: { signIn: NavLink; openApp: NavLink };
};

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
  return { links: chrome.links, cta: chrome.start, account: { signIn: chrome.signIn, openApp: chrome.openApp } };
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

/**
 * A v2 hero sketch (plan U11), a preview-only page. Each sketch draws its own header, because the header is part
 * of the look being chosen, so the site's header and footer are left off these pages and no others.
 *
 * `served` is whether this build serves the sketches at all (isKnownNonProduction, read by the root layout: the
 * browser cannot read VERCEL_ENV). Where it does not, these addresses are the not-found page, which keeps the
 * site's header and footer like any other. One path segment after /hero/ only, so nothing deeper matches.
 */
export function isHeroSketch(path: string, served: boolean) {
  return served && /^\/site-preview\/hero\/[^/]+$/.test(path);
}

/** `chrome` is a site version's own header content; Circles, the legacy site and the pages that keep their header need none. */
export function navFor(path: string, site: ServedSite, chrome?: SiteChrome | null): NavSet {
  if (accountPages.some((p) => path === p || path.startsWith(`${p}/`))) return { links: [], cta: null };
  if (site === "legacy") {
    if (path.startsWith("/companies")) return company;
    // A page prepared for one company or group: no navigation, nothing to sell around it
    if (isUnlisted(path)) return { links: [], cta: null };
    // After paying, the only job left is booking: no button competing with it
    if (path.startsWith("/thanks") || path.startsWith("/admin")) return { ...library, cta: null };
    return library;
  }
  if (isUnlisted(path)) return { links: [], cta: null };
  // The admin keeps the header it has under Circles whichever site is served (plan R4).
  if (path.startsWith("/admin")) return { ...circles, cta: null };
  if (site === "circles") return path.startsWith("/apply") ? { ...circles, cta: null } : circles;
  return built(chrome);
}

/**
 * The right of a site version's header. The page is prerendered signed out,
 * and the browser swaps in "Open Roger" once it has read the signed-in hint
 * cookie, so no page waits on a session check. The signed-out pair stays in
 * place, hidden, to hold its width: nothing beside it moves on the swap.
 */
function AccountLinks({ cta, account }: { cta: NonNullable<NavSet["cta"]>; account: NonNullable<NavSet["account"]> }) {
  const signedIn = useSignedInHint();
  return (
    <span className="grid items-center justify-items-end">
      <span className={`col-start-1 row-start-1 flex items-center gap-4 sm:gap-5 ${signedIn ? "invisible" : ""}`} aria-hidden={signedIn || undefined}>
        {/* On the narrowest phones there is no room beside the button: the menu carries it there. */}
        <Link href={account.signIn.href} className="whitespace-nowrap rounded px-0.5 py-1 text-small text-ink-2 transition-colors duration-[180ms] hover:text-ink max-[359px]:hidden">
          {account.signIn.label}
        </Link>
        <span className="header-cta">
          <StartLink className="btn btn-m">
            <span className="hidden xl:inline">{cta.label}</span>
            <span className="xl:hidden">{cta.short}</span>
          </StartLink>
        </span>
      </span>
      {signedIn && (
        <Link href={account.openApp.href} className="btn btn-m col-start-1 row-start-1">
          {account.openApp.label}
        </Link>
      )}
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
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-12 items-center text-title" onClick={onNavigate}>
              {l.label}
            </Link>
          </li>
        ))}
        {nav.account && <MenuAccountLink account={nav.account} onClick={onNavigate} />}
      </ul>
    </nav>
  );
}

export function SiteHeader({ site, chrome, sketches = false }: { site: ServedSite; chrome?: SiteChrome | null; /** Whether this build serves the v2 hero sketches. */ sketches?: boolean }) {
  const path = usePathname() || "/";
  const nav = navFor(path, site, chrome);
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

  // A hero sketch brings its own header.
  if (isHeroSketch(path, sketches)) return null;

  return (
    <header className="sticky top-0 z-40 bg-ground">
      <a href="#main" className="sr-only-focusable absolute left-4 top-2 z-50 rounded-full bg-ink px-4 py-2 text-small text-ground">
        Skip to content
      </a>
      <div className="wrap flex h-[60px] items-center gap-6">
        <Link href="/" className="-ml-1 flex items-center gap-2 rounded-md px-1 py-1 text-[1.0625rem] font-[620] tracking-[-0.015em]">
          <Toque className="size-[22px] text-accent" />
          Roger
        </Link>

        <nav aria-label="Main" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-5 whitespace-nowrap text-small text-ink-2 lg:gap-7">
            {nav.links.map((l) => {
              const active = l.href === path;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded px-0.5 py-1 transition-colors duration-[180ms] hover:text-ink ${active ? "text-ink" : ""}`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={`ml-auto flex items-center gap-2 lg:ml-0 ${nav.cta ? "" : "lg:hidden"}`}>
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
              className="-mr-2 grid size-11 place-items-center rounded-full text-ink lg:hidden"
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
        <div id="mobile-menu" ref={menuRef} className="bg-ground-2 lg:hidden">
          <PhoneMenu nav={nav} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </header>
  );
}
