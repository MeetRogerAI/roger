import Link from "next/link";
import { connection } from "next/server";
import { ApproveButton, RejectForm, ReviewJobButton, ReviewMessages } from "@/components/admin/review-proposal";
import { adminIdentity, isAdmin } from "@/lib/admin-auth";
import { when } from "@/lib/admin/format";
import { READ_NOT_LOGGED, readsLogged } from "@/lib/admin/read-log";
import { query } from "@/lib/db-query";
import { overlapText, overlapWarning } from "@/lib/review/approve";
import { beforeAfter, type BeforeAfter, type FileBeforeAfter, TOO_FEW, WEEKS_EACH_SIDE, type ZackSide } from "@/lib/review/before-after";
import { reviewWeek } from "@/lib/review/evidence";
import { EVIDENCE_GONE, resolveEvidence, type EvidenceShown, type StoredEvidence } from "@/lib/review/evidence-view";
import { reviewGitHub, reviewSyncGitHub } from "@/lib/review/github";
import { MAX_MANUAL_ATTEMPTS, MAX_MODEL_ATTEMPTS } from "@/lib/review/job";
import { readInstructionFiles } from "@/lib/review/propose";
import { readV3Settings } from "@/lib/v3-settings";
import { isRepoPullUrl } from "@/lib/review/pr-url";

/** "Run now" calls the review model (240-second timeout); server actions take the page's limit. */
export const maxDuration = 300;

/**
 * /admin/review (B3 plan Units 8 to 10): the review bot's proposals by
 * status, approve and reject, the pull requests, before and after for merged
 * Zack proposals, and the bot's recent runs.
 *
 * Member text appears only in a proposal's evidence, which is closed until an
 * admin opens it (?evidence={public_id}). Opening it reads each source live
 * and writes the read log first; if that write fails, no evidence is shown
 * (fail-closed). Everything else here (diffs, rationales, counts, admin
 * notes) holds no member text, and React renders all of it as text.
 */

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

type Payload = { why?: string | null; main_commit?: string; branch?: string; title?: string; writes?: { method?: string; path?: string }[]; supersedes?: string[] };

type ProposalRow = {
  public_id: string;
  review_week: string;
  paths: string[];
  base_versions: Record<string, string> | null;
  result_versions: Record<string, string> | null;
  diff_text: string;
  rationale: string;
  evidence: StoredEvidence[] | null;
  guardrail: boolean;
  guardrail_reasons: string[] | null;
  blocked_reason: string | null;
  status: string;
  first_read_by: string | null;
  first_read_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  reject_note: string | null;
  pr_number: number | null;
  pr_url: string | null;
  merged_at: string | null;
  closed_at: string | null;
  edited_before_merge: boolean;
  close_pending: boolean;
  dry_run_payload: Payload | string | null;
  check_note: string | null;
  error: string | null;
  document_only: boolean;
  created_at: string;
  superseded_by: string | null;
};

/** At most this many proposals are listed, newest first. */
const LIST_LIMIT = 200;
const PUBLIC_ID = /^[a-z2-7]{10}$/;
const DOCUMENT_ONLY = "Document only — needs a matching code change";

const SECTIONS: { title: string; statuses: string[]; empty: string }[] = [
  { title: "Waiting for review", statuses: ["pending", "first_read", "approving"], empty: "Nothing is waiting." },
  { title: "Blocked", statuses: ["blocked"], empty: "None." },
  { title: "Open pull requests", statuses: ["pr_open"], empty: "None." },
  { title: "Merged", statuses: ["merged"], empty: "None." },
  { title: "Rejected, stale, dry runs and closed", statuses: ["rejected", "stale", "dry_run", "closed", "superseded"], empty: "None." },
];

const STATUS_WORDS: Record<string, string> = {
  pending: "Waiting for review",
  first_read: "First read given; waiting for a second read by a different admin",
  approving: "Being approved now",
  blocked: "Blocked: it can't be approved",
  pr_open: "Pull request open",
  merged: "Merged",
  closed: "Closed on GitHub without merging",
  superseded: "Superseded",
  stale: "Stale: main no longer has the lines it edits",
  dry_run: "Dry run recorded: nothing was sent to GitHub",
  rejected: "Rejected",
};

const APPROVABLE = ["pending", "first_read", "dry_run"];
const REJECTABLE = ["pending", "first_read", "blocked", "dry_run"];
/** Statuses whose card shows the overlap warning (Unit 9): before approving, and while its PR is open. */
const OVERLAP_SHOWN = ["pending", "first_read", "dry_run", "pr_open"];

const td = "py-2 pr-4 align-top";
const th = "py-2 pr-4 font-[500] align-bottom text-left";
const meta = "text-small text-ink-2";
const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "none");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const asPayload = (p: ProposalRow["dry_run_payload"]): Payload | null => {
  if (!p) return null;
  if (typeof p !== "string") return p;
  try {
    return JSON.parse(p) as Payload;
  } catch {
    return null;
  }
};

export default async function ReviewPage({ searchParams }: PageProps<"/admin/review">) {
  await connection();
  if (!(await isAdmin())) return null;
  const by = await adminIdentity();
  if (!by) return null;
  const sp = await searchParams;
  const open = typeof sp.evidence === "string" && PUBLIC_ID.test(sp.evidence) ? sp.evidence : null;

  const [settings, runs, proposals] = await Promise.all([
    readV3Settings(),
    query<RunRow>(
      `select week_of::text, status, model_attempts, evidence_count, proposal_count, discarded, error, started_at::text, finished_at::text
       from review_runs order by week_of desc limit 8`,
    ),
    query<ProposalRow>(
      `select p.public_id, p.review_week::text, p.paths, p.base_versions, p.result_versions, p.diff_text, p.rationale, p.evidence, p.guardrail, p.guardrail_reasons,
              p.blocked_reason, p.status, p.first_read_by, p.first_read_at::text, p.approved_by, p.approved_at::text, p.rejected_by, p.rejected_at::text, p.reject_note,
              p.pr_number, p.pr_url, p.merged_at::text, p.closed_at::text, p.edited_before_merge, p.close_pending, p.dry_run_payload, p.check_note, p.error,
              p.document_only, p.created_at::text, s.public_id as superseded_by
       from review_proposals p left join review_proposals s on s.id = p.superseded_by
       order by p.created_at desc, p.public_id limit ${LIST_LIMIT}`,
    ),
  ]);
  const week = reviewWeek(new Date());
  const mode = reviewGitHub(settings);
  const sync = reviewSyncGitHub();

  // Overlap warnings against the deployed files (approval decides again against main).
  const files = readInstructionFiles();
  const overlaps = new Map<string, string>();
  for (const p of proposals.filter((x) => OVERLAP_SHOWN.includes(x.status))) {
    const o = await overlapWarning(query, p.public_id, files);
    if (o.length) overlaps.set(p.public_id, overlapText(o));
  }

  const measured = new Map<string, BeforeAfter>();
  const merged = proposals.filter((x) => x.status === "merged");
  (await Promise.all(merged.map((p) => beforeAfter(query, p)))).forEach((m, i) => measured.set(merged[i].public_id, m));

  // The one opened proposal's evidence: read live, logged before it is shown.
  let evidence: { id: string; items: EvidenceShown[] | null } | null = null;
  const opened = open ? proposals.find((p) => p.public_id === open) : undefined;
  if (opened) {
    const r = await resolveEvidence(query, opened.evidence ?? [], { now: new Date() });
    evidence = { id: opened.public_id, items: (await readsLogged(query, by, "/admin/review", r.reads)) ? r.items : null };
  }

  return (
    <section className="max-w-[60rem] space-y-10">
      <ReviewMessages>
        <header className="space-y-3">
          <h1 className="text-h3">Review bot</h1>
          <p className={`rounded-[var(--radius-control)] border px-4 py-3 text-small ${mode.live ? "border-accent text-accent" : "border-rule text-ink"}`}>
            {mode.live
              ? "Live: approving opens a real pull request on MeetRogerAI/roger."
              : `Dry run: no pull requests are opened here (${mode.why}). Approving checks the change against main and records what would be sent.`}
          </p>
          <p className={meta}>
            Review week of {week}. The bot is {settings.reviewBotOn ? "on" : "off (v3.reviewBotOn): neither the Friday run nor Run now does anything"}. It runs on Fridays, 14:15 to 16:45 UTC, once a week;
            the schedule stops after {MAX_MODEL_ATTEMPTS} failed model attempts. Run now runs this week at once, up to {MAX_MANUAL_ATTEMPTS} model attempts a week of its own, unless it is already done. Refresh from GitHub records merged and closed
            pull requests{sync.live ? "" : `, and does nothing here (${sync.why})`}.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ReviewJobButton job="run" />
            <ReviewJobButton job="refresh" />
          </div>
        </header>

        {SECTIONS.map((s) => {
          const list = proposals.filter((p) => s.statuses.includes(p.status));
          const hid = `h-${s.statuses[0]}`;
          return (
            <section key={s.title} aria-labelledby={hid} className="mt-10 space-y-4">
              <h2 id={hid} className="text-title">
                {s.title} ({list.length})
              </h2>
              {list.length === 0 ? (
                <p className={meta}>{s.empty}</p>
              ) : (
                list.map((p) => (
                  <Proposal
                    key={p.public_id}
                    p={p}
                    overlap={overlaps.get(p.public_id) ?? null}
                    measured={measured.get(p.public_id) ?? null}
                    evidence={evidence?.id === p.public_id ? evidence.items : undefined}
                    dryRun={!mode.live}
                  />
                ))
              )}
            </section>
          );
        })}

        <section aria-labelledby="h-runs" className="mt-10">
          <h2 id="h-runs" className="text-title">
            Recent runs
          </h2>
          {runs.length === 0 ? (
            <p className={`mt-3 ${meta}`}>No runs yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-small tabular-nums">
                <caption className="sr-only">The review bot&rsquo;s runs, newest week first, with the proposals stored and discarded</caption>
                <thead>
                  <tr className="border-b border-ink text-ink-2">
                    {["Week", "Status", "Model attempts", "Evidence", "Proposals", "Discarded", "Started", "Finished"].map((h) => (
                      <th key={h} scope="col" className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.week_of} className="border-b border-rule">
                      <th scope="row" className={`${td} font-[400]`}>
                        {r.week_of}
                      </th>
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
            </div>
          )}
        </section>
      </ReviewMessages>
    </section>
  );
}

function approveLabel(p: ProposalRow, dryRun: boolean): string {
  if (p.guardrail && p.status !== "first_read" && !p.first_read_by) return "Give the first read";
  const opens = dryRun ? "record a dry run" : "open the pull request";
  if (p.guardrail) return `Give the second read and ${opens}`;
  return dryRun ? "Approve (dry run)" : "Approve and open the pull request";
}

function Proposal({ p, overlap, measured, evidence, dryRun }: { p: ProposalRow; overlap: string | null; measured: BeforeAfter | null; evidence: EvidenceShown[] | null | undefined; dryRun: boolean }) {
  const hid = `p-${p.public_id}-h`;
  const refs = Array.isArray(p.evidence) ? p.evidence : [];
  const payload = p.status === "dry_run" ? asPayload(p.dry_run_payload) : null;
  const prLink = p.pr_number && isRepoPullUrl(p.pr_url) ? p.pr_url : null;
  return (
    <article id={`p-${p.public_id}`} aria-labelledby={hid} className="space-y-3 rounded-[var(--radius-object)] border border-rule bg-surface p-5">
      <header>
        <h3 id={hid} className="text-body font-[600] [overflow-wrap:anywhere]">
          Proposal {p.public_id}: {p.paths.join(", ")}
        </h3>
        <p className={meta}>
          {p.status === "superseded" && p.superseded_by ? `Superseded by ${p.superseded_by}` : (STATUS_WORDS[p.status] ?? p.status)}. Review week of {p.review_week}, proposed {when(p.created_at)}.
        </p>
      </header>

      <ul className="flex flex-wrap gap-2 text-meta">
        {p.document_only && <li className="rounded-full border border-rule-strong px-3 py-1">{DOCUMENT_ONLY}</li>}
        {p.guardrail && <li className="rounded-full border border-accent px-3 py-1 text-accent">Needs a second read by a different admin</li>}
      </ul>
      {p.guardrail && (p.guardrail_reasons ?? []).length > 0 && <p className={meta}>Why: {(p.guardrail_reasons ?? []).join("; ")}.</p>}
      {p.first_read_by && (
        <p className="text-small">
          First read given by {p.first_read_by}, {when(p.first_read_at)}.
        </p>
      )}
      {p.blocked_reason && <p className="text-small text-error">Blocked: {p.blocked_reason}</p>}
      {p.check_note && <p className="text-small text-error">{p.check_note}</p>}
      {p.error && <p className="text-small text-error">{p.error}</p>}
      {overlap && <p className="text-small text-error">Overlap: {overlap}</p>}

      <div>
        <h4 className="text-meta font-[600] text-ink-2">Why the bot proposes it</h4>
        <p className="text-small [overflow-wrap:anywhere]">{p.rationale || "No reason given."}</p>
      </div>
      <div>
        <h4 className="text-meta font-[600] text-ink-2">The change</h4>
        <pre aria-label={`The change proposed in ${p.public_id}`} className="mt-1 max-h-[28rem] overflow-auto rounded-[var(--radius-control)] border border-rule bg-ground p-3 font-mono text-meta whitespace-pre">
          <code>{p.diff_text}</code>
        </pre>
      </div>

      {p.pr_number ? (
        <p className="text-small">
          {prLink ? (
            <a href={prLink} className="tlink" target="_blank" rel="noreferrer">
              Pull request #{p.pr_number}
            </a>
          ) : (
            `Pull request #${p.pr_number}`
          )}
          : {STATUS_WORDS[p.status] ?? p.status}
          {p.merged_at ? `, merged ${when(p.merged_at)}` : ""}
          {p.closed_at ? `, closed ${when(p.closed_at)}` : ""}
          {p.close_pending ? ". Closing it on GitHub failed; the next sync tries again" : ""}.
        </p>
      ) : null}
      {p.approved_by && p.status !== "rejected" && (
        <p className={meta}>
          Approved by {p.approved_by}, {when(p.approved_at)}.
        </p>
      )}
      {p.status === "rejected" && (
        <div className="text-small">
          <p>
            Rejected by {p.rejected_by ?? "an admin"}, {when(p.rejected_at)}.
          </p>
          {p.reject_note && <p className="text-ink-2 [overflow-wrap:anywhere]">Note: {p.reject_note}</p>}
        </div>
      )}
      {payload && <DryRun payload={payload} />}

      {p.status === "merged" && measured && <Measured m={measured} edited={p.edited_before_merge} />}

      <EvidenceBlock id={p.public_id} count={refs.length} items={evidence} />

      {(APPROVABLE.includes(p.status) || REJECTABLE.includes(p.status)) && (
        <div className="flex flex-wrap items-start gap-6 border-t border-rule pt-4">
          {APPROVABLE.includes(p.status) && <ApproveButton proposal={p.public_id} label={approveLabel(p, dryRun)} />}
          {REJECTABLE.includes(p.status) && (
            <div className="min-w-[16rem] flex-1">
              <RejectForm proposal={p.public_id} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function DryRun({ payload }: { payload: Payload }) {
  const writes = Array.isArray(payload.writes) ? payload.writes : [];
  return (
    <div className="text-small">
      <h4 className="text-meta font-[600] text-ink-2">What the dry run would have sent</h4>
      <p>
        Branch {payload.branch ?? "unknown"} on main at {short(payload.main_commit)}
        {payload.title ? `, titled “${payload.title}”` : ""}
        {payload.why ? `. Not sent because ${payload.why}` : ""}.
      </p>
      {writes.length > 0 && (
        <ul className="mt-1 list-disc pl-5 font-mono text-meta">
          {writes.map((w, i) => (
            <li key={i}>
              {String(w.method ?? "")} {String(w.path ?? "")}
            </li>
          ))}
        </ul>
      )}
      {(payload.supersedes ?? []).length > 0 && <p className="mt-1">Would close, as superseded: {(payload.supersedes ?? []).join(", ")}.</p>}
    </div>
  );
}

function EvidenceBlock({ id, count, items }: { id: string; count: number; items: EvidenceShown[] | null | undefined }) {
  if (count === 0) return <p className={meta}>No evidence cited.</p>;
  if (items === undefined)
    return (
      <p className="text-small">
        <Link href={`/admin/review?evidence=${id}#evidence-${id}`} className="tlink">
          Show the evidence ({plural(count, "item")})
        </Link>{" "}
        <span className="text-ink-2">Opening it shows members&rsquo; words and is logged.</span>
      </p>
    );
  return (
    <section id={`evidence-${id}`} aria-labelledby={`evidence-${id}-h`} tabIndex={-1} className="space-y-2">
      <h4 id={`evidence-${id}-h`} className="text-meta font-[600] text-ink-2">
        Evidence, read now from its sources
      </h4>
      {items === null ? (
        <p role="alert" className="text-small text-error">
          {READ_NOT_LOGGED}
        </p>
      ) : (
        <ol className="space-y-2 text-small">
          {items.map((e, i) => (
            <li key={i} className="border-l-2 border-rule pl-3">
              <p className="font-[600]">{e.label}</p>
              {e.text === null ? <p className="text-ink-2">{EVIDENCE_GONE}</p> : <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{e.text}</p>}
              {e.why && <p className="text-ink-2">Why the bot cited it: {e.why}</p>}
              {e.link && (
                <Link href={e.link.href} className="tlink">
                  {e.link.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-small">
        <Link href={`/admin/review#p-${id}`} className="tlink">
          Hide the evidence
        </Link>
      </p>
    </section>
  );
}

const pct = (num: number, den: number) => (den === 0 ? "No runs" : `${Math.round((100 * num) / den)}% (${num} of ${den})`);
const perRun = (plays: number, runs: number) => (runs === 0 ? "No runs" : `${(plays / runs).toFixed(1)} (${plays} plays, ${plural(runs, "run")})`);

function Measured({ m, edited }: { m: BeforeAfter; edited: boolean }) {
  if (m.kind === "document_only") return <p className={meta}>No before and after: {DOCUMENT_ONLY.toLowerCase()}. No code reads Cora&rsquo;s file, so its runs can&rsquo;t show this change.</p>;
  if (m.kind === "no_merge_date") return <p className={meta}>No before and after: the merge date isn&rsquo;t recorded. Refresh from GitHub to record it.</p>;
  return (
    <div className="space-y-4">
      <p className={meta}>
        Before and after the merge (list week of {m.mergedWeek}), {WEEKS_EACH_SIDE} list weeks each side, members&rsquo; runs stamped with each version from an instructions fetch.
        {edited ? " Edited on GitHub before merging: after is the first new version runs used after the merge." : ""}
      </p>
      {m.files.map((f) => (
        <FileMeasures key={f.path} f={f} />
      ))}
    </div>
  );
}

function FileMeasures({ f }: { f: FileBeforeAfter }) {
  const rows: [string, (s: ZackSide) => string][] = [
    ["Runs measured", (s) => String(s.n)],
    ["Accepted", (s) => pct(s.accepted, s.n)],
    ["Flagged", (s) => pct(s.flagged, s.n)],
    ["Rejected", (s) => pct(s.rejected, s.n)],
    ["Read from the block, not by the model", (s) => pct(s.fromBlock, s.parsed)],
    ["Plays per accepted run", (s) => perRun(s.plays, s.accepted)],
  ];
  const afterHead =
    f.afterFrom === "none" ? "After (no new version yet)" : `After, ${short(f.after.version)}${f.afterFrom === "edited_fallback" ? " (edited on GitHub before merging)" : ""}`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-small tabular-nums">
        <caption className="mb-2 text-left text-small font-[600]">Before and after: {f.path}</caption>
        <thead>
          <tr className="border-b border-ink text-ink-2">
            <th scope="col" className={th}>
              Measure
            </th>
            <th scope="col" className={th}>
              Before, {short(f.before.version)}
            </th>
            <th scope="col" className={th}>
              {afterHead}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-rule">
              <th scope="row" className={`${td} font-[400]`}>
                {label}
              </th>
              <td className={td}>{value(f.before)}</td>
              <td className={td}>{value(f.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {f.tooFew && (
        <p className="mt-2 text-small font-[600]">
          Too few to compare: fewer than {TOO_FEW} runs on a side ({f.before.n} before, {f.after.n} after).
        </p>
      )}
      {f.before.deployed + f.after.deployed > 0 && (
        <p className={`mt-1 ${meta}`}>
          Not counted: runs with no instructions fetch behind them, stamped with the deployed version ({f.before.deployed} before, {f.after.deployed} after).
        </p>
      )}
    </div>
  );
}
