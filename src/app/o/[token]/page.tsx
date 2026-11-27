import type { Metadata } from "next";
import { Suspense } from "react";
import { OPT_OUT_WORDS, OptOutView } from "./opt-out-view";

/** Never indexed, and the token never leaves in a Referer (next.config.ts sends the same as headers). */
export const metadata: Metadata = { title: "Roger invitations", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Body({ params, searchParams }: Props) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  return <OptOutView token={token} error={sp.error === "1"} />;
}

/** A guest's opt-out page (B2 whole-branch review); see opt-out-view.tsx. */
export default function OptOutPage({ params, searchParams }: Props) {
  return (
    <section className="mx-auto max-w-[760px] px-4 py-16 sm:px-6 lg:py-24">
      <Suspense fallback={<p className="text-lead text-ink-2">{OPT_OUT_WORDS.loading}</p>}>
        <Body params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
