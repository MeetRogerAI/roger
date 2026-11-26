import { afterEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/data/config";
import { bySite, getServedSite, hiddenLegacyRobots, isBuiltVersion, isKnownNonProduction, requireBuiltVersion, resolveSiteVersion } from "./version";

afterEach(() => vi.unstubAllEnvs());

describe("resolveSiteVersion", () => {
  it("serves the live version in production, whatever the override says", () => {
    for (const override of [undefined, "v1", "v2", "circles", "nonsense"]) {
      for (const nodeEnv of ["production", "development", "test", undefined]) {
        expect(resolveSiteVersion({ vercelEnv: "production", nodeEnv, override, live: "circles", preview: "v1" }), `${override} ${nodeEnv}`).toBe("circles");
        expect(resolveSiteVersion({ vercelEnv: "production", nodeEnv, override, live: "v2", preview: "v3" }), `${override} ${nodeEnv}`).toBe("v2");
      }
    }
  });

  it("honours a valid override wherever VERCEL_ENV is not production, a local production build included", () => {
    for (const vercelEnv of ["preview", "development", undefined]) {
      for (const nodeEnv of ["production", "development", "test", undefined]) {
        expect(resolveSiteVersion({ vercelEnv, nodeEnv, override: "v2", live: "circles", preview: "v1" }), `${vercelEnv} ${nodeEnv}`).toBe("v2");
        expect(resolveSiteVersion({ vercelEnv, nodeEnv, override: "circles", live: "v1", preview: "v1" }), `${vercelEnv} ${nodeEnv}`).toBe("circles");
      }
    }
    expect(resolveSiteVersion({ vercelEnv: undefined, nodeEnv: "production", override: "v1", live: "circles", preview: "v2" })).toBe("v1");
  });

  it("falls back to the preview version when the override is missing or not a known version", () => {
    for (const override of [undefined, "", "v4", "V1", "legacy", "live"]) {
      expect(resolveSiteVersion({ vercelEnv: "preview", nodeEnv: "production", override, live: "circles", preview: "v1" }), String(override)).toBe("v1");
      expect(resolveSiteVersion({ vercelEnv: undefined, nodeEnv: "test", override, live: "v1", preview: "circles" }), String(override)).toBe("circles");
    }
  });

  it("serves the preview version by default on a Vercel preview or development deployment", () => {
    // Vercel builds previews with NODE_ENV=production.
    expect(resolveSiteVersion({ vercelEnv: "preview", nodeEnv: "production", override: undefined, live: "circles", preview: "v1" })).toBe("v1");
    expect(resolveSiteVersion({ vercelEnv: "development", nodeEnv: "development", override: undefined, live: "circles", preview: "v1" })).toBe("v1");
  });

  it("serves the preview version by default in local development and tests", () => {
    for (const vercelEnv of [undefined, ""]) {
      expect(resolveSiteVersion({ vercelEnv, nodeEnv: "development", override: undefined, live: "circles", preview: "v1" }), String(vercelEnv)).toBe("v1");
      expect(resolveSiteVersion({ vercelEnv, nodeEnv: "test", override: undefined, live: "circles", preview: "v1" }), String(vercelEnv)).toBe("v1");
    }
  });

  it("fails closed to the live version when the environment is not known to be a preview", () => {
    // A production build with no VERCEL_ENV, for example one made off Vercel.
    expect(resolveSiteVersion({ vercelEnv: undefined, nodeEnv: "production", override: undefined, live: "circles", preview: "v1" })).toBe("circles");
    expect(resolveSiteVersion({ vercelEnv: undefined, nodeEnv: undefined, override: undefined, live: "circles", preview: "v1" })).toBe("circles");
    expect(resolveSiteVersion({ vercelEnv: "staging", nodeEnv: "development", override: undefined, live: "circles", preview: "v1" })).toBe("circles");
    expect(resolveSiteVersion({ vercelEnv: undefined, nodeEnv: "production", override: "v9", live: "circles", preview: "v1" })).toBe("circles");
  });
});

describe("isKnownNonProduction", () => {
  const nodeEnvs = ["production", "development", "test", undefined];

  it("is true on a Vercel preview or development deployment, whatever NODE_ENV is", () => {
    for (const vercelEnv of ["preview", "development"]) for (const nodeEnv of nodeEnvs) expect(isKnownNonProduction({ vercelEnv, nodeEnv }), `${vercelEnv} ${nodeEnv}`).toBe(true);
  });

  it("is false on Vercel production and on any VERCEL_ENV it does not know, whatever NODE_ENV is", () => {
    for (const vercelEnv of ["production", "staging", "Preview"]) for (const nodeEnv of nodeEnvs) expect(isKnownNonProduction({ vercelEnv, nodeEnv }), `${vercelEnv} ${nodeEnv}`).toBe(false);
  });

  it("with no VERCEL_ENV, is true only in local development and tests", () => {
    for (const vercelEnv of [undefined, ""]) {
      expect(isKnownNonProduction({ vercelEnv, nodeEnv: "development" })).toBe(true);
      expect(isKnownNonProduction({ vercelEnv, nodeEnv: "test" })).toBe(true);
      // A production build made off Vercel.
      expect(isKnownNonProduction({ vercelEnv, nodeEnv: "production" })).toBe(false);
      expect(isKnownNonProduction({ vercelEnv, nodeEnv: undefined })).toBe(false);
    }
  });

  it("reads the environment when given nothing", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isKnownNonProduction()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isKnownNonProduction()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isKnownNonProduction()).toBe(false);
  });

  it("is the rule the resolver uses for its default: preview where true, live where false", () => {
    for (const vercelEnv of ["preview", "development", "staging", "", undefined]) {
      for (const nodeEnv of nodeEnvs) {
        const served = resolveSiteVersion({ vercelEnv, nodeEnv, override: undefined, live: "circles", preview: "v1" });
        expect(served, `${vercelEnv} ${nodeEnv}`).toBe(isKnownNonProduction({ vercelEnv, nodeEnv }) ? "v1" : "circles");
      }
    }
  });
});

/** Runs with `circlesMode` off, which is what selects the legacy site, and puts it back. */
function withCirclesModeOff(run: () => void) {
  const flags = siteConfig.flags as { circlesMode: boolean };
  const before = flags.circlesMode;
  flags.circlesMode = false;
  try {
    run();
  } finally {
    flags.circlesMode = before;
  }
}

describe("getServedSite", () => {
  it("serves the legacy site when Circles resolves with circlesMode off, and a site version regardless (KTD3)", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    withCirclesModeOff(() => {
      vi.stubEnv("SITE_VERSION", "circles");
      expect(getServedSite()).toBe("legacy");
      vi.stubEnv("SITE_VERSION", "v1");
      expect(getServedSite()).toBe("v1");
    });
    expect(siteConfig.flags.circlesMode).toBe(true);
    vi.stubEnv("SITE_VERSION", "circles");
    expect(getServedSite()).toBe("circles");
  });

  it("fails closed in a production build with no VERCEL_ENV, and still honours the override there", () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_VERSION", undefined);
    expect(getServedSite()).toBe(siteConfig.site.live);
    vi.stubEnv("SITE_VERSION", "v1");
    expect(getServedSite()).toBe("v1");
  });


  it("keeps Circles live in production until Peter names a version (R2)", () => {
    expect(siteConfig.site.live).toBe("circles");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SITE_VERSION", "v1");
    expect(getServedSite()).toBe("circles");
  });

  it("reads the override outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("SITE_VERSION", "v1");
    expect(getServedSite()).toBe("v1");
    vi.stubEnv("SITE_VERSION", "v9");
    expect(getServedSite()).toBe(siteConfig.site.preview);
  });
});

describe("branch helpers", () => {
  it("tells a built version from Circles and the legacy site", () => {
    expect((["circles", "legacy", "v1", "v2", "v3"] as const).map(isBuiltVersion)).toEqual([false, false, true, true, true]);
  });

  it("picks one value per kind of site", () => {
    const choices = { circles: "c", built: "b", legacy: "l" };
    expect((["circles", "legacy", "v1", "v2", "v3"] as const).map((s) => bySite(s, choices))).toEqual(["c", "l", "b", "b", "b"]);
  });

  it("keeps a legacy-only page out of search unless the legacy site is served", () => {
    expect(hiddenLegacyRobots("legacy")).toEqual({});
    for (const site of ["circles", "v1", "v2", "v3"] as const) expect(hiddenLegacyRobots(site), site).toEqual({ robots: { index: false, follow: false } });
    // With no argument it reads the served site.
    vi.stubEnv("SITE_VERSION", "circles");
    expect(hiddenLegacyRobots()).toEqual({ robots: { index: false, follow: false } });
  });
});

describe("requireBuiltVersion", () => {
  it("is not found while Circles or the legacy site is served (covers AE8)", () => {
    for (const site of ["circles", "legacy"] as const) {
      expect(() => requireBuiltVersion(site), site).toThrowError(expect.objectContaining({ digest: expect.stringContaining("404") }));
    }
  });

  it("returns the version to render otherwise", () => {
    expect(requireBuiltVersion("v1")).toBe("v1");
    expect(requireBuiltVersion("v3")).toBe("v3");
  });
});
