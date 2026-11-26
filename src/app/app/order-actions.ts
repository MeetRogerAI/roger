"use server";

import { refresh } from "next/cache";
import { requireUserForAction } from "@/lib/auth/access";
import { NO_CARD_TRIAL_SQL } from "@/lib/billing/has-card";
import { cancelOrder, placeOrder, type OrderResult } from "@/lib/billing/orders";
import { cutoffInstant, isRealDate, weekOf } from "@/lib/clock";
import { query } from "@/lib/db-query";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * One list at a time (spec B.9): order or cancel the coming Monday's list, until Sunday's cutoff.
 *
 * Dormant: monthly is the only plan (plan 2026-11-26-001, Unit 9), so no page
 * calls these. A server action is still a public endpoint, so each one first
 * refuses any account that is not a leftover per-run account with a card
 * (monthly, sponsored-only, a trial still waiting for its card), before it
 * reads settings, writes an order or calls Stripe (review fixes Unit 9, F1).
 */
const PER_RUN_ONLY = "Monthly is the only plan.";

async function perRunAccount(userId: string): Promise<boolean> {
  const [u] = await query<{ ok: boolean }>(`select (u.plan = 'per_run' and not ${NO_CARD_TRIAL_SQL("u")}) as ok from users u where u.id = $1`, [userId]);
  return u?.ok === true;
}

/**
 * The Monday comes from the page (the one the user saw), so an order or a
 * cancel after Sunday's cutoff is refused rather than moved to a later week.
 */
function weekFrom(fd: FormData): string | null {
  const w = String(fd.get("week") ?? "");
  return isRealDate(w) ? w : null;
}

export async function orderNextList(fd: FormData): Promise<OrderResult> {
  const s = await requireUserForAction();
  if (!(await perRunAccount(s.userId))) return { ok: false, message: PER_RUN_ONLY };
  const week = weekFrom(fd);
  if (!week) return { ok: false, message: "Choose a Monday." };
  const settings = await readV3Settings();
  const now = new Date();
  // Only the coming Monday can be ordered.
  if (week !== weekOf(now, settings.runCutoff) && now < cutoffInstant(week, settings.runCutoff)) return { ok: false, message: "Only the coming Monday can be ordered." };
  const r = await placeOrder(query, { userId: s.userId, week, now, settings });
  if (r.ok) refresh();
  return r;
}

export async function cancelNextList(fd: FormData): Promise<OrderResult> {
  const s = await requireUserForAction();
  if (!(await perRunAccount(s.userId))) return { ok: false, message: PER_RUN_ONLY };
  const week = weekFrom(fd);
  if (!week) return { ok: false, message: "Choose a Monday." };
  const settings = await readV3Settings();
  const r = await cancelOrder(query, { userId: s.userId, week, now: new Date(), settings });
  if (r.ok) refresh();
  return r;
}
