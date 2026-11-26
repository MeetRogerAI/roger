import Link from "next/link";
import { cacheLife } from "next/cache";
import { siteConfig } from "@/data/config";
import { getSettings } from "@/lib/settings";
import type { SiteChrome } from "@/lib/site/chrome";
import { isBuiltVersion, type ServedSite } from "@/lib/site/version";

async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

const circlesLinks = [
  { href: "/#how", label: "How it works" },
  { href: "/zack", label: "Run Zack" },
  { href: "/library", label: "Use cases" },
  { href: "/#questions", label: "FAQ" },
  { href: "/#letter", label: "About" },
];
const links = [
  { href: "/library", label: "Use cases" },
  { href: "/packs/solopreneur", label: "Starter packs" },
  { href: "/setup", label: "Setup" },
  { href: "/companies", label: "Companies" },
  { href: "/workshops", label: "Workshops" },
];

const legal = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refunds", label: "Refunds" },
];

/** One quiet line: what this is, where to go, the year and the small print. */
function Line({ left, centre, year, site, small }: { left: React.ReactNode; centre: { href: string; label: string }[]; year: number; site: ServedSite; /** A site version's own small print, in its own words. */ small?: { href: string; label: string }[] }) {
  return (
    <footer className="text-small text-ink-2">
      <div className="wrap grid gap-2 pb-7 pt-[18svh] md:grid-cols-[1fr_auto_1fr] md:items-baseline md:gap-6">
        <p className="flex flex-wrap items-center gap-x-6 gap-y-1">{left}</p>
        {centre.length > 0 && (
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              {centre.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="inline-block py-1 text-ink underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-[180ms] hover:decoration-current">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {/* A site version has more links in the middle, so its small print holds one line and the middle wraps. */}
        <p className={`flex flex-wrap gap-x-5 gap-y-1 md:justify-end${small ? " md:flex-nowrap md:whitespace-nowrap" : ""}`}>
          <span>© {year}</span>
          {(small ?? legal.filter((l) => site === "legacy" || l.href !== "/refunds")).map((l) => (
            <Link key={l.label} href={l.href} className="inline-block py-1 text-ink underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-[180ms] hover:decoration-current">
              {l.label}
            </Link>
          ))}
        </p>
      </div>
    </footer>
  );
}

/** The footer on a page prepared for one company: who to call, and the legal links. */
export async function MinimalFooter({ site }: { site: ServedSite }) {
  const year = await currentYear();
  const { contactEmail } = siteConfig;
  const founder = { phone: (await getSettings()).founderPhone };
  return (
    <Line
      site={site}
      year={year}
      centre={[]}
      left={
        <>
          <span className="text-ink">Roger, Toronto</span>
          {contactEmail && (
            <a className="tlink" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
          )}
          {founder.phone && (
            <a className="tlink" href={`tel:${founder.phone.replace(/[^+\d]/g, "")}`}>
              {founder.phone}
            </a>
          )}
        </>
      }
    />
  );
}

/** `chrome` is a site version's footer content (spec A.3); Circles and the legacy site keep their own. */
export async function SiteFooter({ site, chrome }: { site: ServedSite; chrome?: SiteChrome | null }) {
  const year = await currentYear();
  if (isBuiltVersion(site)) {
    if (!chrome) throw new Error("A site version's footer needs its chrome: pass getSiteChrome() from the root layout.");
    const email = <a className="tlink" href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>;
    return <Line site={site} year={year} centre={chrome.footer} small={chrome.legal} left={<><span>{chrome.place}</span>{email}</>} />;
  }
  const contact = <><span>Roger, Toronto</span><a className="tlink" href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a></>;
  return <Line site={site} year={year} centre={site === "circles" ? circlesLinks : links} left={site === "legacy" ? <span>Real agent use cases, read every morning in Toronto.</span> : contact} />;
}
