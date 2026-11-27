import type { Query } from "@/lib/db-query";
import type { CreditGateway } from "@/lib/billing/gateway";
import type { Currency } from "@/lib/billing/prices";
import type { MailDeps } from "@/lib/mail/send";
import type { V3Settings } from "@/lib/v3-settings";

/**
 * The referral credit ledger's vocabulary and its money rules (B2 plan
 * Unit 4): row kinds and statuses, the amount a payment earns, and the
 * fixed USD/CAD conversion. No Stripe calls here.
 *
 * Status of a row: `pending_customer` (waiting to post: a grant waiting for
 * its referrer's card, or a clawback or lapse about to post), `pending_switch`
 * (a grant recorded while `v3.referralsOn` is off), `frozen` (a dispute is
 * open on the payment it was earned on), `posted`, or `lapsed` (never posted:
 * the referrer is sponsored or closed, or the payment was clawed back).
 */
export const CREDIT_KINDS = ["grant", "clawback", "lapse"] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];
export const CREDIT_STATUSES = ["pending_customer", "pending_switch", "frozen", "posted", "lapsed"] as const;
export type CreditStatus = (typeof CREDIT_STATUSES)[number];
/** Rows waiting to post (the posting sweep's rows). */
export const WAITING = ["pending_customer", "pending_switch"] as const satisfies readonly CreditStatus[];
/** Rows not posted and not given up: waiting, or held by a dispute. An account cannot be deleted while it has one. */
export const UNPOSTED = ["pending_customer", "pending_switch", "frozen"] as const satisfies readonly CreditStatus[];

/** An SQL `in (...)` list from one of the tuples above (fixed strings only, never user input). */
export const sqlList = (xs: readonly CreditStatus[] | readonly CreditKind[]) => xs.map((s) => `'${s}'`).join(", ");

/**
 * The job's dependencies. `lease` is set while the member's balance lease
 * is held (credit-balance.ts), so a nested call does not take it again.
 * Every ledger timestamp is the job clock (`now`), never the database's.
 */
export type CreditDeps = {
  credits: CreditGateway;
  settings: V3Settings;
  now: Date;
  lease?: { userId: string; holder: string; startedAt: number };
  /** The real clock (epoch ms) the lease's time limit is measured on; tests pass their own. */
  clock?: () => number;
} & MailDeps;

export type CreditRow = {
  id: string;
  user_id: string | null;
  referral_id: string | null;
  kind: CreditKind;
  amount_cents: number;
  uncollected_cents: number;
  offset_cents: number;
  currency: Currency;
  status: CreditStatus;
  reason: string | null;
  stripe_txn: string | null;
  source_payment_intent: string | null;
  source_object_id: string | null;
  created_at: Date;
};
const ROW = `c.id, c.user_id, c.referral_id, c.kind, c.amount_cents, c.uncollected_cents, c.offset_cents, c.currency, c.status, c.reason, c.stripe_txn,
  c.source_payment_intent, c.source_object_id, c.created_at`;

export async function loadCredit(q: Query, id: string): Promise<CreditRow | null> {
  const [r] = await q<CreditRow>(`select ${ROW} from credits c where c.id = $1`, [id]);
  return r ?? null;
}

/** The grant earned on a payment intent, if any. */
export async function grantForPayment(q: Query, pi: string): Promise<CreditRow | null> {
  const [g] = await q<CreditRow>(`select ${ROW} from credits c where c.kind = 'grant' and c.source_payment_intent = $1 order by c.created_at limit 1`, [pi]);
  return g ?? null;
}

/**
 * USD and CAD prices are in a fixed ratio of 7:5 (US$200 ↔ CA$280, Peter,
 * November 27): a credit earned on an invoice in the other currency is
 * converted at that ratio, not at a market rate, so it is always exactly one
 * month at the referrer's own price when the payer paid a full month.
 * Integer arithmetic, one rounding.
 */
export function convertCents(cents: number, from: Currency, to: Currency): number {
  if (from === to) return cents;
  return from === "USD" ? Math.round((cents * 7) / 5) : Math.round((cents * 5) / 7);
}

/**
 * A grant moved to another currency: the gross is converted once and the
 * offset once, and the amount is what is left, so amount + offset is always
 * exactly the converted gross.
 */
export function convertGrant(g: { amount: number; offset: number }, from: Currency, to: Currency): { amount: number; offset: number } {
  const gross = convertCents(g.amount + g.offset, from, to);
  const offset = Math.min(gross, convertCents(g.offset, from, to));
  return { amount: gross - offset, offset };
}

/** One month at the list (standard monthly) price, in cents. */
export function listCents(s: Pick<V3Settings, "priceUsd" | "priceCad">, c: Currency): number {
  return Math.round((c === "CAD" ? s.priceCad : s.priceUsd) * 100);
}

/** The credit an invoice earns: one month at the referrer's list price, at most the invoice's value before tax. */
export function grantCents(s: Pick<V3Settings, "priceUsd" | "priceCad">, inv: { totalExcludingTax: number; currency: Currency }, to: Currency): number {
  return Math.max(0, Math.min(listCents(s, to), convertCents(inv.totalExcludingTax, inv.currency, to)));
}

/**
 * How much of a grant a reversal takes back: the grant's value times the
 * share of the payment reversed so far (`reversed`, cumulative, capped at
 * `paid`), less what was taken already, and never more than the grant.
 */
export function clawCents(o: { gross: number; taken: number; reversed: number; paid: number }): number {
  if (o.paid <= 0) return 0;
  const target = Math.round((o.gross * Math.min(o.reversed, o.paid)) / o.paid);
  return Math.max(0, Math.min(target, o.gross) - o.taken);
}

/** SQL: the key of a closed account's current close (its access end), for its one lapse row. */
export const CLOSE_KEY_SQL = (alias = "u") => `('close:' || coalesce(extract(epoch from ${alias}.access_ends_at)::bigint::text, 'legacy'))`;
