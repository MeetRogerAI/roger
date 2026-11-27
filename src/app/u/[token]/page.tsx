import type { Metadata } from "next";
import { Suspense } from "react";
import { UNSUB_WORDS, UnsubscribeView } from "./unsubscribe-view";

/** Never indexed, and the token never leaves in a Referer (next.config.ts sends the same as headers). */
export const metadata: Metadata = { title: "Wednesday stats email", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Body({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  return <UnsubscribeView token={token} error={sp.error === "1"} />;
}

/** The stats email's unsubscribe page (B2 plan Unit 8); see unsubscribe-view.tsx. */
export default function UnsubscribePage({ params, searchParams }: Props) {
  return (
    <section className="mx-auto max-w-[760px] px-4 py-16 sm:px-6 lg:py-24">
      <Suspense fallback={<p className="text-lead text-ink-2">{UNSUB_WORDS.loading}</p>}>
        <Body params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
