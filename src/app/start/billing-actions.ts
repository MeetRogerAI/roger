"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUserForAction } from "@/lib/auth/access";
import { startCardSetup } from "@/lib/billing/card-setup";
import { stripeGateway } from "@/lib/billing/gateway";
import { oneAtATimeOffered } from "@/lib/billing/offered";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { appUrl } from "@/lib/mail/layout";
import { clientIp, hit, limits } from "@/lib/rate-limit";

export type PlanState = { status: "idle" | "error"; errors?: Record<string, string>; message?: string };

/**
 * Screen 3 (spec B.4): the plan and the consent, which the user ticks themselves.
 * While one at a time is not offered (billing/offered.ts) the page shows
 * monthly only and sends no plan, and monthly is what is stored: a posted
 * "per_run" is refused here, whatever the page showed.
 */
export async function savePlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const session = await requireUserForAction();
  const offered = oneAtATimeOffered();
  const plan = field(fd, "plan") || (offered ? "" : "monthly");
  const errors: Record<string, string> = {};
  if (plan === "per_run" && !offered) errors.plan = "That plan isn’t offered. Roger is monthly.";
  else if (plan !== "monthly" && plan !== "per_run") errors.plan = "Choose one.";
  if (field(fd, "consent") !== "yes") errors.consent = "Tick the box to agree, so Zack can run for you each week.";
  if (Object.keys(errors).length) return { status: "error", errors };
  const rows = await query(
    // The first agreement stays on record; changing plan later does not reset it.
    `update users set plan = $2, consent_at = coalesce(consent_at, now()), signup_step = 'card' where id = $1 and status = 'signup' returning id`,
    [session.userId, plan],
  );
  if (!rows.length) redirect("/app");
  redirect("/start/card");
}

/** Screen 4: the currency can change until the card is saved. */
export async function setCurrency(fd: FormData) {
  const session = await requireUserForAction();
  const cur = field(fd, "cur");
  if (cur === "USD" || cur === "CAD") {
    await query(`update users set currency = $2 where id = $1 and status = 'signup'`, [session.userId, cur]);
  }
  redirect("/start/card");
}

/** Screen 4: open Stripe's hosted card page. Only for a signed-in user, limited per user and per IP. */
export async function openCardPage(): Promise<PlanState> {
  const session = await requireUserForAction();
  const gw = stripeGateway();
  if (!gw) return { status: "error", message: "Billing isn’t switched on yet. Try again soon." };
  const ip = clientIp(await headers());
  const allowed = [
    await hit(`checkout:user:${session.userId}`, limits.checkoutPerUser),
    await hit(`checkout:ip:${ip}`, limits.checkoutPerIp),
    await hit(`checkout:user-day:${session.userId}`, limits.checkoutPerUserDay),
    await hit(`checkout:ip-day:${ip}`, limits.checkoutPerIpDay),
  ];
  if (allowed.includes(false)) return { status: "error", message: "Too many tries. Wait a while and try again, or write to us." };
  const [u] = await query<{ currency: "USD" | "CAD" | null; plan: string; status: string }>(`select currency, plan, status from users where id = $1`, [session.userId]);
  // A sign-up left half done on one at a time, from when it was offered: back to the plan step, which stores monthly.
  if (u?.status === "signup" && u.plan === "per_run" && !oneAtATimeOffered()) redirect("/start/plan");
  let r: Awaited<ReturnType<typeof startCardSetup>>;
  try {
    r = await startCardSetup(query, gw, {
      userId: session.userId,
      currency: u?.currency ?? "USD",
      successUrl: `${appUrl("/start/done")}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: appUrl("/start/card"),
    });
  } catch (e) {
    console.error("[start/card] could not open Checkout", e);
    return { status: "error", message: "Something went wrong on our side. Try again in a minute." };
  }
  if (r.ok) redirect(r.url);
  redirect(r.reason === "not_consented" ? "/start/plan" : "/app");
}
