import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";
import nextConfig from "../../next.config";

afterEach(() => vi.unstubAllEnvs());

/** The header rules other than the Payment page's CSP (tested in src/lib/payment-csp.test.ts). */
const robotsHeaders = async () => (await nextConfig.headers!()).filter((r) => !r.source.startsWith("/start/payment"));

describe("indexing", () => {
  it("blocks every crawler on previews", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(await robotsHeaders()).toEqual([{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]);
  });

  it("leaves production indexable with its sitemap", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const r = robots();
    expect(r.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toMatch(/sitemap\.xml$/);
    expect(await robotsHeaders()).toEqual([]);
  });
});
