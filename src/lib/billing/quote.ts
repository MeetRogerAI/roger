import { addDays, cutoffInstant, wallToInstant, weekOf } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { sendToUser, type MailDeps, type SendResult } from "@/lib/mail/send";
import type { Rendered } from "@/lib/mail/layout";
import { firstChargeReminderEmail, firstPaidNextEmail, quoteChangedEmail } from "@/lib/mail/templates/quote";
import type { V3Settings } from "@/lib/v3-settings";
import { sharingAtCutoff } from "./first-charge";
import { firstChargePricing, type Currency } from "./prices";
import type { BillingGateway } from "./subscriptions";

/**
 * The stored quote is the amount the user was **told** (plan "Every amount
 * quoted before a charge comes from Stripe's invoice preview"; spec check 21).
 * It changes only when an email stating the new amount was sent. The Monday
 * charge compares Stripe's preview with it; any difference the user was not
 * told about, whatever caused it, holds the charge and tells them first.
 *
 * Amounts are priced the way the charge prices them: from the user's sharing
 * at the cutoff of the Monday being quoted.
 */
export type Quote = { totalCents: number; currency: Currency; price: string; extraCents?: number; at: string; week: string };
export type QuoteDeps = { gw: BillingGateway; settings: V3Settings; now: Date } & MailDeps;

type U = { id: string; email: string; status: string; plan: string; currency: Currency | null; stripe_customer: string | null; quote: Quote | null };

async function load(q: Query, userId: string): Promise<U | null> {
  const [u] = await q<U>(`select id, email, status, plan, currency, stripe_customer, quote from users where id = $1`, [userId]);
  return u ?? null;
}

/** Only a monthly trial user before their first charge is quoted; held users are handled by the charge and its retries. */
const quotable = (u: U) => u.plan === "monthly" && u.status === "trial" && Boolean(u.stripe_customer);

/**
 * From the cutoff of the Monday a quote is for until that Monday ends, the
 * quote is what the charge compares with: it is not replaced.
 */
export function quoteFrozen(quote: Pick<Quote, "week"> | null, now: Date, s: V3Settings): boolean {
  if (!quote) return false;
  return now >= cutoffInstant(quote.week, s.runCutoff) && now < wallToInstant(addDays(quote.week, 1), "00:00");
}

/** What the first charge would be for the coming Monday, priced as the charge will price it. */
async function preview(q: Query, d: QuoteDeps, u: U): Promise<Quote | null> {
  const week = weekOf(d.now, d.settings.runCutoff);
  const sharing = await sharingAtCutoff(q, u.id, week, d.settings);
  const currency = u.currency ?? "USD";
  // Exactly as the charge prices it: the standard price, plus the month's difference on the first invoice when not sharing at the cutoff.
  const { price, extraCents } = await firstChargePricing(d.settings, currency, sharing, d.gw);
  if (!price) return null;
  const p = await d.gw.preview({ customer: u.stripe_customer!, price, extra: extraCents > 0 ? { amountCents: extraCents, currency } : null });
  return { totalCents: p.totalCents, currency: p.currency as Currency, price, extraCents, at: d.now.toISOString(), week };
}

const same = (a: Quote | null, b: Quote) =>
  Boolean(a && a.totalCents === b.totalCents && a.currency === b.currency && a.price === b.price && (a.extraCents ?? 0) === b.extraCents && a.week === b.week);

/** Sends an email stating an amount, and stores that amount as told only if it was sent. */
async function tell(q: Query, d: QuoteDeps, u: U, kind: string, ref: string, quote: Quote, message: Rendered): Promise<SendResult> {
  const res = await sendToUser({ id: u.id, email: u.email }, kind, ref, message, d).catch((): SendResult => "failed");
  if (res === "sent" || res === "already") {
    await q(`update users set quote = $2 where id = $1 and status = 'trial'`, [u.id, JSON.stringify(quote)]);
  }
  return res;
}

/** After a change of sharing, plan, currency or address: if the coming charge's amount moved, tell the user. */
export async function noticeQuoteChange(q: Query, d: QuoteDeps, userId: string): Promise<boolean> {
  const u = await load(q, userId);
  if (!u || !quotable(u) || !u.quote || quoteFrozen(u.quote, d.now, d.settings)) return false;
  const fresh = await preview(q, d, u);
  if (!fresh || same(u.quote, fresh)) return false;
  // Unique per refresh: switching back and forth still tells the user each time.
  const res = await tell(q, d, u, "quote_changed", `${fresh.week}:${fresh.at}`, fresh, quoteChangedEmail({ week: fresh.week, amountCents: fresh.totalCents, currency: fresh.currency }));
  return res === "sent";
}

/**
 * After a switch to monthly with the free lists used (plan Unit 15): the
 * plan-changed email states the first charge's date and amount, and that
 * amount becomes the told one, so Monday's charge is not held for a
 * difference. `build` gets the fresh quote; null when there is nothing to
 * quote (free lists left, or no price or customer).
 */
export async function tellFirstCharge(
  q: Query,
  d: QuoteDeps,
  userId: string,
  kind: string,
  ref: string,
  build: (quote: Quote) => Rendered,
): Promise<SendResult | null> {
  const u = await load(q, userId);
  if (!u || !quotable(u)) return null;
  const fresh = await preview(q, d, u);
  if (!fresh) return null;
  return tell(q, d, u, kind, ref, fresh, build(fresh));
}

/** Spec B.13 email 7, sent when the second free list is delivered (Unit 13 calls this). */
export async function sendFirstPaidNext(q: Query, d: QuoteDeps, userId: string): Promise<boolean> {
  const u = await load(q, userId);
  if (!u || !quotable(u)) return false;
  const fresh = await preview(q, d, u);
  if (!fresh) return false;
  const res = await tell(q, d, u, "first_paid_next", fresh.week, fresh, firstPaidNextEmail({ week: fresh.week, amountCents: fresh.totalCents, currency: fresh.currency }));
  return res === "sent";
}

/**
 * Hourly: 48 hours before the charge time of the coming Monday, one reminder
 * per user and week, with the amount as it stands then (which becomes the
 * told amount). Once sent, the quote is left alone: a later difference is
 * caught by the charge, which tells the user before charging.
 */
export async function sendFirstChargeReminders(q: Query, d: QuoteDeps): Promise<number> {
  const week = weekOf(d.now, d.settings.runCutoff);
  const chargeAt = wallToInstant(week, d.settings.chargeAt);
  if (d.now < new Date(chargeAt.getTime() - 48 * 3600_000) || d.now >= cutoffInstant(week, d.settings.runCutoff)) return 0;
  const users = await q<{ id: string }>(
    `select u.id from users u
     where u.status = 'trial' and u.plan = 'monthly' and u.free_lists_used >= $1 and u.cancel_requested_at is null
       and u.stripe_subscription is null and u.stripe_customer is not null
       and not exists (select 1 from notifications n where n.recipient = u.id::text and n.kind = 'first_charge_reminder' and n.ref = $2 and n.status = 'sent')`,
    [d.settings.freeRuns, week],
  );
  let n = 0;
  for (const { id } of users) {
    try {
      const u = (await load(q, id))!;
      const fresh = await preview(q, d, u);
      if (!fresh) continue;
      const res = await tell(q, d, u, "first_charge_reminder", week, fresh, firstChargeReminderEmail({ week, amountCents: fresh.totalCents, currency: fresh.currency }));
      if (res === "sent") n++;
    } catch (e) {
      console.error("[quote] reminder", id, e instanceof Error ? e.message : e);
    }
  }
  return n;
}
