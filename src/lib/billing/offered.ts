import { plans } from "@/data/config";

/**
 * The one switch for the "one Cora Curation at a time" plan (`per_run`):
 * `plans.oneAtATimeOffered` in src/data/config.ts, off at launch.
 *
 * Since main's payment-at-first-curation work (plan 2026-11-26-001, merged
 * into this branch for the v1 launch) one at a time is retired on its own:
 * sign-up has no plan picker and always stores monthly, the switch offer, the
 * order box and the order actions are gone from the app, and the order emails
 * are dormant. So this switch is now only a second, server-side guard, and
 * setting it to true no longer brings the option back by itself: the screens
 * would have to be rebuilt too.
 *
 * While it is off:
 * - nobody can ask to switch to one at a time (billing/switch.ts `switchPlan`),
 *   and the billing page offers no such switch. A switch asked for while the
 *   plan was offered is not undone: `applySwitch`, the hourly pass for booked
 *   switches and the subscription-ended webhook do not read this switch;
 * - no new order can be placed (billing/orders.ts), and the Friday order
 *   reminder is not sent;
 * - the emails and the billing page an account still on the plan can get
 *   name no ordering (billing.ts, charges.ts, quote.ts, plan-changed.ts,
 *   zack/sharing-effect.ts).
 *
 * It does not migrate anyone, and it does not touch a charge: an account
 * already on the plan stays on it, an order placed before the switch went off
 * is still charged and delivered as agreed (and can still be cancelled), and a
 * switch to monthly stays open to it. Tests of the one-at-a-time machinery
 * mock this module to turn the option on.
 */
export function oneAtATimeOffered(): boolean {
  return plans.oneAtATimeOffered;
}

/** Said to anyone who asks for the option while it is off, and to an account still on it. */
export const ONE_AT_A_TIME_NOT_OFFERED = "Ordering one Cora Curation at a time isn’t offered at the moment. Monthly brings a Cora Curation every Monday.";

/**
 * The billing page's and the status line's close for an account still on one at a time: there is no switch to
 * offer (the billing page has none), so the order emails and the order refusal end with it too (November 28, 2026).
 */
export const PLAN_QUESTIONS = "Monthly is now the only plan. Write to us if you have questions about yours.";