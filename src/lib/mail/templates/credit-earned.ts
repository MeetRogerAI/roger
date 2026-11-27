import { appUrl, renderEmail, type Rendered } from "../layout";
import { moneyCents, type Currency } from "@/lib/billing/prices";

/**
 * Referral credit posted (B2 plan Unit 4): the referrer is told once per
 * grant. The amount is what was added to their balance when this was sent.
 */
export function creditEarnedEmail(o: { amountCents: number; currency: Currency }): Rendered {
  const amount = moneyCents(o.amountCents, o.currency);
  return renderEmail({
    subject: `You earned ${amount} of Roger credit`,
    preview: "Someone you invited is now paying for Roger.",
    heading: "Someone you invited is now paying for Roger.",
    paragraphs: [`${amount} of credit is on your account now. It comes off your next charges before your card is charged.`],
    button: { label: "See your referrals", url: appUrl("/app/referrals") },
  });
}
