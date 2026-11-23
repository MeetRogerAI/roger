"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUserForAction } from "@/lib/auth/access";
import { cancelPlan, undoCancel, type PlanDeps, type PlanResult } from "@/lib/billing/cancel";
import { startCardUpdate } from "@/lib/billing/card-setup";
import { stripeGateway } from "@/lib/billing/gateway";
import { stripeAdjustments, stripeBilling, stripePlans } from "@/lib/billing/subscriptions";
import { switchPlan } from "@/lib/billing/switch";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { appUrl } from "@/lib/mail/layout";
import { clientIp, hit, limits } from "@/lib/rate-limit";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * /app/billing (spec B.9, B.10). Server actions are public endpoints: each
 * one checks the session itself and acts only on the signed-in user's own
 * account. Nothing in the form names an account or a subscription; the user
 * id comes from the session and every lookup starts from it.
 */
export type BillingState = { status: "idle" | "done" | "error"; message?: string; at?: number };

/** Cancel, undo and switch share one limit per user: each one calls Stripe. */
const mutationAllowed = (userId: string) => hit(`billing:mutate:${userId}`, { limit: 10, windowSeconds: 60 * 60 });
const TOO_MANY: BillingState = { status: "error", message: "Too many changes. Wait a while and try again." };

const OFF: BillingState ={ status: "error", message: "Billing isn’t switched on yet. Try again soon, or write to us." };

async function deps(): Promise<PlanDeps | null> {
  const plans = stripePlans();
  if (!plans) return null;
  return { plans, gw: stripeBilling() ?? undefined, adjust: stripeAdjustments() ?? undefined, settings: await readV3Settings(), now: new Date() };
}

function answer(r: PlanResult): BillingState {
  if (!r.ok) return { status: "error", message: r.message };
  refresh();
  return { status: "done", message: r.message, at: Date.now() };
}

/** One click, one optional question ("Why are you leaving?"), no retention screen (spec check 27). */
export async function cancelAction(_prev: BillingState, fd: FormData): Promise<BillingState> {
  const s = await requireUserForAction();
  if (!(await mutationAllowed(s.userId))) return TOO_MANY;
  const d = await deps();
  if (!d) return OFF;
  return answer(await cancelPlan(query, d, { userId: s.userId, reason: field(fd, "reason", 1000) }));
}

/** Takes back a cancellation before the paid month ends: the same subscription continues. */
export async function undoCancelAction(): Promise<BillingState> {
  const s = await requireUserForAction();
  if (!(await mutationAllowed(s.userId))) return TOO_MANY;
  const d = await deps();
  if (!d) return OFF;
  return answer(await undoCancel(query, d, { userId: s.userId }));
}

/** Between monthly and one list at a time; the page showed the effect beside the button. */
export async function switchAction(_prev: BillingState, fd: FormData): Promise<BillingState> {
  const s = await requireUserForAction();
  const to = field(fd, "to");
  if (to !== "monthly" && to !== "per_run") return { status: "error", message: "Choose a plan." };
  if (!(await mutationAllowed(s.userId))) return TOO_MANY;
  const d = await deps();
  if (!d) return OFF;
  return answer(await switchPlan(query, d, { userId: s.userId, to }));
}

/** "Update card": Stripe's own card page (setup-mode Checkout) for the user's own customer. */
export async function updateCardAction(): Promise<BillingState> {
  const s = await requireUserForAction();
  const gw = stripeGateway();
  if (!gw) return OFF;
  const ip = clientIp(await headers());
  const allowed = [
    await hit(`checkout:user:${s.userId}`, limits.checkoutPerUser),
    await hit(`checkout:ip:${ip}`, limits.checkoutPerIp),
    await hit(`checkout:user-day:${s.userId}`, limits.checkoutPerUserDay),
    await hit(`checkout:ip-day:${ip}`, limits.checkoutPerIpDay),
  ];
  if (allowed.includes(false)) return { status: "error", message: "Too many tries. Wait a while and try again, or write to us." };
  let r: Awaited<ReturnType<typeof startCardUpdate>>;
  try {
    r = await startCardUpdate(query, gw, {
      userId: s.userId,
      successUrl: `${appUrl("/app/billing")}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: appUrl("/app/billing"),
    });
  } catch (e) {
    console.error("[billing] could not open Checkout", e instanceof Error ? e.message : e);
    return { status: "error", message: "Something went wrong on our side. Try again in a minute." };
  }
  if (r.ok) redirect(r.url);
  return { status: "error", message: r.reason === "no_card_yet" ? "Add your card from the sign-up first." : "This account can’t take a new card." };
}
