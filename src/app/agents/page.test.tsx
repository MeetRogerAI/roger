/**
 * The /agents route (plan U6, KTD4): not found while Circles or the legacy
 * site is served (covers AE8), the v1 page under a site version, and that
 * page's own metadata.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v1Agents } from "@/data/site/v1";
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

/** The route as a build for `served` would load it: the version is read once, when the file is. */
async function route(served: ServedSite) {
  site = served;
  vi.resetModules();
  return import("./page");
}

beforeEach(() => resetNextFakes());

describe("/agents", () => {
  it("is not found when the version is Circles (covers AE8)", async () => {
    const { default: Page, metadata } = await route("circles");
    expect(() => Page()).toThrowError(expect.objectContaining({ digest: expect.stringContaining("404") }));
    expect(metadata).toEqual({ robots: { index: false, follow: false } });
  });

  it("is not found on the legacy site", async () => {
    const { default: Page, metadata } = await route("legacy");
    expect(() => Page()).toThrowError(expect.objectContaining({ digest: expect.stringContaining("404") }));
    expect(metadata).toEqual({ robots: { index: false, follow: false } });
  });

  it("opts out of the instant-shell check, which a page that is only \"not found\" fails in development", async () => {
    expect((await route("circles")).instant).toBe(false);
  });

  it("serves the v1 page under every site version, with that version's wrapper", async () => {
    for (const version of ["v1", "v2", "v3"] as const) {
      const { default: Page } = await route(version);
      const markup = await pageMarkup(<Page />);
      expect(markup, version).toContain(`data-site="${version}"`);
      expect(markup, version).toContain("Stop figuring out AI agents alone.");
      expect(markup, version).toContain("Works with every agent");
      expect(markup, version).toContain('href="/start?path=agents"');
      expect(markup, version).not.toContain("Circle");
    }
  });

  it("is indexable under v1, with the title and description of the page's own copy", async () => {
    const { metadata } = await route("v1");
    expect(metadata.robots).toBeUndefined();
    expect(metadata.title).toEqual({ absolute: "Roger: Stop figuring out AI agents alone." });
    expect(metadata.description).toBe(v1Agents.hero.sub);
    expect(metadata.alternates).toEqual({ canonical: "/agents" });
    expect(metadata.openGraph).toEqual({ url: "/agents", title: v1Agents.hero.headline, description: v1Agents.hero.sub });
    expect(JSON.stringify(metadata)).not.toMatch(/Circle|\$/);
  });
});
