import Link from "next/link";
import { StartLink } from "@/components/site/shared/start-link";
import { getSiteChrome } from "@/lib/site/chrome";
import { getServedSite, isBuiltVersion, type BuiltVersion } from "@/lib/site/version";

/** A site version's not-found page: the way home and the start button, and no old offer (spec A.2). */
async function BuiltNotFound({ version }: { version: BuiltVersion }) {
  const { notFound, start } = await getSiteChrome(version);
  return (
    <section data-site={version} className="wrap py-24 md:py-36">
      <h1 className="text-h2 text-stretch-display">{notFound.title}</h1>
      <p className="mt-5 max-w-[34rem] text-lead">{notFound.line}</p>
      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
        <StartLink className="btn btn-l">{start.label}</StartLink>
        <Link className="tlink chev" href="/">{notFound.home}</Link>
      </div>
    </section>
  );
}

export default function NotFound() {
  const site = getServedSite();
  if (isBuiltVersion(site)) return <BuiltNotFound version={site} />;
  return (
    <section className="wrap py-24 md:py-36">
      <h1 className="text-h2 text-stretch-display">That page isn’t here</h1>
      <p className="mt-5 max-w-[34rem] text-lead">The link may be old or mistyped (error 404). Try one of these:</p>
      <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
        <li><Link className="tlink chev" href="/library">The use-case library</Link></li>
        <li><Link className="tlink chev" href="/packs/solopreneur">Free starter pack</Link></li>
        <li><Link className="tlink chev" href="/companies">For companies</Link></li>
        <li><Link className="tlink chev" href="/setup">Custom setup</Link></li>
      </ul>
    </section>
  );
}
