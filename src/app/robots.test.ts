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

/** The header rules other than the Payment page's CSP (tested in src/lib/payment-csp.test.ts). */
const robotsHeaders = async () => (await nextConfig.headers!()).filter((r) => !r.source.startsWith("/start/payment"));

describe("indexing", () => {
  it("blocks every crawler on previews, whichever site is served", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    for (site of ["circles", "v1", "v2", "v3", "legacy"] as const) {
      expect(robots(), site).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    }
    expect(await robotsHeaders()).toEqual([{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]);
  });

  it("leaves production indexable with its sitemap", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const r = robots();
    expect(r.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toMatch(/sitemap\.xml$/);
    expect(await robotsHeaders()).toEqual([]);
  });

  it("keeps the Circles disallow list in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/thanks/", "/for/", "/apply", "/setup", "/companies", "/packs/", "/workshops"] });
  });

  it("disallows the hidden legacy pages, the app, the admin, sign-up and the API under a version, and allows the legacy pages on the legacy site", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    for (site of ["v1", "v2", "v3"] as const) {
      expect(robots().rules, site).toEqual({
        userAgent: "*",
        allow: ["/", "/api/zack/instructions"],
        disallow: ["/thanks/", "/for/", "/apply", "/setup", "/companies", "/packs/", "/workshops", "/app/", "/app$", "/admin", "/start", "/api"],
      });
      expect(robots().sitemap, site).toMatch(/sitemap\.xml$/);
    }
    site = "legacy";
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/thanks/", "/for/"] });
  });

  it("under a version, keeps crawlers out of the app and the API but not /apple-icon or the Zack instructions", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    site = "v1";
    const rules = robots().rules as { allow: string[]; disallow: string[] };
    // RFC 9309: the longest matching rule decides, and Allow wins a tie. "*" is any run of characters, "$" the end of the address.
    const matches = (rule: string, at: string) => {
      const toEnd = rule.endsWith("$");
      const body = (toEnd ? rule.slice(0, -1) : rule).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${body}${toEnd ? "$" : ""}`).test(at);
    };
    const longest = (list: string[], at: string) => Math.max(-1, ...list.filter((rule) => matches(rule, at)).map((rule) => rule.length));
    const allowed = (at: string) => longest(rules.allow, at) >= longest(rules.disallow, at);

    for (const at of ["/", "/pricing", "/apple-icon", "/apple-icon.png", "/approach", "/api/zack/instructions", "/api/zack/instructions?agent=claude"]) expect(allowed(at), at).toBe(true);
    for (const at of ["/app", "/app/", "/app/zack", "/admin", "/admin/users", "/start", "/start/plan", "/api", "/api/zack/runs", "/api/zack", "/api/checkout", "/apply", "/packs/solopreneur"]) expect(allowed(at), at).toBe(false);
  });
});
