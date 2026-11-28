import Link from "next/link";
import { connection } from "next/server";
import { FlagDecision } from "@/components/app/admin-v3";
import { adminIdentity } from "@/lib/admin-auth";
import { EDITABLE_FIELDS, flaggedRunsWithoutPlays, listFlags } from "@/lib/admin/flags";
import { READ_NOT_LOGGED, readsLogged } from "@/lib/admin/read-log";
import { query } from "@/lib/db-query";

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Flags (spec B.6, B.12): each flagged play's text, what was flagged, and approve, edit or reject. Logged as a read of those members' runs (B3 Unit 6, fail-closed). */
export default async function FlagsPage() {
  await connection();
  const by = await adminIdentity();
  if (!by) return null;
  const [plays, runs] = await Promise.all([listFlags(query), flaggedRunsWithoutPlays(query)]);
  if (!(await readsLogged(query, by, "/admin/flags", [{ what: "read_runs", userIds: [...plays.map((p) => p.userId), ...runs.map((r) => r.userId)] }]))) {
    return <p role="alert" className="text-small text-error">{READ_NOT_LOGGED}</p>;
  }

  return (
    <section className="max-w-[60rem] space-y-10">
      <header>
        <h1 className="text-h3">Flags</h1>
        <p className="mt-2 text-small text-ink-2">
          Plays intake held back. Approving lets a play join the pool only if its run and its member share; editing changes the text, then approves; rejecting keeps it out for good.
        </p>
      </header>

      {plays.length === 0 ? (
        <p className="text-small text-ink-2">Nothing waiting.</p>
      ) : (
        <ul className="space-y-8">
          {plays.map((p) => {
            const fields = Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, k === "title" ? p.title : text(p.body[k])]));
            return (
              <li key={p.id} className="rounded-[8px] border border-rule bg-surface p-5">
                <h2 className="text-title">{p.title}</h2>
                <p className="mt-1 text-small text-ink-2 [overflow-wrap:anywhere]">
                  {p.category} · {p.who} · week of {p.weekOf} · run sharing {p.runSharing} ·{" "}
                  <Link href={`/admin/runs?id=${p.runId}`} className="tlink">
                    read the run
                  </Link>
                </p>
                <p className="mt-3 text-small">
                  <span className="font-[600]">Flagged:</span> {p.reasons.join("; ") || "no reason recorded"}
                  {p.fields.length > 0 && <span className="text-ink-2"> (in {p.fields.join(", ")})</span>}
                </p>
                <p className="mt-3 text-small">{text(p.body.description)}</p>
                <pre tabIndex={0} className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-[8px] bg-ground-2 p-4 text-meta [overflow-wrap:anywhere]">
                  {text(p.body.playbook_md)}
                </pre>
                <div className="mt-4">
                  <FlagDecision playId={p.id} fields={fields} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {runs.length > 0 && (
        <div>
          <h2 className="text-title">Runs flagged as a whole</h2>
          <p className="mt-1 text-small text-ink-2">Intake couldn’t read these into plays. Read the run; if it matters, add it again for the member from their user page.</p>
          <ul className="mt-3 text-small">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/runs?id=${r.id}`} className="tlink">
                  {r.who}, week of {r.weekOf}
                </Link>{" "}
                · {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
