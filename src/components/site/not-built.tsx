import type { BuiltVersion } from "@/lib/site/version";

/** Stands in for a page of a site version until its unit builds it. */
export function SiteNotBuilt({ version, page }: { version: BuiltVersion; page: string }) {
  return (
    <section data-site={version} className="wrap py-24 md:py-36">
      <h1 className="text-h2 text-stretch-display">{page}</h1>
      <p className="mt-5 max-w-[34rem] text-lead">This page of site version {version} is not built yet.</p>
    </section>
  );
}
