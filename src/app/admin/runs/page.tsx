import Link from "next/link";
import { connection } from "next/server";
import { adminIdentity } from "@/lib/admin-auth";
import { when } from "@/lib/admin/format";
import { READ_NOT_LOGGED, readsLogged } from "@/lib/admin/read-log";
import { listRuns, runDetail } from "@/lib/admin/runs";
import { query } from "@/lib/db-query";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["received", "accepted", "flagged", "rejected", "deleted"];

/** Runs (spec B.12): every run with its status; open any to read it. Logged as a read of every member listed (B3 Unit 6, fail-closed). */
export default async function RunsPage({ searchParams }: PageProps<"/admin/runs">) {
  await connection();
  const by = await adminIdentity();
  if (!by) return null;
  const sp = await searchParams;
  const id = typeof sp.id === "string" && UUID.test(sp.id) ? sp.id : null;
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status) ? sp.status : undefined;
  const [runs, open] = await Promise.all([listRuns(query, { status }), id ? runDetail(query, id) : null]);
  // The open run's member first, so they are always within the 200 ids kept.
  if (!(await readsLogged(query, by, "/admin/runs", [{ what: "read_runs", userIds: [open?.userId, ...runs.map((r) => r.userId)] }]))) {
    return <p role="alert" className="text-small text-error">{READ_NOT_LOGGED}</p>;
  }

  return (
    <section className="space-y-8">
      <header>
        <h1 className="text-h3">Runs</h1>
        <nav aria-label="Filter by status" className="mt-3 flex flex-wrap gap-3 text-small">
          <Link href="/admin/runs" className="tlink" aria-current={!status ? "page" : undefined}>
            All
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={`/admin/runs?status=${s}`} className="tlink" aria-current={status === s ? "page" : undefined}>
              {s}
            </Link>
          ))}
        </nav>
      </header>

      {open && (
        <article aria-labelledby="run-h" className="rounded-[8px] border border-rule bg-surface p-5">
          <h2 id="run-h" className="text-title">
            {open.who}, week of {open.weekOf}
          </h2>
          <p className="mt-1 text-small text-ink-2">
            {open.status}
            {open.isTest ? " (test)" : ""} · {open.route} · {open.agent} · sharing {open.sharing} · parsed by {open.parsedBy ?? "–"} · Zack {open.zackVersion || "?"} · {when(open.receivedAt)}
            {open.reason ? ` · ${open.reason}` : ""}
          </p>
          {open.playRows.length > 0 && (
            <ul className="mt-3 text-small">
              {open.playRows.map((p) => (
                <li key={p.id}>
                  {p.set}
                  {p.position}: {p.title} ({p.category}) · {p.shareable ? "shareable" : "not shareable"}
                  {p.flag ? " · flagged" : ""}
                  {p.inPool ? " · in the pool" : ""}
                </li>
              ))}
            </ul>
          )}
          <pre tabIndex={0} className="mt-4 max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-[8px] bg-ground-2 p-4 text-meta [overflow-wrap:anywhere]">
            {open.rawText}
          </pre>
        </article>
      )}

      {runs.length === 0 ? (
        <p className="text-small text-ink-2">No runs{status ? ` with status ${status}` : " yet"}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-small">
            <thead>
              <tr className="border-b border-ink text-ink-2">
                {["Who", "Week", "Status", "Route", "Agent", "Plays", "Received"].map((h) => (
                  <th key={h} className="py-2 pr-4 font-[500]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-rule align-top">
                  <td className="py-2 pr-4 [overflow-wrap:anywhere]">
                    <Link href={`/admin/runs?id=${r.id}${status ? `&status=${status}` : ""}`} className="tlink">
                      {r.who}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{r.weekOf}</td>
                  <td className="py-2 pr-4">
                    {r.status}
                    {r.isTest ? " (test)" : ""}
                  </td>
                  <td className="py-2 pr-4">{r.route}</td>
                  <td className="py-2 pr-4">{r.agent}</td>
                  <td className="py-2 pr-4">{r.plays}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{when(r.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
