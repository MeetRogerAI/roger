/**
 * What a site version serves before its pages are built: placeholders, the
 * /apply redirect, and no link back to a Circles or legacy offer page.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { pageMarkup } from "@/test-helpers/page-markup";
import { nextHeaders, Redirected, resetNextFakes } from "@/test-helpers/next-fakes";
import { v3Defaults } from "@/data/config";
import { siteLegalMeta, trainingPosition } from "@/data/site/legal";

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
  it("serves the v1 home, open to search (U5)", async () => {
    const markup = await pageMarkup(<Home />);
    expect(markup).not.toContain("not built yet");
    expect(markup).toContain("Your AI agents, smarter every Monday.");
    expect(markup).toContain('data-site="v1"');
    expect(markup).not.toContain("Circle");
    expect(homeMetadata.robots).toBeUndefined();
    expect(homeMetadata.alternates).toEqual({ canonical: "/" });
  });

  it("serves the free Zack run at /zack, open to search, not the Hampton page (U8)", async () => {
    const markup = await pageMarkup(<Zack />);
    expect(markup).not.toContain("not built yet");
    expect(markup).toContain("Run Zack on yourself first");
    expect(markup).toContain('data-site="v1"');
    expect(markup).not.toContain("Zack The Collector Page");
    expect(zackMetadata.alternates).toEqual({ canonical: "/zack" });
    expect(zackMetadata.robots).toBeUndefined();
  });

  it("serves the version's own privacy and terms as reviewed, with no draft note and no Circles text (U9; reviewed by Peter, November 26, 2026)", async () => {
    for (const page of [<Privacy key="p" />, <Terms key="t" />]) {
      const markup = await pageMarkup(page);
      expect(markup).not.toContain("not built yet");
      expect(markup).not.toContain("Circle");
      expect(markup).toContain('data-site="v1"');
      expect(markup).not.toContain('role="note"');
      expect(markup).not.toContain("Draft, under review.");
      expect(markup).not.toMatch(/\bdraft\b/i);
      expect(markup).toContain("Last updated <!-- -->November 2026");
      expect(markup).not.toMatch(/\{\w+\}/);
    }
  });

  it("privacy names Vercel, Neon, Resend, Stripe and Google, and states the free run's period from the setting (U9)", async () => {
    const markup = await pageMarkup(<Privacy />);
    for (const name of ["Vercel", "Neon", "Resend", "Stripe", "Google"]) expect(markup, name).toContain(name);
    expect(markup).toContain('<section id="free-run"');
    expect(markup).toContain(`the free run is deleted ${v3Defaults.retentionDays} days after you started it`);
    // The whole sentence, as the page prints it: it states no position.
    expect(trainingPosition).toBe("We are confirming the model provider’s position on training its models, and will state it here.");
    expect(markup).toContain(`>${trainingPosition}</p>`);
    expect(markup.match(/\btrain\w*/gi)).toEqual(["training"]);
  });

  it("terms state the no-refund line and no amount that differs from the defaults (U9)", async () => {
    const markup = await pageMarkup(<Terms />);
    expect(markup).toContain("There are no refunds.");
    const allowed = [v3Defaults.priceUsd, v3Defaults.priceRunUsd, v3Defaults.priceHigherUsd].map((n) => `US$${n}`).concat([v3Defaults.priceCad, v3Defaults.priceRunCad, v3Defaults.priceHigherCad].map((n) => `CA$${n}`));
    const shown = markup.match(/(?:US|CA)\$[\d,]+/g) ?? [];
    expect(shown.length).toBeGreaterThanOrEqual(8);
    for (const amount of shown) expect(allowed, amount).toContain(amount);
    // No "$" without its country.
    expect(markup).not.toMatch(/(?<!US|CA)\$/);
  });

  it("opens /privacy and /terms to search, with each page's own title and description (U9)", () => {
    expect(privacyMetadata.robots).toBeUndefined();
    expect(termsMetadata.robots).toBeUndefined();
    expect(privacyMetadata.alternates).toEqual({ canonical: "/privacy" });
    expect(termsMetadata.alternates).toEqual({ canonical: "/terms" });
    expect(privacyMetadata.title).toEqual({ absolute: "Roger: Privacy" });
    expect(termsMetadata.title).toEqual({ absolute: "Roger: Terms" });
    expect(privacyMetadata.description).toBe(siteLegalMeta.privacy.description);
    expect(termsMetadata.description).toBe(siteLegalMeta.terms.description);
    expect(JSON.stringify([privacyMetadata, termsMetadata])).not.toContain("Circle");
    expect(JSON.stringify([privacyMetadata, termsMetadata])).not.toContain("setups");
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
    // No card links to /setup (spec A.12).
    expect(hrefs(markup).filter((h) => h.startsWith("/setup"))).toEqual([]);
    expect(markup).not.toContain("data-to-offer");
  });

  it("ends the library on one band: the sentence, the start button with no audience, and the trial line (U9)", async () => {
    path = "/library";
    const markup = await pageMarkup(<Library />);
    const sentence = "This is what people post in public. Roger sends you what works in private.";
    expect(markup.split(sentence)).toHaveLength(2);
    expect(markup.match(/data-library-band/g)).toHaveLength(1);
    const band = markup.slice(markup.indexOf("<div data-site=\"v1\" data-library-band"));
    // The band is the last thing on the page, after the watch section.
    expect(markup.indexOf("data-library-band")).toBeGreaterThan(markup.indexOf('id="watch"'));
    expect(band).not.toContain("<article");
    expect(band).toContain(sentence);
    // One link, the primary button, to /start with nothing added on the server.
    expect(hrefs(band)).toEqual(["/start"]);
    expect(band).toContain('<a class="btn btn-l" href="/start">Get two free Monday lists</a>');
    expect(band).toContain("Your first two Monday lists are free. We ask for a card when you start.");
    // It is the page's only start link.
    expect(hrefs(markup).filter((h) => h.startsWith("/start"))).toEqual(["/start"]);
  });
});
