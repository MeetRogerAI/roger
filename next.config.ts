import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Zack's instructions and connector texts are read from disk at request time.
  // /how-it-works links the Zack file of each agent that has one (src/data/zack.ts looks in public/zack).
  // The page is regenerated in a function, which has public/ beside it only if the files are traced in.
  // Without the entry the links could vanish.
  outputFileTracingIncludes: {
    "/api/zack/instructions": ["./content/zack/**/*"],
    "/app/**": ["./content/zack/**/*"],
    "/how-it-works": ["./public/zack/*.md"],
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
  // Previews are public (no Vercel login, so sign-in works like production) but never indexed.
  async headers() {
    return process.env.VERCEL_ENV === "preview" ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }] : [];
  },
  async redirects() {
    return [
      // The home setup lived at /home, then at /; it now lives at /families.
      // One ladder now (Peter's v1 brief): free pack, $500 setup, $50/mo plan.
      { source: "/home", destination: "/setup", permanent: false },
      { source: "/families", destination: "/setup", permanent: false },
      { source: "/business", destination: "/setup", permanent: false },
      // /zack is the single address for running Zack (Peter's decision of November 26, 2026).
      // The three group pages were deleted; links already sent to people land on the tool.
      { source: "/hampton", destination: "/zack", permanent: true },
      { source: "/rlp", destination: "/zack", permanent: true },
      { source: "/founders", destination: "/zack", permanent: true },
      // /pricing and /agents were deleted (Peter's decision of November 27, 2026). The price is a section of the
      // homepage, and the homepage speaks to everyone who uses AI agents. Links already out there still land.
      { source: "/pricing", destination: "/#price", permanent: true },
      { source: "/agents", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
