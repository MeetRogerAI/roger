/**
 * Which public site is served (plan KTD1 to KTD4).
 *
 * Server files only: VERCEL_ENV and SITE_VERSION do not exist in the browser,
 * so a client component takes the result as a prop from its server parent.
 * Prerendered pages and module-level metadata read it once, at build.
 */
import { notFound } from "next/navigation";
import { siteConfig, type SiteVersion } from "@/data/config";

export type { SiteVersion };

/** A site version built from the marketing spec, as opposed to the Circles preview. */
export type BuiltVersion = Exclude<SiteVersion, "circles">;

/**
 * What a branch point chooses between. "legacy" is the older library-led site
 * that `circlesMode: false` restores; no site version selects it.
 */
export type ServedSite = SiteVersion | "legacy";

const versions: readonly SiteVersion[] = ["circles", "v1", "v2", "v3"];

export const isSiteVersion = (value: unknown): value is SiteVersion => versions.includes(value as SiteVersion);

export const isBuiltVersion = (site: ServedSite): site is BuiltVersion => site !== "circles" && site !== "legacy";

/**
 * True only where the environment is known not to be live: a Vercel preview or
 * development deployment, or, with no VERCEL_ENV at all, local development and
 * tests. Anything else is false, a production build made off Vercel included,
 * so whatever asks this fails closed.
 */
export function isKnownNonProduction({ vercelEnv, nodeEnv }: { vercelEnv: string | undefined; nodeEnv: string | undefined } = { vercelEnv: process.env.VERCEL_ENV, nodeEnv: process.env.NODE_ENV }): boolean {
  if (vercelEnv) return vercelEnv === "preview" || vercelEnv === "development";
  return nodeEnv === "development" || nodeEnv === "test";
}

/**
 * Production serves `live` whatever the override says. Outside production a
 * valid SITE_VERSION wins. Without one, `preview` is served only where the
 * environment is known not to be live (isKnownNonProduction). Anything else,
 * such as a production build made off Vercel, serves `live`.
 */
export function resolveSiteVersion({ vercelEnv, nodeEnv, override, live, preview }: { vercelEnv: string | undefined; nodeEnv: string | undefined; override: string | undefined; live: SiteVersion; preview: SiteVersion }): SiteVersion {
  if (vercelEnv === "production") return live;
  if (isSiteVersion(override)) return override;
  return isKnownNonProduction({ vercelEnv, nodeEnv }) ? preview : live;
}

/** The site this build or request serves. */
export function getServedSite(): ServedSite {
  const version = resolveSiteVersion({
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    override: process.env.SITE_VERSION,
    live: siteConfig.site.live,
    preview: siteConfig.site.preview,
  });
  return version === "circles" && !siteConfig.flags.circlesMode ? "legacy" : version;
}

/** One value per kind of site, for the places that differ only in a string or a list. */
export function bySite<T>(site: ServedSite, choices: { circles: T; built: T; legacy: T }): T {
  if (site === "circles") return choices.circles;
  return site === "legacy" ? choices.legacy : choices.built;
}

/**
 * Robots metadata for a page that belongs to the legacy site only (companies,
 * setup, workshops, packs): kept out of search unless that site is served.
 */
export function hiddenLegacyRobots(site: ServedSite = getServedSite()): { robots?: { index: false; follow: false } } {
  return site === "legacy" ? {} : { robots: { index: false, follow: false } };
}

/**
 * The gate for a route that exists only in a site version: not found while
 * Circles (or the legacy site) is served, otherwise the version to render.
 */
export function requireBuiltVersion(site: ServedSite = getServedSite()): BuiltVersion {
  if (!isBuiltVersion(site)) notFound();
  return site;
}
