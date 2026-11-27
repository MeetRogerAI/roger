import { randomBytes } from "node:crypto";
import { logAdminAction } from "@/lib/admin/log";
import { hashSecret } from "@/lib/auth/tokens";
import type { Query } from "@/lib/db-query";
import { isEmail } from "@/lib/form";
import { adminAlert, alertAdmins, type MailDeps } from "@/lib/mail/send";
import { counterFor, hit, limits, windowStart, type Counter } from "@/lib/rate-limit";
import { featureOn } from "@/lib/v3-features";
import { mergeV3 } from "@/lib/v3-settings";
import type { Currency } from "@/lib/billing/prices";
import type { SponsorGateway } from "@/lib/billing/sponsor-gateway";
import { cleanSponsorCode } from "./code";

/**
 * Sponsors (spec B.15, B2 plan Unit 10): an organisation that pays for a
 * number of seats by monthly invoice. A person who signs up through
 * `/start?sponsor={code}` takes one seat and is never asked for a card.
 *
 * - The code is 12 characters of base32, shown to the admin once; only its
 *   hash is stored, and it is never logged.
 * - The code in transit: the proxy moves `?sponsor=` into the `roger-sponsor`
 *   cookie and redirects to a clean /start, the quiz copies it into the
 *   sign-up draft, and the draft hands it to the account (NewAccount.sponsor,
 *   never a Referrer). The account-creating insert's row then claims a seat.
 * - A seat is a `users.sponsor_seat` number from 1 to `seats`, unique per
 *   sponsor, so two sign-ups racing for the last seat cannot both hold it.
 * - An invalid, revoked or full code gives one uniform message and the
 *   sign-up goes on as an ordinary trial.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** A new sponsor code: 12 characters of base32 (60 random bits). */
export function newSponsorCode(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (const b of bytes) out += BASE32[b & 31];
  return out;
}

export const sponsorCodeHash = (code: string) => hashSecret(`sponsor:${code}`);

/** The hash a sign-up carries for a code as typed, or null when it isn't a code at all. */
export function sponsorHashFor(raw: string | null | undefined): string | null {
  const c = cleanSponsorCode(raw);
  return c ? sponsorCodeHash(c) : null;
}

const HASH = /^[A-Za-z0-9_-]{43}$/;

/** Whether sponsor sign-up is on: v3.sponsorsOn, with sign-up open and the cycle live. Any doubt means off. */
export async function sponsorsLive(q: Query): Promise<boolean> {
  try {
    const rows = await q<{ key: string; value: unknown }>(`select key, value from settings where key like 'v3.%'`);
    return featureOn(mergeV3(rows), "sponsorsOn");
  } catch {
    return false;
  }
}

/** SQL: how many seats the sponsor `s` (an alias with id) has taken. Every member pointing at it holds one, until an admin releases it. */
const TAKEN_SQL = (s: string) => `(select count(*) from users x where x.sponsor_id = ${s}.id)`;

/** The sponsor a code names, if it is not revoked and has a seat free. */
export async function openSponsorFor(q: Query, code: string | null | undefined): Promise<{ id: string; name: string } | null> {
  const c = cleanSponsorCode(code);
  if (!c) return null;
  const [s] = await q<{ id: string; name: string }>(
    `select sp.id, sp.name from sponsors sp where sp.code_hash = $1 and sp.revoked_at is null and ${TAKEN_SQL("sp")} < sp.seats`,
    [sponsorCodeHash(c)],
  );
  return s ?? null;
}

export type StartCheck = "ok" | "invalid" | "unchecked";

/**
 * The check /start makes, to tell a visitor early that their link won't
 * work. A correct code is never counted or refused. Wrong codes are counted
 * per IP; once an IP is over the limit its codes are no longer looked up
 * here ("unchecked": no message, the code still travels), so /start can't be
 * used to try codes in bulk. The account-creating claim is the real check.
 */
export async function checkSponsorAtStart(q: Query, code: string, ip: string, now: Date, counter: Counter = counterFor(q)): Promise<StartCheck> {
  // No IP known: never share one bucket between everyone; the code is looked up, and nothing is counted.
  if (!ip || ip === "unknown") return (await openSponsorFor(q, code)) ? "ok" : "invalid";
  const l = limits.sponsorBadCodePerIp;
  const key = `sponsor:bad:${ip}`;
  const start = windowStart(now, l.windowSeconds);
  // by = 0 reads the count without adding to it.
  if ((await counter(key, start, new Date((start + l.windowSeconds) * 1000), 0)) >= l.limit) return "unchecked";
  if (await openSponsorFor(q, code)) return "ok";
  await hit(key, l, now, counter);
  return "invalid";
}

/**
 * Whether /start should show the uniform message: a sponsor code brought
 * there (the proxy's cookie, else the draft) won't give a seat. Only while
 * sponsors are on; any failure shows nothing (the account-creating claim is
 * the real check).
 */
export async function sponsorRefusedAtStart(q: Query, o: { cookie?: string | null; draft?: string | null; ip: string; now: Date }): Promise<boolean> {
  const code = cleanSponsorCode(o.cookie) ?? cleanSponsorCode(o.draft);
  if (!code) return false;
  try {
    if (!(await sponsorsLive(q))) return false;
    return (await checkSponsorAtStart(q, code, o.ip, o.now)) === "invalid";
  } catch (e) {
    console.error("[start] sponsor code not checked", e instanceof Error ? e.message : e);
    return false;
  }
}

export type SeatClaim = { kind: "claimed"; sponsorId: string; seat: number } | { kind: "refused" } | { kind: "off" };

/**
 * One statement: the sponsor is found by its code's hash, not revoked and
 * with fewer members than seats; the lowest free seat number is picked; and
 * the new account takes it (the guarded write), and only then is the seat's
 * history row opened from it, at the job clock ($3). Two sign-ups that pick
 * the same seat at once collide on `users_sponsor_seat`: the loser's whole
 * statement fails and is tried again, and then sees the seat taken.
 */
export const CLAIM_SEAT_SQL = `with s as (
    select sp.id, sp.seats from sponsors sp
    where sp.code_hash = $2 and sp.revoked_at is null and ${TAKEN_SQL("sp")} < sp.seats
  ),
  n as (
    select s.id, (select g.n from generate_series(1, s.seats) g(n)
                  where not exists (select 1 from users x where x.sponsor_id = s.id and x.sponsor_seat = g.n)
                  order by g.n limit 1) as seat
    from s
  ),
  c as (
    update users u set sponsor_id = n.id, sponsor_seat = n.seat
    from n
    where u.id = $1 and u.sponsor_id is null and n.seat is not null
    returning u.id as user_id, n.id as sponsor_id, n.seat
  ),
  h as (
    insert into sponsor_seat_history (sponsor_id, user_id, seat, held_from)
    select sponsor_id, user_id, seat, $3::timestamptz from c
    on conflict do nothing
    returning 1
  )
  select sponsor_id, seat from c`;

const isSeatClash = (e: unknown) => {
  const err = e as { code?: string; constraint?: string; message?: string };
  return err?.code === "23505" && (err.constraint === "users_sponsor_seat" || /users_sponsor_seat/.test(err.message ?? ""));
};

/**
 * Gives the new account a seat, when sponsors are on, from the hash of the
 * code it signed up with (`sponsorHashFor`). Call it only for an
 * account the calling insert created. Then tells the admins once the
 * sponsor reaches 80% of its seats.
 */
export async function claimSponsorSeat(q: Query, userId: string, codeHash: string | null | undefined, deps: MailDeps & { now?: Date } = {}): Promise<SeatClaim> {
  if (!(await sponsorsLive(q))) return { kind: "off" };
  if (!codeHash || !HASH.test(codeHash)) return { kind: "refused" };
  let row: { sponsor_id: string; seat: number } | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      [row] = await q<{ sponsor_id: string; seat: number }>(CLAIM_SEAT_SQL, [userId, codeHash, (deps.now ?? new Date()).toISOString()]);
      break;
    } catch (e) {
      if (!isSeatClash(e) || attempt >= 3) throw e;
    }
  }
  if (!row) return { kind: "refused" };
  await alertAt80(q, row.sponsor_id, { ...deps, query: deps.query ?? q }).catch((e) => console.error("[sponsors] 80% alert", e instanceof Error ? e.message : e));
  return { kind: "claimed", sponsorId: row.sponsor_id, seat: Number(row.seat) };
}

/**
 * `claimSponsorSeat` for the sign-up paths: a failure is logged and the
 * sign-up goes on as an ordinary trial, with the uniform message.
 */
export async function claimSponsorSeatSafely(q: Query, userId: string, codeHash: string | null | undefined, deps: MailDeps & { now?: Date } = {}): Promise<SeatClaim> {
  try {
    return await claimSponsorSeat(q, userId, codeHash, deps);
  } catch (e) {
    console.error("[sponsors] seat not claimed", { userId, message: e instanceof Error ? e.message : String(e) });
    return { kind: "refused" };
  }
}

/** Where sign-up goes after the account is made: Step 3, with the uniform message when a sponsor code was refused. */
export const afterSignupPath = (next: string, claim: SeatClaim | null) => (claim?.kind === "refused" ? `${next}${next.includes("?") ? "&" : "?"}sponsor=invalid` : next);

/** The seat count at which the admins are told (80%, rounded up). */
export const alertAt = (seats: number) => Math.max(1, Math.ceil(seats * 0.8));

/**
 * Tells the admins once when a sponsor reaches 80% of its seats. The
 * notifications claim on (sponsor, seats) keeps it to one email, even for
 * two sign-ups at once; `alerted_80_at` records it once sent. Editing the
 * seats can arm it again (`setSponsorSeats`).
 */
export async function alertAt80(q: Query, sponsorId: string, deps: MailDeps = {}): Promise<boolean> {
  const [s] = await q<{ id: string; name: string; seats: number; taken: number | string; alerted: boolean }>(
    `select sp.id, sp.name, sp.seats, ${TAKEN_SQL("sp")} as taken, sp.alerted_80_at is not null as alerted from sponsors sp where sp.id = $1`,
    [sponsorId],
  );
  if (!s || s.alerted || s.seats < 1 || Number(s.taken) < alertAt(s.seats)) return false;
  const r = await alertAdmins(
    "sponsor_80",
    `${s.id}:${s.seats}`,
    adminAlert(`${s.name} has used ${Number(s.taken)} of ${s.seats} sponsored seats`, [
      `${s.name} has ${Number(s.taken)} of its ${s.seats} seats taken. When every seat is taken, new sign-ups with its link become ordinary trials.`,
      "Add seats on the Sponsors page in the admin if they asked for more.",
    ]),
    { ...deps, query: deps.query ?? q },
  );
  if (r === "failed") return false;
  await q(`update sponsors set alerted_80_at = now() where id = $1 and alerted_80_at is null`, [s.id]);
  return r === "sent";
}

// ---------------------------------------------------------------------------
// Admin

export type SponsorInput = {
  name: string;
  currency: Currency;
  standardCents: number;
  higherCents: number;
  seats: number;
  billingEmail: string;
  billingCountry: "CA" | "US";
  billingPostal: string;
};

/** "49", "49.5" or "49.50" (dollars) to cents; NaN for anything else. */
export function dollarsToCents(raw: string): number {
  const m = /^\s*(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(raw);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0")) : NaN;
}

/** A postal code Stripe Tax can place: Canadian A1A 1A1, or a US ZIP (12345 or 12345-6789). */
export function postalFits(country: string, postal: string): boolean {
  const p = postal.trim().toUpperCase();
  return country === "CA" ? /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(p) : country === "US" ? /^\d{5}(-\d{4})?$/.test(p) : false;
}

/** Checks a new sponsor's details; the message for the first problem, or null. */
export function sponsorInputProblem(i: SponsorInput): string | null {
  if (!i.name.trim() || i.name.length > 120) return "Enter the sponsor’s name.";
  if (i.currency !== "USD" && i.currency !== "CAD") return "Choose USD or CAD.";
  if (!Number.isInteger(i.standardCents) || i.standardCents < 1) return "Enter the standard price per seat.";
  if (!Number.isInteger(i.higherCents) || i.higherCents < i.standardCents) return "Enter the higher price per seat, at least the standard price.";
  if (!Number.isInteger(i.seats) || i.seats < 1 || i.seats > 10_000) return "Enter a whole number of seats.";
  if (!isEmail(i.billingEmail)) return "Enter the billing email.";
  if (i.billingCountry !== "CA" && i.billingCountry !== "US") return "Choose Canada or the United States.";
  if (!postalFits(i.billingCountry, i.billingPostal)) return i.billingCountry === "CA" ? "Enter a Canadian postal code, like M5V 2T6." : "Enter a US ZIP code, like 10001.";
  return null;
}

export type SponsorCustomers = Pick<SponsorGateway, "createSponsorCustomer">;

/**
 * Creates a sponsor and returns its code, once. Only the code's hash is
 * stored and the log row never carries the code. The Stripe customer is
 * made with the billing email and address (automatic tax needs the address);
 * if Stripe fails, the sponsor still exists and its invoice makes the
 * customer later.
 */
export async function createSponsor(
  q: Query,
  gw: SponsorCustomers | null,
  by: string,
  i: SponsorInput,
): Promise<{ ok: true; id: string; code: string; customer: string | null } | { ok: false; message: string }> {
  const problem = sponsorInputProblem(i);
  if (problem) return { ok: false, message: problem };
  const code = newSponsorCode();
  const [s] = await q<{ id: string }>(
    `insert into sponsors (name, currency, standard_cents, higher_cents, seats, code_hash, billing_email, billing_country, billing_postal)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [i.name.trim(), i.currency, i.standardCents, i.higherCents, i.seats, sponsorCodeHash(code), i.billingEmail.trim().toLowerCase(), i.billingCountry, i.billingPostal.trim().toUpperCase()],
  );
  await logAdminAction(q, { by, action: "sponsor_create", detail: { sponsorId: s.id, name: i.name.trim(), seats: i.seats, currency: i.currency } });
  const customer = gw ? await ensureSponsorCustomer(q, gw, s.id).catch((e) => (console.error("[sponsors] customer", e instanceof Error ? e.message : e), null)) : null;
  return { ok: true, id: s.id, code, customer };
}

/** The sponsor's Stripe customer, made once (its idempotency key is the sponsor id). */
export async function ensureSponsorCustomer(q: Query, gw: SponsorCustomers, sponsorId: string): Promise<string> {
  const [s] = await q<{ name: string; billing_email: string; billing_country: string; billing_postal: string; stripe_customer: string | null }>(
    `select name, billing_email, billing_country, billing_postal, stripe_customer from sponsors where id = $1`,
    [sponsorId],
  );
  if (!s) throw new Error("No such sponsor");
  if (s.stripe_customer) return s.stripe_customer;
  const country = s.billing_country === "CA" ? "CA" : "US";
  const id = await gw.createSponsorCustomer({ sponsorId, name: s.name, email: s.billing_email, country, postal: s.billing_postal });
  const [kept] = await q<{ stripe_customer: string }>(
    `update sponsors set stripe_customer = coalesce(stripe_customer, $2) where id = $1 returning stripe_customer`,
    [sponsorId, id],
  );
  return kept.stripe_customer;
}

/** Revokes a sponsor's code: no new seats. Members already sponsored keep theirs. */
export async function revokeSponsor(q: Query, by: string, sponsorId: string): Promise<boolean> {
  const rows = await q(`update sponsors set revoked_at = now() where id = $1 and revoked_at is null returning id`, [sponsorId]);
  if (rows.length) await logAdminAction(q, { by, action: "sponsor_revoke", detail: { sponsorId } });
  return rows.length > 0;
}

/**
 * Changes the number of seats. Fewer seats than members is allowed (nobody
 * loses a seat; new sign-ups are refused until there is room). Dropping
 * below 80% arms the alert again.
 */
export async function setSponsorSeats(q: Query, by: string, sponsorId: string, seats: number): Promise<{ ok: boolean; message: string }> {
  if (!Number.isInteger(seats) || seats < 0 || seats > 10_000) return { ok: false, message: "Enter a whole number of seats." };
  const [r] = await q<{ before: number; taken: number | string }>(
    `with old as (select seats from sponsors where id = $1)
     update sponsors sp set seats = $2::int,
       alerted_80_at = case when ${TAKEN_SQL("sp")} < greatest(1, ceil($2::int * 0.8)) then null else sp.alerted_80_at end
     where sp.id = $1 returning (select seats from old) as before, ${TAKEN_SQL("sp")} as taken`,
    [sponsorId, seats],
  );
  if (!r) return { ok: false, message: "No such sponsor." };
  await logAdminAction(q, { by, action: "sponsor_seats", detail: { sponsorId, from: r.before, to: seats } });
  return { ok: true, message: `Seats set to ${seats}; ${Number(r.taken)} taken.` };
}

/**
 * Releases one member's seat: they are no longer sponsored, so they become
 * an ordinary trial (a card is asked for before their next list). The seat's
 * history row ends now, in the same statement: the month it ends in is still
 * billed (invoice.ts). `released_at` (job clock) restarts their no-card clock
 * (housekeeping/clocks.ts noCardClocks), so they get the full card window
 * from the release rather than from sign-up.
 */
export async function releaseSeat(q: Query, by: string, sponsorId: string, userId: string, now: Date = new Date()): Promise<boolean> {
  const rows = await q(
    `with r as (update users set sponsor_id = null, sponsor_seat = null, released_at = $3::timestamptz where id = $1 and sponsor_id = $2 returning id),
     h as (update sponsor_seat_history set held_to = greatest(held_from, $3::timestamptz) where user_id in (select id from r) and sponsor_id = $2 and held_to is null returning 1)
     select id from r`,
    [userId, sponsorId, now.toISOString()],
  );
  if (rows.length) await logAdminAction(q, { by, userId, action: "sponsor_release", detail: { sponsorId } });
  return rows.length > 0;
}

/**
 * SQL: the member `u` held a sponsor's seat, past their third list, in a
 * calendar month (Toronto) whose sponsor invoice isn't sent yet, the current
 * month included. A hold ends with its release, or with the account's
 * access once it is closed or cancelled (as in invoice.ts). Deleting the member would take that billable seat-month
 * (their seat history and delivered weeks) with it, so it waits.
 */
export const UNBILLED_SEAT_SQL = (u: string) => `exists (
  select 1 from sponsor_seat_history h
  cross join lateral (select (select dw.week_of from cora_user_weeks dw where dw.user_id = h.user_id and not dw.dry_run and dw.delivered_at is not null
                              order by dw.week_of offset 2 limit 1) as third) t
  cross join lateral generate_series(date_trunc('month', h.held_from at time zone 'America/Toronto'),
                                     date_trunc('month', least(coalesce(h.held_to, now()),
                                       case when ${SEAT_ENDED_SQL(u)} then coalesce(${u}.access_ends_at, h.held_from) end) at time zone 'America/Toronto'),
                                     interval '1 month') m(start)
  where h.user_id = ${u}.id and t.third is not null and t.third < (m.start + interval '1 month')::date
    and not exists (select 1 from sponsor_invoices si where si.sponsor_id = h.sponsor_id and si.month = m.start::date and si.sent_at is not null))`;

/** SQL: the member `u` has left Roger, for a sponsor's seat: closed, or cancelled (B2 whole-branch review). */
export const SEAT_ENDED_SQL = (u: string) => `${u}.status in ('closed', 'cancelled')`;

/**
 * The one place a closed or cancelled account's seat history ends: when its
 * access ended (or now). The member keeps `sponsor_id` (an admin releases the
 * seat); billing stops after the month the account ended in. Called by every
 * path that closes or cancels an account (the admin close, cancel.ts
 * `finishCancellation`, a subscription ending); does nothing for an open
 * account; safe to repeat. The invoice and UNBILLED_SEAT_SQL read the same
 * end from the account itself, so a call that failed bills nothing extra.
 */
export async function endSeatOnClose(q: Query, userId: string): Promise<void> {
  await q(
    `update sponsor_seat_history h set held_to = greatest(h.held_from, coalesce((select u.access_ends_at from users u where u.id = h.user_id and ${SEAT_ENDED_SQL("u")}), now()))
     where h.user_id = $1 and h.held_to is null and exists (select 1 from users u where u.id = $1 and ${SEAT_ENDED_SQL("u")})`,
    [userId],
  );
}

export type SponsorRow = {
  id: string;
  name: string;
  currency: Currency;
  standardCents: number;
  higherCents: number;
  seats: number;
  taken: number;
  billingEmail: string;
  billingCountry: string;
  billingPostal: string;
  stripeCustomer: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export async function listSponsors(q: Query): Promise<SponsorRow[]> {
  const rows = await q<{
    id: string;
    name: string;
    currency: Currency;
    standard_cents: number;
    higher_cents: number;
    seats: number;
    taken: number | string;
    billing_email: string;
    billing_country: string;
    billing_postal: string;
    stripe_customer: string | null;
    revoked_at: string | null;
    created_at: string;
  }>(
    `select sp.id, sp.name, sp.currency, sp.standard_cents, sp.higher_cents, sp.seats, ${TAKEN_SQL("sp")} as taken, sp.billing_email, sp.billing_country,
       sp.billing_postal, sp.stripe_customer, sp.revoked_at::text, sp.created_at::text
     from sponsors sp order by sp.revoked_at is not null, sp.created_at desc`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    currency: r.currency,
    standardCents: r.standard_cents,
    higherCents: r.higher_cents,
    seats: r.seats,
    taken: Number(r.taken),
    billingEmail: r.billing_email,
    billingCountry: r.billing_country,
    billingPostal: r.billing_postal,
    stripeCustomer: r.stripe_customer,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  }));
}

export type SponsoredMember = { id: string; name: string; email: string; status: string; seat: number | null };

export async function sponsorMembers(q: Query, sponsorId: string): Promise<SponsoredMember[]> {
  return q<SponsoredMember>(
    `select id, name, email, status, sponsor_seat as seat from users where sponsor_id = $1 order by sponsor_seat nulls last, created_at`,
    [sponsorId],
  );
}

/** The name of the sponsor paying for a member, or null (Step 3, the welcome email). */
export async function sponsorNameFor(q: Query, userId: string): Promise<string | null> {
  const [r] = await q<{ name: string }>(`select sp.name from users u join sponsors sp on sp.id = u.sponsor_id where u.id = $1`, [userId]);
  return r?.name ?? null;
}
