import type { Query } from "@/lib/db-query";
import { hit, limits, type Counter } from "@/lib/rate-limit";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { noAccountEmail, signInLinkEmail } from "@/lib/mail/templates/sign-in";
import { issueToken } from "./login-link";
import { emailKey, hashSecret, normaliseEmail } from "./secrets";

/**
 * "Email me a sign-in link." The caller always shows the same answer, whether
 * the address has an account, has none, or has asked too often, so the form
 * cannot be used to find out who uses Roger.
 *
 * Returns what happened, for tests and logs only. Never show it to the visitor.
 */
export type LinkOutcome = "sent" | "no_account" | "limited" | "invalid";

export async function requestSignInLink(
  q: Query,
  rawEmail: string,
  ip: string,
  nextPath: string,
  deps: MailDeps & { counter?: Counter; now?: Date } = {},
): Promise<LinkOutcome> {
  const email = normaliseEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "invalid";
  const now = deps.now ?? new Date();
  const okEmail = await hit(`signin:email:${emailKey(email)}`, limits.signinPerEmail, now, deps.counter);
  const okIp = await hit(`signin:ip:${ip}`, limits.signinPerIp, now, deps.counter);
  if (!okEmail || !okIp) return "limited";

  const users = await q<{ id: string }>(`select id from users where email = $1`, [email]);
  const token = await issueToken(q, { email, purpose: "signin", userId: users[0]?.id ?? null, nextPath }, now);
  // Each request is its own trigger, keyed by its token.
  const ref = hashSecret(token).slice(0, 16);
  const recipient = { id: users[0]?.id ?? `email:${emailKey(email)}`, email };
  if (!users[0]) {
    await sendToUser(recipient, "signin_no_account", ref, noAccountEmail(), deps);
    return "no_account";
  }
  await sendToUser(recipient, "signin_link", ref, signInLinkEmail(token), deps);
  return "sent";
}
