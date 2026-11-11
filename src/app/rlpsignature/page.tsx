import type { Metadata } from "next";
import { siteConfig } from "@/data/config";

const title = "Roger for RLP Signature";
const description = "Learning AI is a team sport. A one-minute look at what Roger can do for RLP Signature.";

// Shared by link only: kept out of search, the sitemap and the nav
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/rlpsignature" },
  // Overriding openGraph drops the root's file-based image, so the poster frame is the share card
  openGraph: {
    url: "/rlpsignature",
    title,
    description,
    siteName: "Roger",
    type: "website",
    images: [{ url: "/media/rlp-signature-poster.jpg", width: 1600, height: 900 }],
  },
  twitter: { card: "summary_large_image", images: ["/media/rlp-signature-poster.jpg"] },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

const join = `mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("Join the RLP Signature group")}`;

export default function RlpSignaturePage() {
  return (
    <>
      {/* 1 · The video first, on a stage: the night band starts behind it and carries into the close */}
      <section aria-labelledby="video-title" className="relative bg-ground pt-6 md:pt-10">
        <h1 id="video-title" className="sr-only">
          {title}
        </h1>
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-night" aria-hidden="true" />
        <div className="wrap relative">
          <video
            controls
            playsInline
            preload="metadata"
            poster="/media/rlp-signature-poster.jpg"
            aria-label="Roger for RLP Signature, a one-minute video"
            className="aspect-video w-full rounded-[8px] bg-night shadow-[0_24px_60px_-20px_rgba(12,12,14,0.45)]"
          >
            <source src="/media/rlp-signature.mp4" type="video/mp4" />
            Video not loading? Email <a href={join}>{siteConfig.contactEmail}</a>.
          </video>
        </div>
      </section>

      {/* 2 · The ask, right where the video ends */}
      <section id="final-cta" aria-labelledby="join-title" className="on-night bg-night text-night-ink">
        <div className="wrap grid gap-10 py-20 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:py-28">
          <div>
            <h2 id="join-title" className="text-h2">
              Don’t be the last one still Googling “what is ChatGPT.”
            </h2>
            <p className="mt-4 max-w-[30rem] text-lead text-night-ink">
              The rest of RLP Signature is getting sharp on AI together. Pull up a chair. One email and you’re in.
            </p>
          </div>
          <div>
            <a className="btn btn-l" href={join}>
              Count me in
            </a>
            <p className="mt-4 select-all text-small text-night-ink-2">{siteConfig.contactEmail}</p>
          </div>
        </div>
      </section>
    </>
  );
}
