/**
 * The header of a site version for a signed-in visitor (spec A.3). The page is
 * prerendered signed out and the browser swaps "Open Roger" in, so the hint is
 * set here by hand and the header rendered with it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { amountsFrom } from "@/lib/site/amounts";
import { siteChrome } from "@/lib/site/chrome";
import { pageMarkup } from "@/test-helpers/page-markup";

let signedIn = false;
vi.mock("@/lib/auth/signed-in-hint", () => ({ useSignedInHint: () => signedIn }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), usePathname: () => "/pricing" }));

const { SiteHeader, PhoneMenu, navFor } = await import("./site-header");

const chrome = siteChrome("v1", amountsFrom(v3Defaults));
const links = (markup: string) => [...markup.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
const hrefs = (markup: string) => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const header = async (as: "out" | "in") => {
  signedIn = as === "in";
  return pageMarkup(<SiteHeader site="v1" chrome={chrome} />);
};

const openApp = /<a [^>]*href="\/app"[^>]*>Open Roger<\/a>/g;
const hiddenPair = ' invisible" aria-hidden="true">';

afterEach(() => {
  signedIn = false;
});

describe("a site version's header for a signed-in visitor", () => {
  it("shows Open Roger, to /app", async () => {
    const markup = await header("in");
    expect(markup.match(openApp)).toHaveLength(1);
    expect(markup.match(openApp)![0]).toContain('class="btn btn-m col-start-1 row-start-1"');
  });

  it("keeps Sign in and the start button in the markup, inside a wrapper that is invisible and hidden from screen readers", async () => {
    const markup = await header("in");
    expect(hrefs(markup)).toEqual(["#main", "/", "/how-it-works", "/pricing", "/library", "/faq", "/about", "/signin", "/start", "/app"]);
    // One wrapper carries both marks, and it is the wrapper of the signed-out pair.
    expect(markup.match(/invisible/g)).toHaveLength(1);
    const wrapper = markup.match(/<span class="col-start-1 row-start-1 [^"]* invisible" aria-hidden="true">/)!;
    expect(wrapper).not.toBeNull();
    // Open Roger directly follows the wrapper's end (the start link, the span around it, then the wrapper), so everything between the two is inside the wrapper.
    const from = wrapper.index! + wrapper[0].length;
    const to = markup.search(openApp);
    const ends = "</a></span></span>";
    expect(markup.slice(to - ends.length, to)).toBe(ends);
    const inside = markup.slice(from, to - "</span>".length);
    // One label at every width: no shorter one beside it.
    expect(inside).toMatch(/<a class="btn btn-m [^"]*" href="\/start">Get two free Cora Curations<\/a>/);
    expect(inside).not.toContain("Start free");
    expect(inside.match(/<span/g)!.length).toBe(inside.match(/<\/span>/g)!.length);
    expect(hrefs(inside)).toEqual(["/signin", "/start"]);
    expect(inside).toContain(">Sign in</a>");
    // Under 375 pixels Sign in leaves the row (the menu lists it), so the button's two lines have room: at 360 they took three beside it.
    expect(inside).toMatch(/<a class="[^"]*max-\[374px\]:hidden[^"]*" href="\/signin">Sign in<\/a>/);
    // Nothing before the wrapper is hidden with it.
    expect(hrefs(markup.slice(0, wrapper.index))).toEqual(["#main", "/", "/how-it-works", "/pricing", "/library", "/faq", "/about"]);
  });

  it("changes nothing else in the header", async () => {
    const out = await header("out");
    const signed = await header("in");
    expect(out).not.toContain("invisible");
    expect(out).not.toContain("Open Roger");
    expect(out).not.toContain('aria-hidden="true"><a');
    expect(signed).toContain(hiddenPair);
    // Take the two additions away and the signed-in header is the signed-out one, character for character.
    expect(signed.replace(openApp, "").replace(hiddenPair, ' ">')).toBe(out);
  });
});

// The menu opens on a click, so a static render of the header never shows it: its rows are rendered directly.
describe("a site version's menu on a phone", () => {
  const fiveLinks = [
    ["/how-it-works", "How it works"],
    ["/pricing", "Pricing"],
    ["/library", "Use cases"],
    ["/faq", "FAQ"],
    ["/about", "About"],
  ];
  const menu = async (as: "out" | "in", nav = navFor("/pricing", "v1", chrome)) => {
    signedIn = as === "in";
    return pageMarkup(<PhoneMenu nav={nav} onNavigate={() => {}} />);
  };

  it("lists the five links, then Sign in for a signed-out visitor", async () => {
    expect(links(await menu("out"))).toEqual([...fiveLinks, ["/signin", "Sign in"]]);
  });

  it("lists the five links, then Open Roger for a signed-in visitor", async () => {
    const markup = await menu("in");
    expect(links(markup)).toEqual([...fiveLinks, ["/app", "Open Roger"]]);
    expect(markup).not.toContain("Sign in");
    expect(markup).not.toContain("invisible");
  });

  it("has no account row under Circles, signed in or not", async () => {
    for (const as of ["out", "in"] as const) {
      const markup = await menu(as, navFor("/", "circles"));
      expect(hrefs(markup), as).toEqual(["/#how", "/zack", "/library", "/#questions", "/#letter"]);
    }
  });
});
