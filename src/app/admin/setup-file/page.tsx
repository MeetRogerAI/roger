import { connection } from "next/server";
import { Suspense } from "react";
import { SetupFileEditor } from "@/components/app/setup-file-editor";
import { isAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db-query";
import { listVersions } from "@/lib/setup-file";
import { publishSetupFile, restoreSetupFile } from "./actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" });

/** The setup file on /getstarted, with every version (spec B.11). */
async function SetupFileAdmin({ searchParams }: { searchParams: PageProps<"/admin/setup-file">["searchParams"] }) {
  await connection();
  if (!(await isAdmin())) return null;
  const sp = await searchParams;
  const versions = await listVersions(query);
  const asked = typeof sp.v === "string" ? Number(sp.v) : null;
  const opened = versions.find((v) => v.version === asked) ?? null;
  const base = opened ?? versions[0] ?? null;
  const live = versions.find((v) => v.published);

  return (
    <section className="max-w-[60rem] space-y-12">
      <header>
        <h1 className="text-h3">Setup file</h1>
        <p className="mt-2 text-small text-ink-2">
          The starter team setup file on /getstarted. {live ? `Version ${live.version} is live.` : "Nothing is published, so the page shows no setup file."}
        </p>
      </header>

      {opened && (
        <article aria-labelledby="opened-h">
          <h2 id="opened-h" className="text-title">
            Version {opened.version}
            {opened.published ? " (live)" : ""}
          </h2>
          <p className="mt-1 text-small text-ink-2">
            {when(opened.createdAt)} · {opened.savedBy} · {opened.note}
          </p>
          <pre tabIndex={0} className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-[8px] border border-rule bg-surface p-4 text-small [overflow-wrap:anywhere]">
            {opened.bodyMd}
          </pre>
        </article>
      )}

      <div>
        <h2 className="text-title">Save a new version</h2>
        <div className="mt-4">
          <SetupFileEditor initial={base?.bodyMd ?? ""} startedFrom={base?.version ?? null} />
        </div>
      </div>

      <div>
        <h2 className="text-title">Versions</h2>
        {versions.length === 0 ? (
          <p className="mt-3 text-small text-ink-2">No versions yet. The first one waits for Peter’s starter file.</p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {versions.map((v) => (
              <li key={v.version} className="grid gap-2 py-4 text-small sm:grid-cols-[1fr_auto] sm:gap-6">
                <div>
                  <p className="font-semibold">
                    Version {v.version}
                    {v.published && <span className="ml-2 text-meta uppercase tracking-wider text-accent">Live</span>}
                  </p>
                  <p className="mt-1 text-ink-2">
                    {when(v.createdAt)} · {v.savedBy}
                  </p>
                  <p className="mt-1">{v.note}</p>
                </div>
                <div className="flex flex-wrap items-start gap-4">
                  <a href={`/admin/setup-file?v=${v.version}`} className="tlink">
                    Open<span className="sr-only"> version {v.version}</span>
                  </a>
                  {!v.published && (
                    <form action={publishSetupFile}>
                      <input type="hidden" name="version" value={v.version} />
                      <button type="submit" className="tlink">
                        Publish<span className="sr-only"> version {v.version}</span>
                      </button>
                    </form>
                  )}
                  <form action={restoreSetupFile}>
                    <input type="hidden" name="version" value={v.version} />
                    <button type="submit" className="tlink">
                      Restore<span className="sr-only"> version {v.version} as a new version</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function Page({ searchParams }: PageProps<"/admin/setup-file">) {
  return (
    <Suspense fallback={<p className="text-small text-ink-2">Loading…</p>}>
      <SetupFileAdmin searchParams={searchParams} />
    </Suspense>
  );
}
