/**
 * The release file, src/data/site/released.json (plan KTD13, U10): the
 * built-in wording and layout this release carries, written by the release
 * snapshot (scripts/snapshot-content.mjs). The snapshot runs this file
 * against what it has just written, and puts the old file back if it fails.
 *
 * It must parse STRICTLY: every field, section and list id one the code has,
 * every name in braces real, every link usable, every list within its bounds.
 * The site reads it leniently (a bad entry is dropped and the code's wording
 * shows), so without this test an entry the code no longer knows would be
 * wording silently lost at the release.
 *
 * Released text is not put through the wording rules here: it was checked when
 * it was published, where every rule published over was logged (plan R16).
 *
 * The tests that pin the code copy render with an empty release file, so a
 * snapshot never breaks them; this file is where the real one is held.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { at, renderSitePages } from "@/test-helpers/site-pages";

// The real file: every other test reads it as empty (src/test-helpers/empty-release.ts).
vi.unmock("@/data/site/released.json");
vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => at.path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/font/google", () => ({ Mona_Sans: () => ({ variable: "font-mona-test" }) }));
vi.mock("@/lib/watches", () => ({ confirmWatch: async () => null, stopWatch: async () => null }));
vi.mock("@/lib/admin-auth", () => ({ isAdmin: async () => false }));
vi.mock("@/lib/db", () => ({ hasDb: () => false, sql: Object.assign(async () => [], { query: async () => [] }) }));

const { parseOverlayStrict } = await import("@/lib/site/content/format");
const { canonicalOverlay } = await import("@/lib/site/content/export");
const { codeModel, applyOverlay, releasedOverlay } = await import("@/lib/site/content/model");
const { canonical } = await import("@/lib/site/content/store");

/** The file as it is on disk, through JSON.parse, as the release reads it: a "__proto__" key is an own key there. */
const written = readFileSync(path.join(import.meta.dirname, "released.json"), "utf8");
const file: unknown = JSON.parse(written);

describe("src/data/site/released.json", () => {
  it("parses strictly: every id one the code has, every name in braces real, every destination usable", () => {
    const read = parseOverlayStrict(file);
    expect(read.ok ? [] : read.problems).toEqual([]);
  });

  it("is read by the site as it is written: nothing in it is dropped by the lenient reader", () => {
    expect(canonical(releasedOverlay)).toBe(canonical(file));
  });

  it("is written the way the snapshot writes it: keys in order, two spaces, one newline at the end", () => {
    expect(written.replace(/\r\n/g, "\n")).toBe(`${JSON.stringify(canonicalOverlay(file as never), null, 2)}\n`);
  });

  it("gives every covered page something to render, with the header and the footer, and no database", async () => {
    resetNextFakes({}, { "x-vercel-ip-country": "US" });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const pages = await renderSitePages("v1");
    expect(pages.length).toBe(13);
    for (const page of pages) expect(page.markup.length, page.path).toBeGreaterThan(1000);
    // Every released text that the homepage prints in its hero is on the homepage.
    const home = pages.find((page) => page.path === "/")!;
    const headline = applyOverlay(codeModel, releasedOverlay).home.hero.headline;
    expect(home.markup.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')).toContain(headline);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  }, 120_000);
});

describe("the strict reading of a release file", () => {
  const overlay = (o: Record<string, unknown>) => ({ format: 1, text: {}, sections: {}, lists: {}, ...o });
  it("fails a field id the code does not have", () => {
    expect(parseOverlayStrict(overlay({ text: { "home.hero.nothing": "x" } })).ok).toBe(false);
  });
  it("fails a name in braces that is not an amount", () => {
    expect(parseOverlayStrict(overlay({ text: { "questions.price-and-billing.items.cost.a": "{monthlyUsdd} a month" } })).ok).toBe(false);
  });
  it("fails a link that would run script", () => {
    expect(parseOverlayStrict(overlay({ text: { "nav.pricing.href": "javascript:alert(1)" } })).ok).toBe(false);
  });
  it("passes the same entries when they are sound", () => {
    expect(parseOverlayStrict(overlay({ text: { "questions.price-and-billing.items.cost.a": "{monthlyUsd} a month", "nav.pricing.href": "/#price" } })).ok).toBe(true);
  });
});
