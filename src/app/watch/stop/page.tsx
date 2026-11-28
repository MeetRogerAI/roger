import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getServedSite, isBuiltVersion } from "@/lib/site/version";
import { stopWatch } from "@/lib/watches";

export const metadata: Metadata = { title: "Watch stopped", robots: { index: false } };

/** Reached from the library's watch email. A site version's library is at /library: "/" is the homepage there. */
const site = getServedSite();
const version = isBuiltVersion(site) ? site : undefined;
const library = version ? "/library" : "/";

async function Result({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const query = t ? await stopWatch(t) : null;
  return query ? (
    <>
      <h1 className="text-h2">Watch stopped.</h1>
      <p className="mt-4 max-w-[34rem] text-lead">
        No more emails for <strong className="font-[600] text-ink">“{query}”</strong>.
      </p>
    </>
  ) : (
    <>
      <h1 className="text-h2">That link has expired.</h1>
      <p className="mt-4 max-w-[34rem] text-lead">Set the watch again from the library and we’ll send a fresh link.</p>
    </>
  );
}

export default function Page({ searchParams }: PageProps<"/watch/stop">) {
  return (
    <section data-site={version} className="wrap py-24 md:py-32">
      <Suspense fallback={<p className="text-lead">Stopping…</p>}>
        <Result searchParams={searchParams as Promise<{ t?: string }>} />
      </Suspense>
      <p className="mt-10">
        <Link className="tlink chev" href={library}>
          Back to the library
        </Link>
      </p>
    </section>
  );
}
