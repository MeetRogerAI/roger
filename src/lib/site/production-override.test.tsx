/**
 * Production ignores SITE_VERSION: with the override naming another site, the
 * pages themselves, not only the resolver, are still the live version, which
 * is v1 (plan KTD1).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/data/config";
import { pageMarkup } from "@/test-helpers/page-markup";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";

// Set before any page module loads: metadata and the page branch read the served site at import.
vi.hoisted(() => {
  process.env.VERCEL_ENV = "production";
  process.env.SITE_VERSION = "circles";
  delete process.env.DATABASE_URL;
});

vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/font/google", () => ({ Mona_Sans: () => ({ variable: "font-mona-test" }) }));

const { default: Home, metadata: homeMetadata } = await import("@/app/page");
const { default: robots } = await import("@/app/robots");
const { default: sitemap } = await import("@/app/sitemap");
const { getServedSite } = await import("@/lib/site/version");

beforeAll(() => resetNextFakes());
afterAll(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.SITE_VERSION;
});

describe("production with SITE_VERSION=circles set", () => {
  it("still serves the live version's home page, which is v1", async () => {
    expect(process.env.VERCEL_ENV).toBe("production");
    expect(process.env.SITE_VERSION).toBe("circles");
    expect(siteConfig.site.live).toBe("v1");
    expect(getServedSite()).toBe("v1");

    const markup = await pageMarkup(<Home />);
    expect(markup).toContain("Your AI agents, smarter every Monday.");
    expect(markup).toContain('data-site="v1"');
    expect(markup).not.toContain('href="/apply"');
    expect(markup).not.toContain("Circle");

    expect(homeMetadata.title).toEqual({ absolute: "Roger: Your AI agents, smarter every Monday." });
    expect(homeMetadata.robots).toBeUndefined();
  });

  it("serves v1's sitemap and v1's production robots rules", () => {
    expect(sitemap().map((entry) => entry.url.replace(siteConfig.domain, ""))).toEqual(["/", "/agents", "/pricing", "/how-it-works", "/faq", "/about", "/zack", "/library", "/getstarted", "/privacy", "/terms"]);
    const rules = robots().rules as { allow: string[]; disallow: string[] };
    expect(rules.allow).toEqual(["/", "/api/zack/instructions"]);
    expect(rules.disallow).toEqual(expect.arrayContaining(["/apply", "/app/", "/app$", "/admin", "/start", "/api"]));
  });
});
