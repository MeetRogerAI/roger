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
const { getSiteChrome } = await import("@/lib/site/chrome");
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
    expect(hrefs(await pageMarkup(<SiteFooter site="circles" />))).not.toContain("/refunds");
    const v1 = hrefs(await pageMarkup(<SiteFooter site="v1" chrome={await getSiteChrome("v1")} />));
    expect(v1).toContain("/agents");
    expect(v1).not.toContain("/refunds");
  });
});

describe("/privacy and /terms on the legacy site", () => {
  it("render the setup-era documents with the metadata they had before a site version had its own (U9)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/site/version", async (orig) => ({ ...(await orig<typeof import("@/lib/site/version")>()), getServedSite: () => "legacy" }));
    try {
      const { default: Privacy, metadata: privacyMetadata } = await import("@/app/privacy/page");
      const { default: Terms, metadata: termsMetadata } = await import("@/app/terms/page");
      const { LegalPage } = await import("@/components/legal-page");
      const { privacy, terms } = await import("@/data/legal");
      expect(await pageMarkup(<Privacy />)).toBe(await pageMarkup(<LegalPage doc={privacy} />));
      expect(await pageMarkup(<Terms />)).toBe(await pageMarkup(<LegalPage doc={terms} />));
      expect(await pageMarkup(<Terms />)).toContain("These terms cover the setups we sell on this site.");
      expect(privacyMetadata).toEqual({ title: "Privacy", description: "What Roger collects, why, and what stays in your browser.", alternates: { canonical: "/privacy" } });
      expect(termsMetadata).toEqual({ title: "Terms", description: "The plain-language terms for Roger setups.", alternates: { canonical: "/terms" } });
    } finally {
      vi.doUnmock("@/lib/site/version");
      vi.resetModules();
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
