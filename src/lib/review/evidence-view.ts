import { adminEmails } from "@/lib/auth/admin-emails";
import type { Query } from "@/lib/db-query";
import type { ReadWhat } from "@/lib/admin/read-log";
import { loadEvidence } from "./evidence";

/**
 * A proposal's evidence on /admin/review (B3 plan Unit 10, R19, R21). A
 * proposal keeps references only (kind and id, with the bot's reason); each
 * one is read from its source when an admin opens the evidence, so a source
 * deleted with the member's account shows as gone.
 *
 * The result holds member text (notes, replies, cancellation reasons, play
 * titles, run reasons). The page must render it as text, and log the read
 * (`reads`, for logAdminReads) before showing it, fail-closed. A source that
 * is gone reads nobody.
 */

export type StoredEvidence = { kind: string; ref: string; why: string };
export type EvidenceShown = {
  kind: string;
  label: string;
  /** The source's text now, or null when it is gone. */
  text: string | null;
  why: string;
  /** Whether `text` came from a member (counts do not). */
  member: boolean;
  link?: { href: string; label: string };
};
export type EvidenceReads = { what: ReadWhat; userIds: string[] }[];

export const EVIDENCE_GONE = "No longer available. Deleted with the member's account.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LABEL: Record<string, string> = {
  feedback: "Feedback",
  cancel_reason: "A member's reason for cancelling",
  play: "A flagged play",
  run: "A run",
  cora_user_week: "A Cora list",
  counts: "Counts",
};
const ucfirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const userLink = (id: string) => ({ href: `/admin/users/${id}`, label: "The member's page" });
const runLink = (id: string) => ({ href: `/admin/runs?id=${id}`, label: "The run" });

export async function resolveEvidence(q: Query, refs: StoredEvidence[], o: { now: Date; admins?: string[] }): Promise<{ items: EvidenceShown[]; reads: EvidenceReads }> {
  const list = Array.isArray(refs) ? refs.filter((r) => r && typeof r === "object") : [];
  const ids = (kind: string) => [...new Set(list.filter((r) => r.kind === kind && UUID.test(String(r.ref))).map((r) => String(r.ref)))];
  const coraKeys = list
    .filter((r) => r.kind === "cora_user_week")
    .map((r) => String(r.ref).split(":"))
    .filter(([u, w, ...rest]) => UUID.test(u ?? "") && DATE.test(w ?? "") && !rest.length);

  const none = Promise.resolve([]);
  const [feedback, cancels, plays, runs, cora] = await Promise.all([
    ids("feedback").length
      ? q<{ id: string; user_id: string; source: string; week_of: string | null; body: string; entered_by: string | null }>(
          `select id, user_id, source, to_char(week_of, 'YYYY-MM-DD') as week_of, body, entered_by from member_feedback where id = any($1::uuid[])`,
          [ids("feedback")],
        )
      : none,
    ids("cancel_reason").length ? q<{ id: string; reason: string | null }>(`select id, cancel_reason as reason from users where id = any($1::uuid[])`, [ids("cancel_reason")]) : none,
    ids("play").length
      ? q<{ id: string; user_id: string | null; run_id: string; title: string; week_of: string; reasons: string[] }>(
          `select p.id, p.user_id, p.run_id, p.title, to_char(p.week_of, 'YYYY-MM-DD') as week_of,
                  array(select jsonb_array_elements_text(case when jsonb_typeof(p.flag->'reasons') = 'array' then p.flag->'reasons' else '[]'::jsonb end)) as reasons
           from plays p join runs r on r.id = p.run_id where p.id = any($1::uuid[]) and r.status <> 'deleted'`,
          [ids("play")],
        )
      : none,
    ids("run").length
      ? q<{ id: string; user_id: string | null; status: string; reason: string; week_of: string; agent: string }>(
          `select id, user_id, status, reason, to_char(week_of, 'YYYY-MM-DD') as week_of, agent from runs where id = any($1::uuid[]) and status <> 'deleted'`,
          [ids("run")],
        )
      : none,
    coraKeys.length
      ? q<{ user_id: string; week_of: string; outcome: string; note: string }>(
          `select c.user_id, to_char(c.week_of, 'YYYY-MM-DD') as week_of, c.outcome, c.note
           from cora_user_weeks c join jsonb_to_recordset($1::jsonb) as k(u uuid, w date) on c.user_id = k.u and c.week_of = k.w`,
          [JSON.stringify(coraKeys.map(([u, w]) => ({ u, w })))],
        )
      : none,
  ]);

  // Counts are recomputed with the bot's own definitions, for each week cited.
  const countWeeks = [
    ...new Set(
      list
        .filter((r) => r.kind === "counts")
        .map((r) => String(r.ref).split(":")[1])
        .filter((w): w is string => DATE.test(w ?? "")),
    ),
  ];
  const counts = new Map<string, string>();
  for (const week of countWeeks) {
    const { items } = await loadEvidence(q, { week, now: o.now, admins: o.admins ?? adminEmails() });
    for (const i of items) if (i.ref.kind === "counts") counts.set(i.ref.id, i.text);
  }

  const reads: Record<"read_feedback" | "read_runs" | "read_picks", string[]> = { read_feedback: [], read_runs: [], read_picks: [] };
  const items = list.map((r): EvidenceShown => {
    const ref = String(r.ref);
    const base = { kind: String(r.kind), label: LABEL[r.kind] ?? "Evidence", text: null, why: String(r.why ?? ""), member: r.kind !== "counts" };
    switch (r.kind) {
      case "feedback": {
        const f = feedback.find((x) => x.id === ref);
        if (!f) return base;
        reads.read_feedback.push(f.user_id);
        const label = f.source === "member_note" ? `A member's note on their list${f.week_of ? ` of ${f.week_of}` : ""}` : `A member's emailed reply${f.entered_by ? `, added by ${f.entered_by}` : ""}`;
        return { ...base, label, text: f.body, link: userLink(f.user_id) };
      }
      case "cancel_reason": {
        const c = cancels.find((x) => x.id === ref);
        if (!c || !c.reason?.trim()) return base;
        reads.read_feedback.push(c.id);
        return { ...base, text: c.reason, link: userLink(c.id) };
      }
      case "play": {
        const p = plays.find((x) => x.id === ref);
        // No member attached means no read we can log, so it shows as gone (B3 Unit 10 review).
        if (!p || !p.user_id) return base;
        reads.read_runs.push(p.user_id);
        const flagged = p.reasons.length ? ` Flagged: ${p.reasons.join("; ")}.` : " Not flagged now.";
        return { ...base, text: `“${p.title}”, for the list of ${p.week_of}.${flagged}`, link: runLink(p.run_id) };
      }
      case "run": {
        const x = runs.find((y) => y.id === ref);
        if (!x || !x.user_id) return base;
        reads.read_runs.push(x.user_id);
        return { ...base, text: `${ucfirst(x.status)} run for the list of ${x.week_of} from ${x.agent || "an unknown agent"}${x.reason ? `: ${x.reason}` : ""}`, link: runLink(x.id) };
      }
      case "cora_user_week": {
        const [u, w] = ref.split(":");
        const c = cora.find((x) => x.user_id === u && x.week_of === w);
        if (!c) return base;
        reads.read_picks.push(c.user_id);
        return { ...base, text: `The list for ${c.week_of} was ${c.outcome}${c.note ? `: ${c.note}` : ""}`, link: userLink(c.user_id) };
      }
      case "counts": {
        const t = counts.get(ref);
        return t ? { ...base, text: t } : base;
      }
      default:
        return base;
    }
  });
  return {
    items,
    reads: (["read_feedback", "read_runs", "read_picks"] as const).map((what) => ({ what, userIds: reads[what] })),
  };
}
