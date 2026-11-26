/**
 * What a site version serves before its pages are built: placeholders, the
 * /apply redirect, and no link back to a Circles or legacy offer page.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { pageMarkup } from "@/test-helpers/page-markup";
import { nextHeaders, Redirected, resetNextFakes } from "@/test-helpers/next-fakes";

vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});

let path = "/";
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  redirect: (url: string): never => {
    throw new Redirected(url);
  },
}));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/font/google", () => ({ Mona_Sans: () => ({ variable: "font-mona-test" }) }));

const { default: RootLayout, metadata: rootMetadata } = await import("@/app/layout");
const { default: Home, metadata: homeMetadata } = await import("@/app/page");
const { default: Zack, metadata: zackMetadata } = await import("@/app/zack/page");
const { default: Library } = await import("@/app/library/page");
const { default: Privacy, metadata: privacyMetadata } = await import("@/app/privacy/page");
const { default: Terms, metadata: termsMetadata } = await import("@/app/terms/page");
const { default: Apply } = await import("@/app/apply/page");
const companies = await import("@/app/companies/page");
const card = await import("@/app/opengraph-image");

const hidden = ["/apply", "/setup", "/companies", "/packs/", "/workshops", "/refunds", "/business", "/families"];
const hrefs = (markup: string) => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

beforeAll(() => resetNextFakes());

describe("a site version before its pages are built", () => {
  it("serves a placeholder home, kept out of search", async () => {
    const markup = await pageMarkup(<Home />);
    expect(markup).toContain("not built yet");
    expect(markup).toContain('data-site="v1"');
    expect(markup).not.toContain("Circle");
    expect(homeMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("serves a placeholder at /zack, not the Hampton page", async () => {
    const markup = await pageMarkup(<Zack />);
    expect(markup).toContain("not built yet");
    expect(markup).not.toContain("Zack The Collector Page");
    expect(zackMetadata.alternates).toEqual({ canonical: "/zack" });
    expect(zackMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("shows no Circles legal text at /privacy or /terms", async () => {
    for (const page of [<Privacy key="p" />, <Terms key="t" />]) {
      const markup = await pageMarkup(page);
      expect(markup).toContain("not built yet");
      expect(markup).not.toContain("Circle");
    }
  });

  it("keeps the /privacy and /terms placeholders out of search", () => {
    expect(privacyMetadata.robots).toEqual({ index: false, follow: false });
    expect(termsMetadata.robots).toEqual({ index: false, follow: false });
    expect(privacyMetadata.alternates).toEqual({ canonical: "/privacy" });
    expect(termsMetadata.alternates).toEqual({ canonical: "/terms" });
    expect(JSON.stringify([privacyMetadata, termsMetadata])).not.toContain("Circle");
  });

  it("sends /apply to /start (covers AE10)", () => {
    expect(() => Apply()).toThrowError(new Redirected("/start"));
  });

  it("carries no Circles wording in the root metadata, JSON-LD or social card", async () => {
    expect(JSON.stringify(rootMetadata)).not.toContain("Circle");
    expect(card.alt).toBe("Roger");
    const markup = await pageMarkup(<RootLayout params={Promise.resolve({})}>{null}</RootLayout>);
    const json = markup.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    expect(JSON.parse(json)).toEqual({ "@context": "https://schema.org", "@type": "Organization", name: "Roger", url: "https://meetroger.ai", email: "hello@meetroger.ai" });
  });

  it("keeps the hidden legacy pages out of search", () => {
    expect(companies.metadata.robots).toEqual({ index: false, follow: false });
  });

  it("links to no Circles or legacy offer page from the header, footer or library", async () => {
    const pages: [string, React.ReactNode][] = [["/", <Home key="h" />], ["/library", <Library key="l" />], ["/zack", <Zack key="z" />], ["/privacy", <Privacy key="p" />]];
    for (const [at, page] of pages) {
      path = at;
      const markup = await pageMarkup(<RootLayout params={Promise.resolve({})}>{page}</RootLayout>);
      expect(markup, at).toContain("<header");
      expect(markup, at).toContain("<footer");
      const bad = hrefs(markup).filter((h) => hidden.some((x) => h.startsWith(x)));
      expect(bad, at).toEqual([]);
    }
  });

  it("renders library rows without the setup offer", async () => {
    path = "/library";
    const markup = await pageMarkup(<Library />);
    expect(markup.match(/<article/g)!.length).toBeGreaterThan(10);
    expect(markup).not.toContain("We can set this up");
    expect(markup).not.toContain("Apply for a founding Circle");
  });
});
