/**
 * The address every start button on the public site points at (plan KTD9,
 * marketing spec "Start handoff"). The keys and shapes are the ones
 * parseStartParams in src/lib/signup/params.ts accepts, so nothing built here
 * is dropped on arrival.
 */
import type { Currency } from "./amounts";

/** Which reader a page is written for. Most pages have none. */
export type SiteAudience = "re" | "agents";

/** Campaign tags as ClientBoot stores them (readUtm in src/lib/session.ts). */
export type CampaignTags = { utm_source?: unknown; utm_medium?: unknown; utm_campaign?: unknown };

export type StartLinkInput = {
  /** The audience of the page the button is on. */
  audience?: SiteAudience | null;
  /** The last audience seen this visit, used when the page has none. */
  remembered?: string | null;
  /** The currency the visitor chose, if they chose one. */
  currency?: string | null;
  /** A free Zack run token from /zack. */
  zack?: string | null;
  /** A referral code, carried through untouched. */
  ref?: string | null;
  tags?: CampaignTags | null;
};

export const isSiteAudience = (value: unknown): value is SiteAudience => value === "re" || value === "agents";

const zackShape = /^[A-Za-z0-9_-]{16,128}$/;
const refShape = /^[A-Za-z0-9_-]{3,40}$/;

/**
 * The tags as the one `utm` value /start stores: source, medium and campaign
 * joined with "/", as the pack form already writes them to the same column.
 * Each part is printable ASCII and short enough that the whole fits in 200 characters.
 */
export function utmValue(tags: CampaignTags | null | undefined): string {
  if (!tags) return "";
  return [tags.utm_source, tags.utm_medium, tags.utm_campaign]
    .map((tag) =>
      typeof tag === "string"
        ? tag
            .replace(/[^\x20-\x7E]/g, "")
            .replace(/\//g, "-")
            .trim()
            .slice(0, 60)
            .trim()
        : "",
    )
    .filter(Boolean)
    .join("/");
}

/** "/start" with whatever context is known. A value of the wrong shape is left out. */
export function startHref({ audience, remembered, currency, zack, ref, tags }: StartLinkInput = {}): string {
  const q = new URLSearchParams();
  const path = isSiteAudience(audience) ? audience : isSiteAudience(remembered) ? remembered : null;
  if (path) q.set("path", path);
  if (currency === "USD" || currency === "CAD") q.set("cur", currency satisfies Currency);
  if (ref && refShape.test(ref)) q.set("ref", ref);
  if (zack && zackShape.test(zack)) q.set("zack", zack);
  const utm = utmValue(tags);
  if (utm) q.set("utm", utm);
  const query = q.toString();
  return query ? `/start?${query}` : "/start";
}
