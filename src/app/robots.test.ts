import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServedSite } from "@/lib/site/version";
import nextConfig from "../../next.config";

// Production always serves the live version, so other versions are set here.
let site: ServedSite = "circles";
vi.mock("@/lib/site/version", async (orig) => ({ ...(await orig<typeof import("@/lib/site/version")>()), getServedSite: () => site }));

const { default: robots } = await import("./robots");

afterEach(() => {
  vi.unstubAllEnvs();
  site = "circles";
});

describe("indexing", () => {
  it("blocks every crawler on previews, whichever site is served", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    for (site of ["circles", "v1", "v2", "v3", "legacy"] as const) {
      expect(robots(), site).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    }
    expect(await nextConfig.headers!()).toEqual([{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]);
  });

  it("leaves production indexable with its sitemap", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const r = robots();
    expect(r.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toMatch(/sitemap\.xml$/);
    expect(await nextConfig.headers!()).toEqual([]);
  });

  it("keeps the Circles disallow list in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/thanks/", "/for/", "/apply", "/setup", "/companies", "/packs/", "/workshops", "/refunds"] });
  });

  it("keeps the hidden legacy pages disallowed under a version, and allows them on the legacy site", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    site = "v1";
    expect(robots().rules).toMatchObject({ disallow: ["/thanks/", "/for/", "/apply", "/setup", "/companies", "/packs/", "/workshops", "/refunds"] });
    site = "legacy";
    expect(robots().rules).toMatchObject({ disallow: ["/thanks/", "/for/"] });
  });
});
