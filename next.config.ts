import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Zack's instructions and connector texts are read from disk at request time.
  // /agents lists the agents whose Zack file exists, and /how-it-works links each of those files
  // (src/data/zack.ts looks in public/zack). Both pages are regenerated in a function, which has
  // public/ beside it only if the files are traced in. Without the entry the names or links could vanish.
  outputFileTracingIncludes: {
    "/api/zack/instructions": ["./content/zack/**/*"],
    "/app/**": ["./content/zack/**/*"],
    "/agents": ["./public/zack/*.md"],
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
    ];
  },
};

export default nextConfig;
