import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServedSite } from "@/lib/site/version";

let site: ServedSite = "circles";
vi.mock("@/lib/site/version", async (orig) => ({ ...(await orig<typeof import("@/lib/site/version")>()), getServedSite: () => site }));

const { default: sitemap } = await import("./sitemap");

const paths = () => sitemap().map((e) => e.url.replace("https://meetroger.ai", ""));

afterEach(() => {
  site = "circles";
});

describe("sitemap", () => {
  it("lists exactly /, /library, /privacy and /terms under Circles", () => {
    expect(paths()).toEqual(["/", "/library", "/privacy", "/terms"]);
    expect(sitemap().every((e) => e.lastModified === "2026-11-14" && e.changeFrequency === "weekly")).toBe(true);
    expect(sitemap().map((e) => e.priority)).toEqual([1, 0.6, 0.6, 0.6]);
  });

  it("lists exactly the nine public paths under a version, without the deleted /agents and /pricing", () => {
    for (site of ["v1", "v2", "v3"] as const) {
      expect(paths(), site).toEqual(["/", "/how-it-works", "/faq", "/about", "/zack", "/library", "/getstarted", "/privacy", "/terms"]);
      expect(sitemap().map((e) => e.priority), site).toEqual([1, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6]);
      // A redirected address is never listed, and neither is an address with a "#".
      for (const path of paths()) expect(path, site).not.toMatch(/^\/(?:agents|pricing)$|#/);
    }
  });

  it("keeps the legacy site's list", () => {
    site = "legacy";
    expect(paths()).toEqual(["/", "/business", "/families", "/library", "/workshops", "/refunds", "/terms", "/privacy"]);
  });
});
