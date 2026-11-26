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

  it("lists no Circles, legacy or unbuilt page under a version", () => {
    for (site of ["v1", "v2", "v3"] as const) expect(paths(), site).toEqual(["/library"]);
  });

  it("keeps the legacy site's list", () => {
    site = "legacy";
    expect(paths()).toEqual(["/", "/business", "/families", "/library", "/workshops", "/refunds", "/terms", "/privacy"]);
  });
});
