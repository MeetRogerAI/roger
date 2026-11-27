import { torontoDate } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { ANCHOR, ISO } from "@/lib/billing/adjustment";
import { oneAtATimeOffered } from "@/lib/billing/offered";
import { periodAt } from "@/lib/billing/period";
import { amount, money, moneyCents, priceId, taxPhrase, type Currency } from "@/lib/billing/prices";
import type { AdjustmentGateway, InvoiceRow, OrderGateway, PlanGateway } from "@/lib/billing/subscriptions";
import { switchOffer, type SwitchOffer } from "@/lib/billing/switch";
import { longDate } from "@/lib/mail/templates/welcome";
import { changedAmountChargeDate } from "./status";
import type { V3Settings } from "@/lib/v3-settings";

/**
 * What /app/billing shows (spec B.10): the plan and its price, the next
 * charge with tax (the told quote, or Stripe's preview), invoices with their
 * hosted copies, and which of switch, cancel and undo apply. Stripe is read
 * only for the preview and the invoices; either failing leaves the page
 * readable with the price and the tax words instead.
 */
export type BillingView = {
  status: string;
  plan: "monthly" | "per_run";
  planLine: string;
  nextCharge: string;
  invoices: InvoiceRow[];
  invoicesFailed: boolean;
  canUpdateCard: boolean;
  offer: SwitchOffer | null;
  cancel: { label: string; switchLink: boolean } | null;
  undo: { until: string } | null;
};

type U = {
  status: string;
  plan: "monthly" | "per_run";
  hold_reason: string | null;
  currency: Currency | null;
  free_lists_used: number;
  quote: { totalCents: number; currency: Currency; week: string; at?: string } | null;
  stripe_customer: string | null;
  stripe_subscription: string | null;
  cancel_requested_at: string | null;
  access_ends_at: string | null;
  plan_change_to: string | null;
  anchor: string | null;
  at_once: boolean;
  switched: boolean;
  renewal_invoice: string | null;
};

export type BillingDeps = { settings: V3Settings; now: Date; plans?: PlanGateway | null; adjust?: AdjustmentGateway | null; orders?: OrderGateway | null };

export async function loadBilling(q: Query, userId: string, d: BillingDeps): Promise<BillingView | null> {
  const [u] = await q<U>(
    `select status, plan, hold_reason, currency, free_lists_used, quote, stripe_customer, stripe_subscription,
            ${ISO("cancel_requested_at")} as cancel_requested_at, ${ISO("access_ends_at")} as access_ends_at, plan_change_to, ${ISO(ANCHOR("users"))} as anchor,
            (access_ends_at is not null and access_ends_at <= cancel_requested_at + interval '1 minute') as at_once,
            switched_from_per_run_at is not null as switched, renewal_invoice
     from users where id = $1`,
    [userId],
  );
  if (!u || u.status === "signup") return null;
  const s = d.settings;
  const cur = u.currency ?? "USD";
  const tax = taxPhrase(cur);
  const monthly = money(amount(s, "monthly", cur), cur);
  const run = money(amount(s, "per_run", cur), cur);
  // One at a time is named with its price only while it is offered (billing/offered.ts). An account still on it while it
  // is not offered keeps its plan: no new order can be placed, nothing is charged, and the switch to monthly stays open.
  const offered = oneAtATimeOffered();
  const planLine =
    u.plan === "monthly"
      ? `Monthly: ${monthly} a month, ${tax}, for a Cora Curation every Monday.`
      : offered
        ? `One Cora Curation at a time: ${run} each, ${tax}, only for the Mondays you order.`
        : "One Cora Curation at a time. This plan is not offered at the moment.";
  const date = (iso: string) => longDate(torontoDate(new Date(iso)));
  const accessLeft = Boolean(u.access_ends_at && new Date(u.access_ends_at) > d.now);
  const switching = u.status === "active" && u.plan_change_to === "per_run" && Boolean(u.cancel_requested_at);
  // Cancelled but still inside the paid month: active until the subscription ends.
  const cancelling = u.status === "active" && Boolean(u.cancel_requested_at) && Boolean(u.stripe_subscription) && !switching;

  let nextCharge: string;
  if (u.status === "held" && u.hold_reason === "renewal_unpaid") nextCharge = "Your last monthly payment is unpaid. Update your card and it is charged straight away.";
  else if (u.status === "held" && u.hold_reason === "amount_changed") {
    const when = changedAmountChargeDate(u.quote);
    nextCharge =
      u.quote && when
        ? `Your first charge changed to ${moneyCents(u.quote.totalCents, u.quote.currency)} with tax. It is charged on ${longDate(when)}, with your Cora Curation. If you’d rather not, cancel before then.`
        : "Your first charge amount changed. It is charged a day after we told you the new amount, with your Cora Curation.";
  } else if (u.status === "held") nextCharge = "Your first charge is waiting for a card that works. Update your card and it is tried straight away.";
  else if (u.status === "cancelled" || u.status === "closed") nextCharge = accessLeft && !u.at_once ? `Nothing more will be charged. Your Cora Curations continue until ${date(u.access_ends_at!)}.` : "Nothing more will be charged.";
  else if (cancelling) nextCharge = accessLeft ? `Nothing more will be charged. Your Cora Curations continue until ${date(u.access_ends_at!)}.` : "Nothing more will be charged.";
  else if (switching) nextCharge = `Nothing more is charged for monthly. It ends on ${date(u.access_ends_at!)}; after that, only the Cora Curations you order.`;
  else if (u.plan === "monthly" && u.stripe_subscription) nextCharge = await renewalLine(d, u, monthly, tax);
  else if (u.plan === "monthly" && u.status === "trial") {
    if (u.quote) nextCharge = `Your first charge, with your third Cora Curation: no earlier than ${longDate(u.quote.week)}, ${moneyCents(u.quote.totalCents, u.quote.currency)} with tax.`;
    else if (u.free_lists_used < s.freeRuns) nextCharge = `Nothing until your free Cora Curations are done. Then ${monthly} a month, ${tax}, starting with your third Cora Curation.`;
    else nextCharge = `Your first charge comes with your next Cora Curation: ${monthly}, ${tax}.`;
  } else if (!offered) {
    // Ordering is not named while it is not offered. One at a time: what still holds for the account. Monthly with no
    // subscription and no trial (a sponsored member, say): there is no charge to announce.
    nextCharge =
      u.plan === "per_run"
        ? "No new order can be placed. An order you placed earlier is still charged the Monday it is sent; otherwise nothing is charged unless you switch to monthly."
        : "No charge is scheduled.";
  } else nextCharge = await orderLine(d, u, run, tax);

  let invoices: InvoiceRow[] = [];
  let invoicesFailed = false;
  if (u.stripe_customer && d.plans) {
    try {
      invoices = await d.plans.invoices(u.stripe_customer);
    } catch (e) {
      invoicesFailed = true;
      console.error("[billing] invoices", e instanceof Error ? e.message : e);
    }
  }

  const live = ["trial", "active", "held"].includes(u.status);
  // A paying one-at-a-time member waiting for their first monthly charge is "trial" in the data, never in the words.
  const label = u.status === "trial" && !u.switched ? "Cancel my trial" : u.stripe_subscription && u.status === "active" ? "Cancel my plan" : "Cancel my account";
  const cancel = live && !cancelling ? { label, switchLink: offered && u.plan === "monthly" && !switching && u.status !== "held" && !u.renewal_invoice } : null;
  const undo = cancelling && accessLeft ? { until: date(u.access_ends_at!) } : null;
  return {
    status: u.status,
    plan: u.plan,
    planLine,
    nextCharge,
    invoices,
    invoicesFailed,
    canUpdateCard: live && Boolean(u.stripe_customer),
    offer: live ? await switchOffer(q, s, d.now, userId) : null,
    cancel,
    undo,
  };
}

/** The coming renewal: its date from the subscription's anchor, its total with tax from Stripe's preview (any month's difference included). */
async function renewalLine(d: BillingDeps, u: U, monthly: string, tax: string): Promise<string> {
  const end = periodAt(u.anchor, d.now)?.endDate;
  const when = end ? `${longDate(end)}: ` : "";
  if (d.adjust && u.stripe_customer && u.stripe_subscription) {
    try {
      const p = await d.adjust.previewRenewal({ customer: u.stripe_customer, subscription: u.stripe_subscription });
      return `Next charge ${when}${moneyCents(p.totalCents, p.currency as Currency)} with tax.`;
    } catch (e) {
      console.error("[billing] renewal preview", e instanceof Error ? e.message : e);
    }
  }
  return `Next charge ${when}${monthly}, ${tax}.`;
}

/** One at a time: nothing unless ordered; a list's price with tax from Stripe's preview where it can be read. */
async function orderLine(d: BillingDeps, u: U, run: string, tax: string): Promise<string> {
  const price = priceId("per_run", u.currency ?? "USD");
  if (d.orders && u.stripe_customer && price) {
    try {
      const p = await d.orders.previewOrder({ customer: u.stripe_customer, price });
      return `Nothing is charged unless you order. Each Cora Curation is ${moneyCents(p.totalCents, p.currency as Currency)} with tax, charged the Monday it is sent.`;
    } catch (e) {
      console.error("[billing] order preview", e instanceof Error ? e.message : e);
    }
  }
  return `Nothing is charged unless you order. Each Cora Curation is ${run}, ${tax}, charged the Monday it is sent.`;
}
