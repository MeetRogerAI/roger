import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PlanForm } from "@/components/app/plan-form";
import { oneAtATimeOffered } from "@/lib/billing/offered";
import { amount, money } from "@/lib/billing/prices";
import { signupUser, zackFileFor } from "@/lib/signup/current";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

/**
 * Spec B.4, screen 3: plan and consent. At launch the plan is monthly, so
 * there is nothing to choose and the step confirms it. The step stays because
 * the consent is given here and the card step requires it.
 */
async function Plan() {
  const u = await signupUser("/start/plan");
  if (u.status !== "signup") redirect("/app");
  const s = await getV3SettingsForDisplay();
  const cur = u.currency ?? "USD";
  return (
    <PlanForm
      monthly={money(amount(s, "monthly", cur), cur)}
      perRun={oneAtATimeOffered() ? money(amount(s, "per_run", cur), cur) : null}
      higher={money(amount(s, "monthly", cur, "higher"), cur)}
      zackLink={`/start/zack/${zackFileFor(u.agent)}`}
    />
  );
}

export default function PlanPage() {
  const choice = oneAtATimeOffered();
  return (
    <>
      <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">Step 3 of 5</p>
      <h1 className="mt-3 text-h2">{choice ? "Choose how to pay after your two free Cora Curations." : "Your plan after your two free Cora Curations."}</h1>
      <p className="mt-6 max-w-[40rem] text-lead text-ink-2">
        {choice ? "Your first two Cora Curations are free either way. Prices are before tax." : "Your first two Cora Curations are free. The price is before tax."}
      </p>
      <Suspense fallback={<p className="mt-10 text-ink-2">Loading…</p>}>
        <Plan />
      </Suspense>
    </>
  );
}
