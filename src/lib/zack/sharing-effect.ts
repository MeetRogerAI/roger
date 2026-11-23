import { addDays, weekOf } from "@/lib/clock";
import { amount, money, type Currency, type Plan } from "@/lib/billing/prices";
import { longDate } from "@/lib/mail/templates/welcome";
import type { V3Settings } from "@/lib/v3-settings";
import type { Sharing } from "./settings";

/**
 * What a sharing change does to the price (spec B.5 item 2). Monthly members
 * whose Zack does not share pay the higher rate (the contributor rule, which
 * Unit 14 applies). Moving between two choices on the same rate changes
 * nothing. The date is known during the trial (the first charge); after
 * that it is the next monthly charge.
 */
export function sharingEffect(o: {
  settings: V3Settings;
  plan: Plan;
  currency: Currency | null;
  from: Sharing;
  to: Sharing;
  trialStartedAt: string | null;
  status: string;
}): string | null {
  const cur = o.currency ?? "USD";
  if (o.plan === "per_run") return o.to === "off" ? "With Zack off, lists can’t be ordered until sharing is back on. Your price doesn’t change." : null;
  const band = (s: Sharing) => (s === "share" ? "standard" : "higher");
  if (band(o.from) === band(o.to)) return null;
  const when =
    o.status === "trial" && o.trialStartedAt
      ? `From your first charge, no earlier than ${longDate(addDays(weekOf(new Date(o.trialStartedAt)), 14))},`
      : "From your next monthly charge";
  return o.to === "share"
    ? `${when} you will pay ${money(amount(o.settings, "monthly", cur), cur)} a month.`
    : `${when} you will pay ${money(amount(o.settings, "monthly", cur, "higher"), cur)} a month, the rate for members whose Zack doesn’t share.`;
}
