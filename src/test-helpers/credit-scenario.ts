import type Stripe from "stripe";
import type { Transport } from "@/lib/mail/send";
import { handleStripeEvent } from "@/lib/billing/webhook";
import type { CreditDeps } from "@/lib/referrals/credit-money";
import { mergeV3, type V3Settings } from "@/lib/v3-settings";
import { fakeGateway } from "./fake-card-gateway";
import { fakeCredits } from "./fake-credits";
import { testDb, testSponsor } from "./pglite-db";

/**
 * A referral credit scenario (B2 Unit 4 tests): a PGlite database, the fake
 * Stripe balance, members and referrals, and Stripe events through the real
 * webhook handler.
 */
export const CREDIT_NOW = new Date("2026-12-16T15:00:00Z");
export const REFERRALS_ON = mergeV3([
  { key: "v3.cycleLive", value: true },
  { key: "v3.signupOpen", value: true },
  { key: "v3.referralsOn", value: true },
]);
export const REFERRALS_OFF = mergeV3([
  { key: "v3.cycleLive", value: true },
  { key: "v3.signupOpen", value: true },
]);

export async function creditScenario() {
  const { query } = await testDb();
  const stripe = fakeCredits();
  const sent: Parameters<Transport>[0][] = [];
  const s = { query, stripe, sent, failMail: false, settings: REFERRALS_ON as V3Settings, now: CREDIT_NOW, evt: 0 };
  const transport: Transport = async (m) => {
    if (s.failMail && !m.subject.startsWith("[Roger]")) return { ok: false, error: "resend down", retryable: true };
    sent.push(m);
    return { ok: true };
  };
  process.env.ADMIN_EMAILS = "peter@example.com,zack@example.com";

  const deps = (o: Partial<CreditDeps> = {}): CreditDeps => ({ credits: stripe, settings: s.settings, now: s.now, query, transport, sleep: async () => {}, ...o });

  /** A member. `card: false` is a trial with no card saved yet (no customer, no currency). */
  async function member(
    email: string,
    o: { currency?: "USD" | "CAD"; card?: boolean; fingerprint?: string | null; status?: string; sponsored?: boolean } = {},
  ): Promise<{ id: string; customer: string | null }> {
    const card = o.card !== false;
    const customer = card ? `cus_${email.split("@")[0]}` : null;
    const sponsor = o.sponsored ? await testSponsor(query) : null;
    const [u] = await query<{ id: string }>(
      `insert into users (email, name, status, plan, currency, stripe_customer, trial_started_at, card_fingerprint, sponsor_id, access_ends_at)
       values ($1, 'Member', $2, 'monthly', $3, $4, $5, $6, $7, $8) returning id`,
      [
        email,
        o.status ?? (card ? "active" : "trial"),
        card ? (o.currency ?? "CAD") : null,
        customer,
        card ? "2026-12-01T15:00:00Z" : null,
        o.fingerprint === undefined ? `fp_${email}` : o.fingerprint,
        sponsor,
        o.status === "closed" ? "2026-12-10T15:00:00Z" : null,
      ],
    );
    return { id: u.id, customer };
  }

  /** A referred member (a customer, in trial) and their `trial` referral from `referrer`. */
  async function referred(email: string, referrer: string | null, o: Parameters<typeof member>[1] = {}) {
    const m = await member(email, { status: "trial", ...o });
    const [r] = await query<{ id: string }>(`insert into referrals (referrer_id, referred_user_id, source, stage, trial_at) values ($1, $2, 'link', 'trial', $3) returning id`, [
      referrer,
      m.id,
      CREDIT_NOW.toISOString(),
    ]);
    return { ...m, referral: r.id };
  }

  const event = (type: string, object: Record<string, unknown>, id = `evt_${++s.evt}`, created = Math.floor(CREDIT_NOW.getTime() / 1000)) =>
    ({ id, type, created, data: { object: { lines: { data: [] }, ...object } } }) as unknown as Stripe.Event;

  const handle = (e: Stripe.Event, o: { settings?: V3Settings } = {}) =>
    handleStripeEvent(query, fakeGateway(), e, { getSettings: async () => o.settings ?? s.settings, now: s.now, credits: stripe, query, transport, sleep: async () => {} });

  /** The member's subscription invoice paid in the fake (CA$280 + 13% HST unless said). */
  const pay = (customer: string, o: { id?: string; exTax?: number; tax?: number; currency?: "USD" | "CAD"; subscription?: string | null } = {}) => {
    const exTax = o.exTax ?? 28000;
    return stripe.payInvoice({
      id: o.id ?? `in_${++s.evt}`,
      customer,
      currency: o.currency ?? "CAD",
      totalExcludingTax: exTax,
      taxCents: o.tax ?? Math.round(exTax * 0.13),
      subscription: o.subscription,
    });
  };

  /** Paid, then `invoice.paid` through the webhook. */
  async function paid(customer: string, o: Parameters<typeof pay>[1] & { settings?: V3Settings } = {}) {
    const inv = pay(customer, o);
    await handle(event("invoice.paid", { id: inv.id, object: "invoice", customer }), { settings: o.settings });
    return inv;
  }

  const chargeOf = (inv: { paymentIntent: string | null }) => `ch_${inv.paymentIntent!.slice(3)}`;

  const ledger = () =>
    query<{
      id: string;
      kind: string;
      amount_cents: number;
      uncollected_cents: number;
      offset_cents: number;
      currency: string;
      status: string;
      reason: string | null;
      stripe_txn: string | null;
      user_id: string | null;
      source_object_id: string | null;
    }>(
      `select id, kind, amount_cents, uncollected_cents, offset_cents, currency, status, reason, stripe_txn, user_id, source_object_id from credits
       order by created_at, array_position(array['grant', 'clawback', 'lapse']::text[], kind), (status = 'lapsed'), id`,
    );
  const stage = async (referral: string) => (await query<{ stage: string }>(`select stage from referrals where id = $1`, [referral]))[0].stage;
  const posts = () => stripe.calls.filter((c) => c.startsWith("post:"));

  return Object.assign(s, { transport, deps, member, referred, event, handle, pay, paid, chargeOf, ledger, stage, posts });
}
