import type { Query } from "@/lib/db-query";
import { adminAlert, alertAdmins, type MailDeps } from "@/lib/mail/send";
import { counterFor, hit, limits, type Counter } from "@/lib/rate-limit";
import type { V3Settings } from "@/lib/v3-settings";
import { deliverUnlock, newestDeliveredWeek, UnlockEmailNotSent } from "@/lib/cora/unlock";
import type { CardSaveResult } from "./card-saved";
import { refusePromotion, type CardGateway, type Promotion, type SetupSession } from "./gateway";
import { hasCard, isNoCardTrial } from "./has-card";
import { CLOSED_NO_CARD } from "./no-card";
import type { Currency, Plan } from "./prices";

/**
 * Saving the card (spec B.9): a card with a billing address, nothing charged.
 *
 * Sign-up no longer reaches this (plan 2026-11-26-001, Unit 2): it ends at
 * Step 3 with a trial and no card, and the welcome email is sent there
 * (`src/lib/signup/finish.ts`). The card is saved on the Payment page
 * (`openEmbeddedSetup`), and `completeCardSetup` (Unit 5) is the unlock: it
 * saves the card, locks in the promo code and delivers the held list. The
 * hosted card-at-sign-up page (`startCardSetup`) is gone (whole-branch review
 * W8); the hosted page is still used by "Update card" (`startCardUpdate`).
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
  /** "complete": the stored session already saved a card; the caller runs `completeCardSetup(sessionId)`. */
  | { ok: false; reason: "complete"; sessionId: string }
  /** "try_again": other calls kept replacing the stored session; nothing is wrong with the account. */
  | { ok: false; reason: "not_found" | "not_allowed" | "rate_limited" | "try_again" };

type EmbeddedUser = SignupUser & { setup_session: string | null; sponsored: boolean };

/** Passes over the stored session before giving up with "try_again" (each pass after a lost store). */
const OPEN_ATTEMPTS = 3;

const logExpireFailure = (id: string) => (e: unknown) => console.warn("[card] expire setup session failed", { id, message: (e as Error)?.message });

/**
 * The Payment page's card form (plan 2026-11-26-001, Unit 4): the embedded
 * setup session for a trial with no card. One open session per user, kept in
 * `users.setup_session` and handed back on every visit while it is still open
 * for this customer and currency (a double submit or a reload never opens a
 * second one). A stored session that is complete (the card was confirmed but
 * the completion has not run yet) is never replaced: the answer is
 * "complete", and the caller completes it. A new one is made only when the
 * stored one is expired, gone, or open but unusable (another customer, user
 * or currency, a card update, no client secret), and only that counts against
 * the checkout limits. The store is compare-and-set, so two tabs opening at
 * once end with one stored session, which both are given; Unit 5's completion
 * accepts only the stored session. An open session that was replaced is
 * expired in Stripe (best effort) and read again: if it completed meanwhile it
 * is put back and "complete" is answered, so a confirmed card is never left
 * on a session nobody stores.
 */
export async function openEmbeddedSetup(
  q: Query,
  gw: CardGateway,
  o: { userId: string; ip: string; returnUrl: string; now?: Date; counter?: Counter },
): Promise<EmbeddedSetup> {
  const counter = o.counter ?? counterFor(q);
  let limited = false;
  for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt++) {
    const [u] = await q<EmbeddedUser>(`select ${USER_COLUMNS}, setup_session, sponsor_id is not null as sponsored from users where id = $1`, [o.userId]);
    if (!u) return { ok: false, reason: "not_found" };
    if (!isNoCardTrial({ status: u.status, trialStartedAt: u.trial_started_at, sponsored: u.sponsored })) return { ok: false, reason: "not_allowed" };
    const customer = await ensureCustomer(q, gw, u);
    const currency: Currency = u.currency ?? "USD";

    // The stored session, while it is open but cannot be handed back; expired once ours is stored.
    let replacing: SetupSession | null = null;
    if (u.setup_session) {
      const s = await readSession(gw, u.setup_session);
      const ours = s != null && s.customer === customer && s.purpose !== "card_update" && (!s.userId || s.userId === u.id);
      if (s && ours && s.status === "complete") return { ok: false, reason: "complete", sessionId: s.id };
      if (s && ours && s.status === "open" && s.clientSecret && s.currency === currency) {
        return { ok: true, sessionId: s.id, clientSecret: s.clientSecret, currency, reused: true };
      }
      if (s?.status === "open") replacing = s;
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
    if (!stored.length) {
      // Another call stored its session first: ours is closed, and theirs is handed back on the next pass.
      await gw.expireSetupSession(created.id).catch(logExpireFailure(created.id));
      continue;
    }
    if (replacing) {
      const kept = await retireReplaced(q, gw, u.id, replacing.id, created.id);
      if (kept) return { ok: false, reason: "complete", sessionId: kept };
    }
    return { ok: true, sessionId: created.id, clientSecret: created.clientSecret, currency, reused: false };
  }
  return { ok: false, reason: "try_again" };
}

/**
 * Closes the open session `oldId` that `newId` has just replaced, so an old
 * tab cannot save a card on it. If it completed before the expiry landed (a
 * confirm in flight), the card is on `oldId`: it is stored again in place of
 * `newId` (or of nothing, after a discard), `newId` is closed, and `oldId` is
 * returned for the caller to complete. Otherwise null.
 */
async function retireReplaced(q: Query, gw: CardGateway, userId: string, oldId: string, newId: string): Promise<string | null> {
  await gw.expireSetupSession(oldId).catch(logExpireFailure(oldId));
  const after = await readSession(gw, oldId).catch((e) => {
    console.warn("[card] re-read of a replaced setup session failed", { id: oldId, message: (e as Error)?.message });
    return null;
  });
  if (after?.status !== "complete") return null;
  await q(`update users set setup_session = $2 where id = $1 and (setup_session = $3 or setup_session is null)`, [userId, oldId, newId]);
  await gw.expireSetupSession(newId).catch(logExpireFailure(newId));
  return oldId;
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

/**
 * Whole-branch review W3 (and Unit 9 F5's cancel): an account that has just
 * ended for good (an admin close, a cancel) and can never save its first
 * card. Its stored Payment session is expired and cleared, so an open tab
 * cannot confirm a card; if the member confirmed it already, Roger does not
 * save that card: it is taken off the Stripe customer, then the session is
 * cleared. "removed" says a confirmed card was taken off. Throws when Stripe
 * fails (the caller logs it); the session then stays stored, so a late
 * webhook's completion answers "closed" and removes the card itself
 * (`removeStrandedCard`).
 */
export async function retireSessionForGood(q: Query, gw: CardGateway, userId: string): Promise<"none" | "discarded" | "removed"> {
  const r = await discardSetupSession(q, gw, userId);
  if (r !== "complete") return r;
  const [u] = await q<{ setup_session: string | null }>(`select setup_session from users where id = $1`, [userId]);
  if (!u?.setup_session) return "none";
  const s = await readSession(gw, u.setup_session);
  if (s?.paymentMethod) await gw.detachPaymentMethod(s.paymentMethod);
  await q(`update users set setup_session = null where id = $1 and setup_session = $2`, [userId, u.setup_session]);
  return "removed";
}

/**
 * Whole-branch review W4: a card confirmed on the stored Payment session of an
 * account that is cancelled or closed (and not reopenable) is never saved by
 * Roger, so it must not stay on the Stripe customer, where a later charge or
 * an admin could find it. It is detached, whether or not the cancellation's
 * card removal already ran (`cards_removed_at` set), and the admins are told.
 * A detach that fails throws, so the webhook answers 500 and Stripe sends the
 * event again; the alert goes once per session.
 */
async function removeStrandedCard(
  q: Query,
  gw: CardGateway,
  u: { id: string; status: string; closed_reason: string | null },
  s: SetupSession,
  o: MailDeps,
): Promise<void> {
  const why = `${u.status}${u.closed_reason ? ` (${u.closed_reason})` : ""}`;
  let removed = true;
  try {
    if (s.paymentMethod) await gw.detachPaymentMethod(s.paymentMethod);
  } catch (e) {
    removed = false;
    console.error("[card] a card confirmed on a closed account could not be removed", { userId: u.id, session: s.id, message: (e as Error)?.message });
  }
  await alertAdmins(
    "card_on_closed_account",
    s.id,
    adminAlert("A card was confirmed on an account that has ended", [
      `User ${u.id}, account ${why}, Stripe session ${s.id}, customer ${s.customer}. Roger did not save the card and nothing was charged.`,
      removed ? "The card was removed from the Stripe customer." : "Removing the card from the Stripe customer failed; Stripe's retry of the event tries again. If it stays, remove it in Stripe.",
    ]),
    { ...o, query: o.query ?? q },
  ).catch(() => {});
  if (!removed) throw new Error("A card confirmed on a closed account could not be removed yet");
}

/**
 * The stored Payment session, completed if the member has confirmed it
 * (review fixes Unit 7, F1: the no-card close asks before it closes, and again
 * after it has closed the session). "none": nothing stored, or not complete.
 * The completion's own outcome otherwise ("done" when the card is saved; a
 * list whose email failed still counts as done, the unlock sweep retries it).
 */
export async function completeStoredSession(q: Query, gw: CardGateway, userId: string, o: CompleteOptions): Promise<CompleteOutcome | "none"> {
  const [u] = await q<{ setup_session: string | null }>(`select setup_session from users where id = $1`, [userId]);
  if (!u?.setup_session) return "none";
  const s = await readSession(gw, u.setup_session);
  if (s?.status !== "complete") return "none";
  try {
    return await completeCardSetup(q, gw, s.id, { ...o, expectUserId: userId });
  } catch (e) {
    if (e instanceof UnlockEmailNotSent) return "done";
    throw e;
  }
}

/** How long after a no-card close a card confirmed on the stored session still reopens the trial. */
export const REOPEN_DAYS = 7;

/**
 * Review fixes (Unit 7), F1: an account the no-card close closed (reason
 * `no_card`, the card never saved) less than REOPEN_DAYS ago, whose stored
 * session the member confirmed at or after the close, is reopened by the
 * completion instead of answered "closed": the card is saved and the list
 * unlocked as for a trial. `$now` is the job clock parameter. Mirrors
 * `reopenable`.
 */
const REOPENABLE_SQL = (now: string) =>
  `(status = 'closed' and closed_reason = '${CLOSED_NO_CARD}' and trial_started_at is null and sponsor_id is null
    and access_ends_at > ${now}::timestamptz - interval '${REOPEN_DAYS} days')`;

type ReopenFacts = { status: string; closed_reason: string | null; access_ends_at: string | Date | null; trial_started_at: string | Date | null };
const reopenable = (u: ReopenFacts, now: Date) =>
  u.status === "closed" &&
  u.closed_reason === CLOSED_NO_CARD &&
  u.trial_started_at == null &&
  u.access_ends_at != null &&
  new Date(u.access_ends_at).getTime() > now.getTime() - REOPEN_DAYS * 86_400_000;

/**
 * "closed": the account is no longer one that can save its first card (closed,
 * cancelled before saving one); nothing changes. A no-card close within
 * REOPEN_DAYS is reopened instead (review fixes Unit 7, F1).
 */
export type CompleteOutcome = "done" | "pending" | "address_invalid" | "not_yours" | "unknown_customer" | "closed";

export type CompleteOptions = {
  expectUserId?: string;
  /** Read once the card is saved: the unlock delivers with the free-list count and the playbook preface. */
  getSettings: () => Promise<V3Settings>;
  /** The job clock: `trial_started_at`, the reservation and the delivery are stamped with it. */
  now?: Date;
} & MailDeps;

type CardSaveUser = SignupUser & ReopenFacts & { setup_session: string | null; promo_code: string | null; promo_coupon: string | null };

/** Passes at the save claim before giving up for now (each pass after losing a promo slot or a changed selection). */
const CLAIM_ATTEMPTS = 3;

/**
 * Saves the first card and unlocks the held list (plan 2026-11-26-001,
 * Unit 5). Called from the return page (`/start/payment/done`), the Stripe
 * webhook (`checkout.session.completed`) and its reconcile replay; safe to run
 * any number of times, in any order, at once.
 *
 * - Ownership: the session must be complete, not a card update, on the user's
 *   own Stripe customer and carry the user's id; until the card is saved it
 *   must also be the session stored in `users.setup_session`
 *   (`openEmbeddedSetup`). `expectUserId` is the signed-in user on the return
 *   page.
 * - Before the card is saved (`trial_started_at` null) only: the account
 *   state (before any Stripe call), the default card and the tax location. An
 *   address Stripe cannot place → "address_invalid": the used-up session is
 *   dropped from `users.setup_session` (so Payment opens a fresh one) and
 *   nothing else changes. Then one claim statement (CARD_SAVE_CLAIM_SQL)
 *   stamps `trial_started_at` (job clock), the currency and country, and locks
 *   in or refuses the pending promo code with its reservation.
 * - After it, on every call (whoever saved the card): the unlock, from stored
 *   state (`deliverUnlock`). A replay never touches the card again, so a card
 *   changed since through "Update card" stays the default.
 *
 * Throws when the unlocked list's email failed (UnlockEmailNotSent), so the
 * webhook answers 500 and Stripe retries; the hourly `unlock_pending` sweep
 * retries too.
 */
export async function completeCardSetup(q: Query, gw: CardGateway, sessionId: string, o: CompleteOptions): Promise<CompleteOutcome> {
  const s = await gw.getSetupSession(sessionId);
  if (s.status !== "complete" || !s.customer || !s.paymentMethod) return "pending";
  // An "Update card" session can never unlock a held list (it has its own completion).
  if (s.purpose === "card_update") return "not_yours";

  const [u] = await q<CardSaveUser>(
    `select ${USER_COLUMNS}, setup_session, promo_code, promo_coupon, closed_reason, access_ends_at from users where stripe_customer = $1`,
    [s.customer],
  );
  if (!u) return "unknown_customer";
  if (o.expectUserId && o.expectUserId !== u.id) return "not_yours";
  if (s.userId !== u.id) return "not_yours";
  // Before the card is saved, only the stored session can save it. After, any of the member's own setup
  // sessions (customer and metadata checked above, not a card update) may run the unlock, which is
  // idempotent and decided from stored state: a newer session stored since must not strand the list.
  if (u.trial_started_at == null && u.setup_session !== s.id) return "not_yours";

  const now = o.now ?? new Date();
  if (u.trial_started_at == null) {
    // The account state is checked before anything is changed in Stripe. Only a trial (or a no-card close
    // still within its grace) can save its first card.
    if (u.status !== "trial" && !reopenable(u, now)) return closedWithCard(q, gw, u, s, o);
    await gw.setDefaultCard(s.customer, s.paymentMethod);
    if ((await gw.checkTaxLocation(s.customer)) === "invalid") {
      // This session is used up (complete) and can never save the card: drop it, so the next Payment
      // visit opens a fresh one instead of handing this one back as "complete" for ever.
      await q(`update users set setup_session = null where id = $1 and setup_session = $2 and trial_started_at is null`, [u.id, s.id]);
      return "address_invalid";
    }
    const claimed = await claimCardSave(q, gw, u.id, s, now);
    // Cancelled or closed between the check above and the claim: the card was made the default, and goes again.
    if (claimed === "closed") {
      const [after] = await q<{ status: string; closed_reason: string | null }>(`select status, closed_reason from users where id = $1`, [u.id]);
      return closedWithCard(q, gw, { id: u.id, status: after?.status ?? u.status, closed_reason: after?.closed_reason ?? null }, s, o);
    }
  }

  const settings = await o.getSettings();
  await deliverUnlock(q, { settings, now, query: o.query, transport: o.transport, sleep: o.sleep }, u.id);
  return "done";
}

/**
 * "closed": the account can no longer save its first card. A cancelled or
 * closed account's confirmed card is taken off the customer (W4); any other
 * state (a legacy row with no card stamp) is left as it is.
 */
async function closedWithCard(q: Query, gw: CardGateway, u: { id: string; status: string; closed_reason: string | null }, s: SetupSession, o: MailDeps): Promise<"closed"> {
  if (u.status === "cancelled" || u.status === "closed") await removeStrandedCard(q, gw, u, s, o);
  return "closed";
}

/**
 * The card-save claim, one statement (Neon over HTTP has no transactions):
 *
 * - `u` locks the user row while the card is not saved yet and the pending
 *   code is still the one checked ($5), so two completions for one member
 *   run one after the other and the second finds the card saved.
 * - The reservation (`r`) is written only when the code was found valid in
 *   Stripe ($6 not null), other members' reservations plus Stripe's
 *   `times_redeemed` leave room under `max_redemptions` (no limit: always),
 *   and a first-time-only code is not blocked: this member holds another
 *   reservation, the same card fingerprint was used by another member, or the
 *   member has paid before. A limited code takes the next slot number; the
 *   unique (code, slot) index lets one of two members saving the last use at
 *   once have it.
 * - `verdict`: none (no code pending), reserved, refused (invalid, used up or
 *   first-time blocked: the card is saved at the regular price, the pending
 *   code cleared and `promo_refused_at` stamped), or lost_race (another
 *   member took the slot after our snapshot: nothing is written, and the
 *   caller tries again with a fresh count).
 * - `upd` stamps the card as saved, last, and only when `u` held the row and
 *   the verdict is final. The user row is updated once.
 *
 * $1 user, $2 job clock, $3 currency, $4 country, $5 pending code as read,
 * $6 promotion code id (null when Stripe refused it), $7 max redemptions,
 * $8 Stripe's times redeemed, $9 first-time only, $10 card fingerprint,
 * $11 the coupon's duration (once, repeating, forever) and $12 its months.
 */
export const CARD_SAVE_CLAIM_SQL = `
with u as (
  select id from users
  where id = $1 and trial_started_at is null and promo_code is not distinct from $5::text
    and (status = 'trial' or ${REOPENABLE_SQL("$2")})
  for update
),
others as (
  select count(*)::int as taken, coalesce(max(slot), 0)::int as top
  from promo_reservations where promotion_code = $6::text and user_id <> $1
),
own as (select exists (select 1 from promo_reservations where promotion_code = $6::text and user_id = $1) as yes),
room as (select ($7::int is null or (select taken from others) + $8::int < $7::int) as yes),
first_blocked as (
  select ($9::boolean and (
       exists (select 1 from promo_reservations pr where pr.user_id = $1 and pr.promotion_code <> $6::text)
    or ($10::text is not null and exists (select 1 from promo_reservations pr where pr.card_fingerprint = $10::text and pr.user_id <> $1))
    -- Whole-branch review W7: the same card saved by another member (users.card_fingerprint is stamped at every save).
    or ($10::text is not null and exists (select 1 from users fu where fu.card_fingerprint = $10::text and fu.id <> $1))
    or exists (select 1 from users pu where pu.id = $1 and pu.first_charge_at is not null)
    or exists (select 1 from orders po where po.user_id = $1 and po.status in ('charged', 'sent'))
  )) as yes
),
r as (
  insert into promo_reservations (promotion_code, user_id, card_fingerprint, reserved_at, slot)
  select $6::text, u.id, $10::text, coalesce($2::timestamptz, now()), case when $7::int is null then null else (select top from others) + 1 end
  from u
  where $6::text is not null and (select yes from room) and not (select yes from first_blocked) and not (select yes from own)
  on conflict do nothing
  returning id
),
verdict as (
  select case
    when $5::text is null then 'none'
    when $6::text is null then 'refused'
    when (select yes from own) or exists (select 1 from r) then 'reserved'
    when (select yes from first_blocked) or not (select yes from room) then 'refused'
    else 'lost_race'
  end as v
),
upd as (
  update users set
    trial_started_at = coalesce($2::timestamptz, now()), status = 'trial', signup_step = 'done',
    -- A reopened no-card close (REOPENABLE_SQL): the close's fields go (SET reads the row as it was).
    closed_reason = case when status = 'closed' then null else closed_reason end,
    access_ends_at = case when status = 'closed' then null else access_ends_at end,
    currency = $3, country = coalesce($4::text, country), card_fingerprint = coalesce($10::text, card_fingerprint),
    promo_code = case when (select v from verdict) = 'refused' then null else promo_code end,
    promo_coupon = case when (select v from verdict) = 'refused' then null else promo_coupon end,
    promo_label = case when (select v from verdict) = 'refused' then null else promo_label end,
    -- The locked-in coupon's duration as Stripe has it now (Unit 8 review F5); kept as stored if not known.
    promo_duration = case (select v from verdict) when 'refused' then null when 'reserved' then coalesce($11::text, promo_duration) else promo_duration end,
    promo_duration_months = case (select v from verdict) when 'refused' then null when 'reserved' then coalesce($12::int, promo_duration_months) else promo_duration_months end,
    promo_refused_at = case when (select v from verdict) = 'refused' then coalesce($2::timestamptz, now()) end
  where id = $1 and exists (select 1 from u) and (select v from verdict) <> 'lost_race'
  returning id
)
select (select v from verdict) as verdict, exists (select 1 from upd) as saved`;

/**
 * Re-reads the pending code, re-checks it in Stripe (its limits and
 * first-time rule as they are now) and runs the claim. Returns "saved" once
 * the card is saved, by this call or another; "closed" if the account can no
 * longer save its first card.
 */
async function claimCardSave(q: Query, gw: CardGateway, userId: string, s: { customer: string | null; country: string | null; currency: Currency | null; cardFingerprint?: string | null }, now: Date): Promise<"saved" | "closed"> {
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const [u] = await q<ReopenFacts & { currency: Currency | null; promo_code: string | null; promo_coupon: string | null }>(
      `select status, currency, trial_started_at, promo_code, promo_coupon, closed_reason, access_ends_at from users where id = $1`,
      [userId],
    );
    if (!u || u.trial_started_at != null) return "saved";
    if (u.status !== "trial" && !reopenable(u, now)) return "closed";
    // The user's own last choice wins over the currency an older card tab was opened with.
    const currency: Currency = u.currency ?? s.currency ?? "USD";

    let promo: Promotion | null = null;
    if (u.promo_code) {
      const found = await gw.findPromotion(u.promo_code, currency, { customer: s.customer, now });
      // The coupon shown on the Payment page is the one locked in; a code now pointing elsewhere is refused.
      if (found.valid && found.couponId === u.promo_coupon) promo = found;
      // Called only for its log line ("[promo] code refused"); its {valid: false} answer is not needed.
      else if (found.valid) refusePromotion(found.code, "coupon_invalid");
    }
    const [r] = await q<{ verdict: string; saved: boolean }>(CARD_SAVE_CLAIM_SQL, [
      userId,
      now.toISOString(),
      currency,
      s.country,
      u.promo_code,
      promo?.promotionCodeId ?? null,
      promo?.maxRedemptions ?? null,
      promo?.timesRedeemed ?? 0,
      promo?.firstTimeOnly ?? false,
      s.cardFingerprint ?? null,
      promo?.duration ?? null,
      promo?.durationInMonths ?? null,
    ]);
    if (r?.verdict === "refused") console.info("[card] promo code not applied at card save", { userId });
    if (r?.saved) return "saved";
    // Lost a slot to another member, the pending code changed, or another call saved the card: read again.
  }
  const [u] = await q<{ trial_started_at: string | null }>(`select trial_started_at from users where id = $1`, [userId]);
  if (u?.trial_started_at != null) return "saved";
  throw new Error("The card-save claim kept losing; try again");
}

type SaveState = { saved: boolean; refused: boolean; setup_session: string | null };

const saveState = async (q: Query, userId: string): Promise<SaveState | null> =>
  (
    await q<SaveState>(`select trial_started_at is not null as saved, promo_refused_at is not null as refused, setup_session from users where id = $1`, [userId])
  )[0] ?? null;

/** Where a member whose card is saved lands: their unlocked week (or none yet), read from stored state. */
async function savedResult(q: Query, userId: string): Promise<CardSaveResult> {
  const s = await saveState(q, userId);
  return { outcome: "done", week: await newestDeliveredWeek(q, userId), promoRefused: Boolean(s?.refused) };
}

/**
 * What the return page (and Unit 6's Payment action, when `openEmbeddedSetup`
 * answers "complete") does with a session for the signed-in user, read back
 * from stored state:
 *
 * - The card is saved already: no Stripe call. The unlock runs from stored
 *   state (idempotent; a failure is left to the webhook and the hourly sweep)
 *   and the member lands on their unlocked week, whichever session id the
 *   page was given.
 * - Otherwise the id must be the stored session (`users.setup_session`), or
 *   it is "not_yours" without asking Stripe; and completions are limited per
 *   member (`cardSavePerUser`), a limited one reading as "pending".
 * - Then the completion. A list delivered whose email failed is still "done".
 *   Any other failure reads as "pending" with `problem` set (the page words it
 *   as our problem, not Stripe's), unless the card got saved.
 */
export async function finishCardSave(
  q: Query,
  gw: CardGateway,
  sessionId: string,
  o: CompleteOptions & { expectUserId: string; counter?: Counter },
): Promise<CardSaveResult> {
  const before = await saveState(q, o.expectUserId);
  if (!before) return { outcome: "not_yours" };
  if (before.saved) {
    try {
      await deliverUnlock(q, { settings: await o.getSettings(), now: o.now ?? new Date(), query: o.query, transport: o.transport, sleep: o.sleep }, o.expectUserId);
    } catch (e) {
      if (!(e instanceof UnlockEmailNotSent)) console.error("[card] unlock after a saved card failed", { message: (e as Error)?.message });
    }
    return savedResult(q, o.expectUserId);
  }
  if (!sessionId || sessionId !== before.setup_session) return { outcome: "not_yours" };
  if (!(await hit(`card-save:user:${o.expectUserId}`, limits.cardSavePerUser, o.now ?? new Date(), o.counter ?? counterFor(q)))) return { outcome: "pending" };

  let outcome: CompleteOutcome | "error";
  try {
    outcome = await completeCardSetup(q, gw, sessionId, o);
  } catch (e) {
    if (!(e instanceof UnlockEmailNotSent)) console.error("[card] could not finish the card save", { message: (e as Error)?.message });
    outcome = e instanceof UnlockEmailNotSent ? "done" : "error";
  }
  if (outcome === "pending") return { outcome: "pending" };
  if (outcome === "address_invalid") return { outcome: "address_invalid" };
  const after = await saveState(q, o.expectUserId);
  if (outcome === "done" || after?.saved) return savedResult(q, o.expectUserId);
  if (outcome === "error") return { outcome: "pending", problem: true };
  return { outcome: "not_yours" };
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
    else {
      // The member's card now (whole-branch review W7: first-time-only promo codes refuse a card another member saved).
      if (s.cardFingerprint) await q(`update users set card_fingerprint = $2 where id = $1`, [u.id, s.cardFingerprint]);
      await o.after(u.id);
    }
  } catch (e) {
    // Released at once, so the webhook's retry (or a reload) does it all again.
    await q(`update card_updates set claimed_at = 'epoch' where session_id = $1 and done_at is null`, [s.id]).catch(() => {});
    throw e;
  }
  await q(`update card_updates set done_at = now(), outcome = $2 where session_id = $1`, [s.id, outcome]);
  return outcome;
}
