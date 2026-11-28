import { redirect } from "next/navigation";
import { SignupSteps } from "@/components/app/signup-steps";
import { Suspense } from "react";
import { PlanForm } from "@/components/app/plan-form";
import { amount, money } from "@/lib/billing/prices";
import { signupUser, zackFileFor } from "@/lib/signup/current";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

/** Step 3, Product and Pricing (plan 2026-11-26-001, Unit 2): the last sign-up step; no card is asked for. */
async function Plan() {
  const u = await signupUser("/start/plan");
  if (u.status !== "signup") redirect("/app");
  const s = await getV3SettingsForDisplay();
  return (
    <PlanForm usd={money(amount(s, "monthly", "USD"), "USD")} cad={money(amount(s, "monthly", "CAD"), "CAD")} zackLink={`/start/zack/${zackFileFor(u.agent)}`} />
  );
}

export default function PlanPage() {
  return (
    <>
      <SignupSteps current={3} />
      <h1 className="text-h2">Product and Pricing</h1>
      <Suspense fallback={<p className="mt-10 text-ink-2">Loading…</p>}>
        <Plan />
      </Suspense>
    </>
  );
}
