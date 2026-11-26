/**
 * The legacy branch: the older library-led site that `circlesMode: false`
 * restores. Nothing selects it today, so these tests are what keeps it working.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/data/config";
import { seedUseCases } from "@/data/library";
import { pageMarkup } from "@/test-helpers/page-markup";

vi.hoisted(() => {
  process.env.SITE_VERSION = "circles";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});

vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { UseCaseCard, UseCaseRow } = await import("@/components/use-case-card");
const { SiteFooter } = await import("@/components/site-footer");
const { default: Apply } = await import("@/app/apply/page");
const { getServedSite } = await import("@/lib/site/version");

const u = seedUseCases[0];
const offer = `href="/setup?from=${encodeURIComponent(u.id)}"`;
const hrefs = (markup: string) => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

afterEach(() => vi.unstubAllEnvs());

describe("the setup offer on a use case", () => {
  it("is on a row only when the caller asks for it", async () => {
    const withOffer = await pageMarkup(<UseCaseRow u={u} shade={false} showOffer />);
    expect(withOffer).toContain("We can set this up");
    expect(withOffer).toContain(offer);
    for (const row of [<UseCaseRow key="a" u={u} shade={false} />, <UseCaseRow key="b" u={u} shade={false} showOffer={false} />]) {
      const markup = await pageMarkup(row);
      expect(markup).toContain(u.handle);
      expect(markup).not.toContain("We can set this up");
      expect(markup).not.toContain("/setup");
    }
  });

  it("is on a card only when the caller asks for it", async () => {
    expect(await pageMarkup(<UseCaseCard u={u} showOffer />)).toContain(offer);
    expect(await pageMarkup(<UseCaseCard u={u} />)).not.toContain("We can set this up");
  });
});

describe("the legacy site's footer", () => {
  it("links to Refunds, which Circles and a site version leave out", async () => {
    const legacy = await pageMarkup(<SiteFooter site="legacy" />);
    expect(hrefs(legacy)).toContain("/refunds");
    expect(legacy).toContain("Refunds");
    expect(legacy).toContain("Real agent use cases, read every morning in Toronto.");
    for (const site of ["circles", "v1"] as const) {
      expect(hrefs(await pageMarkup(<SiteFooter site={site} />)), site).not.toContain("/refunds");
    }
  });
});

describe("/apply on the legacy site", () => {
  it("is not found, as it was before the resolver", () => {
    const flags = siteConfig.flags as { circlesMode: boolean };
    const before = flags.circlesMode;
    flags.circlesMode = false;
    try {
      expect(getServedSite()).toBe("legacy");
      expect(() => Apply()).toThrowError(expect.objectContaining({ digest: expect.stringContaining("404") }));
    } finally {
      flags.circlesMode = before;
    }
    // Back under Circles the page renders.
    expect(getServedSite()).toBe("circles");
    expect(() => Apply()).not.toThrow();
  });
});
