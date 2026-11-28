import { addDays, weekOf } from "@/lib/clock";
import { amount, money, type Currency, type Plan } from "@/lib/billing/prices";
import { SHARING_OFF } from "@/lib/app/status";
import { longDate } from "@/lib/dates";
import type { V3Settings } from "@/lib/v3-settings";
import type { Sharing } from "./settings";

/**
 * What a sharing change does to the price (spec B.5 item 2). Under the
 * contributor rule what counts is sharing at each Sunday cutoff: a billing
 * month with sharing off at any of its cutoffs is billed at the higher rate,
 * the difference added to the next invoice as its own line (billing/
 * contribution.ts). During the trial the first charge is priced from the
 * cutoff before it. Moving between two choices on the same side changes
 * nothing.
 */
type EffectArgs = Parameters<typeof sharingEffect>[0];

/** The member's higher monthly price, and whether it is exactly twice the standard one (the email says "doubles" only then). */
export type SharingOffPrice = { higher: string; doubles: boolean };

/**
 * The member's own higher monthly price ("US$400", "CA$560") when this change turns sharing off for a monthly
 * member (from sharing to matching only or off), else null: the sharing-changed email then explains the rule in
 * Peter's words (2026-11-27). The Zack page's confirmation keeps `sharingEffect`'s line.
 */
export function sharingOffPrice(o: EffectArgs): SharingOffPrice | null {
  if (o.plan !== "monthly" || o.from !== "share" || o.to === "share") return null;
  const cur = o.currency ?? "USD";
  const higher = amount(o.settings, "monthly", cur, "higher");
  return { higher: money(higher, cur), doubles: higher === 2 * amount(o.settings, "monthly", cur) };
}

export function sharingEffect(o: {
  settings: V3Settings;
  plan: Plan;
  currency: Currency | null;
  from: Sharing;
  to: Sharing;
  trialStartedAt: string | null;
  status: string;
  /** A paying one-at-a-time member who switched to monthly (status trial, waiting for the first monthly charge): no trial dates. */
  switchedFromPerRun?: boolean;
  /** The Monday of the first charge as last told (the stored quote), when there is one. */
  quoteWeek?: string | null;
}): string | null {
  const cur = o.currency ?? "USD";
  if (o.plan === "per_run") return o.to === "off" ? "With Zack off, lists can’t be ordered until sharing is back on. Your price doesn’t change." : null;
  const band = (s: Sharing) => (s === "share" ? "standard" : "higher");
  if (band(o.from) === band(o.to)) return null;
  const standard = money(amount(o.settings, "monthly", cur), cur);
  const higher = money(amount(o.settings, "monthly", cur, "higher"), cur);
  if (o.status === "trial") {
    // The told Monday when there is one; a switched member's trial dates mean nothing (their free lists are long past).
    // With no card saved yet (trialStartedAt null) there is no first-charge date to give: the free lists start with the card.
    const week = o.switchedFromPerRun ? (o.quoteWeek ?? null) : o.trialStartedAt ? (o.quoteWeek ?? addDays(weekOf(new Date(o.trialStartedAt)), 14)) : null;
    const before = week ? `the Sunday cutoff before your first charge (no earlier than ${longDate(week)})` : "the Sunday cutoff before your first monthly charge";
    return o.to === "share"
      ? `With sharing on at ${before}, your first month is ${standard}.`
      : `If sharing is still off at ${before}, your first month is ${higher}, the rate for members whose Zack doesn’t share. After that, any month with sharing off at a Sunday cutoff is billed at ${higher}, the difference added to your next invoice.`;
  }
  return o.to === "share"
    ? `A month with sharing on at every Sunday cutoff is ${standard}. A month that already had sharing off at a cutoff stays at ${higher}.`
    : SHARING_OFF(higher);
}
