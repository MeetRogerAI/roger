import { adminEmails } from "@/lib/auth/admin-emails";
import { addDays, currentMonday } from "@/lib/clock";
import type { Query } from "@/lib/db-query";

/**
 * The review bot's evidence for one review week (B3 plan Unit 7, origin R17
 * and R21). Code selects it, bounded, from the week's runs, flags and
 * rejections, Cora's outcomes, the picks' set-up rates, the instruction
 * versions in use, and members' feedback and cancellation reasons.
 *
 * Every item is UNTRUSTED DATA. It goes to the model only inside a dataTag()
 * element, and it is never stored with a proposal: a proposal keeps the
 * item's `ref` (kind and id), and /admin/review renders the source live, so
 * no member text outlives the account (R21). `member` marks text a member
 * (or a model reading their text) wrote, which the quote check runs against.
 *
 * Members only: admin accounts (ADMIN_EMAILS), test runs and dry-run lists
 * and picks are left out.
 */

export type EvidenceKind = "feedback" | "cancel_reason" | "play_flag" | "run_reason" | "cora_note" | "run_counts" | "cora_counts" | "pick_counts" | "versions";
export type EvidenceRef = { kind: "feedback" | "cancel_reason" | "play" | "run" | "cora_user_week" | "counts"; id: string };
export type EvidenceItem = { id: string; kind: EvidenceKind; ref: EvidenceRef; text: string; member: boolean };
type Draft = Omit<EvidenceItem, "id">;

export const EVIDENCE_LIMITS = { items: 80, itemChars: 600, totalChars: 40_000, feedbackDays: 14 } as const;

/** Selection order when a week has more than the limits allow: feedback first, then flags and rejections, then the counts. */
const PRIORITY: EvidenceKind[] = ["feedback", "cancel_reason", "play_flag", "run_reason", "cora_note", "run_counts", "cora_counts", "pick_counts", "versions"];

/** The review week: the latest list Monday at or before `now` (Toronto). */
export function reviewWeek(now: Date): string {
  return currentMonday(now);
}

const clip = (s: string, n: number = EVIDENCE_LIMITS.itemChars) => [...s.replace(/\r\n?/g, "\n").trim()].slice(0, n).join("");

const MEMBER = `u.id is not null and lower(u.email) <> all($2::text[])`;

export async function loadEvidence(q: Query, o: { week: string; now: Date; admins?: string[] }): Promise<{ items: EvidenceItem[]; empty: boolean }> {
  const admins = (o.admins ?? adminEmails()).map((e) => e.toLowerCase());
  const week = o.week;
  const prev = addDays(week, -7);
  const now = o.now.toISOString();
  const drafts: Draft[] = [];

  // Feedback from the last 14 days, newest first: notes and pasted replies.
  const feedback = await q<{ id: string; source: string; week_of: string | null; body: string }>(
    `select f.id, f.source, to_char(f.week_of, 'YYYY-MM-DD') as week_of, f.body
     from member_feedback f join users u on u.id = f.user_id
     where f.updated_at > $1::timestamptz - interval '${EVIDENCE_LIMITS.feedbackDays} days' and f.updated_at <= $1::timestamptz and ${MEMBER}
     order by f.updated_at desc, f.id limit ${EVIDENCE_LIMITS.items}`,
    [now, admins],
  );
  for (const f of feedback) {
    const label = f.source === "member_note" ? `A member's note on their list${f.week_of ? ` of ${f.week_of}` : ""}` : "A member's emailed reply";
    drafts.push({ kind: "feedback", ref: { kind: "feedback", id: f.id }, text: clip(`${label}: ${f.body}`), member: true });
  }

  // Cancellation reasons from the same 14 days, read in place on users.
  const cancels = await q<{ id: string; reason: string }>(
    `select u.id, u.cancel_reason as reason from users u
     where u.cancel_requested_at > $1::timestamptz - interval '${EVIDENCE_LIMITS.feedbackDays} days' and u.cancel_requested_at <= $1::timestamptz
       and nullif(trim(u.cancel_reason), '') is not null and ${MEMBER}
     order by u.cancel_requested_at desc, u.id limit ${EVIDENCE_LIMITS.items}`,
    [now, admins],
  );
  for (const c of cancels) drafts.push({ kind: "cancel_reason", ref: { kind: "cancel_reason", id: c.id }, text: clip(`A member's reason for cancelling: ${c.reason}`), member: true });

  // Plays flagged this week, by reason (the reasons can come from a model reading member text).
  const flags = await q<{ reason: string; n: number; sample: string }>(
    `select fr.reason, count(*)::int as n, (array_agg(p.id::text order by p.id))[1] as sample
     from plays p join runs r on r.id = p.run_id join users u on u.id = p.user_id,
          jsonb_array_elements_text(case when jsonb_typeof(p.flag->'reasons') = 'array' then p.flag->'reasons' else '[]'::jsonb end) as fr(reason)
     where p.week_of = $1::date and not r.is_test and r.status <> 'deleted' and ${MEMBER}
     group by fr.reason order by n desc, fr.reason limit 40`,
    [week, admins],
  );
  for (const f of flags) drafts.push({ kind: "play_flag", ref: { kind: "play", id: f.sample }, text: clip(`${f.n} play${f.n === 1 ? "" : "s"} flagged this week: ${f.reason}`), member: true });

  // Runs flagged or rejected as a whole, by reason.
  const reasons = await q<{ status: string; reason: string; n: number; sample: string }>(
    `select r.status, r.reason, count(*)::int as n, (array_agg(r.id::text order by r.received_at, r.id))[1] as sample
     from runs r join users u on u.id = r.user_id
     where r.week_of = $1::date and not r.is_test and r.status in ('flagged', 'rejected') and r.reason <> '' and ${MEMBER}
     group by r.status, r.reason order by n desc, r.reason limit 20`,
    [week, admins],
  );
  // A reason is a fixed template, but some quote a play's title (member text): the title becomes a
  // placeholder, reasons that then read the same are merged, and the text still counts as a member's.
  const merged = new Map<string, { n: number; sample: string }>();
  for (const r of reasons) {
    const text = `${r.status}: ${reasonTemplate(r.reason)}`;
    const m = merged.get(text);
    if (m) m.n += r.n;
    else merged.set(text, { n: r.n, sample: r.sample });
  }
  for (const [text, r] of merged) drafts.push({ kind: "run_reason", ref: { kind: "run", id: r.sample }, text: clip(`${r.n} run${r.n === 1 ? "" : "s"} ${text}`), member: true });

  // Cora's lists that came up short or empty, by note.
  const notes = await q<{ outcome: string; note: string; n: number; sample: string }>(
    `select c.outcome, c.note, count(*)::int as n, (array_agg(c.user_id::text order by c.user_id))[1] as sample
     from cora_user_weeks c join users u on u.id = c.user_id
     where c.week_of = $1::date and not c.dry_run and c.outcome in ('short', 'none') and ${MEMBER}
     group by c.outcome, c.note order by n desc, c.note limit 20`,
    [week, admins],
  );
  for (const n of notes) {
    drafts.push({
      kind: "cora_note",
      ref: { kind: "cora_user_week", id: `${n.sample}:${week}` },
      text: clip(`${n.n} ${n.n === 1 ? "member's list was" : "members' lists were"} ${n.outcome === "none" ? "empty" : "short"}${n.note ? `: ${n.note}` : " (no note)"}`),
      member: false,
    });
  }

  // Run counts by agent: status, and how many were read by the model rather than from the block.
  const runs = await q<{ agent: string; status: string; model: number; n: number }>(
    `select r.agent, r.status, count(*) filter (where r.parsed_by = 'model')::int as model, count(*)::int as n
     from runs r join users u on u.id = r.user_id
     where r.week_of = $1::date and not r.is_test and r.status <> 'deleted' and ${MEMBER}
     group by r.agent, r.status order by r.agent, r.status`,
    [week, admins],
  );
  const byAgent = new Map<string, { n: number; model: number; status: string[] }>();
  for (const r of runs) {
    const a = byAgent.get(r.agent || "unknown") ?? { n: 0, model: 0, status: [] };
    a.n += r.n;
    a.model += r.model;
    a.status.push(`${r.n} ${r.status}`);
    byAgent.set(r.agent || "unknown", a);
  }
  for (const [agent, a] of byAgent) {
    drafts.push({
      kind: "run_counts",
      ref: { kind: "counts", id: `runs:${week}:${agent}` },
      text: `Runs for the list of ${week} from ${agent}: ${a.n} in all (${a.status.join(", ")}). ${a.model} of ${a.n} read by the model rather than from the roger-run block.`,
      member: false,
    });
  }

  const cora = await q<{ outcome: string; n: number }>(
    `select c.outcome, count(*)::int as n from cora_user_weeks c join users u on u.id = c.user_id
     where c.week_of = $1::date and not c.dry_run and ${MEMBER} group by c.outcome order by c.outcome`,
    [week, admins],
  );
  if (cora.length) {
    drafts.push({ kind: "cora_counts", ref: { kind: "counts", id: `cora:${week}` }, text: `Cora's lists for ${week}: ${cora.map((c) => `${c.n} ${c.outcome}`).join(", ")}.`, member: false });
  }

  // Picks for this week and the one before: sent, opened, marked set up and confirmed, by position and by category.
  const picks = await q<{ week_of: string; by: string; key: string; sent: number; opened: number; marked: number; confirmed: number }>(
    `with p as (
       select to_char(p.week_of, 'YYYY-MM-DD') as week_of, p.position::text as position, pp.category, p.opened_at, p.setup_marked_at, p.setup_confirmed_at
       from picks p join pool_plays pp on pp.id = p.pool_play_id join users u on u.id = p.user_id
       where p.week_of in ($1::date, $3::date) and not p.dry_run and p.delivered_at is not null and ${MEMBER}
     )
     select week_of, g.by, g.key, count(*)::int as sent, count(opened_at)::int as opened, count(setup_marked_at)::int as marked, count(setup_confirmed_at)::int as confirmed
     from p, lateral (values ('position', p.position), ('category', p.category)) as g(by, key)
     group by week_of, g.by, g.key order by week_of desc, g.by desc, g.key`,
    [week, admins, prev],
  );
  for (const p of picks) {
    drafts.push({
      kind: "pick_counts",
      ref: { kind: "counts", id: `picks:${p.week_of}:${p.by}:${p.key}` },
      text: `Ideas sent for the list of ${p.week_of}, ${p.by === "position" ? `position ${p.key}` : `category ${p.key}`}: ${p.sent} sent, ${p.opened} opened, ${p.marked} marked set up, ${p.confirmed} confirmed set up.`,
      member: false,
    });
  }

  // The instruction versions the week's runs and lists used.
  const versions = await q<{ what: string; version: string | null; n: number }>(
    `select 'Zack ' || coalesce(nullif(r.agent, ''), 'unknown') as what, r.instructions_version as version, count(*)::int as n
     from runs r join users u on u.id = r.user_id
     where r.week_of = $1::date and not r.is_test and r.status <> 'deleted' and ${MEMBER} group by 1, 2
     union all
     select 'Cora method', c.method_version, count(*)::int from cora_user_weeks c join users u on u.id = c.user_id
     where c.week_of = $1::date and not c.dry_run and ${MEMBER} group by 1, 2
     order by 1, 2`,
    [week, admins],
  );
  if (versions.length) {
    drafts.push({
      kind: "versions",
      ref: { kind: "counts", id: `versions:${week}` },
      text: `Instruction versions in use for ${week}: ${versions.map((v) => `${v.what} ${v.version ? v.version.slice(0, 7) : "unknown"} (${v.n})`).join(", ")}.`,
      member: false,
    });
  }

  const items = bound(drafts);
  return { items, empty: !items.some((i) => i.kind !== "versions") };
}

const QUOTED = new RegExp(
  [`"[^"\\n]*"`, `${String.fromCharCode(0x201c)}[^${String.fromCharCode(0x201d)}\\n]*${String.fromCharCode(0x201d)}`, `(?<![\\p{L}\\p{N}])['${String.fromCharCode(0x2018)}][^'${String.fromCharCode(0x2019)}\\n]*['${String.fromCharCode(0x2019)}](?![\\p{L}\\p{N}])`].join("|"),
  "gu",
);

/**
 * A run's reason with anything quoted in it (a play's title, a value from the
 * report) replaced by a placeholder, so only the fixed template reaches the
 * model: `In "Inbox zero", the low end…` becomes `In "[a play title]", the low end…`.
 */
export function reasonTemplate(reason: string): string {
  return reason.replace(QUOTED, '"[a play title]"');
}

/** Keeps the highest-priority items within the limits, then numbers them e1, e2 … */
export function bound(drafts: Draft[]): EvidenceItem[] {
  const sorted = [...drafts].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
  const kept: Draft[] = [];
  let total = 0;
  for (const d of sorted) {
    const text = clip(d.text);
    const len = [...text].length;
    if (kept.length >= EVIDENCE_LIMITS.items || total + len > EVIDENCE_LIMITS.totalChars) continue;
    kept.push({ ...d, text });
    total += len;
  }
  return kept.map((d, i) => ({ id: `e${i + 1}`, ...d }));
}
