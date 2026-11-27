import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { heroSketch, heroSketches } from "@/components/site/v2/sketches";
import { v1Copy } from "@/lib/site/content/model";
import { getAmounts } from "@/lib/site/amounts";
import { isKnownNonProduction } from "@/lib/site/version";

export const metadata: Metadata = { title: "Hero sketch", robots: { index: false, follow: false } };

/** One page per sketch. Any other number is not found. */
export function generateStaticParams() {
  return heroSketches.map((sketch) => ({ n: String(sketch.n) }));
}

// In a production build this page is only "not found", so there is no instant shell to validate.
// It has to be a literal: the build rejects a value worked out from the environment.
export const instant = false;

/**
 * One v2 hero sketch, full page (plan U11, R15): a first screen and the start
 * of the next section, with the v1 words. The site's header and footer are
 * left off these addresses (isHeroSketch in src/components/site-header.tsx),
 * because each sketch draws its own header.
 *
 * Served only where the environment is known not to be live, by the rule that
 * gates /site-preview/blocks: a production build with no VERCEL_ENV does not
 * serve it.
 */
export default async function HeroSketchPage({ params }: PageProps<"/site-preview/hero/[n]">) {
  if (!isKnownNonProduction()) notFound();
  const { n } = await params;
  const sketch = heroSketch(n);
  if (!sketch) notFound();
  const amounts = await getAmounts();
  const { copy } = v1Copy(amounts);
  return <sketch.Component copy={copy} amounts={amounts} />;
}
