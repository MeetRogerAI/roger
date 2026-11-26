import type { NextConfig } from "next";
import { paymentCspHeaders } from "./src/lib/payment-csp";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Zack's instructions and connector texts are read from disk at request time.
  outputFileTracingIncludes: { "/api/zack/instructions": ["./content/zack/**/*"], "/app/**": ["./content/zack/**/*"] },
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
      // The Payment step's CSP, on its routes only (report-only for now; see src/lib/payment-csp.ts).
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
