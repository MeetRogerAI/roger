import { beforeEach, describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { v1 } from "@/data/site/v1";
import { amountsFrom, fillCopy } from "./amounts";
import { emptyOverlay, newOverlay, type Overlay } from "./content/format";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

/** What the content reader gives getSiteChrome. The reader itself is tested in content/read.test.ts. */
const stored = { content: emptyOverlay as Overlay };
vi.mock("./content/read", () => ({ getSiteContent: async () => stored.content }));

const { PRICE_SECTION_HREF, chromeFrom, getSiteChrome, siteChrome } = await import("./chrome");

const amounts = amountsFrom(v3Defaults);
const edits = (text: Record<string, string>): Overlay => ({ ...newOverlay(), text });

beforeEach(() => {
  stored.content = emptyOverlay;
});

describe("chromeFrom", () => {
  // The chrome is built in the root layout, so it must not depend on any page's own copy.
  it("builds when a page's own copy names an amount that does not exist", () => {
    const broken = { ...v1, home: { ...v1.home, closing: { line: "See what {freeList} Mondays bring." } }, cardLine: "Charged with your {thirdList} list." };
    // The case is real: filling the whole object throws.
    expect(() => fillCopy(broken, amounts)).toThrow(/\{freeList\}|\{thirdList\}/);
    expect(chromeFrom(broken, amounts)).toEqual(siteChrome("v1", amounts));
  });

  it("still fails on an unknown amount in a string the chrome shows", () => {
    for (const part of ["buttons", "footer", "notFound"] as const) {
      const [key] = Object.keys(v1[part]);
      const broken = { ...v1, [part]: { ...v1[part], [key]: "{nope}" } };
      expect(() => chromeFrom(broken, amounts), part).toThrow("{nope}");
    }
    expect(() => chromeFrom({ ...v1, nav: [{ ...v1.nav[0], label: "{nope}" }] }, amounts)).toThrow("{nope}");
    expect(() => chromeFrom({ ...v1, footer: { ...v1.footer, links: [{ ...v1.footer.links[0], label: "{nope}" }] } }, amounts)).toThrow("{nope}");
  });

  it("fills the amounts its own labels name", () => {
    expect(siteChrome("v1", amounts).start).toEqual({ href: "/start", label: "Get two free Cora Curations", short: "Get two free Cora Curations" });
    expect(JSON.stringify(siteChrome("v1", amounts))).not.toMatch(/[{}]\w|\w\}/);
  });
});

describe("the chrome with stored content (plan U4)", () => {
  it("is the code copy's when no content is handed over, or content that changes nothing", () => {
    expect(siteChrome("v1", amounts, emptyOverlay)).toEqual(siteChrome("v1", amounts));
    // Another page's words are none of the chrome's.
    expect(siteChrome("v1", amounts, edits({ "home.hero.headline": "Smarter every Monday.", cardLine: "No card needed." }))).toEqual(siteChrome("v1", amounts));
  });

  it("shows a published start button in the header, with the amount it names filled in, and every other edited label in its place", () => {
    const chrome = siteChrome(
      "v1",
      amounts,
      edits({
        "buttons.start": "Start with {freeLists} free Cora Curations",
        "buttons.signIn": "Log in",
        "buttons.openApp": "Open my Roger",
        "nav.pricing.label": "Price",
        "nav.faq.label": "Questions",
        "footer.links.pricing.label": "Price",
        "footer.links.faq.label": "Questions",
        "footer.place": "Roger, Hamilton",
        "footer.terms": "The terms",
        "notFound.title": "Nothing lives at this address",
      }),
    );
    expect(chrome.start).toEqual({ href: "/start", label: "Start with two free Cora Curations", short: "Start with two free Cora Curations" });
    expect(chrome.signIn).toEqual({ href: "/signin", label: "Log in" });
    expect(chrome.openApp).toEqual({ href: "/app", label: "Open my Roger" });
    // The header's links and the footer's keep their two orders and their addresses.
    expect(chrome.links.map((link) => link.label)).toEqual(["How it works", "Price", "Use cases", "Questions", "About"]);
    expect(chrome.footer.map((link) => link.label)).toEqual(["Price", "How it works", "Questions", "About", "Use cases"]);
    expect(chrome.links.map((link) => link.href)).toEqual(siteChrome("v1", amounts).links.map((link) => link.href));
    expect(chrome.place).toBe("Roger, Hamilton");
    expect(chrome.legal).toEqual([
      { href: "/privacy", label: siteChrome("v1", amounts).legal[0].label },
      { href: "/terms", label: "The terms" },
    ]);
    expect(chrome.notFound.title).toBe("Nothing lives at this address");
    expect(chrome.notFound.line).toBe(siteChrome("v1", amounts).notFound.line);
  });

  it("is not taken down by a stored label that names an amount that does not exist: the label is not applied", () => {
    const broken = edits({ "buttons.start": "Get {nope} free", "nav.faq.label": "{monthlyUsdd}", "footer.place": "   ", "notFound.line": "{week}", "nav.about.label": "Team", "footer.links.about.label": "Team" });
    expect(() => siteChrome("v1", amounts, broken)).not.toThrow();
    // The one usable entry is applied, and every other label is the built-in one.
    const plain = siteChrome("v1", amounts);
    expect(siteChrome("v1", amounts, broken)).toEqual({
      ...plain,
      links: plain.links.map((link) => (link.href === "/about" ? { ...link, label: "Team" } : link)),
      footer: plain.footer.map((link) => (link.href === "/about" ? { ...link, label: "Team" } : link)),
    });
    // Nor by content that is no overlay at all.
    for (const nonsense of ["text", null, [], { format: 9, text: { "buttons.start": "x" } }, { format: 1, text: "x" }]) expect(siteChrome("v1", amounts, nonsense as never)).toEqual(plain);
  });

  it("with no list entry, has today's five links in the header and the footer, in today's two orders, and “Pricing” still goes to the price section (plan U8)", () => {
    const chrome = siteChrome("v1", amounts);
    expect(chrome.links.map((link) => [link.label, link.href])).toEqual([
      ["How it works", "/how-it-works"],
      ["Pricing", PRICE_SECTION_HREF],
      ["Use cases", "/library"],
      ["FAQ", "/faq"],
      ["About", "/about"],
    ]);
    expect(chrome.footer.map((link) => [link.label, link.href])).toEqual([
      ["Pricing", PRICE_SECTION_HREF],
      ["How it works", "/how-it-works"],
      ["FAQ", "/faq"],
      ["About", "/about"],
      ["Use cases", "/library"],
    ]);
    // The copy's "pricing" links are the price section's address, which the redirects test holds chrome.ts to.
    expect([...v1.nav, ...v1.footer.links].filter((link) => link.id === "pricing").map((link) => link.href)).toEqual([PRICE_SECTION_HREF, PRICE_SECTION_HREF]);
    expect(chrome.navRow).toBe("lg");
  });

  it("shows a link added to the header last in the header, and not in the footer; the start and Sign in buttons are no links of the list", () => {
    const zack = { ...newOverlay(), text: { "nav.x-zack.label": "Run Zack", "nav.x-zack.href": "/zack" }, lists: { nav: { order: [], removed: [], added: ["x-zack"] } } };
    const chrome = siteChrome("v1", amounts, zack);
    expect(chrome.links.at(-1)).toEqual({ href: "/zack", label: "Run Zack", id: "x-zack" });
    expect(chrome.links).toHaveLength(6);
    expect(chrome.footer).toEqual(siteChrome("v1", amounts).footer);
    expect(chrome.links.map((link) => link.href)).not.toContain("/start");
    expect(chrome.links.map((link) => link.href)).not.toContain("/signin");
    // Six links do not fit beside the two buttons at 1024 pixels: the row starts at 1280 (header-fit.ts).
    expect(chrome.navRow).toBe("xl");
  });

  it("prints the footer's links in a new order, and the two small-print links stay where they are", () => {
    const order = ["about", "faq", "library", "pricing", "howItWorks"];
    const chrome = siteChrome("v1", amounts, { ...newOverlay(), lists: { "footer.links": { order, removed: [], added: [] } } });
    expect(chrome.footer.map((link) => link.id)).toEqual(order);
    expect(chrome.legal).toEqual(siteChrome("v1", amounts).legal);
    expect(chrome.links).toEqual(siteChrome("v1", amounts).links);
  });

  it("drops a stored address a link may not point at: a built-in link keeps its own, an added one is not shown", () => {
    for (const bad of ["javascript:alert(1)", "//evil.test", "http://x.test", "data:text/html,x", "https://a@evil.test"]) {
      const chrome = siteChrome("v1", amounts, {
        ...newOverlay(),
        text: { "nav.faq.href": bad, "footer.links.faq.href": bad, "nav.x-bad.label": "Bad", "nav.x-bad.href": bad },
        lists: { nav: { order: [], removed: [], added: ["x-bad"] } },
      });
      expect(chrome.links.find((link) => link.id === "faq")?.href, bad).toBe("/faq");
      expect(chrome.footer.find((link) => link.id === "faq")?.href, bad).toBe("/faq");
      expect(chrome.links.map((link) => link.id), bad).not.toContain("x-bad");
      expect(JSON.stringify(chrome), bad).not.toContain(bad);
    }
  });

  it("is read with the published content by the root layout's reader, and is the built-in chrome when there is none", async () => {
    expect(await getSiteChrome("v1")).toEqual(siteChrome("v1", amounts));
    stored.content = edits({ "buttons.start": "Start now", "notFound.home": "Home" });
    const chrome = await getSiteChrome("v1");
    expect(chrome.start.label).toBe("Start now");
    expect(chrome.notFound.home).toBe("Home");
    expect(chrome.signIn).toEqual(siteChrome("v1", amounts).signIn);
  });
});
