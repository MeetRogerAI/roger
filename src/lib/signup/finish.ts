import type { Query } from "@/lib/db-query";
import { MAX_ATTEMPTS, sendToUser, type MailDeps, type SendResult } from "@/lib/mail/send";
import { welcomeEmail } from "@/lib/mail/templates/welcome";
import type { Currency } from "@/lib/billing/prices";
import type { V3Settings } from "@/lib/v3-settings";
import { claimFreeRun } from "@/lib/zack/receive";

/**
 * The end of sign-up (plan 2026-11-26-001, Unit 2). Step 3, Product and
 * Pricing, records the consent and moves the account straight to a trial with
 * no card: `status = 'trial'`, `trial_started_at` null ("card saved" keeps
 * its meaning). Monthly is the only plan. The card is asked for later, when
 * the first list is ready.
 *
 * The welcome email goes out through the notifications claim, so it is sent
 * at most once. The server action that ends sign-up tries it once; a send
 * that fails there is retried by the hourly `welcome_unsent` task, because a
 * server action has no retry of its own.
 */

/**
 * The hourly retry only looks at accounts that consented on or after this
 * moment, the day this flow was built. Earlier accounts were welcomed at the
 * old card step (or never finished it), so leftover preview accounts are
 * never welcomed again.
 */
export const WELCOME_SWEEP_FROM = "2026-11-26T00:00:00Z";

/** How many welcomes one hourly pass sends at most. */
export const MAX_WELCOMES = 50;

/**
 * Step 3's state change: consent (the first one stays on record), monthly,
 * and a trial with no card. Only an account still signing up moves; returns
 * whether this call moved it. `now` is the job clock; the server action
 * passes it. The database's now() is only a fallback for callers that have
 * no clock.
 */
export async function finishSignup(q: Query, userId: string, now?: Date): Promise<boolean> {
  const rows = await q(
    `update users set plan = 'monthly', consent_at = coalesce(consent_at, coalesce($2::timestamptz, now())), status = 'trial', signup_step = 'done'
     where id = $1 and status = 'signup' returning id`,
    [userId, now?.toISOString() ?? null],
  );
  return rows.length > 0;
}

export type WelcomeDeps = { settings: V3Settings; now?: Date } & MailDeps;

/**
 * Claims a free-tool report brought to sign-up as this week's run (once;
 * never blocks the welcome), then sends the welcome email (at most once).
 */
export async function sendSignupWelcome(q: Query, userId: string, d: WelcomeDeps): Promise<SendResult | "not_found"> {
  await claimFreeRun(q, userId, d.settings.runCutoff, d.now).catch((e) => console.error("[signup] free-tool run not claimed", e instanceof Error ? e.message : e));
  const [u] = await q<{ id: string; email: string; name: string; currency: Currency | null; path: string }>(
    `select id, email, name, currency, path from users where id = $1`,
    [userId],
  );
  if (!u) return "not_found";
  return sendToUser(
    { id: u.id, email: u.email },
    "welcome",
    "signup",
    welcomeEmail({ name: u.name, currency: u.currency ?? "USD", path: u.path, settings: d.settings }),
    d,
  );
}

/**
 * The hourly `welcome_unsent` task: a trial that consented after
 * WELCOME_SWEEP_FROM and has no welcome sent (and none given up on after
 * MAX_ATTEMPTS) gets the free-tool claim re-run and the welcome sent, whether
 * or not it has saved a card since (a card saved before the retry must not
 * lose the welcome). At most MAX_WELCOMES a pass; stops at the pass's deadline.
 */
export async function sendUnsentWelcomes(q: Query, d: WelcomeDeps & { deadline?: number }): Promise<number> {
  const due = await q<{ id: string }>(
    `select u.id from users u
     where u.status = 'trial' and u.consent_at >= $1::timestamptz
       and not exists (
         select 1 from notifications n where n.recipient = u.id::text and n.kind = 'welcome' and n.ref = 'signup'
           and (n.status in ('sent', 'skipped') or n.attempts >= $2))
     order by u.consent_at
     limit $3`,
    [WELCOME_SWEEP_FROM, MAX_ATTEMPTS, MAX_WELCOMES],
  );
  let sent = 0;
  for (const u of due) {
    if (d.deadline && Date.now() >= d.deadline) break;
    const r = await sendSignupWelcome(q, u.id, d).catch((e) => {
      console.error("[hourly] welcome", e instanceof Error ? e.message : e);
      return "failed" as const;
    });
    if (r === "sent") sent++;
  }
  return sent;
}
