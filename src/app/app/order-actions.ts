"use server";

import { refresh } from "next/cache";
import { requireUserForAction } from "@/lib/auth/access";
import { cancelOrder, placeOrder, type OrderResult } from "@/lib/billing/orders";
import { cutoffInstant, isRealDate, weekOf } from "@/lib/clock";
import { query } from "@/lib/db-query";
import { readV3Settings } from "@/lib/v3-settings";

/** One list at a time (spec B.9): order or cancel the coming Monday's list, until Sunday's cutoff. */
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
  const week = weekFrom(fd);
  if (!week) return { ok: false, message: "Choose a Monday." };
  const settings = await readV3Settings();
  const r = await cancelOrder(query, { userId: s.userId, week, now: new Date(), settings });
  if (r.ok) refresh();
  return r;
}
