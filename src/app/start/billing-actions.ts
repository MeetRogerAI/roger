"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUserForAction } from "@/lib/auth/access";
import { startCardSetup } from "@/lib/billing/card-setup";
import { stripeGateway } from "@/lib/billing/gateway";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { appUrl } from "@/lib/mail/layout";
import { clientIp, hit, limits } from "@/lib/rate-limit";

export type PlanState = { status: "idle" | "error"; errors?: Record<string, string>; message?: string };

/** Screen 3 (spec B.4): the plan and the consent, which the user ticks themselves. */
export async function savePlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const session = await requireUserForAction();
  const plan = field(fd, "plan");
  const errors: Record<string, string> = {};
  if (plan !== "monthly" && plan !== "per_run") errors.plan = "Choose one.";
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
  const [u] = await query<{ currency: "USD" | "CAD" | null }>(`select currency from users where id = $1`, [session.userId]);
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
