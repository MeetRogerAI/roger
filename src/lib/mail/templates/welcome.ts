import { amount, money, taxPhrase, type Currency } from "@/lib/billing/prices";
import type { V3Settings } from "@/lib/v3-settings";
import { appUrl, renderEmail, type Rendered } from "../layout";

/**
 * Email 2 (spec B.13): welcome, sent when sign-up ends at Step 3 (plan
 * 2026-11-26-001, Unit 2). No card has been asked for yet, and the email
 * does not say when it will be (Peter's wording sign-off, 2026-11-26). Monthly is the only plan; the higher-rate
 * rule lives in the terms and FAQ, not here (origin R6).
 */
export function welcomeEmail(o: { name: string; currency: Currency; path: string; settings: V3Settings }): Rendered {
  // Both prices for every member, whatever their currency (Peter, 2026-11-27), each from the settings; then the
  // member's own tax words, as the price plus the tax (S18 point a).
  const price = (["USD", "CAD"] as const).map((c) => money(amount(o.settings, "monthly", c), c)).join(" / ");
  const terms = [
    `After that, Roger is ${price} a month ${taxPhrase(o.currency)}. Your first charge comes with your third list, and we’ll email you the exact date and amount before it happens. You can cancel any time in one click.`,
  ];
  const next =
    o.path === "running"
      ? { line: "Your next step is to connect Zack to your AI agent. It takes a few minutes.", label: "Connect Zack" }
      : { line: "Your next step is to set up your AI agent and the starter team. Most people finish in about half an hour.", label: "Get started" };
  return renderEmail({
    subject: "Welcome to Roger",
    preview: "Your first two Cora lists are free.",
    heading: `Welcome, ${o.name.split(" ")[0] || "there"}.`,
    paragraphs: ["Your first two Cora lists are free.", ...terms, next.line],
    button: { label: next.label, url: appUrl("/app") },
  });
}
