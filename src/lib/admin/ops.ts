import { contributionStatus } from "@/lib/billing/contribution";
import { closeTrialAt } from "@/lib/billing/claims";
import { HAS_CARD_SQL } from "@/lib/billing/has-card";
import { amount, money, moneyCents, type Currency } from "@/lib/billing/prices";
import { addDays, currentMonday, wallParts, wallToInstant } from "@/lib/clock";
import { loadUsers } from "@/lib/cora/context";
import { eligiblePlays } from "@/lib/cora/eligible";
import type { Query } from "@/lib/db-query";
import { nextMonthly } from "@/lib/app/status";
import { trialClocks } from "@/lib/housekeeping/trial";
import type { V3Settings } from "@/lib/v3-settings";

/**
 * The operations screen (spec B.12, plan Unit 17): one row per user, built
 * from stored facts only, and the "needs attention" rules (spec check 30).
 * Every moment comes from `now`, so tests and "as of" previews see the same
 * screen the real clock would show then.
 */

/** Why a user needs attention. */
export type Attention = "no_run" | "flagged_run" | "rejected_run" | "held" | "trial_closing" | "few_eligible";

export const ATTENTION_LABELS: Record<Attention, string> = {
  no_run: "No run by Sunday 8:00 PM",
  flagged_run: "Run flagged",
  rejected_run: "Run rejected",
  held: "Payment held",
  trial_closing: "Trial closes within 5 days",
  few_eligible: "Fewer than 3 eligible plays",
};

/** A trial closing this many days ahead (or sooner) needs attention. */
export const CLOSING_SOON_DAYS = 5;
/** Fewer eligible plays than this needs attention (R16). */
export const FEW_ELIGIBLE = 3;

/**
 * The week the screen is about: the coming Monday's list (all of Sunday
 * included, whatever the cutoff time), except on a Monday, when it is the
 * week Cora, the charge and the send are working on.
 */
export function opsWeek(now: Date): string {
  const monday = currentMonday(now);
  // Tuesday to Sunday: the next Monday (from Sunday, tomorrow).
  return wallParts(now).dow === 1 ? monday : addDays(monday, 7);
}

/**
 * The week an excuse form starts on: the most recent week already recorded
 * at its cutoff, i.e. this week's Monday (today, on a Monday).
 */
export function excuseDefaultWeek(now: Date): string {
  return currentMonday(now);
}

export type RunState = { status: "received" | "accepted" | "flagged" | "rejected"; route: string; receivedAt: string } | null;
export type CoraState = "ready" | "sent" | "held" | "none" | "not yet";

export type OpsRow = {
  id: string;
  email: string;
  name: string;
  path: "new" | "running";
  notReady: boolean;
  status: string;
  holdReason: string | null;
  plan: "monthly" | "per_run";
  sponsored: boolean;
  sharing: "share" | "match_only" | "off";
  currency: Currency | null;
  freeListsUsed: number;
  stripeCustomer: string | null;
  /** A card is saved (billing/has-card.ts); a trial without one is waiting for it. */
  hasCard: boolean;
  cancelRequested: boolean;
  /** A switch to one at a time waiting for the paid month's end (also on cancel_requested_at, but not a cancellation). */
  switching: boolean;
  /** A paying one-at-a-time member who switched to monthly: "trial" in the data, never a trial (no free lists, no trial close). */
  switched: boolean;
  /** This week's order, for one at a time. */
  order: string | null;
  run: RunState;
  cora: CoraState;
  /** Next charge, as words ("Dec 7: $57.63 with tax"). */
  money: string;
  missesUsed: number | null;
  lastSignIn: string | null;
  lastOpened: string | null;
  note: string;
  /** Eligible pool plays left for the user; null when Cora would not consider them. */
  eligible: number | null;
  /** When the trial closes, if it is heading that way. */
  closesAt: string | null;
  attention: Attention[];
};

type Facts = Pick<OpsRow, "status" | "holdReason" | "plan" | "sharing" | "order" | "run" | "eligible" | "closesAt" | "freeListsUsed">;

/**
 * Who is expected to send a run this week: a live account with Zack on. One
 * at a time needs a run only with an order, unless it is a trial member still
 * on free lists.
 */
function expectsRun(f: Facts, freeRuns: number): boolean {
  if (f.status !== "trial" && f.status !== "active") return false;
  if (f.sharing === "off") return false;
  if (f.plan === "per_run") return (f.status === "trial" && f.freeListsUsed < freeRuns) || f.order === "ordered" || f.order === "charged";
  return true;
}

/** The needs-attention rules (spec B.12, R16, spec check 30). Pure: everything comes from the row and the clock. */
export function attentionFor(f: Facts, o: { now: Date; week: string; freeRuns: number }): Attention[] {
  const out: Attention[] = [];
  // Sunday 8:00 PM before the week's Monday.
  const sundayEvening = wallToInstant(addDays(o.week, -1), "20:00");
  if (!f.run && expectsRun(f, o.freeRuns) && o.now >= sundayEvening) out.push("no_run");
  if (f.run?.status === "flagged") out.push("flagged_run");
  if (f.run?.status === "rejected") out.push("rejected_run");
  if (f.status === "held") out.push("held");
  if (f.closesAt && Date.parse(f.closesAt) - o.now.getTime() <= CLOSING_SOON_DAYS * 86_400_000) out.push("trial_closing");
  if (f.eligible !== null && f.eligible < FEW_ELIGIBLE && (f.status === "trial" || f.status === "active")) out.push("few_eligible");
  return out;
}

export type OpsFilter = { attention?: boolean; status?: string; path?: string };

/** The screen's filters: "needs attention", by status (as the status column words it), by path. */
export function filterOps(rows: OpsRow[], f: OpsFilter): OpsRow[] {
  return rows.filter((r) => (!f.attention || r.attention.length > 0) && (!f.status || statusKey(r) === f.status) && (!f.path || r.path === f.path));
}

export const STATUS_KEYS = ["signup", "trial", "trial_no_card", "monthly", "per_run", "switching", "held", "sponsored", "cancelled", "closed"] as const;

/** The status column's kind (spec B.12): trial (with or without a card), monthly, one at a time, switching, payment held, sponsored, cancelled. */
export function statusKey(r: Pick<OpsRow, "status" | "plan" | "sponsored" | "cancelRequested"> & Partial<Pick<OpsRow, "switching" | "switched" | "hasCard">>): (typeof STATUS_KEYS)[number] {
  if (r.status === "held") return "held";
  if (r.status === "cancelled" || r.status === "closed" || r.status === "signup") return r.status;
  // Monthly to one at a time, waiting for the paid month's end: a switch, not a cancellation.
  if (r.status === "active" && r.switching) return "switching";
  // A monthly subscriber who cancelled stays active until the paid month ends (Unit 15).
  if (r.status === "active" && r.cancelRequested) return "cancelled";
  if (r.sponsored) return "sponsored";
  // One at a time to monthly, waiting for the first monthly charge: a paying member, not a trial.
  if (r.status === "trial" && r.switched) return "monthly";
  // Sign-up ends without a card: a trial waiting for its card (billing/has-card.ts).
  if (r.status === "trial" && r.hasCard === false) return "trial_no_card";
  if (r.status === "trial") return "trial";
  return r.plan === "per_run" ? "per_run" : "monthly";
}

/**
 * How many eligible pool plays each user has left (eligible.ts, the same rule
 * picking uses), for the users Cora considers. A linked seed contributor's
 * plays count as the user's own, so linking lowers the count (R25).
 */
export async function eligibleCounts(q: Query, week: string, onlyIds?: string[]): Promise<Map<string, number>> {
  const users = await loadUsers(q, week, onlyIds ? { onlyIds } : {});
  if (!users.length) return new Map();
  const pool = (await q<{ id: string; retired: boolean }>(`select id, not active as retired from pool_plays`)).map((p) => ({ id: p.id, retired: p.retired }));
  return new Map(users.map((u) => [u.id, eligiblePlays(pool, u.ctx).length]));
}

type Row = {
  id: string;
  email: string;
  name: string;
  path: "new" | "running";
  not_ready: boolean;
  status: string;
  hold_reason: string | null;
  plan: "monthly" | "per_run";
  sponsored: boolean;
  sharing: "share" | "match_only" | "off";
  currency: Currency | null;
  free_lists_used: number;
  stripe_customer: string | null;
  stripe_subscription: string | null;
  cancel_requested: boolean;
  switching: boolean;
  switched: boolean;
  quote: { totalCents: number; currency: Currency; week: string } | null;
  first_charge_at: string | null;
  trial_started_at: string | null;
  has_card: boolean;
  admin_note: string;
  order_status: string | null;
  order_cents: number | null;
  run_status: NonNullable<RunState>["status"] | null;
  run_route: string | null;
  run_at: string | null;
  cw_outcome: string | null;
  picks: number;
  delivered: number;
  last_signin: string | null;
  last_opened: string | null;
  last_first_week: string | null;
};

const ROW_SQL = `
  select u.id, u.email, u.name, u.path, u.not_ready, u.status, u.hold_reason, u.plan, (u.sponsor_id is not null) as sponsored, u.sharing, u.currency,
         u.free_lists_used, u.stripe_customer, u.stripe_subscription, (u.cancel_requested_at is not null) as cancel_requested, u.quote,
         (u.cancel_requested_at is not null and u.plan_change_to = 'per_run') as switching, (u.switched_from_per_run_at is not null) as switched,
         u.first_charge_at::text, u.trial_started_at::text, ${HAS_CARD_SQL("u")} as has_card, u.admin_note,
         o.status as order_status, o.amount_cents as order_cents,
         r.status as run_status, r.route as run_route, r.received_at::text as run_at,
         cw.outcome as cw_outcome,
         (select count(*)::int from picks p where p.user_id = u.id and p.week_of = $1 and not p.dry_run) as picks,
         (select count(*)::int from picks p where p.user_id = u.id and p.week_of = $1 and not p.dry_run and p.delivered_at is not null) as delivered,
         (select max(s.created_at)::text from sessions s where s.user_id = u.id) as last_signin,
         (select max(p.opened_at)::text from picks p where p.user_id = u.id) as last_opened,
         (select to_char(c.week_of, 'YYYY-MM-DD') from charge_attempts c where c.user_id = u.id and c.purpose = 'first_charge' order by c.claimed_at desc limit 1) as last_first_week
  from users u
  left join orders o on o.user_id = u.id and o.week_of = $1
  left join runs r on r.user_id = u.id and r.week_of = $1 and not r.is_test and r.status <> 'deleted'
  left join cora_user_weeks cw on cw.user_id = u.id and cw.week_of = $1 and not cw.dry_run
  where ($2::uuid is null or u.id = $2)
  order by u.created_at desc`;

function coraState(r: Row, weekStatus: string | null): CoraState {
  if (!weekStatus) return "not yet";
  if (r.picks === 0) return "none";
  if (r.delivered > 0) return "sent";
  return r.status === "held" ? "held" : "ready";
}

function closesAt(r: Row, s: V3Settings, noListCloses: Map<string, Date>): string | null {
  // A switched member's failed first monthly charge goes back to one at a time on day 7: nothing closes.
  if (r.switched) return null;
  const failed = r.hold_reason === "first_charge_failed" || (r.hold_reason === "amount_changed" && r.quote?.week === r.last_first_week);
  if (r.status === "held" && failed && r.last_first_week) return closeTrialAt(r.last_first_week, s.chargeAt).toISOString();
  // A trial with no list yet, or past its free lists with no first paid list: the trial clocks apply (src/lib/housekeeping/trial.ts).
  return noListCloses.get(r.id)?.toISOString() ?? null;
}

async function moneyOf(q: Query, r: Row, s: V3Settings, now: Date): Promise<{ text: string; missesUsed: number | null }> {
  const cur = r.currency ?? "USD";
  if (r.status === "held") return { text: `Held: ${(r.hold_reason ?? "").replace(/_/g, " ")}`, missesUsed: null };
  if (r.sponsored) return { text: "Sponsored", missesUsed: null };
  if (r.status === "trial") {
    if (!r.has_card && !r.switched) return { text: "No card yet", missesUsed: null };
    if (r.plan === "per_run") return { text: r.order_status ? `Order: ${r.order_status}` : "One at a time, no order", missesUsed: null };
    const left = s.freeRuns - r.free_lists_used;
    if (left > 0 && !r.switched) return { text: `${left} free list${left === 1 ? "" : "s"} left`, missesUsed: null };
    return { text: r.quote ? `${r.quote.week}: ${moneyCents(r.quote.totalCents, r.quote.currency)} with tax` : "First charge next ready week (no amount told yet)", missesUsed: null };
  }
  if (r.status === "active" && r.plan === "monthly") {
    const c = await contributionStatus(q, r.id, s, now).catch(() => null);
    const next = c?.periodEnd ?? (r.first_charge_at ? nextMonthly(r.first_charge_at, now) : null);
    const extra = c?.adjustment ? ` plus ${moneyCents(c.adjustment.amountCents, c.adjustment.currency)} difference` : "";
    return { text: `${next ?? "?"}: ${money(amount(s, "monthly", cur), cur)} plus tax${extra}${r.switching ? " (switching to one at a time)" : r.cancel_requested ? " (cancelling)" : ""}`, missesUsed: c?.used ?? 0 };
  }
  if (r.status === "active") return { text: r.order_status ? `Order: ${r.order_status}${r.order_cents != null ? `, ${moneyCents(r.order_cents, cur)}` : ""}` : "No order this week", missesUsed: null };
  return { text: "", missesUsed: null };
}

/** The whole screen, or one user's row. */
export async function loadOps(q: Query, o: { now: Date; settings: V3Settings; userId?: string }): Promise<{ week: string; rows: OpsRow[] }> {
  const week = opsWeek(o.now);
  const [w] = await q<{ status: string }>(`select status from cora_weeks where week_of = $1 and not dry_run`, [week]);
  const rows = await q<Row>(ROW_SQL, [week, o.userId ?? null]);
  const eligible = await eligibleCounts(q, week, o.userId ? [o.userId] : undefined);
  const only = o.userId ? [o.userId] : undefined;
  const clocks = [...(await trialClocks(q, o.settings, o.now, only)), ...(await trialClocks(q, o.settings, o.now, only, "no_charge"))];
  const noListCloses = new Map(clocks.map((t) => [t.id, t.closesAt]));
  const out: OpsRow[] = [];
  for (const r of rows) {
    const m = await moneyOf(q, r, o.settings, o.now);
    const base = {
      status: r.status,
      holdReason: r.hold_reason,
      plan: r.plan,
      sharing: r.sharing,
      order: r.order_status,
      run: r.run_status ? { status: r.run_status, route: r.run_route ?? "", receivedAt: r.run_at ?? "" } : null,
      eligible: eligible.has(r.id) ? eligible.get(r.id)! : null,
      closesAt: closesAt(r, o.settings, noListCloses),
      freeListsUsed: r.free_lists_used,
    };
    out.push({
      ...base,
      id: r.id,
      email: r.email,
      name: r.name,
      path: r.path,
      notReady: r.not_ready,
      sponsored: r.sponsored,
      currency: r.currency,
      stripeCustomer: r.stripe_customer,
      hasCard: r.has_card,
      cancelRequested: r.cancel_requested,
      switching: r.switching,
      switched: r.switched,
      cora: coraState(r, w?.status ?? null),
      money: m.text,
      missesUsed: m.missesUsed,
      lastSignIn: r.last_signin,
      lastOpened: r.last_opened,
      note: r.admin_note,
      attention: attentionFor(base, { now: o.now, week, freeRuns: o.settings.freeRuns }),
    });
  }
  return { week, rows: out };
}

/** Stripe's dashboard page for a customer, in the mode the key is in. */
export function stripeCustomerUrl(customer: string, mode: "test" | "live" | "off"): string {
  return `https://dashboard.stripe.com/${mode === "live" ? "" : "test/"}customers/${encodeURIComponent(customer)}`;
}
