import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";
import nextConfig from "../../next.config";

afterEach(() => vi.unstubAllEnvs());

describe("indexing", () => {
  it("blocks every crawler on previews", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(await nextConfig.headers!()).toEqual([{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]);
  });

  it("leaves production indexable with its sitemap", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const r = robots();
    expect(r.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toMatch(/sitemap\.xml$/);
    expect(await nextConfig.headers!()).toEqual([]);
  });
});
