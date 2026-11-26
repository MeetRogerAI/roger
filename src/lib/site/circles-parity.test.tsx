/**
 * The Circles site, as served before the site-version resolver existed.
 *
 * The fixtures in __fixtures__/circles were written from the code before any
 * flag read moved. Every unit that touches a shared file must leave them
 * passing: a difference here is a change to the live site (plan R2, R9).
 */
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { expectFixture, pageMarkup } from "@/test-helpers/page-markup";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";

// Circles whatever the config's preview value becomes, and no database: the library renders from its seed.
vi.hoisted(() => {
  process.env.SITE_VERSION = "circles";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});

let path = "/";
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/font/google", () => ({ Mona_Sans: () => ({ variable: "font-mona-test" }) }));

const { default: RootLayout, metadata: rootMetadata, viewport } = await import("@/app/layout");
const { default: Home, metadata: homeMetadata } = await import("@/app/page");
const { default: Zack, metadata: zackMetadata } = await import("@/app/zack/page");
const { default: Library, metadata: libraryMetadata } = await import("@/app/library/page");
const { default: Privacy, metadata: privacyMetadata } = await import("@/app/privacy/page");
const { default: Terms, metadata: termsMetadata } = await import("@/app/terms/page");
const { default: Apply, metadata: applyMetadata } = await import("@/app/apply/page");
const companies = await import("@/app/companies/page");
const setup = await import("@/app/setup/page");
const workshops = await import("@/app/workshops/page");
const refunds = await import("@/app/refunds/page");
const packs = await import("@/app/packs/[id]/page");
const card = await import("@/app/opengraph-image");
const { default: sitemap } = await import("@/app/sitemap");
const { default: robots } = await import("@/app/robots");

const fixture = (name: string) => fileURLToPath(new URL(`./__fixtures__/circles/${name}.html`, import.meta.url));

/** The header, footer and JSON-LD the root layout puts around a page at this address. */
const chrome = (at: string) => {
  path = at;
  return pageMarkup(<RootLayout params={Promise.resolve({})}>{null}</RootLayout>);
};

beforeAll(() => {
  // The footer prints the year.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T15:00:00Z"));
  resetNextFakes();
});
afterAll(() => vi.useRealTimers());

describe("Circles pages render the markup captured before the resolver", () => {
  it("home (covers AE1)", async () => {
    expectFixture(fixture("home"), await pageMarkup(<Home />));
  });

  it("home for a visitor in Canada", async () => {
    resetNextFakes({}, { "x-vercel-ip-country": "CA" });
    const markup = await pageMarkup(<Home />);
    resetNextFakes();
    expectFixture(fixture("home-ca"), markup);
  });

  it("/zack is the Hampton page (covers AE9)", async () => {
    const markup = await pageMarkup(<Zack />);
    expect(markup).toContain("Zack The Collector Page");
    expectFixture(fixture("zack"), markup);
  });

  it("/library", async () => {
    path = "/library";
    expectFixture(fixture("library"), await pageMarkup(<Library />));
  });

  it("/privacy and /terms", async () => {
    expectFixture(fixture("privacy"), await pageMarkup(<Privacy />));
    expectFixture(fixture("terms"), await pageMarkup(<Terms />));
  });

  it("/apply", async () => {
    expectFixture(fixture("apply"), await pageMarkup(<Apply />));
  });
});

describe("Circles header, footer and JSON-LD", () => {
  it.each([
    ["chrome-home", "/"],
    ["chrome-library", "/library"],
    ["chrome-apply", "/apply"],
    ["chrome-zack", "/zack"],
    ["chrome-hampton", "/hampton"],
    ["chrome-for", "/for/x"],
    ["chrome-start", "/start"],
    ["chrome-app", "/app/zack"],
    ["chrome-admin", "/admin"],
  ])("%s", async (name, at) => {
    expectFixture(fixture(name), await chrome(at));
  });

  it("gives /zack and /hampton a header with no links and no button", async () => {
    for (const at of ["/zack", "/hampton"]) {
      const header = (await chrome(at)).match(/<header[\s\S]*?<\/header>/)![0];
      expect(header.match(/href="[^"]*"/g), at).toEqual(['href="#main"', 'href="/"']);
    }
  });

  it("describes the organization in JSON-LD", async () => {
    const json = (await chrome("/")).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    expect(JSON.parse(json)).toMatchInlineSnapshot(`
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "description": "Confidential Circles for people who use AI agents heavily for work.",
        "email": "hello@meetroger.ai",
        "name": "Roger",
        "url": "https://meetroger.ai",
      }
    `);
  });
});

describe("Circles metadata", () => {
  it("root layout", () => {
    expect(rootMetadata).toMatchInlineSnapshot(`
      {
        "alternates": {
          "canonical": "/",
        },
        "applicationName": "Roger",
        "description": "Confidential Circles for people who use AI agents heavily for work.",
        "metadataBase": "https://meetroger.ai/",
        "openGraph": {
          "locale": "en_CA",
          "siteName": "Roger",
          "type": "website",
          "url": "/",
        },
        "title": {
          "default": "Roger Circles",
          "template": "%s · Roger",
        },
        "twitter": {
          "card": "summary_large_image",
        },
      }
    `);
    expect(viewport).toMatchInlineSnapshot(`
      {
        "colorScheme": "light",
        "themeColor": "#fbfbfd",
      }
    `);
  });

  it("home", () => {
    expect(homeMetadata).toMatchInlineSnapshot(`
      {
        "alternates": {
          "canonical": "/",
        },
        "description": "A confidential Circle of eight people who use AI agents heavily for work. Trade what works, get ranked playbooks every Monday, and help each other install them.",
        "openGraph": {
          "description": "Eight people. Any agents. A better week of work.",
          "title": "Stop figuring out AI agents alone.",
          "url": "/",
        },
        "title": {
          "absolute": "Roger Circles: Stop figuring out AI agents alone.",
        },
      }
    `);
  });

  it("/zack, /library, /privacy, /terms and /apply", () => {
    expect(zackMetadata).toMatchInlineSnapshot(`
      {
        "alternates": {
          "canonical": "/zack",
        },
        "description": "Run Zack The Collector in your own agent, save the .md output and email it to Roger.",
        "openGraph": {
          "description": "Run Zack The Collector in your own agent, save the .md output and email it to Roger.",
          "siteName": "Roger",
          "title": "Zack The Collector Page",
          "type": "website",
          "url": "/zack",
        },
        "robots": {
          "follow": false,
          "googleBot": {
            "follow": false,
            "index": false,
          },
          "index": false,
          "nocache": true,
        },
        "title": {
          "absolute": "Zack The Collector Page",
        },
      }
    `);
    expect(libraryMetadata).toMatchInlineSnapshot(`
      {
        "alternates": {
          "canonical": "/library",
        },
        "description": "What people’s AI agents are actually doing: meal plans, school forms, forgotten gift cards, invoices and customer messages. Read from public posts every morning, each linked to the original.",
        "openGraph": {
          "url": "/library",
        },
        "title": {
          "absolute": "Real AI agent use cases · Roger",
        },
      }
    `);
    expect(privacyMetadata).toMatchInlineSnapshot(`
      {
        "alternates": {
          "canonical": "/privacy",
        },
        "description": "What Roger collects, why, and what stays in your browser.",
        "title": "Privacy",
      }
    `);
    expect(termsMetadata).toMatchInlineSnapshot(`
      {
        "alternates": {
          "canonical": "/terms",
        },
        "description": "Draft terms and the 45-day guarantee for Roger Circles.",
        "title": "Terms",
      }
    `);
    expect(applyMetadata).toMatchInlineSnapshot(`
      {
        "alternates": {
          "canonical": "/apply",
        },
        "description": "The entry bar for Roger's founding Circles.",
        "robots": {
          "follow": false,
          "index": false,
        },
        "title": "Apply for a founding Circle",
      }
    `);
  });

  it("keeps the five hidden legacy pages out of search", async () => {
    const noindex = { index: false, follow: false };
    expect(companies.metadata.robots).toEqual(noindex);
    expect(setup.metadata.robots).toEqual(noindex);
    expect(workshops.metadata.robots).toEqual(noindex);
    expect(refunds.metadata.robots).toEqual(noindex);
    const pack = await packs.generateMetadata({ params: Promise.resolve({ id: "solopreneur" }), searchParams: Promise.resolve({}) });
    expect(pack.robots).toEqual(noindex);
    expect({ companies: companies.metadata, setup: setup.metadata, workshops: workshops.metadata, refunds: refunds.metadata, pack }).toMatchInlineSnapshot(`
      {
        "companies": {
          "alternates": {
            "canonical": "/companies",
          },
          "description": "We map where your company’s hours go in one two-hour session, then build and run the automations every month: quotes, orders, customer questions, invoices. On your own systems. From $10,000 a month.",
          "openGraph": {
            "url": "/companies",
          },
          "robots": {
            "follow": false,
            "index": false,
          },
          "title": {
            "absolute": "Roger: AI and automation for family-owned companies · Toronto",
          },
        },
        "pack": {
          "alternates": {
            "canonical": "/packs/solopreneur",
          },
          "description": "The ten setups that show up most often in the library for people who run everything themselves. Works with Muse, Grok Bot, Hark or any agent that can read your email and calendar.",
          "robots": {
            "follow": false,
            "index": false,
          },
          "title": "Solopreneur starter pack: Ten agents for a business of one",
        },
        "refunds": {
          "alternates": {
            "canonical": "/refunds",
          },
          "description": "Working, or you pay nothing: exactly what working means and how to claim a refund.",
          "robots": {
            "follow": false,
            "index": false,
          },
          "title": "Refunds and the guarantee",
        },
        "setup": {
          "alternates": {
            "canonical": "/setup",
          },
          "description": "Peter designs a set of AI agents for how you work, from what's actually working in the Roger library, and installs them on your own accounts with you. $500 once, then an optional $50/month plan.",
          "openGraph": {
            "url": "/setup",
          },
          "robots": {
            "follow": false,
            "index": false,
          },
          "title": {
            "absolute": "A custom agent setup, $500 · Roger",
          },
        },
        "workshops": {
          "alternates": {
            "canonical": "/workshops",
          },
          "description": "In 60 minutes we set up a real AI agent live, start to finish, and show your members what it can take off their plate. Free for Toronto BIAs, associations, chambers and school communities.",
          "openGraph": {
            "url": "/workshops",
          },
          "robots": {
            "follow": false,
            "index": false,
          },
          "title": {
            "absolute": "Free AI agent workshop for your members · Roger",
          },
        },
      }
    `);
  });

  it("social card alt text and size", () => {
    expect({ alt: card.alt, size: card.size, contentType: card.contentType }).toMatchInlineSnapshot(`
      {
        "alt": "Roger Circles: Stop figuring out AI agents alone.",
        "contentType": "image/png",
        "size": {
          "height": 630,
          "width": 1200,
        },
      }
    `);
  });
});

describe("Circles sitemap and robots", () => {
  it("sitemap lists exactly /, /library, /privacy and /terms", () => {
    expect(sitemap()).toMatchInlineSnapshot(`
      [
        {
          "changeFrequency": "weekly",
          "lastModified": "2026-11-14",
          "priority": 1,
          "url": "https://meetroger.ai/",
        },
        {
          "changeFrequency": "weekly",
          "lastModified": "2026-11-14",
          "priority": 0.6,
          "url": "https://meetroger.ai/library",
        },
        {
          "changeFrequency": "weekly",
          "lastModified": "2026-11-14",
          "priority": 0.6,
          "url": "https://meetroger.ai/privacy",
        },
        {
          "changeFrequency": "weekly",
          "lastModified": "2026-11-14",
          "priority": 0.6,
          "url": "https://meetroger.ai/terms",
        },
      ]
    `);
  });

  it("robots keeps its disallow list wherever it is not a preview", () => {
    expect(robots()).toMatchInlineSnapshot(`
      {
        "rules": {
          "allow": "/",
          "disallow": [
            "/thanks/",
            "/for/",
            "/apply",
            "/setup",
            "/companies",
            "/packs/",
            "/workshops",
            "/refunds",
          ],
          "userAgent": "*",
        },
        "sitemap": "https://meetroger.ai/sitemap.xml",
      }
    `);
  });
});
