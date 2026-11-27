/**
 * The routes /pricing, /faq, /how-it-works and /about (plan U7, KTD4): each is
 * not found while Circles or the legacy site is served (covers AE8), serves
 * the v1 page under a site version, and takes its metadata from the page's
 * own copy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v1 } from "@/data/site/v1";
import type { ServedSite } from "@/lib/site/version";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";

vi.hoisted(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});

let site: ServedSite = "circles";
vi.mock("@/lib/site/version", async (orig) => ({ ...(await orig<typeof import("@/lib/site/version")>()), getServedSite: () => site }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const routes = {
  "/pricing": { load: () => import("./pricing/page"), copy: v1.pricing, title: "Roger: Pricing", shows: "What is included" },
  "/faq": { load: () => import("./faq/page"), copy: v1.faq, title: "Roger: Questions", shows: "Zack and privacy" },
  "/how-it-works": { load: () => import("./how-it-works/page"), copy: v1.howItWorks, title: "Roger: How it works", shows: "Zack, in detail" },
  "/about": { load: () => import("./about/page"), copy: v1.about, title: "Roger: About", shows: "Hey there," },
};

/** The route as a build for `served` would load it: the version is read once, when the file is. */
async function route(path: keyof typeof routes, served: ServedSite) {
  site = served;
  vi.resetModules();
  return routes[path].load();
}

beforeEach(() => resetNextFakes());

describe.each(Object.keys(routes) as (keyof typeof routes)[])("%s", (path) => {
  const { copy, title, shows } = routes[path];

  it("is not found when the version is Circles (covers AE8)", async () => {
    const { default: Page, metadata } = await route(path, "circles");
    expect(() => Page()).toThrowError(expect.objectContaining({ digest: expect.stringContaining("404") }));
    expect(metadata).toEqual({ robots: { index: false, follow: false } });
  });

  it("is not found on the legacy site", async () => {
    const { default: Page, metadata } = await route(path, "legacy");
    expect(() => Page()).toThrowError(expect.objectContaining({ digest: expect.stringContaining("404") }));
    expect(metadata).toEqual({ robots: { index: false, follow: false } });
  });

  it("opts out of the instant-shell check, which a page that is only \"not found\" fails in development", async () => {
    expect((await route(path, "circles")).instant).toBe(false);
  });

  it("serves the v1 page under every site version, with that version's wrapper", async () => {
    for (const version of ["v1", "v2", "v3"] as const) {
      const { default: Page } = await route(path, version);
      const markup = await pageMarkup(<Page />);
      expect(markup, version).toContain(`data-site="${version}"`);
      expect(markup, version).toContain(shows);
      expect(markup, version).toContain('href="/start"');
      expect(markup, version).not.toContain("path=");
      expect(markup, version).not.toContain("Circle");
    }
  });

  it("is indexable under v1, with the title and description of the page's own copy", async () => {
    const { metadata } = await route(path, "v1");
    expect(metadata.robots).toBeUndefined();
    expect(metadata.title).toEqual({ absolute: title });
    expect(title).toBe(`Roger: ${copy.title}`);
    expect(metadata.description).toBe(copy.meta.description);
    expect(metadata.alternates).toEqual({ canonical: path });
    expect(metadata.openGraph).toEqual({ url: path, title: copy.title, description: copy.meta.description });
    expect(JSON.stringify(metadata)).not.toMatch(/Circle|\$|[{}]\w/);
  });

  it("has the same metadata under v2 and v3 until each has its own page", async () => {
    const { metadata: first } = await route(path, "v1");
    for (const version of ["v2", "v3"] as const) expect((await route(path, version)).metadata, version).toEqual(first);
  });
});

describe("the four reading pages' descriptions", () => {
  it("are lines of each page's own copy, with no amount to fill", () => {
    expect(v1.pricing.meta.description).toBe(`${v1.pricing.included.items[0]} ${v1.pricing.explained.under}`);
    expect(v1.howItWorks.meta.description).toBe(v1.howItWorks.week.days[1].body);
    expect(v1.faq.meta.description).toBe("Getting started, Zack and privacy, Cora and the ideas, Price and billing.");
    expect(v1.about.meta.description).toBe(v1.about.leadIn);
    for (const page of [v1.pricing, v1.howItWorks, v1.faq, v1.about]) {
      expect(page.meta.headline).toBe(page.title);
      expect(page.meta.description).not.toMatch(/[{}$]/);
      expect(page.meta.description.length).toBeLessThanOrEqual(160);
    }
  });
});
