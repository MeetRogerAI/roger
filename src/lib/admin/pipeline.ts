import { adminEmails as configuredAdmins } from "@/lib/auth/admin-emails";
import type { Query } from "@/lib/db-query";
import { referralEmailKey } from "@/lib/referrals/attribution";
import { FIRST_LIST_SQL } from "./measures";

/**
 * The pipeline on /admin/pipeline (B3 Unit 4; spec B.16 "Pipeline"): every
 * person from first touch through trial to paying, with the date of each
 * stage and where they came from.
 *
 * One row per person, keyed by `referralEmailKey` (dots and plus-tags don't
 * make a new person). The SQL returns one row per touch, from members,
 * leads, session guests and open invitations, and `loadPipeline` merges
 * them in code so the key is the exact function attribution uses. Admin
 * addresses (ADMIN_EMAILS, by the same key) never appear. A guest or
 * invitation whose address was cleared (the 90-day retention) has no key, so
 * it is only counted (`CLEARED_SQL`).
 */

/** Rows per page. */
export const PIPELINE_PAGE = 200;

export const STAGES = ["lead", "invited", "started", "signed_up", "trial", "paying", "sponsored"] as const;
export type Stage = (typeof STAGES)[number];
export const SOURCES = ["waitlist", "pack", "interest", "not ready", "guest", "referral", "sign-up"] as const;
export type Source = (typeof SOURCES)[number];

const LEAD_KINDS: Record<string, Source> = { not_open: "waitlist", pack: "pack", interest: "interest", not_ready: "not ready" };
/** Tie-break for touches at the same instant: a link referral is made the moment the account is. */
const TOUCH_ORDER: Source[] = ["waitlist", "pack", "interest", "not ready", "guest", "referral", "sign-up"];

const ISO = (x: string) => `to_char((${x}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * One row per touch. kind: member (a users row), lead, guest (a session
 * guest whose address is kept) or invited (an open referral invitation, not
 * yet an account). `at` is the touch: the account's creation, the lead's
 * first_seen_at, the guest's invitation, the referral's created_at. For a
 * member, via_* is their own non-void referral (who referred them, and when
 * the name was given). Signed up and first list follow the Measure
 * Definitions (`su(u)`, `fl(u)`).
 */
export const PIPELINE_SQL = `
  select 'member' as kind, u.email, u.id::text as user_id, ${ISO("u.created_at")} as at, null::text as lead_kind,
         ${ISO("coalesce(u.signup_finished_at, case when u.status <> 'signup' then u.created_at end)")} as signed_up_at,
         ${ISO(FIRST_LIST_SQL("u"))} as first_list_at,
         ${ISO("u.trial_started_at")} as card_at, ${ISO("u.first_charge_at")} as paying_at, ${ISO("u.access_ends_at")} as ended_at,
         u.status, s.name as sponsor, u.ref, u.utm,
         r.referrer_id::text as via_id, nullif(v.display_name, '') as via_name, r.source as via_source, ${ISO("r.created_at")} as via_at
  from users u
  left join sponsors s on s.id = u.sponsor_id
  left join referrals r on r.referred_user_id = u.id and r.stage <> 'void'
  left join users v on v.id = r.referrer_id
  union all
  select 'lead', l.email, null, ${ISO("l.first_seen_at")}, l.kind, null, null, null, null, null, null, null, null, l.utm, null, null, null, null
  from leads l
  union all
  select 'guest', g.email, null, ${ISO("g.created_at")}, null, null, null, null, null, null, null, null, null, null,
         g.inviter_id::text, nullif(v.display_name, ''), 'guest', ${ISO("g.created_at")}
  from session_guests g join users v on v.id = g.inviter_id
  where g.email is not null
  union all
  select 'invited', r.referred_email, null, ${ISO("r.created_at")}, null, null, null, null, null, null, null, null, null, null,
         r.referrer_id::text, nullif(v.display_name, ''), r.source, ${ISO("r.created_at")}
  from referrals r left join users v on v.id = r.referrer_id
  where r.referred_user_id is null and r.referred_email is not null and r.stage <> 'void'`;

/**
 * People invited whose details were cleared: session guests purged after 90
 * days, and open invitations whose address was cleared with no session row
 * (a purged guest's invitation is counted once, through its guest row).
 */
export const CLEARED_SQL = `
  select ((select count(*) from session_guests where email is null)
        + (select count(*) from referrals r
           where r.referred_user_id is null and r.referred_email is null and r.stage = 'invited'
             and not exists (select 1 from session_guests g where g.referral_id = r.id)))::int as n`;

type TouchRow = {
  kind: "member" | "lead" | "guest" | "invited";
  email: string;
  user_id: string | null;
  at: string;
  lead_kind: string | null;
  signed_up_at: string | null;
  first_list_at: string | null;
  card_at: string | null;
  paying_at: string | null;
  ended_at: string | null;
  status: string | null;
  sponsor: string | null;
  ref: string | null;
  utm: string | null;
  via_id: string | null;
  via_name: string | null;
  via_source: "link" | "guest" | null;
  via_at: string | null;
};

/** Who a person came through: a member's referral link, or a member's guest invitation. `id` is null when that member was deleted. */
export type Via = { id: string | null; name: string | null; kind: "referral" | "guest" };

export type Person = {
  key: string;
  email: string;
  userId: string | null;
  stage: Stage;
  firstTouch: { at: string; source: Source };
  leadAt: string | null;
  leadKind: Source | null;
  guestAt: string | null;
  invitedAt: string | null;
  signedUpAt: string | null;
  firstListAt: string | null;
  cardAt: string | null;
  payingAt: string | null;
  endedAt: string | null;
  status: string | null;
  sponsor: string | null;
  via: Via | null;
  ref: string;
  utm: string;
};

export type Pipeline = { counts: Record<Stage, number>; total: number; rows: Person[]; page: number; pages: number; cleared: number };

const earlier = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a <= b ? a : b);

type Draft = Omit<Person, "stage" | "firstTouch" | "via"> & { touches: { at: string; source: Source }[]; vias: (Via & { at: string })[]; memberVia: Via | null; member: boolean };

function stageOf(p: Draft): Stage {
  if (p.member) {
    if (!p.signedUpAt) return "started";
    if (p.sponsor) return "sponsored";
    if (p.payingAt) return "paying";
    if (p.firstListAt || p.cardAt) return "trial";
    return "signed_up";
  }
  return p.guestAt || p.invitedAt ? "invited" : "lead";
}

/** Merges the touches into one person per address key, admins left out. */
export function mergeTouches(rows: TouchRow[], admins: string[]): Person[] {
  const adminKeys = new Set(admins.map(referralEmailKey));
  const people = new Map<string, Draft>();
  for (const r of rows) {
    const key = referralEmailKey(r.email);
    if (adminKeys.has(key)) continue;
    let p = people.get(key);
    if (!p) {
      p = { key, email: r.email, userId: null, leadAt: null, leadKind: null, guestAt: null, invitedAt: null, signedUpAt: null, firstListAt: null, cardAt: null, payingAt: null, endedAt: null, status: null, sponsor: null, ref: "", utm: "", touches: [], vias: [], memberVia: null, member: false };
      people.set(key, p);
    }
    const viaKind = r.via_source === "guest" ? "guest" : "referral";
    if (r.kind === "member") {
      if (!p.member) {
        Object.assign(p, {
          member: true,
          email: r.email,
          userId: r.user_id,
          signedUpAt: r.signed_up_at,
          firstListAt: r.first_list_at,
          cardAt: r.card_at,
          payingAt: r.paying_at,
          endedAt: r.ended_at,
          status: r.status,
          sponsor: r.sponsor,
          ref: r.ref ?? "",
          utm: r.utm || p.utm,
        });
        if (r.via_source && r.via_at) {
          p.memberVia = { id: r.via_id, name: r.via_name, kind: viaKind };
          p.invitedAt = earlier(p.invitedAt, r.via_at);
          p.touches.push({ at: r.via_at, source: viaKind });
        }
      }
      p.touches.push({ at: r.at, source: "sign-up" });
    } else if (r.kind === "lead") {
      const source = LEAD_KINDS[r.lead_kind ?? ""] ?? "interest";
      if (p.leadAt === null || r.at < p.leadAt) p.leadKind = source;
      p.leadAt = earlier(p.leadAt, r.at);
      if (!p.utm) p.utm = r.utm ?? "";
      p.touches.push({ at: r.at, source });
    } else {
      if (r.kind === "guest") p.guestAt = earlier(p.guestAt, r.at);
      else p.invitedAt = earlier(p.invitedAt, r.at);
      p.vias.push({ id: r.via_id, name: r.via_name, kind: viaKind, at: r.at });
      p.touches.push({ at: r.at, source: viaKind });
    }
  }
  return [...people.values()].map((d) => {
    const first = [...d.touches].sort((a, b) => a.at.localeCompare(b.at) || TOUCH_ORDER.indexOf(a.source) - TOUCH_ORDER.indexOf(b.source))[0];
    const earliestVia = [...d.vias].sort((a, b) => a.at.localeCompare(b.at))[0];
    const via = d.memberVia ?? (earliestVia ? { id: earliestVia.id, name: earliestVia.name, kind: earliestVia.kind } : null);
    return {
      key: d.key, email: d.email, userId: d.userId, stage: stageOf(d), firstTouch: first,
      leadAt: d.leadAt, leadKind: d.leadKind, guestAt: d.guestAt, invitedAt: d.invitedAt, signedUpAt: d.signedUpAt, firstListAt: d.firstListAt,
      cardAt: d.cardAt, payingAt: d.payingAt, endedAt: d.endedAt, status: d.status, sponsor: d.sponsor, via, ref: d.ref, utm: d.utm,
    };
  });
}

/** The pipeline: stage counts over everyone, then one page of the people matching the filters, newest first touch first. */
export async function loadPipeline(q: Query, o: { stage?: Stage; source?: Source; page?: number; adminEmails?: string[] } = {}): Promise<Pipeline> {
  const [rows, [cleared]] = await Promise.all([q<TouchRow>(PIPELINE_SQL), q<{ n: number }>(CLEARED_SQL)]);
  const people = mergeTouches(rows, o.adminEmails ?? configuredAdmins());
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const p of people) counts[p.stage]++;
  const shown = people
    .filter((p) => (!o.stage || p.stage === o.stage) && (!o.source || p.firstTouch.source === o.source))
    .sort((a, b) => b.firstTouch.at.localeCompare(a.firstTouch.at) || a.key.localeCompare(b.key));
  const pages = Math.max(1, Math.ceil(shown.length / PIPELINE_PAGE));
  const page = Math.min(Math.max(1, Math.floor(o.page ?? 1)), pages);
  return { counts, total: shown.length, rows: shown.slice((page - 1) * PIPELINE_PAGE, page * PIPELINE_PAGE), page, pages, cleared: cleared?.n ?? 0 };
}
