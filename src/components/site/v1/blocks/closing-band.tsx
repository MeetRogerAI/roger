import { Reveal } from "@/components/site/shared/reveal";
import { StartLink } from "@/components/site/shared/start-link";
import type { ClosingBandCopy } from "@/data/site/copy-types";
import type { SiteAudience } from "@/lib/site/start-link";

/**
 * The closing band, a night chapter (spec A.4): one line and the button. On
 * /library the line under the price is repeated under the heading and the
 * trial line sits under the button (closingBandCopy in src/data/site/v1.ts).
 * The homepage's is the line and the button only, and the button has its own
 * words (Peter, November 27, 2026).
 */
export function ClosingBand({
  copy,
  audience,
  id = "closing",
}: {
  copy: ClosingBandCopy;
  /** The audience of the page, carried by the start button. */
  audience?: SiteAudience;
  id?: string;
}) {
  const titleId = `${id}-title`;
  return (
    <section aria-labelledby={titleId} className="on-night bg-night text-night-ink">
      <Reveal className="wrap py-24 text-center md:py-32">
        <h2 id={titleId} className="mx-auto max-w-[44rem] text-h2">
          {copy.line}
        </h2>
        {copy.sub && (
          <p data-closing-sub className="mx-auto mt-4 max-w-[44rem] text-lead text-night-ink-2">
            {copy.sub}
          </p>
        )}
        <div className="mt-10">
          <StartLink audience={audience} className="btn btn-l">
            {copy.start}
          </StartLink>
        </div>
        {copy.trialLine && (
          <p data-closing-trial className="mx-auto mt-7 max-w-[40rem] text-small text-night-ink-2">
            {copy.trialLine}
          </p>
        )}
      </Reveal>
    </section>
  );
}
