/**
 * Every public page of a site version, rendered to markup through the root
 * layout, so the header and footer are on each one (plan KTD15).
 *
 * The version is whatever the route files resolved when they were imported:
 * the test file sets SITE_VERSION in vi.hoisted before anything loads, and
 * mocks next/navigation (with `usePathname` reading `at.path`), next/headers,
 * next/cache and next/font/google, as the other page tests do. Nothing here is
 * specific to v1, so the same list serves v2 and v3.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { BuiltVersion } from "@/lib/site/version";
import { pageMarkup } from "./page-markup";

/** The path the mocked `usePathname` returns: the header and footer depend on it. */
export const at = { path: "/" };

export type RenderedPage = {
  path: string;
  markup: string;
  /** The words the route gives a browser tab, a search result and a shared link. */
  meta: string[];
};

type Props = Record<string, unknown>;
type Route = { default: (props: never) => ReactNode | Promise<ReactNode>; metadata?: Metadata };

/** Every string in a metadata object that a person can read: titles and descriptions, not addresses. */
export function metaWords(metadata: Metadata | undefined): string[] {
  const out: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (typeof value === "string") {
      if (key === "title" || key === "description" || key === "default" || key === "absolute" || key === "siteName" || key === "applicationName") out.push(value);
    } else if (value && typeof value === "object" && !(value instanceof URL)) {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(metadata, "");
  return out;
}

/** The public routes of a site version: spec A.2, with one listed agent and "other" for /zack/[agent], and the not-found page. */
const routes: { path: string; load: () => Promise<Route>; props?: () => Props }[] = [
  { path: "/", load: () => import("@/app/page") },
  { path: "/agents", load: () => import("@/app/agents/page") },
  { path: "/pricing", load: () => import("@/app/pricing/page") },
  { path: "/faq", load: () => import("@/app/faq/page") },
  { path: "/how-it-works", load: () => import("@/app/how-it-works/page") },
  { path: "/about", load: () => import("@/app/about/page") },
  { path: "/zack", load: () => import("@/app/zack/page") },
  { path: "/zack/claude", load: () => import("@/app/zack/[agent]/page"), props: () => ({ params: Promise.resolve({ agent: "claude" }), searchParams: Promise.resolve({}) }) },
  { path: "/zack/other", load: () => import("@/app/zack/[agent]/page"), props: () => ({ params: Promise.resolve({ agent: "other" }), searchParams: Promise.resolve({}) }) },
  { path: "/library", load: () => import("@/app/library/page") },
  { path: "/privacy", load: () => import("@/app/privacy/page") },
  { path: "/terms", load: () => import("@/app/terms/page") },
  { path: "/a-page-that-is-not-there", load: () => import("@/app/not-found") },
];

export const sitePagePaths: readonly string[] = routes.map((route) => route.path);

/**
 * Renders every route. `version` is checked against the markup, so a test
 * that believes it is reading v2 cannot be reading v1.
 */
export async function renderSitePages(version: BuiltVersion): Promise<RenderedPage[]> {
  const { default: RootLayout, metadata: rootMetadata } = await import("@/app/layout");
  const Layout = RootLayout as unknown as (props: { params: Promise<object>; children: ReactNode }) => ReactNode;
  const pages: RenderedPage[] = [];
  for (const route of routes) {
    at.path = route.path;
    const mod = await route.load();
    const Page = mod.default as unknown as (props: Props) => ReactNode;
    const markup = await pageMarkup(
      <Layout params={Promise.resolve({})}>
        <Page {...(route.props?.() ?? {})} />
      </Layout>,
    );
    if (!markup.includes(`data-site="${version}"`)) throw new Error(`${route.path} did not render site version ${version}`);
    pages.push({ path: route.path, markup, meta: [...metaWords(rootMetadata), ...metaWords(mod.metadata)] });
  }
  return pages;
}
