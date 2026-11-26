"use server";

import { redirect } from "next/navigation";
import { requireUserForAction } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { finishSignup, sendSignupWelcome } from "@/lib/signup/finish";
import { readV3Settings } from "@/lib/v3-settings";

export type PlanState = { status: "idle" | "error"; errors?: Record<string, string>; message?: string };

/**
 * Step 3, Product and Pricing (plan 2026-11-26-001, Unit 2): the consent,
 * which the user ticks themselves, ends sign-up. The account becomes a trial
 * with no card, on monthly (the only plan), and the person goes to /app to
 * connect Zack. The card is asked for when the first list is ready.
 *
 * Only the call that ends sign-up sends the welcome; a failed send is logged
 * and retried by the hourly `welcome_unsent` task, never shown to the person.
 */
export async function savePlan(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const session = await requireUserForAction();
  if (field(fd, "consent") !== "yes") {
    return { status: "error", errors: { consent: "Tick the box to agree, so Zack can run for you each week." } };
  }
  if (!(await finishSignup(query, session.userId))) redirect("/app");
  try {
    const r = await sendSignupWelcome(query, session.userId, { settings: await readV3Settings() });
    if (r === "failed") console.error("[start/plan] welcome email not sent; the hourly task retries it");
  } catch (e) {
    console.error("[start/plan] welcome email not sent; the hourly task retries it", e instanceof Error ? e.message : e);
  }
  redirect("/app");
}
