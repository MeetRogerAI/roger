import { createHash, randomBytes } from "node:crypto";
import type { Query } from "@/lib/db-query";
import { isEmail } from "@/lib/form";
import { checkLeaderboardName } from "@/lib/growth/leaderboard-name";
import { retryPolicy, sendClaimed, sendToUser, type MailDeps, type SendResult } from "@/lib/mail/send";
import { isAddressSuppressed } from "@/lib/mail/suppression";
import { guestInviteEmail } from "@/lib/mail/templates/guest-invite";
import { recordInvitedReferral, referralEmailKey } from "@/lib/referrals/attribution";
import { counterFor, hit, limits, windowStart } from "@/lib/rate-limit";
import { INVITE_WORDS } from "./session-words";
import { nextSession, sessionAccess, sessionPlan, sessionsOn, sessionWhen, type SessionPlan, type SessionSettings } from "./sessions";
import type { V3Settings } from "@/lib/v3-settings";

/**
 * Guest invitations (spec B.15, B2 plan Unit 9). A paying or sponsored
 * member invites one guest per session, by name and email:
 *
 * - a `session_guests` row holds the guest's name, address, normalised
 *   address (`email_key`) and the hash of their 128-bit /g token (the token
 *   itself is only ever in the email);
 * - an `invited` referral row (`recordInvitedReferral`, shared with
 *   attribution), so the guest who signs up is promoted to `trial` instead of
 *   getting a second row;
 * - the guest gets email 22 (claimed in `notifications` as `guest:<id>`,
 *   kind `guest_invite`, ref the session date).
 *
 * Limits: one guest per member per session; one invitation per person
 * (normalised address) a week, whoever invites; GUEST_EMAILS_PER_DAY across
 * Roger per day. The two counters are atomic (`rate_events`), so concurrent
 * invitations can't pass them together. No invitation goes to an address
 * that unsubscribed (`isAddressSuppressed`).
 *
 * A step that fails after the guest row exists leaves the invitation
 * unsent; the member's "Send it again" finishes it (referral and email),
 * idempotently.
 */

export const GUEST_EMAILS_PER_DAY = 50;
/** One invitation per person in this many days, across all members. */
export const GUEST_REPEAT_DAYS = 7;
/** An invitation with no email attempt after this long is stuck, and can be sent again. */
export const STUCK_MINUTES = 5;
export const GUEST_INVITE_KIND = "guest_invite";

export const guestRecipient = (guestId: string) => `guest:${guestId}`;
/** SQL: the `notifications.recipient` of the session_guests row `alias` (mirrors guestRecipient). */
export const GUEST_RECIPIENT_SQL = (alias: string) => `('guest:' || ${alias}.id::text)`;

// ---------------------------------------------------------------------------
// Tokens and names

/** A new /g token: 128 random bits, base64url (22 characters). Only its hash is stored. */
export const newGuestToken = () => randomBytes(16).toString("base64url");
export const hashGuestToken = (t: string) => createHash("sha256").update(`roger-guest:v1:${t}`).digest("hex");
/** A token's shape, checked before any lookup. */
export const isGuestToken = (t: string) => /^[A-Za-z0-9_-]{22}$/.test(t);

/**
 * The inviter as a guest sees them (origin R13: display name only): their
 * display name when it passes the leaderboard's name rules (no look-alike of
 * "Roger support", no other scripts, no blanks), else "A Roger member".
 */
export const ANON_INVITER = "A Roger member";
export function inviterLabel(displayName: string | null | undefined): string {
  const c = checkLeaderboardName(displayName ?? "");
  return c.ok ? c.name : ANON_INVITER;
}

/**
 * A guest's name as the member types it: letters in any script, spaces and
 * . ' - only, 1 to 60 characters. No digits, web addresses or @, so the
 * invitation can't carry a message to a stranger.
 */
export function cleanGuestName(raw: string): string | null {
  const n = raw.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const len = Array.from(n).length;
  if (len < 1 || len > 60) return null;
  if (!/^[\p{L}\p{M} .'’-]+$/u.test(n) || !/\p{L}/u.test(n)) return null;
  // Nothing that reads as a web address ("www.example"); initials like "J.R." are fine.
  if (/\p{L}{2,}\.\p{L}{2,}/u.test(n)) return null;
  return n;
}

export type GuestView = { id: string; inviterId: string; inviterName: string; sessionDate: string; rsvpAt: string | null };

/** The invitation a token opens, or null for an unknown or malformed token, or one whose guest was purged. Throws on a database error. */
export async function guestForToken(q: Query, token: string): Promise<GuestView | null> {
  if (!isGuestToken(token)) return null;
  const [g] = await q<{ id: string; inviter_id: string; display_name: string; session_date: string; rsvp_at: string | null }>(
    `select g.id, g.inviter_id, u.display_name, g.session_date::text, g.rsvp_at::text
     from session_guests g join users u on u.id = g.inviter_id
     where g.token_hash = $1 and g.email is not null`,
    [hashGuestToken(token)],
  );
  return g ? { id: g.id, inviterId: g.inviter_id, inviterName: inviterLabel(g.display_name), sessionDate: g.session_date, rsvpAt: g.rsvp_at } : null;
}

/** Records the guest's RSVP (the first one stands). True when the invitation exists. */
export async function rsvpGuest(q: Query, token: string, now: Date): Promise<boolean> {
  if (!isGuestToken(token)) return false;
  const rows = await q(`update session_guests set rsvp_at = coalesce(rsvp_at, $2::timestamptz) where token_hash = $1 and email is not null returning id`, [
    hashGuestToken(token),
    now.toISOString(),
  ]);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Inviting

type Reason = Exclude<keyof typeof INVITE_WORDS, "sent" | "resent">;
/** `field`: the form field the answer is about, for the page to show it there. */
export type InviteOutcome = { ok: true; message: string; sent: SendResult } | { ok: false; reason: Reason; message: string; field?: "name" | "email" };

const FIELD: Partial<Record<Reason, "name" | "email">> = { name: "name", email: "email", self: "email", blocked: "email", recent: "email" };
const fail = (reason: Reason): InviteOutcome => ({ ok: false, reason, message: INVITE_WORDS[reason], ...(FIELD[reason] ? { field: FIELD[reason] } : {}) });

type Inviter = { id: string; email: string; display_name: string; status: string; sponsored: boolean };
async function loadInviter(q: Query, id: string): Promise<Inviter | null> {
  const [u] = await q<Inviter>(`select id, email, display_name, status, sponsor_id is not null as sponsored from users where id = $1`, [id]);
  return u ?? null;
}

/** The two atomic counters an invitation takes: the day's across Roger, and the person's for the week. */
function counters(q: Query, key: string, now: Date) {
  const count = counterFor(q);
  const day = { key: "guest-invite:day", seconds: 86_400 };
  const person = { key: `guest-invite:to:${createHash("sha256").update(key).digest("hex").slice(0, 32)}`, seconds: GUEST_REPEAT_DAYS * 86_400 };
  const at = (c: { key: string; seconds: number }, by: number) => {
    const start = windowStart(now, c.seconds);
    return count(c.key, start, new Date((start + c.seconds) * 1000), by);
  };
  return {
    takePerson: async () => (await at(person, 1)) <= 1,
    takeDay: async () => (await at(day, 1)) <= GUEST_EMAILS_PER_DAY,
    givePerson: () => at(person, -1),
    giveDay: () => at(day, -1),
  };
}

/** Links the guest row to its `invited` referral (if the address can have one). Idempotent. */
async function linkReferral(q: Query, guestId: string, inviterId: string, email: string, now: Date): Promise<void> {
  const referral = await recordInvitedReferral(q, { referrerId: inviterId, email, at: now });
  if (referral) await q(`update session_guests set referral_id = $2 where id = $1 and referral_id is null`, [guestId, referral]);
}

function inviteMessage(g: { name: string; token: string }, inviterName: string, when: string, tag: string) {
  return { ...guestInviteEmail({ guestName: g.name, inviterName, when, token: g.token }), idempotencyTag: tag };
}

/** Invite a guest to the next session. `now` is the job clock (created_at and the counters use it). */
export async function inviteGuest(
  q: Query,
  o: { inviterId: string; name: string; email: string; plan: SessionPlan | null; now: Date; mail?: MailDeps },
): Promise<InviteOutcome> {
  if (!o.plan) return fail("closed");
  const u = await loadInviter(q, o.inviterId);
  if (!u || sessionAccess(u) !== "full") return fail("locked");
  const name = cleanGuestName(o.name);
  if (!name) return fail("name");
  const email = o.email.trim();
  if (!isEmail(email)) return fail("email");
  const key = referralEmailKey(email);
  if (key === referralEmailKey(u.email)) return fail("self");
  if (await isAddressSuppressed(q, email)) return fail("blocked");

  const session = nextSession(o.plan, o.now);
  const at = o.now.toISOString();
  const [have] = await q(`select 1 from session_guests where inviter_id = $1 and session_date = $2::date`, [u.id, session.date]);
  if (have) return fail("already");
  const [recent] = await q(`select 1 from session_guests where email_key = $1 and created_at > $2::timestamptz - make_interval(days => $3)`, [key, at, GUEST_REPEAT_DAYS]);
  if (recent) return fail("recent");

  // Every count taken is given back on any way out before the guest row exists, a thrown error included.
  const c = counters(q, key, o.now);
  const taken = { person: false, day: false };
  const giveBack = async () => {
    if (taken.day) await c.giveDay().catch((e) => console.error("[sessions] daily count not given back", e instanceof Error ? e.message : e));
    if (taken.person) await c.givePerson().catch((e) => console.error("[sessions] weekly count not given back", e instanceof Error ? e.message : e));
  };
  const token = newGuestToken();
  const hash = hashGuestToken(token);
  let g: { id: string } | undefined;
  try {
    taken.person = true;
    if (!(await c.takePerson())) {
      await giveBack();
      return fail("recent");
    }
    taken.day = true;
    if (!(await c.takeDay())) {
      await giveBack();
      return fail("cap");
    }
    [g] = await q<{ id: string }>(
      `insert into session_guests (token_hash, inviter_id, session_date, name, email, email_key, created_at)
       values ($1, $2, $3::date, $4, $5, $6, $7::timestamptz)
       on conflict do nothing
       returning id`,
      [hash, u.id, session.date, name, email, key, at],
    );
  } catch (e) {
    await giveBack();
    throw e;
  }
  if (!g) {
    await giveBack();
    return fail("already");
  }

  await linkReferral(q, g.id, u.id, email, o.now);
  const sent = await sendToUser(
    { id: guestRecipient(g.id), email },
    GUEST_INVITE_KIND,
    session.date,
    inviteMessage({ name, token }, inviterLabel(u.display_name), sessionWhen(session), hash.slice(0, 12)),
    { ...o.mail, query: o.mail?.query ?? q },
  );
  return { ok: true, sent, message: sent === "sent" || sent === "already" ? INVITE_WORDS.sent(name) : INVITE_WORDS.failed };
}

export type EmailState = "sent" | "sending" | "failed" | "none";
export type MyGuest = { name: string; emailState: EmailState; canResend: boolean };

type GuestRow = { id: string; name: string; email: string; referral_id: string | null; created_at: string; status: string | null; attempts: number | null; claimed_at: string | null };

async function guestRow(q: Query, inviterId: string, sessionDate: string): Promise<GuestRow | null> {
  const [g] = await q<GuestRow>(
    `select g.id, g.name, g.email, g.referral_id, g.created_at::text, n.status, n.attempts, n.claimed_at::text from session_guests g
     left join notifications n on n.recipient = ${GUEST_RECIPIENT_SQL("g")} and n.kind = $3 and n.ref = $2
     where g.inviter_id = $1 and g.session_date = $2::date and g.email is not null`,
    [inviterId, sessionDate, GUEST_INVITE_KIND],
  );
  return g ?? null;
}

/**
 * Whether "Send it again" may run: the email failed with attempts left, it
 * never started (a step failed before the claim) and the row is older than
 * STUCK_MINUTES, or a send has been stuck for 15 minutes (the mail layer's
 * takeover).
 */
function resendable(g: GuestRow, now: Date): "yes" | "sent" | "notYet" | "exhausted" {
  const age = (t: string | null) => (t ? now.getTime() - Date.parse(t) : 0);
  if (g.status === "sent") return "sent";
  if (g.status === "failed") return (g.attempts ?? 0) < retryPolicy(GUEST_INVITE_KIND).maxAttempts ? "yes" : "exhausted";
  if (g.status === "sending") return age(g.claimed_at) > 15 * 60_000 ? "yes" : "notYet";
  return age(g.created_at) > STUCK_MINUTES * 60_000 ? "yes" : "notYet";
}

/** The member's guest for a session, whether their email went, and whether "Send it again" is offered. */
export async function myGuest(q: Query, inviterId: string, sessionDate: string, now: Date): Promise<MyGuest | null> {
  const g = await guestRow(q, inviterId, sessionDate);
  if (!g) return null;
  const emailState: EmailState = g.status === "sent" ? "sent" : g.status === "sending" ? "sending" : g.status === "failed" || g.status === "skipped" ? "failed" : "none";
  return { name: g.name, emailState, canResend: resendable(g, now) === "yes" };
}

/**
 * Finishes an invitation whose email didn't go: links the referral if that
 * step failed, then, in ONE statement, claims the email and writes a new
 * token, so only one re-send can win and the token stored is the token sent
 * (the old link stops working). Never touches an invitation that was sent or
 * is being sent.
 */
export async function resendGuestInvite(q: Query, o: { inviterId: string; plan: SessionPlan | null; now: Date; mail?: MailDeps }): Promise<InviteOutcome> {
  if (!o.plan) return fail("closed");
  const u = await loadInviter(q, o.inviterId);
  if (!u || sessionAccess(u) !== "full") return fail("locked");
  const session = nextSession(o.plan, o.now);
  const g = await guestRow(q, u.id, session.date);
  if (!g) return fail("noGuest");
  const state = resendable(g, o.now);
  if (state === "sent") return fail("alreadySent");
  if (state === "notYet") return fail("notYet");
  if (state === "exhausted") return fail("exhausted");
  if (await isAddressSuppressed(q, g.email)) return fail("blocked");
  if (!g.referral_id) await linkReferral(q, g.id, u.id, g.email, o.now);

  const token = newGuestToken();
  const hash = hashGuestToken(token);
  const recipient = guestRecipient(g.id);
  const [c] = await q<{ attempts: number | null; rotated: boolean }>(
    `with c as (
       insert into notifications (recipient, kind, ref) values ($1, $2, $3)
       on conflict (recipient, kind, ref) do update
         set status = 'sending', attempts = notifications.attempts + 1, claimed_at = now(), error = null
         where (notifications.status = 'failed' and notifications.attempts < $4)
            or (notifications.status = 'sending' and notifications.claimed_at < now() - interval '15 minutes')
       returning attempts
     ),
     g as (update session_guests set token_hash = $5 where id = $6 and email is not null and exists (select 1 from c) returning id)
     select (select attempts from c) as attempts, exists (select 1 from g) as rotated`,
    [recipient, GUEST_INVITE_KIND, session.date, retryPolicy(GUEST_INVITE_KIND).maxAttempts, hash, g.id],
  );
  if (!c?.attempts) return fail("notYet");
  if (!c.rotated) {
    await q(`update notifications set status = 'failed', error = 'guest removed' where recipient = $1 and kind = $2 and ref = $3`, [recipient, GUEST_INVITE_KIND, session.date]);
    return fail("noGuest");
  }
  const sent = await sendClaimed(
    { id: recipient, email: g.email },
    GUEST_INVITE_KIND,
    session.date,
    c.attempts,
    inviteMessage({ name: g.name, token }, inviterLabel(u.display_name), sessionWhen(session), hash.slice(0, 12)),
    { ...o.mail, query: o.mail?.query ?? q },
  );
  return sent === "sent" ? { ok: true, sent, message: INVITE_WORDS.resent(g.name) } : { ok: false, reason: "failed", message: INVITE_WORDS.failed };
}

/**
 * The one entry for a member's invitation (the page's action and POST
 * /api/sessions/guest): a per-member rate limit, the settings (fail closed:
 * unreadable settings mean no session), then `inviteGuest`.
 */
export async function inviteAsMember(
  q: Query,
  o: { userId: string; name: string; email: string; settings: (SessionSettings & Pick<V3Settings, "signupOpen" | "cycleLive">) | null; now: Date; mail?: MailDeps },
): Promise<InviteOutcome> {
  if (!(await hit(`session-invite:${o.userId}`, limits.sessionInvitePerUser, o.now, counterFor(q)))) return fail("limited");
  const plan = o.settings && sessionsOn(o.settings) ? sessionPlan(o.settings) : null;
  return inviteGuest(q, { inviterId: o.userId, name: o.name, email: o.email, plan, now: o.now, mail: o.mail });
}
