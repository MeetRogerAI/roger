import { isAtOrPast, torontoDate } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { statusLine, type StatusFacts } from "@/lib/app/status";
import { weekIdeas } from "@/lib/app/week";
import { oneAtATimeOffered } from "@/lib/billing/offered";
import { amount, money, type Currency } from "@/lib/billing/prices";
import { sendFirstPaidNext } from "@/lib/billing/quote";
import { contributionStatus, processContributions } from "@/lib/billing/contribution";
import type { AdjustmentGateway, BillingGateway } from "@/lib/billing/subscriptions";
import { adminAlert, alertAdmins, sendToUser, type MailDeps } from "@/lib/mail/send";
import { mondayListEmail, noIdeasThisWeekEmail, noRunThisWeekEmail, orderNextEmail } from "@/lib/mail/templates/monday";
import type { V3Settings } from "@/lib/v3-settings";
import { deliverWeek } from "./deliver";

/**
 * The Monday send (spec B.8 step 2): each user with picks and nothing owed
 * has the list delivered, then gets one email. A user who switched the email
 * off still has the list delivered. Emails depend on stored state, not on one
 * pass, so a failed send is tried again by the next pass (the Monday cron, or
 * the hourly late pass for the rest of the week). Safe to run twice.
 */
export type SendDeps = { settings: V3Settings; now: Date; gw?: BillingGateway; adjust?: AdjustmentGateway } & MailDeps;

/** The status line with the month's contribution count for an active monthly member (spec B.9 notice 2). */
async function statusFor(q: Query, d: SendDeps, u: U): Promise<string> {
  const contribution = u.status === "active" && u.plan === "monthly" ? await contributionStatus(q, u.id, d.settings, d.now) : null;
  return statusLine({ ...facts(u, d.settings, d.now), contribution }, d.settings);
}

type U = {
  id: string;
  email: string;
  email_prefs: Record<string, unknown> | null;
  status: string;
  plan: "monthly" | "per_run";
  sponsored: boolean;
  sharing: "share" | "match_only" | "off";
  currency: Currency | null;
  free_lists_used: number;
  quote: StatusFacts["quote"];
  first_charge_at: string | null;
  access_ends_at: string | null;
  hold_reason: string | null;
  renewal_failed_at: string | null;
  switching_at: string | null;
  ending_at: string | null;
  switched: boolean;
  outcome: string;
  run_arrived: boolean;
  order_status: string | null;
  order_cents: number | null;
  receipt_url: string | null;
  has_delivered: boolean;
};

async function usersFor(q: Query, week: string, onlyIds: string[] | null = null): Promise<U[]> {
  return q<U>(
    `select u.id, u.email, u.email_prefs, u.status, u.plan, (u.sponsor_id is not null) as sponsored, u.sharing, u.currency, u.free_lists_used,
            u.quote, u.first_charge_at::text, u.access_ends_at::text, u.hold_reason, u.renewal_failed_at::text,
            case when u.plan_change_to = 'per_run' and u.cancel_requested_at is not null then u.access_ends_at::text end as switching_at,
            case when u.status = 'active' and u.cancel_requested_at is not null and u.plan_change_to is distinct from 'per_run' then u.access_ends_at::text end as ending_at,
            u.switched_from_per_run_at is not null as switched, cw.outcome,
            exists (select 1 from runs r where r.user_id = u.id and r.week_of = $1 and not r.is_test and r.status in ('received', 'accepted', 'flagged')) as run_arrived,
            o.status as order_status, o.amount_cents as order_cents, o.receipt_url,
            exists (select 1 from picks k where k.user_id = u.id and k.week_of = $1 and not k.dry_run and k.delivered_at is not null) as has_delivered
     from cora_user_weeks cw join users u on u.id = cw.user_id
     left join orders o on o.user_id = u.id and o.week_of = $1
     where cw.week_of = $1 and not cw.dry_run and ($2::uuid[] is null or u.id = any($2::uuid[]))
     order by u.id`,
    [week, onlyIds],
  );
}

export const facts = (u: Pick<U, "status" | "plan" | "sponsored" | "sharing" | "currency" | "free_lists_used" | "quote" | "first_charge_at" | "order_cents" | "access_ends_at"> & Partial<Pick<U, "hold_reason" | "renewal_failed_at" | "switching_at" | "ending_at" | "switched">>, s: V3Settings, now: Date): StatusFacts => ({
  status: u.status,
  plan: u.plan,
  sponsored: u.sponsored,
  sharing: u.sharing,
  currency: u.currency,
  freeListsUsed: u.free_lists_used,
  freeRuns: s.freeRuns,
  quote: u.quote,
  firstChargeAt: u.first_charge_at,
  orderCents: u.order_cents,
  accessEndsAt: u.access_ends_at,
  holdReason: u.hold_reason ?? null,
  renewalFailedAt: u.renewal_failed_at ?? null,
  switchingAt: u.switching_at ?? null,
  endingAt: u.ending_at ?? null,
  switchedFromPerRun: u.switched ?? false,
  now,
});

async function sentAlready(q: Query, userId: string, kind: string, sinceRef: string): Promise<boolean> {
  const rows = await q(`select 1 from notifications where recipient = $1 and kind = $2 and ref >= $3 and status in ('sent', 'skipped') limit 1`, [userId, kind, sinceRef]);
  return rows.length > 0;
}

/** Delivers one user's list if nothing is owed, then makes sure its emails went. Returns whether anything was delivered now. */
export async function deliverAndTell(q: Query, d: SendDeps, u: U, week: string): Promise<boolean> {
  if (u.outcome !== "picked" && u.outcome !== "short") return false;
  const { delivered } = await deliverWeek(q, u.id, week, d.settings.freeRuns, d.now);
  const [now] = await usersFor(q, week, [u.id]);
  if (!now?.has_delivered) return false;

  // After the second free list, what comes next (spec B.13 email 7), before the Monday email, so both state the same date and amount.
  if (now.status === "trial" && !now.sponsored && now.free_lists_used >= d.settings.freeRuns) {
    if (now.plan === "monthly" && d.gw && !(await sentAlready(q, now.id, "first_paid_next", week))) {
      await sendFirstPaidNext(q, { gw: d.gw, settings: d.settings, now: d.now, ...mailOf(d) }, now.id).catch((e) => console.error("[send] first paid next", e instanceof Error ? e.message : e));
    }
    // "How to order the next one" goes only while ordering is offered (billing/offered.ts); otherwise the Monday email's status line says what is open.
    if (now.plan === "per_run" && oneAtATimeOffered()) {
      const cur = now.currency ?? "USD";
      await sendToUser({ id: now.id, email: now.email }, "order_next", week, orderNextEmail({ price: money(amount(d.settings, "per_run", cur), cur) }), d).catch(() => {});
    }
  }

  const [after] = await usersFor(q, week, [u.id]);
  const ideas = await weekIdeas(q, u.id, week, d.settings.playbookPreface);
  if (!ideas.length) return delivered > 0;
  const orderCharged = after.order_status === "charged" || after.order_status === "sent";
  const message = mondayListEmail({
    week,
    ideas: ideas.map((i) => ({ id: i.id, title: i.title, reason: i.personal?.reason ?? "", timeLine: i.timeLine })),
    status: await statusFor(q, d, after),
    receipt: orderCharged ? { url: after.receipt_url } : null,
  });
  // A one-list order gets "Your list, and your receipt", which cannot be switched off.
  const kind = orderCharged ? "order_receipt" : "monday_list";
  const res = await sendToUser({ id: after.id, email: after.email, emailPrefs: after.email_prefs }, kind, week, message, d).catch(() => "failed" as const);
  if (orderCharged && res === "sent") await q(`update orders set status = 'sent', updated_at = now() where user_id = $1 and week_of = $2 and status = 'charged'`, [u.id, week]);
  return delivered > 0;
}

const mailOf = (d: SendDeps): MailDeps => ({ query: d.query, transport: d.transport, sleep: d.sleep });

export type SendResult = { week: string; status: "skipped" | "done"; note?: string; delivered?: number; notes?: number };

export async function runSendJob(q: Query, d: SendDeps, o: { week: string }): Promise<SendResult> {
  const { week } = o;
  if (!d.settings.cycleLive) return { week, status: "skipped", note: "The cycle is not live." };
  if (!isAtOrPast(d.now, week, d.settings.sendAt)) return { week, status: "skipped", note: `Before ${d.settings.sendAt}.` };
  const [w] = await q<{ status: string; dry_run: boolean }>(`select status, dry_run from cora_weeks where week_of = $1`, [week]);
  if (!w || w.dry_run || (w.status !== "ready" && w.status !== "sent")) return { week, status: "skipped", note: "Cora's week is not ready." };

  // The week's misses are settled first (forgiven, or the difference), so the status line in each email already says so.
  // Once per week: on the run that finds it ready, before it is marked sent; the hourly pass does the rest.
  if (w.status === "ready") {
    await processContributions(q, { settings: d.settings, now: d.now, adjust: d.adjust, ...mailOf(d) }).catch((e) =>
      console.error("[send] contributions", e instanceof Error ? e.message : e),
    );
  }
  let delivered = 0;
  let notes = 0;
  for (const u of await usersFor(q, week)) {
    try {
      if (await deliverAndTell(q, d, u, week)) delivered++;
      const status = await statusFor(q, d, u);
      const onFreeLists = u.status === "trial" && !u.sponsored && u.free_lists_used < d.settings.freeRuns;
      if (u.outcome === "not_eligible" && onFreeLists && u.sharing !== "off" && !u.run_arrived) {
        // Spec B.8 item 6 (spec check 20): no report, no list, and no free list used.
        if ((await sendToUser({ id: u.id, email: u.email }, "no_run_note", week, noRunThisWeekEmail({ week, status }), d).catch(() => "failed")) === "sent") notes++;
      }
      // R15. Orders and the first charge send their own "no list" notes (order_no_list, charge_date_moved), so they are left out here.
      const coveredElsewhere = (u.plan === "per_run" && u.order_status != null) || (u.status === "trial" && !onFreeLists);
      if (u.outcome === "none" && !coveredElsewhere) {
        // R15: a paying monthly member is not told about charges (theirs is unchanged); the list is missing because
        // of Roger, and the week never counts as missed (contribution.ts excuses an outcome of 'none').
        const paying = u.plan === "monthly" && u.status === "active" && !u.sponsored;
        const note = paying
          ? "This Cora Curation is missing because of Roger, not you, and this week never counts as a missed week."
          : onFreeLists
            ? "Nothing was charged, and this week doesn’t use one of your free Cora Curations."
            : u.sponsored
              ? ""
              : "Nothing was charged.";
        if ((await sendToUser({ id: u.id, email: u.email }, "no_ideas_note", week, noIdeasThisWeekEmail({ week, note, status }), d).catch(() => "failed")) === "sent") notes++;
      }
      // R15: both admins hear of every member with no eligible plays, whatever their plan (R16 is the early warning).
      if (u.outcome === "none") {
        const who = u.plan === "monthly" && u.status === "active" ? "paying monthly" : `${u.status}, ${u.plan === "per_run" ? "one at a time" : "monthly"}`;
        await alertAdmins("no_eligible_ideas", `${u.id}:${week}`, adminAlert("A member had no eligible ideas", [`User ${u.id} (${who}), week ${week}.`]), d).catch(() => {});
      }
    } catch (e) {
      console.error("[send] user", u.id, e instanceof Error ? e.message : e);
    }
  }
  await q(`update cora_weeks set status = 'sent', sent_at = coalesce(sent_at, now()) where week_of = $1 and status in ('ready', 'sent')`, [week]);
  return { week, status: "done", delivered, notes };
}

/**
 * Hourly, for the past week: a list whose charge settled after Monday (a
 * retry that succeeded, a changed amount charged a day later, an order paid
 * late) is delivered then; and a list delivered whose email has not gone yet
 * (a failed send) is emailed. The week may already be marked sent.
 */
export async function deliverLate(q: Query, d: SendDeps): Promise<number> {
  const weeks = await q<{ week: string }>(
    `select to_char(week_of, 'YYYY-MM-DD') as week from cora_weeks where status in ('ready', 'sent') and not dry_run and week_of between $1::date - 8 and $1::date`,
    [torontoDate(d.now)],
  );
  let n = 0;
  for (const { week } of weeks) {
    if (!isAtOrPast(d.now, week, d.settings.sendAt)) continue;
    const waiting = await q<{ user_id: string }>(
      `select distinct k.user_id from picks k
       where k.week_of = $1::date and not k.dry_run
         and (k.delivered_at is null
              or not exists (select 1 from notifications n where n.recipient = k.user_id::text and n.kind in ('monday_list', 'order_receipt') and n.ref = $2 and n.status in ('sent', 'skipped')))`,
      [week, week],
    );
    if (!waiting.length) continue;
    for (const u of await usersFor(q, week, waiting.map((x) => x.user_id))) {
      try {
        if (await deliverAndTell(q, d, u, week)) n++;
      } catch (e) {
        console.error("[send] late", u.id, e instanceof Error ? e.message : e);
      }
    }
  }
  return n;
}
