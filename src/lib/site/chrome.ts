/**
 * What surrounds every page of a site version (spec A.3): the header's links
 * and buttons, the footer's links, the not-found page's words and the
 * metadata. The words are the version's copy; the addresses are here, because
 * they are the same for every version.
 *
 * The header, the footer and the not-found page show their words as
 * published: getSiteChrome reads the stored content (plan U4). The metadata
 * (siteMeta, pageMeta, zackMeta) is the code copy's, always: page titles and
 * search descriptions are not editable in Pages.
 *
 * Server files only. The header is a client component and takes the result as
 * a prop from the root layout: importing a copy file there would pull the
 * settings reader into the browser bundle.
 */
import type { Metadata } from "next";
import type { SharedCopy } from "@/data/site/copy-types";
import { v1, v1Zack } from "@/data/site/v1";
import { fillCopy, getAmounts, type Amounts } from "./amounts";
import { emptyOverlay, type Overlay } from "./content/format";
import { applyOverlay } from "./content/model";
import { getSiteContent } from "./content/read";
import { navRow, type NavRow } from "./header-fit";
import { isBuiltVersion, type BuiltVersion, type ServedSite } from "./version";

/** `id` is the link's name in the copy, for a key: two links may share their words or their address. */
export type ChromeLink = { href: string; label: string; id?: string };

export type SiteChrome = {
  /** The header's links, in order. */
  links: ChromeLink[];
  /** Where the header shows its links in a row: from 1024 pixels as built, from 1280, or never (src/lib/site/header-fit.ts). Below that they are in the menu. */
  navRow: NavRow;
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

/** A version's two copy files: the site's and the free Zack run's. */
type VersionCopy = { main: typeof v1; zack: typeof v1Zack };

const v1Files: VersionCopy = { main: v1, zack: v1Zack };

/**
 * Which copy each version reads. v2 and v3 use v1's words, and show v1's
 * pages, until each has a copy file and pages of its own (U13, U17). This is
 * the one place that says so: give a version its own files here.
 */
const copyByVersion: Record<BuiltVersion, VersionCopy> = { v1: v1Files, v2: v1Files, v3: v1Files };

const copyFor = (version: BuiltVersion): ChromeCopy & Pick<SharedCopy, "meta"> => copyByVersion[version].main;

/**
 * The nine public pages of a site version, in the spec's sitemap order. /agents and /pricing were deleted on
 * November 27, 2026 (Peter): each answers with a permanent redirect (next.config.ts), and neither is listed.
 */
export const builtSitemapPaths = ["/", "/how-it-works", "/faq", "/about", "/zack", "/library", "/getstarted", "/privacy", "/terms"] as const;

/**
 * Where "Pricing" goes, from every page: the price section of the homepage (PriceBlock's id, which has a scroll
 * margin for the sticky header). The copy's "pricing" links say so (a test holds the two together).
 */
export const PRICE_SECTION_HREF = "/#price";

/** A site version's title, description and social card line. No amounts, so static metadata can read it at build. */
export function siteMeta(version: BuiltVersion): SharedCopy["meta"] {
  return copyFor(version).meta;
}

/** The same three for /zack and /zack/[agent], from the free run's own copy. */
export function zackMeta(version: BuiltVersion): SharedCopy["meta"] {
  return copyByVersion[version].zack.meta;
}

/** The three reading pages, by their name in a version's copy. */
export type ReadingPage = "howItWorks" | "faq" | "about";

/** The same three for /how-it-works, /faq and /about, from each page's own copy. */
export function pageMeta(version: BuiltVersion, page: ReadingPage): SharedCopy["meta"] {
  return copyByVersion[version].main[page].meta;
}

/** A page that has a title, a description and a social card line of its own: a reading page or the free Zack run. */
export type MetaPage = ReadingPage | "zack";

/**
 * The metadata of a route that exists only in a site version (plan KTD4):
 * the page's own title and description, and `path` as its one address. Under
 * Circles or the legacy site the route is not found, so it has nothing to
 * index.
 */
export function builtPageMetadata(site: ServedSite, page: MetaPage, path: string): Metadata {
  if (!isBuiltVersion(site)) return { robots: { index: false, follow: false } };
  const meta = page === "zack" ? zackMeta(site) : pageMeta(site, page);
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
  // The links' words and addresses are the copy's lists, in their order (plan U8). The Sign in and start buttons are not among them.
  const link = ({ id, href, label }: { id: string; href: string; label: string }): ChromeLink => ({ href, label, id });
  const links = nav.map(link);
  return {
    links,
    navRow: navRow(
      links.map((entry) => entry.label),
      buttons.signIn,
      buttons.start,
      buttons.openApp,
    ),
    start: { href: "/start", label: buttons.start, short: buttons.start },
    signIn: { href: "/signin", label: buttons.signIn },
    openApp: { href: "/app", label: buttons.openApp },
    place: footer.place,
    footer: footer.links.map(link),
    legal: [
      { href: "/privacy", label: footer.privacy },
      { href: "/terms", label: footer.terms },
    ],
    notFound,
  };
}

/**
 * A version's chrome. `content` is everything stored that the site should show, as one overlay on the code copy
 * (src/lib/site/content): left out, the chrome is the code copy's. An overlay is read leniently where it is
 * applied, so a stored label that names an amount that does not exist is not applied and cannot take the header
 * down, and only the chrome's own four parts are filled.
 */
export function siteChrome(version: BuiltVersion, amounts: Amounts, content: Overlay = emptyOverlay): SiteChrome {
  return chromeFrom(applyOverlay(copyFor(version), content), amounts);
}

/**
 * The chrome as the site shows it: its labels as published (the release file and the site's own edits), with the
 * amounts they name filled in from the settings. Both reads are cached, so the root layout keeps its static shell.
 */
export async function getSiteChrome(version: BuiltVersion): Promise<SiteChrome> {
  const [amounts, content] = await Promise.all([getAmounts(), getSiteContent()]);
  return siteChrome(version, amounts, content);
}
