import type { Query } from "@/lib/db-query";
import type { MailDeps } from "@/lib/mail/send";
import { counterFor, hit, limits, type Counter } from "@/lib/rate-limit";
import type { V3Settings } from "@/lib/v3-settings";
import type { CardGateway, SetupSession } from "./gateway";
import { hasCard, isNoCardTrial } from "./has-card";
import type { Currency, Plan } from "./prices";

/**
 * Saving the card (spec B.9): a card with a billing address, nothing charged.
 *
 * Sign-up no longer reaches this (plan 2026-11-26-001, Unit 2): it ends at
 * Step 3 with a trial and no card, and the welcome email is sent there
 * (`src/lib/signup/finish.ts`). `startCardSetup` / `completeCardSetup` stay
 * for the Payment step, which Units 5 and 6 rebuild on them; until then they
 * still move a `signup` account to `trial` and send nothing.
 */

type SignupUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  plan: Plan;
  currency: Currency | null;
  stripe_customer: string | null;
  path: string;
  consent_at: string | null;
  trial_started_at: string | Date | null;
};

const USER_COLUMNS = "id, email, name, status, plan, currency, stripe_customer, path, consent_at, trial_started_at";

async function loadUser(q: Query, id: string): Promise<SignupUser | null> {
  const rows = await q<SignupUser>(`select ${USER_COLUMNS} from users where id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Opens Stripe's hosted card page. Creates the Stripe customer once (one per
 * user, kept on the user). Only for a signed-in user who has agreed to the
 * terms and not saved a card yet. The consent is checked here, not only on
 * the page, because a server action can be called directly.
 */
export async function startCardSetup(
  q: Query,
  gw: CardGateway,
  o: { userId: string; currency: Currency; successUrl: string; cancelUrl: string },
): Promise<{ ok: true; url: string } | { ok: false; reason: "not_found" | "already_saved" | "not_consented" }> {
  const u = await loadUser(q, o.userId);
  if (!u) return { ok: false, reason: "not_found" };
  if (u.status !== "signup") return { ok: false, reason: "already_saved" };
  if (!u.consent_at) return { ok: false, reason: "not_consented" };

  const customer = await ensureCustomer(q, gw, u);
  const session = await gw.createSetupSession({ userId: u.id, customer, currency: o.currency, successUrl: o.successUrl, cancelUrl: o.cancelUrl });
  return { ok: true, url: session.url };
}

/** The user's Stripe customer, created once (one per user, kept on the user). */
async function ensureCustomer(q: Query, gw: CardGateway, u: Pick<SignupUser, "id" | "email" | "name" | "stripe_customer">): Promise<string> {
  if (u.stripe_customer) return u.stripe_customer;
  const created = await gw.createCustomer({ userId: u.id, email: u.email, name: u.name });
  // The same idempotency key returns the same customer, so a race stores one id either way.
  const rows = await q<{ stripe_customer: string }>(
    `update users set stripe_customer = coalesce(stripe_customer, $2) where id = $1 returning stripe_customer`,
    [u.id, created],
  );
  return rows[0].stripe_customer;
}

/**
 * The limits on opening a card session (card-testing scripts open many):
 * per user and IP, per minute and per day. Every attempt is counted.
 */
export async function checkoutAllowed(userId: string, ip: string, now: Date = new Date(), counter?: Counter): Promise<boolean> {
  const allowed = [
    await hit(`checkout:user:${userId}`, limits.checkoutPerUser, now, counter),
    await hit(`checkout:ip:${ip}`, limits.checkoutPerIp, now, counter),
    await hit(`checkout:user-day:${userId}`, limits.checkoutPerUserDay, now, counter),
    await hit(`checkout:ip-day:${ip}`, limits.checkoutPerIpDay, now, counter),
  ];
  return !allowed.includes(false);
}

/** What a refused card-session open says (shared with "Update card"). */
export const CHECKOUT_LIMITED = "Too many tries. Wait a while and try again, or write to us.";

export type EmbeddedSetup =
  | { ok: true; sessionId: string; clientSecret: string; currency: Currency; reused: boolean }
  | { ok: false; reason: "not_found" | "not_allowed" | "rate_limited" };

type EmbeddedUser = SignupUser & { setup_session: string | null; sponsored: boolean };

/**
 * The Payment page's card form (plan 2026-11-26-001, Unit 4): the embedded
 * setup session for a trial with no card. One open session per user, kept in
 * `users.setup_session` and handed back on every visit while it is still open
 * for this customer and currency (a double submit or a reload never opens a
 * second one). A new one is made only when the stored one is complete,
 * expired, gone or for the other currency, and only that counts against the
 * checkout limits. The store is compare-and-set, so two tabs opening at once
 * end with one stored session, which both are given; Unit 5's completion
 * accepts only the stored session.
 */
export async function openEmbeddedSetup(
  q: Query,
  gw: CardGateway,
  o: { userId: string; ip: string; returnUrl: string; now?: Date; counter?: Counter },
): Promise<EmbeddedSetup> {
  const counter = o.counter ?? counterFor(q);
  let limited = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const [u] = await q<EmbeddedUser>(`select ${USER_COLUMNS}, setup_session, sponsor_id is not null as sponsored from users where id = $1`, [o.userId]);
    if (!u) return { ok: false, reason: "not_found" };
    if (!isNoCardTrial({ status: u.status, trialStartedAt: u.trial_started_at, sponsored: u.sponsored })) return { ok: false, reason: "not_allowed" };
    const customer = await ensureCustomer(q, gw, u);
    const currency: Currency = u.currency ?? "USD";

    if (u.setup_session) {
      const s = await readSession(gw, u.setup_session);
      if (s && s.status === "open" && s.clientSecret && s.customer === customer && s.currency === currency && s.purpose !== "card_update" && (!s.userId || s.userId === u.id)) {
        return { ok: true, sessionId: s.id, clientSecret: s.clientSecret, currency, reused: true };
      }
    }

    if (!limited) {
      if (!(await checkoutAllowed(u.id, o.ip, o.now ?? new Date(), counter))) return { ok: false, reason: "rate_limited" };
      limited = true;
    }
    const created = await gw.createEmbeddedSetupSession({ userId: u.id, customer, currency, returnUrl: o.returnUrl });
    const stored = await q(
      `update users set setup_session = $2 where id = $1 and setup_session is not distinct from $3 returning id`,
      [u.id, created.id, u.setup_session],
    );
    if (stored.length) return { ok: true, sessionId: created.id, clientSecret: created.clientSecret, currency, reused: false };
    // Another call stored its session first: ours is closed, and theirs is handed back on the next pass.
    await gw.expireSetupSession(created.id).catch(() => {});
  }
  return { ok: false, reason: "not_allowed" };
}

/** The stored session, or null when Stripe no longer has it. */
async function readSession(gw: CardGateway, id: string): Promise<SetupSession | null> {
  try {
    return await gw.getSetupSession(id);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "resource_missing" || /no such/i.test(err.message ?? "")) return null;
    throw e;
  }
}

/**
 * Drops the stored embedded session, for a currency change on the Payment
 * page (Unit 6): the open session is expired in Stripe so an old tab cannot
 * save a card in the other currency, and the next open makes a new one.
 * A session already complete is kept ("complete"): the card is saved, and the
 * caller runs the completion instead of changing the currency.
 */
export async function discardSetupSession(q: Query, gw: CardGateway, userId: string): Promise<"none" | "discarded" | "complete"> {
  const [u] = await q<{ setup_session: string | null }>(`select setup_session from users where id = $1`, [userId]);
  if (!u?.setup_session) return "none";
  const s = await readSession(gw, u.setup_session);
  if (s?.status === "complete") return "complete";
  if (s?.status === "open") await gw.expireSetupSession(s.id);
  // Re-read after the expiry: a confirm that landed just before it has completed the session.
  const after = s?.status === "open" ? await readSession(gw, s.id) : s;
  if (after?.status === "complete") return "complete";
  await q(`update users set setup_session = null where id = $1 and setup_session = $2`, [userId, u.setup_session]);
  return "discarded";
}

export type CompleteOutcome = "done" | "pending" | "address_invalid" | "not_yours" | "unknown_customer" | "not_consented";

export type CompleteOptions = {
  expectUserId?: string;
  /** Not read by the card step itself; the webhook reads it for the events that need settings. */
  getSettings: () => Promise<V3Settings>;
  now?: Date;
} & MailDeps;

/**
 * Finishes the card step. Safe to run twice and from two places: the return
 * page and the Stripe webhook both call it, and whichever is first starts the
 * trial. It sends no email: the welcome moved to the end of sign-up (Unit 2),
 * and Unit 5 makes this the unlock of a held list.
 *
 * `expectUserId` is the signed-in user on the return path; a session that
 * belongs to someone else changes nothing.
 */
export async function completeCardSetup(q: Query, gw: CardGateway, sessionId: string, o: CompleteOptions): Promise<CompleteOutcome> {
  const s = await gw.getSetupSession(sessionId);
  if (s.status !== "complete" || !s.customer || !s.paymentMethod) return "pending";

  const rows = await q<SignupUser>(`select ${USER_COLUMNS} from users where stripe_customer = $1`, [s.customer]);
  const u = rows[0];
  if (!u) return "unknown_customer";
  if (o.expectUserId && o.expectUserId !== u.id) return "not_yours";
  if (s.userId && s.userId !== u.id) return "not_yours";

  const now = o.now ?? new Date();
  if (u.status === "signup") {
    if (!u.consent_at) return "not_consented";
    await gw.setDefaultCard(s.customer, s.paymentMethod);
    const tax = await gw.checkTaxLocation(s.customer);
    if (tax === "invalid") return "address_invalid";

    // The user's own last choice wins over the currency an older Checkout tab was opened with.
    const currency: Currency = u.currency ?? s.currency ?? "USD";
    const started = await q<SignupUser>(
      `update users set status = 'trial', signup_step = 'done', currency = $2, country = coalesce($3, country),
         trial_started_at = coalesce(trial_started_at, $4)
       where id = $1 and status = 'signup' and consent_at is not null
       returning ${USER_COLUMNS}`,
      [u.id, currency, s.country, now.toISOString()],
    );
    // Another call may have started the trial between our read and this update.
    const now_ = started[0] ?? (await loadUser(q, u.id));
    return now_?.status === "trial" ? "done" : "pending";
  }
  return "done";
}

/**
 * "Update card" on /app/billing (spec B.9): Stripe's setup-mode Checkout
 * again, on the user's own customer, marked as a card update. Only for an
 * account that can still be charged.
 */
export async function startCardUpdate(
  q: Query,
  gw: CardGateway,
  o: { userId: string; successUrl: string; cancelUrl: string },
): Promise<{ ok: true; url: string } | { ok: false; reason: "not_found" | "no_card_yet" | "closed" }> {
  const u = await loadUser(q, o.userId);
  if (!u) return { ok: false, reason: "not_found" };
  if (!["trial", "active", "held"].includes(u.status)) return { ok: false, reason: u.status === "signup" ? "no_card_yet" : "closed" };
  // A Stripe customer is not a card: Payment creates the customer before the card is saved, and a
  // card saved here would skip the unlock (plan 2026-11-26-001, Unit 1).
  if (!u.stripe_customer || !hasCard({ status: u.status, trialStartedAt: u.trial_started_at })) return { ok: false, reason: "no_card_yet" };
  const session = await gw.createSetupSession({ userId: u.id, customer: u.stripe_customer, currency: u.currency ?? "USD", successUrl: o.successUrl, cancelUrl: o.cancelUrl, purpose: "card_update" });
  return { ok: true, url: session.url };
}

export type CardUpdateOutcome = "done" | "pending" | "address_invalid" | "not_yours" | "unknown_customer";

/** A claim on a card-update session left unfinished this long (a crash) can be taken again. */
const CARD_UPDATE_TAKEOVER = "5 minutes";

/**
 * Finishes a card update, from the return page or the webhook (whichever is
 * first). Only a session made by "Update card" counts. The session is claimed
 * first, and only the caller that wins the claim sets the new card as the
 * default for invoices, checks the address for tax and runs `after` (the held
 * charge retried at once, the quote re-checked): one new card is one retry.
 * The claim is marked done only after all of that, with its outcome, so a
 * failure is released and runs again on the webhook's retry; a caller that
 * finds it done reports the stored outcome, and one that finds it in progress
 * reports "pending".
 */
export async function completeCardUpdate(
  q: Query,
  gw: CardGateway,
  sessionId: string,
  o: { expectUserId?: string; after: (userId: string) => Promise<unknown> },
): Promise<CardUpdateOutcome> {
  const s = await gw.getSetupSession(sessionId);
  if (s.status !== "complete" || !s.customer || !s.paymentMethod) return "pending";
  // A sign-up card step (or any other Checkout) is never treated as a card update.
  if (s.purpose !== "card_update") return "not_yours";
  const [u] = await q<{ id: string }>(`select id from users where stripe_customer = $1`, [s.customer]);
  if (!u) return "unknown_customer";
  if ((o.expectUserId && o.expectUserId !== u.id) || (s.userId && s.userId !== u.id)) return "not_yours";
  const claimed = await q(
    `insert into card_updates (session_id, user_id) values ($1, $2)
     on conflict (session_id) do update set claimed_at = now()
       where card_updates.done_at is null and card_updates.claimed_at < now() - interval '${CARD_UPDATE_TAKEOVER}'
     returning session_id`,
    [s.id, u.id],
  );
  if (!claimed.length) {
    const [row] = await q<{ outcome: CardUpdateOutcome | null; done: boolean }>(`select outcome, done_at is not null as done from card_updates where session_id = $1`, [s.id]);
    return row?.done ? (row.outcome ?? "done") : "pending";
  }
  let outcome: CardUpdateOutcome = "done";
  try {
    await gw.setDefaultCard(s.customer, s.paymentMethod);
    if ((await gw.checkTaxLocation(s.customer)) === "invalid") outcome = "address_invalid";
    else await o.after(u.id);
  } catch (e) {
    // Released at once, so the webhook's retry (or a reload) does it all again.
    await q(`update card_updates set claimed_at = 'epoch' where session_id = $1 and done_at is null`, [s.id]).catch(() => {});
    throw e;
  }
  await q(`update card_updates set done_at = now(), outcome = $2 where session_id = $1`, [s.id, outcome]);
  return outcome;
}
