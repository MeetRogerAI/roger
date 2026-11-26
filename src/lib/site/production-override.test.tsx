/**
 * Production ignores SITE_VERSION: with both set, the pages themselves, not
 * only the resolver, are still Circles (plan R2, KTD1).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pageMarkup } from "@/test-helpers/page-markup";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";

// Set before any page module loads: metadata and the page branch read the served site at import.
vi.hoisted(() => {
  process.env.VERCEL_ENV = "production";
  process.env.SITE_VERSION = "v1";
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
const { getServedSite } = await import("@/lib/site/version");

beforeAll(() => resetNextFakes());
afterAll(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.SITE_VERSION;
});

describe("production with SITE_VERSION=v1 set", () => {
  it("still serves the Circles home page", async () => {
    expect(process.env.VERCEL_ENV).toBe("production");
    expect(process.env.SITE_VERSION).toBe("v1");
    expect(getServedSite()).toBe("circles");

    const markup = await pageMarkup(<Home />);
    expect(markup).toContain("Stop figuring out AI agents alone.");
    expect(markup).toContain('href="/apply"');
    expect(markup).not.toContain("not built yet");
    expect(markup).not.toContain("data-site=");

    expect(homeMetadata.title).toEqual({ absolute: "Roger Circles: Stop figuring out AI agents alone." });
    expect(homeMetadata.robots).toBeUndefined();
  });
});
