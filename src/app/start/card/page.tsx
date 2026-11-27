import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CardButton } from "@/components/app/card-button";
import { oneAtATimeOffered } from "@/lib/billing/offered";
import { amount, money, taxPhrase } from "@/lib/billing/prices";
import { stripeMode } from "@/lib/billing/stripe";
import { addDays, weekOf } from "@/lib/clock";
import { longDate } from "@/lib/mail/templates/welcome";
import { signupUser } from "@/lib/signup/current";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";
import { connection } from "next/server";
import { setCurrency } from "../billing-actions";

/** Spec B.4, screen 4: the card, with the two-free-Cora-Curations statement directly above it. */
async function Card() {
  const u = await signupUser("/start/card");
  if (u.status !== "signup") redirect("/app");
  if (!u.consent_at) redirect("/start/plan");
  // A sign-up left half done on one at a time, from when it was offered: back to the plan step, which stores monthly.
  if (u.plan === "per_run" && !oneAtATimeOffered()) redirect("/start/plan");
  await connection(); // the earliest charge date reads the clock
  const s = await getV3SettingsForDisplay();
  const cur = u.currency ?? "USD";
  const price = money(amount(s, u.plan, cur), cur);
  const tax = taxPhrase(cur);
  const noEarlier = longDate(addDays(weekOf(new Date()), 14));
  const other = cur === "USD" ? "CAD" : "USD";

  return (
    <>
      <div className="mt-8 space-y-4 rounded-[8px] border border-rule bg-surface p-6 text-body">
        <p className="font-[600]">You get two free Cora Curations. Your card is charged only with the third.</p>
        {u.plan === "monthly" ? (
          <p>
            Monthly: then {price} a month, {tax}. Your first charge will be no earlier than {noEarlier}. We will email you the exact date and
            amount before it happens. Cancel any time in one click.
          </p>
        ) : (
          <p>
            One at a time: after your two free Cora Curations, you are charged {price}, {tax}, only when you order one.
          </p>
        )}
      </div>
      <form action={setCurrency} className="mt-4 text-small text-ink-2">
        Prices in {cur}.{" "}
        <input type="hidden" name="cur" value={other} />
        <button type="submit" className="tlink">
          Pay in {other} instead
        </button>
      </form>
      <CardButton off={stripeMode() === "off"} />
    </>
  );
}

export default function CardPage() {
  return (
    <>
      <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">Step 4 of 5</p>
      <h1 className="mt-3 text-h2">Add your card.</h1>
      <p className="mt-6 max-w-[40rem] text-lead text-ink-2">Stripe keeps your card and billing address. Roger never sees the number. Nothing is charged today.</p>
      <Suspense fallback={<p className="mt-10 text-ink-2">Loading…</p>}>
        <Card />
      </Suspense>
    </>
  );
}
