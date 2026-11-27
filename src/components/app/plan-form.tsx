"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { savePlan, type PlanState } from "@/app/start/billing-actions";

const idle: PlanState = { status: "idle" };

/**
 * Step 3, Product and Pricing (plan 2026-11-26-001, Unit 2; origin R3–R6).
 * Product explains the weekly process and carries the Zack consent, which
 * starts unticked; Pricing states both prices. No plan picker and no
 * higher-rate line. Draft wording, for Peter's sign-off (launch list S18).
 * A sponsored member (B2 Unit 10) sees who pays instead of prices and card copy.
 *
 * The only error is an unticked box, so React's reset after the action leaves
 * the form exactly as it was submitted.
 */
export function PlanForm({ usd, cad, zackLink, sponsor = null }: { usd: string; cad: string; zackLink: string; sponsor?: string | null }) {
  const [state, action, pending] = useActionState(savePlan, idle);
  const e = state.errors ?? {};
  const id = useId();
  return (
    <form action={action} className="mt-10 max-w-[40rem] space-y-10" noValidate>
      <section aria-labelledby={`${id}-product`}>
        <h2 id={`${id}-product`} className="text-title">
          Product
        </h2>
        <p className="mt-3 text-ink-2">
          Zack runs in your own AI agent each week and collects what you did and what worked. Cora curates three ideas picked for you,
          every Monday.
        </p>
        <label className="mt-6 flex gap-3 text-small">
          <input
            type="checkbox"
            name="consent"
            value="yes"
            aria-invalid={e.consent ? true : undefined}
            aria-describedby={e.consent ? `${id}-consent` : undefined}
            className="mt-1 size-4 shrink-0 accent-accent"
          />
          <span>
            I agree that Zack will run in my AI agent account each week and send Roger his report and a private matching profile. The
            profile is used only to pick my ideas and is never shared. I can read exactly what Zack does, change what he collects, and
            turn this off at any time.
          </span>
        </label>
        {e.consent && (
          <p id={`${id}-consent`} role="alert" className="mt-2 text-small text-error">
            {e.consent}
          </p>
        )}
        <p className="mt-3 text-small">
          <Link href={zackLink} className="tlink" target="_blank">
            Read what Zack does first
          </Link>
        </p>
      </section>

      <section aria-labelledby={`${id}-pricing`}>
        <h2 id={`${id}-pricing`} className="text-title">
          Pricing
        </h2>
        {sponsor ? (
          <p className="mt-3 text-ink-2">{sponsor} pays for your Roger membership, so you won’t be asked for a card.</p>
        ) : (
          <p className="mt-3 text-ink-2">
            Roger is {usd} a month or {cad} a month, plus tax. We’ll ask for your card before Cora’s first full list is shown. Your free
            trial includes your first two Cora lists, two Mondays.
          </p>
        )}
      </section>

      <button type="submit" className="btn btn-l" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
