import type { Metadata, Viewport } from "next";
import { Mona_Sans } from "next/font/google";
import { siteConfig } from "@/data/config";
import { offerNow } from "@/lib/offer";
import { SiteHeader } from "@/components/site-header";
import { MinimalFooter, SiteFooter } from "@/components/site-footer";
import { FooterSwitch } from "@/components/footer-switch";
import { ClientBoot, CodeBanner } from "@/components/client-boot";
import { Reveals } from "@/components/reveals";
import { SettingsProvider } from "@/components/settings-provider";
import { getSettings } from "@/lib/settings";
import { getSiteChrome, siteMeta } from "@/lib/site/chrome";
import { bySite, getServedSite, isBuiltVersion, isKnownNonProduction } from "@/lib/site/version";
import "./globals.css";

const site = getServedSite();
// The v2 hero sketches (plan U11) draw their own header. They are served only where this is true; elsewhere their addresses are not found, with the site's header and footer.
const sketches = isKnownNonProduction();
// A site version's title and description are its homepage headline and sub-line.
const meta = isBuiltVersion(site) ? siteMeta(site) : null;

const mona = Mona_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-mona",
  display: "swap",
});

const description = bySite<string | undefined>(site, {
  circles: "Confidential Circles for people who use AI agents heavily for work.",
  built: meta?.description,
  legacy: "AI and automation for family-owned companies in Toronto. We map where your company’s hours go in one two-hour session, then build and run the automations every month, on your own systems. Smaller setups for owners and families.",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.domain),
  title: {
    default: bySite(site, { circles: "Roger Circles", built: meta?.title ?? "Roger", legacy: "Roger: AI and automation for family-owned companies · Toronto" }),
    template: "%s · Roger",
  },
  description,
  applicationName: "Roger",
  openGraph: {
    type: "website",
    siteName: "Roger",
    locale: "en_CA",
    url: "/",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#fbfbfd",
  colorScheme: "light",
};

function jsonLd() {
  // Circles and a site version share the Organization, each with its own description.
  if (site !== "legacy") return JSON.stringify({
    "@context": "https://schema.org", "@type": "Organization", name: siteConfig.productName,
    url: siteConfig.domain, email: siteConfig.contactEmail,
    ...(site === "circles" ? { description: "Confidential Circles for people who use AI agents heavily for work." } : meta ? { description: meta.description } : {}),
  }).replace(/</g, "\\u003c");
  const work = offerNow("work");
  const home = offerNow("home");
  const data = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: siteConfig.productName,
    description: "AI and automation for family-owned companies in Toronto, on their own systems. Also setups for owners and families.",
    url: siteConfig.domain,
    ...(siteConfig.contactEmail ? { email: siteConfig.contactEmail } : {}),
    areaServed: { "@type": "City", name: "Toronto" },
    priceRange: `${home.priceLabel}–${work.priceLabel} ${siteConfig.prices.currency}`,
    makesOffer: [
      { "@type": "Offer", name: "Home setup", price: String(home.price), priceCurrency: siteConfig.prices.currency, url: `${siteConfig.domain}/` },
      { "@type": "Offer", name: "Work setup", price: String(work.price), priceCurrency: siteConfig.prices.currency, url: `${siteConfig.domain}/business` },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const s = await getSettings();
  // Circles and the legacy site keep their own header and footer and read nothing more.
  const chrome = isBuiltVersion(site) ? await getSiteChrome(site) : null;
  return (
    <html lang="en-CA" className={mona.variable} suppressHydrationWarning>
      <head>
        {/* Entrances play only with JavaScript; without it the final, complete state renders. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js');setTimeout(function(){document.documentElement.classList.add('settled')},3200)" }} />
      </head>
      <body className="flex min-h-svh flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
        <SettingsProvider value={{ setupCall: s.setupCall, setupCheckout: s.setupCheckout, planCheckout: s.planCheckout, companyCall: s.companyCall }}>
          <ClientBoot />
          <Reveals />
          <SiteHeader site={site} chrome={chrome} sketches={sketches} />
          {site === "legacy" && <CodeBanner />}
          <main id="main" className="flex-1">
            {children}
          </main>
          <FooterSwitch sketches={sketches} full={<SiteFooter site={site} chrome={chrome} />} minimal={<MinimalFooter site={site} />} />
        </SettingsProvider>
      </body>
    </html>
  );
}
