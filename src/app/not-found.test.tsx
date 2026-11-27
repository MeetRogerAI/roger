import { afterEach, describe, expect, it, vi } from "vitest";
import { pageMarkup } from "@/test-helpers/page-markup";
import type { ServedSite } from "@/lib/site/version";

vi.hoisted(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});

let site: ServedSite = "circles";
vi.mock("@/lib/site/version", async (orig) => ({ ...(await orig<typeof import("@/lib/site/version")>()), getServedSite: () => site }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), usePathname: () => "/nothing-here" }));
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { default: NotFound } = await import("./not-found");

afterEach(() => {
  site = "circles";
});

describe("the not-found page", () => {
  // Written against the file before a site version got its own branch: Circles and the legacy site must not move.
  it("is unchanged under Circles and on the legacy site", async () => {
    for (site of ["circles", "legacy"] as const) {
      expect(await pageMarkup(<NotFound />), site).toMatchInlineSnapshot(`"<section class="wrap py-24 md:py-36"><h1 class="text-h2 text-stretch-display">That page isn’t here</h1><p class="mt-5 max-w-[34rem] text-lead">The link may be old or mistyped (error 404). Try one of these:</p><ul class="mt-8 flex flex-wrap gap-x-8 gap-y-3"><li><a class="tlink chev" href="/library">The use-case library</a></li><li><a class="tlink chev" href="/packs/solopreneur">Free starter pack</a></li><li><a class="tlink chev" href="/companies">For companies</a></li><li><a class="tlink chev" href="/setup">Custom setup</a></li></ul></section>"`);
    }
  });

  it("links home and to the start button under a site version, and to no old offer", async () => {
    for (site of ["v1", "v2", "v3"] as const) {
      const markup = await pageMarkup(<NotFound />);
      expect([...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]), site).toEqual(["/start", "/"]);
      expect(markup, site).toContain(`data-site="${site}"`);
      expect(markup, site).not.toMatch(/packs|companies|setup|starter pack/i);
    }
  });
});
