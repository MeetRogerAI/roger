import { amount, money, taxPhrase, type Currency } from "@/lib/billing/prices";
import type { V3Settings } from "@/lib/v3-settings";
import { appUrl, renderEmail, type Rendered } from "../layout";

/**
 * Email 2 (spec B.13): welcome, sent when sign-up ends at Step 3 (plan
 * 2026-11-26-001, Unit 2). No card has been asked for yet, and the email
 * does not say when it will be (Peter's wording sign-off, 2026-11-26). Monthly is the only plan; the higher-rate
 * rule lives in the terms and FAQ, not here (origin R6).
 */
export function welcomeEmail(o: { name: string; currency: Currency; path: string; settings: V3Settings; sponsor?: string | null }): Rendered {
  const price = money(amount(o.settings, "monthly", o.currency), o.currency);
  // A sponsored member (B2 Unit 10) pays nothing: no price, no charge and no free-list line.
  const terms = o.sponsor
    ? [`${o.sponsor} pays for your Roger membership, so you won’t be asked for a card.`]
    : [
        "Your first two Cora lists are free.",
        `After that, Roger is ${price} a month, ${taxPhrase(o.currency)}. Your first charge comes with your third list, and we’ll email you the exact date and amount before it happens. You can cancel any time in one click.`,
      ];
  const next =
    o.path === "running"
      ? { line: "Your next step is to connect Zack to your AI agent. It takes a few minutes.", label: "Connect Zack" }
      : { line: "Your next step is to set up your AI agent and the starter team. Most people finish in about half an hour.", label: "Get started" };
  return renderEmail({
    subject: "Welcome to Roger",
    preview: o.sponsor ? `${o.sponsor} pays for your Roger membership.` : "Your first two Cora lists are free.",
    heading: `Welcome, ${o.name.split(" ")[0] || "there"}.`,
    paragraphs: [...terms, next.line],
    button: { label: next.label, url: appUrl("/app") },
  });
}
