import type { Query } from "@/lib/db-query";
import { issueToken } from "@/lib/auth/login-link";
import { emailKey, EMAIL, hashSecret, normaliseEmail } from "@/lib/auth/secrets";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { signInLinkEmail, startConfirmEmail } from "@/lib/mail/templates/sign-in";
import { hit, limits, type Counter } from "@/lib/rate-limit";
import { accountPath, type SignupDraft } from "./draft";

/**
 * Sign-up step 2 (spec B.4): name and email. Saves the quiz as the account's
 * profile and emails a link; confirming it signs the person in and opens the
 * plan step. The page says "check your email" whatever happened here.
 *
 * - New address: a new, unverified account.
 * - Address with an unverified account (someone started before): its name
 *   and answers are replaced with these, since nobody has proved the address.
 * - Address with a verified account: nothing is changed; a normal sign-in
 *   link is sent, back to wherever that account is.
 */
export type AccountOutcome = "new" | "restarted" | "existing" | "limited" | "invalid";

export const stepPaths: Record<string, string> = {
  quiz: "/start",
  account: "/start/account",
  plan: "/start/plan",
  card: "/start/card",
  done: "/app",
};

export async function startAccount(
  q: Query,
  input: { name: string; email: string; draft: SignupDraft; ip: string },
  deps: MailDeps & { counter?: Counter; now?: Date } = {},
): Promise<AccountOutcome> {
  const email = normaliseEmail(input.email);
  const name = input.name.trim().slice(0, 80);
  if (!EMAIL.test(email) || email.length > 254 || name.length < 1) return "invalid";
  const now = deps.now ?? new Date();
  const okEmail = await hit(`signin:email:${emailKey(email)}`, limits.signinPerEmail, now, deps.counter);
  const okIp = await hit(`signin:ip:${input.ip}`, limits.signinPerIp, now, deps.counter);
  if (!okEmail || !okIp) return "limited";

  const existing = await q<{ id: string; email_verified_at: unknown; signup_step: string }>(
    `select id, email_verified_at, signup_step from users where email = $1`,
    [email],
  );
  const row = existing[0];

  if (row?.email_verified_at) {
    const token = await issueToken(q, { email, purpose: "signin", userId: row.id, nextPath: stepPaths[row.signup_step] ?? "/app" }, now);
    await sendToUser({ id: row.id, email }, "signin_link", hashSecret(token).slice(0, 16), signInLinkEmail(token), deps);
    return "existing";
  }

  const d = input.draft;
  const { path, notReady } = accountPath(d);
  const profile = { ...d.answers, source: d.source };
  const agent = d.answers.agent === "other" ? d.answers.agentOther : d.answers.agent;
  const values = [email, name, path, notReady, JSON.stringify(profile), agent, d.cur, d.ref ?? "", d.utm, d.zack];
  const saved = await q<{ id: string; created: boolean }>(
    `insert into users (email, name, path, not_ready, profile, agent, currency, ref, utm, pending_zack_token, signup_step)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, 'plan')
     on conflict (email) do update set
       name = excluded.name, path = excluded.path, not_ready = excluded.not_ready, profile = excluded.profile,
       agent = excluded.agent, currency = excluded.currency, ref = excluded.ref, utm = excluded.utm,
       pending_zack_token = excluded.pending_zack_token, signup_step = 'plan'
     where users.email_verified_at is null
     returning id, (xmax = 0) as created`,
    values,
  );
  const user = saved[0];
  // A verified account appeared between the two statements: treat it as existing.
  if (!user) return startAccount(q, input, deps);

  const token = await issueToken(q, { email, purpose: "signin", userId: user.id, nextPath: "/start/plan" }, now);
  await sendToUser({ id: user.id, email }, "signup_confirm", hashSecret(token).slice(0, 16), startConfirmEmail(token), deps);
  return user.created ? "new" : "restarted";
}
