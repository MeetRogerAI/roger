import { amount, money, taxPhrase, type Currency, type Plan } from "@/lib/billing/prices";
import type { V3Settings } from "@/lib/v3-settings";
import { appUrl, renderEmail, type Rendered } from "../layout";

/** "Monday, December 7" for a "YYYY-MM-DD" Monday. */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * Email 2 (spec B.13): welcome, with the terms restated and the next step
 * for the user's path. For monthly it also states the contributor rule
 * (spec B.9, "telling the user", step 1).
 */
export function welcomeEmail(o: {
  name: string;
  plan: Plan;
  currency: Currency;
  path: string;
  settings: V3Settings;
  firstChargeNoEarlier: string;
}): Rendered {
  const price = money(amount(o.settings, o.plan, o.currency), o.currency);
  const higher = money(amount(o.settings, "monthly", o.currency, "higher"), o.currency);
  const tax = taxPhrase(o.currency);
  const terms =
    o.plan === "monthly"
      ? [
          `After that, Roger is ${price} a month, ${tax}. Your first charge will be no earlier than ${longDate(o.firstChargeNoEarlier)}. We’ll email you the exact date and amount before it happens. You can cancel any time in one click.`,
          `Roger works because everyone’s Zack sends a report each week. If Zack misses two weeks in one month, that month is ${higher}. We always tell you first.`,
        ]
      : [`After your two free lists, you’re charged ${price}, ${tax}, only when you order a list. Nothing is charged automatically.`];
  const next =
    o.path === "running"
      ? { line: "Your next step is to connect Zack to your AI agent. It takes a few minutes.", label: "Connect Zack" }
      : { line: "Your next step is to set up your AI agent and the starter team. Most people finish in about half an hour.", label: "Get started" };
  return renderEmail({
    subject: "Welcome to Roger",
    preview: "Your first two Monday lists are free.",
    heading: `Welcome, ${o.name.split(" ")[0] || "there"}.`,
    paragraphs: ["Your first two Monday lists are free. Your card is charged only with the third.", ...terms, next.line],
    button: { label: next.label, url: appUrl("/app") },
  });
}
