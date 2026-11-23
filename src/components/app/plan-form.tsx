"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { savePlan, type PlanState } from "@/app/start/billing-actions";

const idle: PlanState = { status: "idle" };
const choice =
  "flex cursor-pointer gap-4 rounded-[8px] border border-rule bg-surface p-5 has-[:checked]:border-accent has-[:checked]:bg-accent-wash";

/** Spec B.4, screen 3. Monthly is selected and marked; the consent box starts unticked. */
export function PlanForm({ monthly, perRun, higher, zackLink }: { monthly: string; perRun: string; higher: string; zackLink: string }) {
  const [state, action, pending] = useActionState(savePlan, idle);
  const e = state.errors ?? {};
  const id = useId();
  return (
    <form action={action} className="mt-10 space-y-8" noValidate>
      <fieldset aria-describedby={e.plan ? `${id}-plan` : undefined}>
        <legend className="sr-only">Choose how to pay after your two free lists</legend>
        <div className="grid gap-4">
          <label className={choice}>
            <input type="radio" name="plan" value="monthly" defaultChecked className="mt-1 size-4 accent-accent" />
            <span>
              <span className="text-meta font-semibold uppercase tracking-wider text-accent">Most people choose this</span>
              <span className="mt-1 block text-title">Monthly, {monthly} a month</span>
              <span className="mt-1 block text-small text-ink-2">Three ideas every Monday. Charged once a month, starting with your third list.</span>
            </span>
          </label>
          <label className={choice}>
            <input type="radio" name="plan" value="per_run" className="mt-1 size-4 accent-accent" />
            <span>
              <span className="block text-title">One list at a time, {perRun} each</span>
              <span className="mt-1 block text-small text-ink-2">Order a list for any Monday you want one, after your two free lists.</span>
            </span>
          </label>
        </div>
        {e.plan && (
          <p id={`${id}-plan`} role="alert" className="mt-2 text-small text-error">
            {e.plan}
          </p>
        )}
        <p className="mt-4 text-small text-ink-2">On monthly: if Zack misses two weeks in a month, that month is {higher}. We always tell you first.</p>
      </fieldset>

      <div>
        <label className="flex gap-3 text-small">
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
      </div>

      <button type="submit" className="btn btn-l" disabled={pending}>
        {pending ? "Saving…" : "Continue to your card"}
      </button>
    </form>
  );
}
