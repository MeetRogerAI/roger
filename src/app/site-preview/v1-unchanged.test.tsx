/**
 * The v2 hero sketches (plan U11) must not change site version 1. This renders
 * the v1 homepage and /pricing through the root layout, header and footer
 * included, and compares each with a fingerprint taken on November 26, 2026,
 * BEFORE the unit touched any shared file (site-header.tsx, footer-switch.tsx,
 * layout.tsx).
 *
 * This test is brittle on purpose. The fingerprints pin every byte of v1's
 * markup as it was that day, so ANY change to v1 fails it: a copy edit, a new
 * section, a class name, a default price, a React upgrade. A failure here is
 * not a bug by itself. If the change to v1 was meant, take the fingerprints
 * again: run this file with PRINT_V1_FINGERPRINT=1 and paste the two lines it
 * prints. If nothing in v1 was meant to change, look at what the sketches
 * touched.
 *
 * It is scaffolding for U11 only. Delete this file when Peter has picked a
 * sketch and the sketches are removed, or as soon as it has cost more than
 * one re-take.
 */
import { createHash } from "node:crypto";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";

const at = vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
  return { path: "/" };
});

vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => at.path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/font/google", () => ({ Mona_Sans: () => ({ variable: "font-mona-test" }) }));

const fingerprint = (markup: string) => `${markup.length}:${createHash("sha256").update(markup).digest("hex")}`;

async function rendered(path: string, load: () => Promise<{ default: unknown }>): Promise<string> {
  const { default: RootLayout } = await import("@/app/layout");
  const Layout = RootLayout as unknown as (props: { params: Promise<object>; children: ReactNode }) => ReactNode;
  const Page = (await load()).default as () => ReactNode;
  at.path = path;
  // The footer prints the year from the clock: the one part of the page that changes without a code change.
  return (
    await pageMarkup(
      <Layout params={Promise.resolve({})}>
        <Page />
      </Layout>,
    )
  ).replace(/© \d{4}/g, "© YEAR");
}

const BEFORE_U11 = {
  "/": "55586:0369d36569de795ee39b0c8c3bf8a38c9d2f6a9707f38c8003ec23e1ada39771",
  "/pricing": "16107:b7a47cd28c256268e6d358642f18b99bb0c29131bc5d1c96a82d8e91e58a7891",
};

beforeEach(() => resetNextFakes());

describe("site version 1 is unchanged by the v2 hero sketches", () => {
  it.each([
    ["/", () => import("@/app/page")],
    ["/pricing", () => import("@/app/pricing/page")],
  ] as const)("%s renders the markup it rendered before the unit", async (path, load) => {
    const markup = await rendered(path, load);
    if (process.env.PRINT_V1_FINGERPRINT) console.log(`  "${path}": "${fingerprint(markup)}",`);
    expect(markup).toContain('data-site="v1"');
    expect(markup).toContain("<header");
    expect(markup).toContain("<footer");
    expect(fingerprint(markup)).toBe(BEFORE_U11[path]);
  });
});
