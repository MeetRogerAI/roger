import { addDays, weekOf } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { welcomeEmail } from "@/lib/mail/templates/welcome";
import { claimFreeRun } from "@/lib/zack/receive";
import type { V3Settings } from "@/lib/v3-settings";
import type { CardGateway } from "./gateway";
import type { Currency, Plan } from "./prices";

/**
 * Sign-up screens 4 and 5 (spec B.4, B.9 "At sign-up"): save a card with a
 * billing address, charge nothing, start the trial.
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

  let customer = u.stripe_customer;
  if (!customer) {
    const created = await gw.createCustomer({ userId: u.id, email: u.email, name: u.name });
    // The same idempotency key returns the same customer, so a race stores one id either way.
    const rows = await q<{ stripe_customer: string }>(
      `update users set stripe_customer = coalesce(stripe_customer, $2) where id = $1 returning stripe_customer`,
      [u.id, created],
    );
    customer = rows[0].stripe_customer;
  }
  const session = await gw.createSetupSession({ userId: u.id, customer, currency: o.currency, successUrl: o.successUrl, cancelUrl: o.cancelUrl });
  return { ok: true, url: session.url };
}

export type CompleteOutcome = "done" | "pending" | "address_invalid" | "not_yours" | "unknown_customer" | "not_consented";

export type CompleteOptions = {
  expectUserId?: string;
  /** Read only when the welcome email is built, so a settings problem cannot stop the card step. */
  getSettings: () => Promise<V3Settings>;
  now?: Date;
} & MailDeps;

/**
 * Finishes the card step. Safe to run twice and from two places: the browser
 * returning to /start/done and the Stripe webhook both call it, and whichever
 * is first starts the trial.
 *
 * The welcome email is sent by every call that finds the user in trial, not
 * only the one that started it: the notifications claim makes repeats free,
 * and a send that failed the first time is tried again on the next visit or
 * webhook retry.
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
    return now_?.status === "trial" ? sendWelcome(q, now_, o) : "pending";
  }
  if (u.status === "trial") return sendWelcome(q, u, o);
  return "done";
}

/**
 * Sends the welcome email (at most once). A send that fails throws, so the
 * webhook answers with an error and Stripe tries again later; the trial has
 * already started either way.
 */
async function sendWelcome(q: Query, u: SignupUser, o: CompleteOptions): Promise<"done"> {
  const startedAt = u.trial_started_at ? new Date(u.trial_started_at) : (o.now ?? new Date());
  const currency = u.currency ?? "USD";
  const settings = await o.getSettings();
  // A report brought from the free tool becomes this week's run (claimed once; never blocks the trial).
  await claimFreeRun(q, u.id, settings.runCutoff, o.now).catch((e) => console.error("[billing] free-tool run not claimed", e));
  const result = await sendToUser(
    { id: u.id, email: u.email },
    "welcome",
    "signup",
    welcomeEmail({
      name: u.name,
      plan: u.plan,
      currency,
      path: u.path,
      settings,
      firstChargeNoEarlier: addDays(weekOf(startedAt), 14),
    }),
    o,
  );
  if (result === "failed") throw new WelcomeNotSent();
  return "done";
}

export class WelcomeNotSent extends Error {
  constructor() {
    super("The trial started but the welcome email could not be sent yet.");
  }
}
