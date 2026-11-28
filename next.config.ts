import type { NextConfig } from "next";
import { paymentCspHeaders } from "./src/lib/payment-csp";

/**
 * Zack's instructions and connector texts are read from disk at request time, and every Zack run
 * and Cora list is stamped with the version of its instruction file (src/lib/instructions/version.ts,
 * B3 plan Unit 2), so each route that can reach them bundles both folders. A route that reaches
 * version.ts without a key here fails src/lib/instructions/tracing.test.ts.
 */
const INSTRUCTION_FILES = ["./content/zack/**/*", "./content/cora/**/*"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/api/zack/instructions": INSTRUCTION_FILES,
    "/api/zack/runs": INSTRUCTION_FILES,
    "/api/cron/cora": INSTRUCTION_FILES,
    "/api/cron/review": INSTRUCTION_FILES,
    "/api/cron/housekeeping": INSTRUCTION_FILES,
    "/app/**": INSTRUCTION_FILES,
    "/admin/**": INSTRUCTION_FILES,
    "/start/plan": INSTRUCTION_FILES,
  },
  experimental: {
    // Vercel restores Turbopack's build cache between deploys, and the Tailwind
    // loader below doesn't invalidate it when globals.css changes: the Oct 24
    // deploy shipped new pages with the previous build's stylesheet. Builds are
    // small, so build cold every time.
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // Previews are public (no Vercel login, so sign-in works like production) but never indexed.
      ...(process.env.VERCEL_ENV === "preview" ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }] : []),
      // Unsubscribe links (B2 Unit 8), guest invitations (B2 Unit 9) and a guest's opt-out carry a token: never indexed, never sent on in a Referer.
      ...["/u/:token", "/api/unsubscribe/:token", "/g/:token", "/g/:token/calendar.ics", "/o/:token", "/api/opt-out/:token"].map((source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
      // The Payment step's CSP, on its routes only (enforced; see src/lib/payment-csp.ts).
      ...paymentCspHeaders(),
    ];
  },
  async redirects() {
    return [
      // The home setup lived at /home, then at /; it now lives at /families.
      // One ladder now (Peter's v1 brief): free pack, $500 setup, $50/mo plan.
      { source: "/home", destination: "/setup", permanent: false },
      { source: "/families", destination: "/setup", permanent: false },
      { source: "/business", destination: "/setup", permanent: false },
    ];
  },
};

export default nextConfig;
