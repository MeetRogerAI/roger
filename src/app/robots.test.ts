import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";
import nextConfig from "../../next.config";

afterEach(() => vi.unstubAllEnvs());

/** The header rules other than the Payment page's CSP (tested in src/lib/payment-csp.test.ts) and the unsubscribe links' (below). */
const UNSUB_SOURCES = ["/u/:token", "/api/unsubscribe/:token"];
const robotsHeaders = async () => (await nextConfig.headers!()).filter((r) => !r.source.startsWith("/start/payment") && !UNSUB_SOURCES.includes(r.source));

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

describe("unsubscribe links (B2 Unit 8)", () => {
  it("are never indexed and never sent on in a Referer, on every deployment", async () => {
    for (const env of ["production", "preview"]) {
      vi.stubEnv("VERCEL_ENV", env);
      const rules = (await nextConfig.headers!()).filter((r) => UNSUB_SOURCES.includes(r.source));
      expect(rules.map((r) => r.source)).toEqual(UNSUB_SOURCES);
      for (const r of rules) {
        expect(r.headers).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
        expect(r.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
      }
    }
  });
});
