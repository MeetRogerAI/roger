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
const { default: NotFound } = await import("@/app/not-found");

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

  it("carries the v1 headline and sub-line in the root metadata, home title, JSON-LD and social card, and no Circles wording", async () => {
    const title = "Roger: Your AI agents, smarter every Monday.";
    const description = "Roger makes your AI agents smarter every week, with ideas that worked for other real estate users.";
    expect(rootMetadata.title).toEqual({ default: title, template: "%s · Roger" });
    expect(rootMetadata.description).toBe(description);
    expect(homeMetadata.title).toEqual({ absolute: title });
    expect(homeMetadata.description).toBe(description);
    expect(homeMetadata.openGraph).toEqual({ url: "/", title: "Your AI agents, smarter every Monday.", description });
    expect(JSON.stringify([rootMetadata, homeMetadata])).not.toContain("Circle");
    // The card's words: the headline, with no number and no claim.
    expect(card.alt).toBe(title);
    expect(card.alt).not.toMatch(/\d/);
    const markup = await pageMarkup(<RootLayout params={Promise.resolve({})}>{null}</RootLayout>);
    const json = markup.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    expect(JSON.parse(json)).toEqual({ "@context": "https://schema.org", "@type": "Organization", name: "Roger", url: "https://meetroger.ai", email: "hello@meetroger.ai", description });
  });

  it("renders the signed-out header in the static markup: five links, Sign in and the start button (spec A.3)", async () => {
    path = "/pricing";
    const markup = await pageMarkup(<RootLayout params={Promise.resolve({})}>{null}</RootLayout>);
    const header = markup.match(/<header[\s\S]*?<\/header>/)![0];
    // The logo, the five links, Sign in, then the start button with no address of its own beyond /start.
    expect(hrefs(header)).toEqual(["#main", "/", "/how-it-works", "/pricing", "/library", "/faq", "/about", "/signin", "/start"]);
    expect(header).toContain('<a aria-current="page"');
    expect(header).toContain(">Sign in</a>");
    expect(header).toContain(">Get two free Monday lists</span>");
    expect(header).toContain(">Start free</span>");
    // The signed-in state is swapped in by the browser, never prerendered.
    expect(header).not.toContain("Open Roger");
    expect(header).not.toContain('href="/app"');
    expect(header).not.toContain("invisible");
    expect(header).not.toContain("aria-hidden=\"true\"><a");
  });

  it("shows no header links or button on sign-up, sign-in and the app, and keeps the admin's header", async () => {
    for (const at of ["/start/plan", "/signin", "/app"]) {
      path = at;
      const header = (await pageMarkup(<RootLayout params={Promise.resolve({})}>{null}</RootLayout>)).match(/<header[\s\S]*?<\/header>/)![0];
      expect(hrefs(header), at).toEqual(["#main", "/"]);
    }
    path = "/admin";
    const admin = (await pageMarkup(<RootLayout params={Promise.resolve({})}>{null}</RootLayout>)).match(/<header[\s\S]*?<\/header>/)![0];
    expect(hrefs(admin)).toEqual(["#main", "/", "/#how", "/zack", "/library", "/#questions", "/#letter"]);
  });

  it("puts the nine items of spec A.3 in the footer, with no Circles or refunds link", async () => {
    path = "/";
    const markup = await pageMarkup(<RootLayout params={Promise.resolve({})}>{null}</RootLayout>);
    const footer = markup.match(/<footer[\s\S]*?<\/footer>/)![0];
    const items = [...footer.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(items).toEqual([
      ["mailto:hello@meetroger.ai", "hello@meetroger.ai"],
      ["/pricing", "Pricing"],
      ["/how-it-works", "How it works"],
      ["/faq", "FAQ"],
      ["/about", "About"],
      ["/library", "Use cases"],
      ["/agents", "For people who run AI agents"],
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
    ]);
    expect(footer).not.toContain("Circle");
    expect(footer).not.toContain("Refunds");
    expect(footer).not.toContain("/#");
  });

  it("gives /zack and /zack/[agent] the public header and footer, and unlisted pages the quiet footer", async () => {
    for (const at of ["/zack", "/zack/claude"]) {
      path = at;
      const markup = await pageMarkup(<RootLayout params={Promise.resolve({})}>{null}</RootLayout>);
      expect(hrefs(markup.match(/<header[\s\S]*?<\/header>/)![0]), at).toContain("/pricing");
      expect(hrefs(markup.match(/<footer[\s\S]*?<\/footer>/)![0]), at).toContain("/agents");
    }
    path = "/hampton";
    const markup = await pageMarkup(<RootLayout params={Promise.resolve({})}>{null}</RootLayout>);
    expect(hrefs(markup.match(/<header[\s\S]*?<\/header>/)![0])).toEqual(["#main", "/"]);
    expect(hrefs(markup.match(/<footer[\s\S]*?<\/footer>/)![0])).toEqual(["mailto:hello@meetroger.ai", "/privacy", "/terms"]);
  });

  it("offers the way home and the start button on the not-found page, and no old offer", async () => {
    path = "/nothing-here";
    const page = await pageMarkup(<NotFound />);
    expect(hrefs(page)).toEqual(["/start", "/"]);
    expect(page).toContain(">Get two free Monday lists</a>");
    expect(page).toContain("That page isn’t here");
    const markup = await pageMarkup(<RootLayout params={Promise.resolve({})}><NotFound /></RootLayout>);
    // The header, the footer and the page itself are all there, so the check below is not passing on an empty page.
    expect(hrefs(markup.match(/<header[\s\S]*?<\/header>/)![0])).toContain("/pricing");
    expect(hrefs(markup.match(/<footer[\s\S]*?<\/footer>/)![0])).toContain("/agents");
    expect(hrefs(markup.match(/<main[\s\S]*?<\/main>/)![0])).toEqual(["/start", "/"]);
    expect(hrefs(markup).filter((h) => hidden.some((x) => h.startsWith(x)))).toEqual([]);
    expect(markup).not.toContain("Circle");
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
