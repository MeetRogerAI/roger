/**
 * What surrounds every page of a site version (spec A.3): the header's links
 * and buttons, the footer's links, the not-found page's words and the
 * metadata. The words are the version's copy; the addresses are here, because
 * they are the same for every version.
 *
 * Server files only. The header is a client component and takes the result as
 * a prop from the root layout: importing a copy file there would pull the
 * settings reader into the browser bundle.
 */
import type { Metadata } from "next";
import type { SharedCopy } from "@/data/site/copy-types";
import { v1, v1Agents, v1Zack } from "@/data/site/v1";
import { fillCopy, getAmounts, type Amounts } from "./amounts";
import { isBuiltVersion, type BuiltVersion, type ServedSite } from "./version";

export type ChromeLink = { href: string; label: string };

export type SiteChrome = {
  /** The header's links, in order. */
  links: ChromeLink[];
  /** The start button. `short` is the same words: a site version's button reads the same at every width. */
  start: ChromeLink & { short: string };
  signIn: ChromeLink;
  /** Shown to a signed-in visitor in place of the two above. */
  openApp: ChromeLink;
  /** Named beside the contact email in the footer. */
  place: string;
  /** The footer's links, and its small print. */
  footer: ChromeLink[];
  legal: ChromeLink[];
  notFound: SharedCopy["notFound"];
};

/** The parts of a version's copy the header, the footer and the not-found page read. `meta` is read as written, by siteMeta. */
export type ChromeCopy = Pick<SharedCopy, "buttons" | "nav" | "footer" | "notFound">;

/** A version's three copy files: the site's, the /agents page's and the free Zack run's. */
type VersionCopy = { main: typeof v1; agents: typeof v1Agents; zack: typeof v1Zack };

const v1Files: VersionCopy = { main: v1, agents: v1Agents, zack: v1Zack };

/**
 * Which copy each version reads. v2 and v3 use v1's words, and show v1's
 * pages, until each has a copy file and pages of its own (U13, U17). This is
 * the one place that says so: give a version its own files here.
 */
const copyByVersion: Record<BuiltVersion, VersionCopy> = { v1: v1Files, v2: v1Files, v3: v1Files };

const copyFor = (version: BuiltVersion): ChromeCopy & Pick<SharedCopy, "meta"> => copyByVersion[version].main;

/** The eleven public pages of a site version, in the spec's sitemap order. */
export const builtSitemapPaths = ["/", "/agents", "/pricing", "/how-it-works", "/faq", "/about", "/zack", "/library", "/getstarted", "/privacy", "/terms"] as const;

/** A site version's title, description and social card line. No amounts, so static metadata can read it at build. */
export function siteMeta(version: BuiltVersion): SharedCopy["meta"] {
  return copyFor(version).meta;
}

/** The same three for /agents, from that page's own copy. */
export function agentsMeta(version: BuiltVersion): SharedCopy["meta"] {
  return copyByVersion[version].agents.meta;
}

/** The same three for /zack and /zack/[agent], from the free run's own copy. */
export function zackMeta(version: BuiltVersion): SharedCopy["meta"] {
  return copyByVersion[version].zack.meta;
}

/** The four reading pages, by their name in a version's copy. */
export type ReadingPage = "pricing" | "howItWorks" | "faq" | "about";

/** The same three for /pricing, /how-it-works, /faq and /about, from each page's own copy. */
export function pageMeta(version: BuiltVersion, page: ReadingPage): SharedCopy["meta"] {
  return copyByVersion[version].main[page].meta;
}

/** A page that has a title, a description and a social card line of its own: a reading page, /agents or the free Zack run. */
export type MetaPage = ReadingPage | "agents" | "zack";

/**
 * The metadata of a route that exists only in a site version (plan KTD4):
 * the page's own title and description, and `path` as its one address. Under
 * Circles or the legacy site the route is not found, so it has nothing to
 * index.
 */
export function builtPageMetadata(site: ServedSite, page: MetaPage, path: string): Metadata {
  if (!isBuiltVersion(site)) return { robots: { index: false, follow: false } };
  const meta = page === "agents" ? agentsMeta(site) : page === "zack" ? zackMeta(site) : pageMeta(site, page);
  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: path },
    openGraph: { url: path, title: meta.headline, description: meta.description },
  };
}

/**
 * The chrome from a version's copy. Only the four parts named here are filled
 * with amounts. This runs in the root layout, for every route under a site
 * version, the app and the admin included: filling the whole copy file would
 * let one misspelt {name} in a page's own copy take all of them down.
 */
export function chromeFrom(copy: ChromeCopy, amounts: Amounts): SiteChrome {
  const { buttons, nav, footer, notFound } = fillCopy({ buttons: copy.buttons, nav: copy.nav, footer: copy.footer, notFound: copy.notFound }, amounts);
  const pricing = { href: "/pricing", label: nav.pricing };
  const howItWorks = { href: "/how-it-works", label: nav.howItWorks };
  const library = { href: "/library", label: nav.library };
  const faq = { href: "/faq", label: nav.faq };
  const about = { href: "/about", label: nav.about };
  return {
    links: [howItWorks, pricing, library, faq, about],
    start: { href: "/start", label: buttons.start, short: buttons.start },
    signIn: { href: "/signin", label: buttons.signIn },
    openApp: { href: "/app", label: buttons.openApp },
    place: footer.place,
    footer: [pricing, howItWorks, faq, about, library, { href: "/agents", label: footer.agents }],
    legal: [
      { href: "/privacy", label: footer.privacy },
      { href: "/terms", label: footer.terms },
    ],
    notFound,
  };
}

export function siteChrome(version: BuiltVersion, amounts: Amounts): SiteChrome {
  return chromeFrom(copyFor(version), amounts);
}

/** The chrome with the amounts its labels name filled in from the settings. */
export async function getSiteChrome(version: BuiltVersion): Promise<SiteChrome> {
  return siteChrome(version, await getAmounts());
}
