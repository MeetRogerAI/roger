import Link from "next/link";
import { connection } from "next/server";
import { PlayEdit } from "@/components/app/admin-v3";
import { isAdmin } from "@/lib/admin-auth";
import { EDITABLE_FIELDS, flaggedRunsWithoutPlays, heldCount, listAutoLog, type LogEntry } from "@/lib/admin/flags";
import { query } from "@/lib/db-query";

const text = (v: unknown) => (typeof v === "string" ? v : "");

const ACTION_WORDS: Record<string, string> = { drafted: "Steps drafted by Roger", redacted: "Names redacted", outline_only: "Outline only" };

function what(p: LogEntry): string {
  if (p.kind === "dropped") return "Dropped for harm";
  return p.actions.map((a) => ACTION_WORDS[a] ?? a).join(", ") || "Fixed";
}

/**
 * Flags (spec B.6, B.12; a read-only log since 2026-11-27, Peter): what
 * intake fixed and admitted, and what it dropped for harm, with the reasons.
 * An admitted play's text can still be edited.
 */
export default async function FlagsPage() {
  await connection();
  if (!(await isAdmin())) return null;
  const [plays, runs, held] = await Promise.all([listAutoLog(query), flaggedRunsWithoutPlays(query), heldCount(query)]);

  return (
    <section className="max-w-[60rem] space-y-10">
      <header>
        <h1 className="text-h3">Flags</h1>
        <p className="mt-2 text-small text-ink-2">
          Nothing waits for a decision. Intake drafts a missing playbook, redacts unclear names, keeps what it can’t make safe as an outline only, and admits the play. It drops anything that could harm
          whoever runs it. This is the log of both, newest week first. Edit an admitted play to improve its text.
        </p>
        {held > 0 && (
          <p className="mt-3 text-small">
            <span className="font-[600]">{held === 1 ? "1 play is" : `${held} plays are`} still held from before automatic admission.</span> The backfill (scripts/auto-admit-held.ts) admits or drops
            them.
          </p>
        )}
      </header>

      {plays.length === 0 ? (
        <p className="text-small text-ink-2">Nothing fixed or dropped yet.</p>
      ) : (
        <ul className="space-y-8">
          {plays.map((p) => {
            const fields = Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, k === "title" ? p.title : text(p.body[k])]));
            return (
              <li key={p.id} className="rounded-[8px] border border-rule bg-surface p-5">
                <h2 className="text-title">{p.title}</h2>
                <p className="mt-1 text-small text-ink-2 [overflow-wrap:anywhere]">
                  {p.category} · {p.who} · week of {p.weekOf} · {p.kind === "dropped" ? "not in the pool" : p.inPool ? "in the pool" : p.shareable ? "joins the pool at the next Cora run" : "not shared"} ·{" "}
                  <Link href={`/admin/runs?id=${p.runId}`} className="tlink">
                    read the run
                  </Link>
                </p>
                <p className="mt-3 text-small">
                  <span className="font-[600]">{what(p)}:</span> {p.reasons.join("; ") || "no reason recorded"}
                  {p.fields.length > 0 && <span className="text-ink-2"> (in {p.fields.join(", ")})</span>}
                </p>
                <p className="mt-3 text-small">{text(p.body.description)}</p>
                <pre tabIndex={0} className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-[8px] bg-ground-2 p-4 text-meta [overflow-wrap:anywhere]">
                  {text(p.body.playbook_md)}
                </pre>
                {p.kind === "fixed" && (
                  <div className="mt-4">
                    <PlayEdit playId={p.id} fields={fields} />
                  </div>
                )}
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
