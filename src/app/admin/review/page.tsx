import { connection } from "next/server";
import { ActionButton } from "@/components/app/admin-v3";
import { isAdmin } from "@/lib/admin-auth";
import { when } from "@/lib/admin/format";
import { query } from "@/lib/db-query";
import { reviewWeek } from "@/lib/review/evidence";
import { MAX_MODEL_ATTEMPTS } from "@/lib/review/job";
import { readV3Settings } from "@/lib/v3-settings";

/** "Run now" calls the review model (240-second timeout); server actions take the page's limit. */
export const maxDuration = 300;

type RunRow = {
  week_of: string;
  status: string;
  model_attempts: number;
  evidence_count: number | null;
  proposal_count: number | null;
  discarded: Record<string, number>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

const td = "py-2 pr-4 align-top";

/**
 * The review bot (B3 plan Unit 8): its recent runs and "Run now". Unit 10
 * adds the proposals. Runs hold counts and a fixed error label only, never
 * member text, so showing them is not a logged read.
 */
export default async function ReviewPage() {
  await connection();
  if (!(await isAdmin())) return null;
  const [settings, runs] = await Promise.all([
    readV3Settings(),
    query<RunRow>(
      `select week_of::text, status, model_attempts, evidence_count, proposal_count, discarded, error, started_at::text, finished_at::text
       from review_runs order by week_of desc limit 8`,
    ),
  ]);
  const week = reviewWeek(new Date());

  return (
    <section className="max-w-[60rem] space-y-10">
      <header>
        <h1 className="text-h3">Review bot</h1>
        <p className="mt-2 text-small text-ink-2">
          Review week of {week}. The bot is {settings.reviewBotOn ? "on" : "off (v3.reviewBotOn): neither the Friday run nor Run now does anything"}. It runs on Fridays, 14:15 to 16:45 UTC, once a week; the
          schedule stops after {MAX_MODEL_ATTEMPTS} failed model attempts. Run now runs this week at once, with no attempt limit, unless it is already done.
        </p>
        <div className="mt-4">
          <ActionButton action="runReview" label="Run now" pendingLabel="Running (up to five minutes)…" className="btn btn-s btn-ink" />
        </div>
      </header>

      <div>
        <h2 className="text-title">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="mt-3 text-small text-ink-2">No runs yet.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-left text-small tabular-nums">
            <thead>
              <tr className="border-b border-ink text-ink-2">
                {["Week", "Status", "Model attempts", "Evidence", "Proposals", "Discarded", "Started", "Finished"].map((h) => (
                  <th key={h} className="py-2 pr-4 font-[500]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.week_of} className="border-b border-rule">
                  <td className={td}>{r.week_of}</td>
                  <td className={td}>
                    {r.status}
                    {r.error ? <span className="block text-ink-2">{r.error}</span> : null}
                  </td>
                  <td className={td}>{r.model_attempts}</td>
                  <td className={td}>{r.evidence_count ?? ""}</td>
                  <td className={td}>{r.proposal_count ?? ""}</td>
                  <td className={td}>
                    {Object.entries(r.discarded ?? {})
                      .map(([k, n]) => `${k} ${n}`)
                      .join(", ") || "None"}
                  </td>
                  <td className={td}>{when(r.started_at)}</td>
                  <td className={td}>{r.finished_at ? when(r.finished_at) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
