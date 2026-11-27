import { plans } from "@/data/config";

/**
 * The one switch for the "one Cora Curation at a time" plan (`per_run`):
 * `plans.oneAtATimeOffered` in src/data/config.ts, off at launch.
 *
 * While it is off:
 * - sign-up stores monthly and refuses any other plan (start/billing-actions.ts);
 * - nobody can switch to one at a time, by click or by a switch booked earlier
 *   (billing/switch.ts), and the billing page offers no such switch;
 * - no new order can be placed (billing/orders.ts), the order box is not
 *   shown, and the Friday order reminder is not sent;
 * - no page or email names the option or its price to a monthly member.
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
