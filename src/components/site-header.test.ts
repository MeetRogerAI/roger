import { describe, expect, it } from "vitest";
import { v3Defaults } from "@/data/config";
import { amountsFrom } from "@/lib/site/amounts";
import { siteChrome } from "@/lib/site/chrome";
import type { ServedSite } from "@/lib/site/version";
import { footerFor } from "./footer-switch";
import { isUnlisted, navFor as navForSite } from "./site-header";

const sites: ServedSite[] = ["circles", "v1", "v2", "v3", "legacy"];
// What the root layout hands the header under a site version.
const chrome = siteChrome("v1", amountsFrom(v3Defaults));
const navFor = (path: string, site: ServedSite) => navForSite(path, site, site === "circles" || site === "legacy" ? null : chrome);
const fiveLinks = [
  { href: "/how-it-works", label: "How it works", id: "howItWorks" },
  // Not a page: the price section of the homepage (Peter, November 27, 2026).
  { href: "/#price", label: "Pricing", id: "pricing" },
  { href: "/library", label: "Use cases", id: "library" },
  { href: "/faq", label: "FAQ", id: "faq" },
  { href: "/about", label: "About", id: "about" },
];
const hidden = ["/apply", "/setup", "/companies", "/packs/", "/workshops", "/refunds", "/business", "/families"];

describe("navFor", () => {
  it("shows no header button or Circles links on sign-up, sign-in and the app (spec A.3)", () => {
    for (const site of sites) {
      for (const p of ["/start", "/start/plan", "/signin", "/auth/confirm", "/app", "/app/zack"]) {
        expect(navFor(p, site), `${site} ${p}`).toEqual({ links: [], cta: null });
      }
    }
  });

  it("gives a site version its five links, Sign in and the start button (spec A.3)", () => {
    for (const p of ["/", "/faq", "/library", "/getstarted", "/privacy", "/nothing-here"]) {
      const nav = navFor(p, "v1");
      expect(nav.links, p).toEqual(fiveLinks);
      expect(nav.cta, p).toEqual({ href: "/start", label: "Get two free Cora Curations", short: "Get two free Cora Curations" });
      expect(nav.account, p).toEqual({ signIn: { href: "/signin", label: "Sign in" }, openApp: { href: "/app", label: "Open Roger" } });
    }
  });

  it("needs no chrome for sign-up, sign-in and the app under a version, and says so when a public page has none", () => {
    for (const p of ["/start/plan", "/signin", "/app"]) expect(navForSite(p, "v1"), p).toEqual({ links: [], cta: null });
    expect(() => navForSite("/faq", "v1")).toThrow(/chrome/);
  });

  it("gives /zack and /zack/[agent] the public header under a version", () => {
    expect(navFor("/zack", "v1").links).toEqual(fiveLinks);
    expect(navFor("/zack", "v1")).toEqual(navFor("/", "v1"));
    expect(navFor("/zack/claude", "v1")).toEqual(navFor("/faq", "v1"));
  });

  it("treats /zack as any other page under Circles and the legacy site, where the route is not found", () => {
    expect(navFor("/zack", "circles")).toEqual(navFor("/library", "circles"));
    expect(navFor("/zack", "legacy")).toEqual(navFor("/library", "legacy"));
    expect(navFor("/zack", "circles").account).toBeUndefined();
  });

  it("no longer knows /hampton, /rlp or /founders, which redirect to /zack (Peter's decision of November 26, 2026)", () => {
    for (const p of ["/hampton", "/rlp", "/founders"]) {
      expect(isUnlisted(p), p).toBe(false);
      expect(navFor(p, "v1"), p).toEqual(navFor("/nothing-here", "v1"));
    }
    expect(isUnlisted("/rlpsignature")).toBe(true);
    expect(isUnlisted("/for/x")).toBe(true);
    expect(isUnlisted("/zack")).toBe(false);
  });

  it("offers Sign in and Open Roger only under a version", () => {
    for (const site of ["circles", "legacy"] as const) {
      for (const p of ["/", "/library", "/apply", "/companies", "/admin"]) expect(navFor(p, site).account, `${site} ${p}`).toBeUndefined();
    }
    expect(navFor("/admin", "v1").account).toBeUndefined();
  });

  it("leaves other Circles pages alone, including /apply", () => {
    expect(navFor("/", "circles").cta).toEqual({ href: "/apply", label: "Apply for a founding Circle", short: "Apply" });
    expect(navFor("/apply", "circles").links.length).toBeGreaterThan(0);
    expect(navFor("/apply", "circles").cta).toBeNull();
  });

  it("is the same under Circles and under a version for the app, the admin and the unlisted pages (R4, R9)", () => {
    for (const p of ["/admin", "/admin/users", "/start", "/signin", "/app/zack", "/rlpsignature", "/for/x"]) {
      expect(navFor(p, "v1"), p).toEqual(navFor(p, "circles"));
    }
    // The admin's header is the logo alone under every site: its sidebar is its navigation (Peter, November 28, 2026).
    for (const site of ["v1", "v2", "v3", "circles", "legacy"] as const) {
      for (const p of ["/admin", "/admin/users", "/admin/pages/home", "/admin/zzz"]) expect(navFor(p, site), `${site} ${p}`).toEqual({ links: [], cta: null });
    }
    // Only the admin itself: an address that merely starts with the same letters is an ordinary page.
    expect(navFor("/administer", "v1").links.length).toBeGreaterThan(0);
  });

  it("links to no Circles or legacy offer page under a version", () => {
    for (const site of ["v1", "v2", "v3"] as const) {
      for (const p of ["/", "/library", "/zack", "/privacy", "/terms", "/companies", "/setup", "/thanks/work"]) {
        const nav = navFor(p, site);
        const hrefs = [...nav.links.map((l) => l.href), nav.cta?.href ?? "", nav.account?.signIn.href ?? "", nav.account?.openApp.href ?? ""];
        for (const h of hrefs) expect(hidden.some((x) => h.startsWith(x)), `${site} ${p} ${h}`).toBe(false);
      }
    }
    expect(navFor("/", "v1").cta?.href).toBe("/start");
  });

  it("keeps the legacy site's header as it was", () => {
    expect(navFor("/", "legacy").cta).toEqual({ href: "/packs/solopreneur", label: "Get the free pack", short: "Free pack" });
    expect(navFor("/companies", "legacy").cta?.kind).toBe("companyCall");
    expect(navFor("/thanks/work", "legacy").links.length).toBeGreaterThan(0);
  });
});

describe("footerFor", () => {
  it("gives unlisted pages the quiet footer under every site", () => {
    // The footer no longer depends on which site is served: /zack is never an unlisted page.
    for (const p of ["/for/x", "/rlpsignature"]) expect(footerFor(p), p).toBe("minimal");
    for (const p of ["/", "/zack", "/zack/claude", "/hampton", "/founders", "/rlp"]) expect(footerFor(p), p).toBe("full");
  });
});
