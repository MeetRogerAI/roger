import type { Query } from "@/lib/db-query";
import { issueToken, type NewAccount } from "@/lib/auth/login-link";
import { emailKey, hashSecret, normaliseEmail } from "@/lib/auth/tokens";
import { isEmail } from "@/lib/form";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { signInLinkEmail, startConfirmEmail } from "@/lib/mail/templates/sign-in";
import { hit, limits, type Counter } from "@/lib/rate-limit";
import { accountPath, type SignupDraft } from "./draft";
import { primaryAgent } from "./quiz";

/**
 * Sign-up step 2 (spec B.4): name and email. Emails a link; confirming it
 * creates the account (or signs in to an existing one) and opens the plan step.
 *
 * No account is written here. The name and quiz answers travel on the link and
 * are applied only when the address is confirmed, so typing someone else's
 * address creates nothing and changes nothing of theirs. An address that
 * already has an account gets a plain sign-in link instead, and its details
 * are never replaced.
 *
 * "send_failed" may be shown to the visitor: it happens whether or not the
 * address has an account.
 */
export type AccountOutcome = "new" | "existing" | "limited" | "invalid" | "send_failed";

/**
 * Where each sign-up step resumes. Sign-up ends at Step 3 (plan
 * 2026-11-26-001, Unit 2); `card` is kept for old rows and resumes at Step 3,
 * which is where the consent that ends sign-up is given.
 */
export const stepPaths: Record<string, string> = {
  quiz: "/start",
  account: "/start/account",
  plan: "/start/plan",
  card: "/start/plan",
  done: "/app",
};

/** A new account's details from the sign-up draft: carried on the email link, or on a Google sign-in (plan Unit 18). */
export function newAccountFrom(d: SignupDraft, name: string): NewAccount {
  const { path, notReady } = accountPath(d);
  return {
    name: name.trim().slice(0, 80),
    path,
    notReady,
    profile: { ...d.answers, source: d.source },
    agent: primaryAgent(d.answers),
    currency: d.cur,
    ref: d.ref ?? "",
    utm: d.utm,
    zack: d.zack,
  };
}

export async function startAccount(
  q: Query,
  input: { name: string; email: string; draft: SignupDraft; ip: string },
  deps: MailDeps & { counter?: Counter; now?: Date } = {},
): Promise<AccountOutcome> {
  const email = normaliseEmail(input.email);
  const name = input.name.trim().slice(0, 80);
  if (!isEmail(email) || name.length < 1) return "invalid";
  const now = deps.now ?? new Date();
  const okEmail = await hit(`signin:email:${emailKey(email)}`, limits.signinPerEmail, now, deps.counter);
  const okIp = await hit(`signin:ip:${input.ip}`, limits.signinPerIp, now, deps.counter);
  if (!okEmail || !okIp) return "limited";

  const existing = await q<{ id: string; signup_step: string }>(`select id, signup_step from users where email = $1`, [email]);
  const row = existing[0];

  if (row) {
    const token = await issueToken(q, { email, purpose: "signin", userId: row.id, nextPath: stepPaths[row.signup_step] ?? "/app" }, now);
    const r = await sendToUser({ id: row.id, email }, "signin_link", hashSecret(token).slice(0, 16), signInLinkEmail(token), deps);
    return r === "failed" ? "send_failed" : "existing";
  }

  return (await sendSignupLink(q, email, newAccountFrom(input.draft, name), { ...deps, now })) === "failed" ? "send_failed" : "new";
}

/**
 * The sign-up confirmation link for an address with no account yet: the
 * account is made only when the link is opened. Also used when a Google
 * sign-up's address is not one Google can vouch for (Unit 18 review).
 */
export async function sendSignupLink(q: Query, email: string, account: NewAccount, deps: MailDeps & { now?: Date } = {}) {
  const token = await issueToken(q, { email, purpose: "signin", nextPath: "/start/plan", newAccount: account }, deps.now ?? new Date());
  return sendToUser({ id: `email:${emailKey(email)}`, email }, "signup_confirm", hashSecret(token).slice(0, 16), startConfirmEmail(token), deps);
}
