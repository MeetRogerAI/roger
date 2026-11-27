import { redirect } from "next/navigation";
import { SignupSteps } from "@/components/app/signup-steps";
import { Suspense } from "react";
import { PlanForm } from "@/components/app/plan-form";
import { amount, money } from "@/lib/billing/prices";
import { query } from "@/lib/db-query";
import { signupUser, zackFileFor } from "@/lib/signup/current";
import { SPONSOR_INVALID } from "@/lib/sponsors/code";
import { sponsorNameFor } from "@/lib/sponsors/sponsors";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

/**
 * Step 3, Product and Pricing (plan 2026-11-26-001, Unit 2): the last sign-up step; no card is asked for.
 * A sponsored member (B2 Unit 10) sees no prices and no card copy; a sponsor code that got no seat
 * (`?sponsor=invalid`, set by the sign-up link or Google) shows the uniform message, with the usual prices.
 */
async function Plan({ searchParams }: { searchParams: PageProps<"/start/plan">["searchParams"] }) {
  const u = await signupUser("/start/plan");
  if (u.status !== "signup") redirect("/app");
  const sponsor = await sponsorNameFor(query, u.id);
  const refused = !sponsor && (await searchParams).sponsor === "invalid";
  const s = await getV3SettingsForDisplay();
  return (
    <>
      {refused && (
        <p role="status" className="mt-6 max-w-[40rem] rounded-md border border-rule p-4 text-small">
          {SPONSOR_INVALID}
        </p>
      )}
      <PlanForm
        usd={money(amount(s, "monthly", "USD"), "USD")}
        cad={money(amount(s, "monthly", "CAD"), "CAD")}
        zackLink={`/start/zack/${zackFileFor(u.agent)}`}
        sponsor={sponsor}
      />
    </>
  );
}

export default function PlanPage({ searchParams }: PageProps<"/start/plan">) {
  return (
    <>
      <SignupSteps current={3} />
      <h1 className="text-h2">Product and Pricing</h1>
      <Suspense fallback={<p className="mt-10 text-ink-2">Loading…</p>}>
        <Plan searchParams={searchParams} />
      </Suspense>
    </>
  );
}
