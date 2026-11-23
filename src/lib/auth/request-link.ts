import type { Query } from "@/lib/db-query";
import { isEmail } from "@/lib/form";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { noAccountEmail, signInLinkEmail } from "@/lib/mail/templates/sign-in";
import { hit, limits, type Counter } from "@/lib/rate-limit";
import { issueToken } from "./login-link";
import { emailKey, hashSecret, normaliseEmail } from "./tokens";

/**
 * "Email me a sign-in link."
 *
 * An email goes out whether or not the address has an account (an unknown
 * address is told where to start), so "sent" and "no_account" must look the
 * same to the visitor. "send_failed" may be shown: it happens for either kind
 * of address and says nothing about which. "limited" is shown as "sent", so a
 * stranger cannot use the limit to learn anything either.
 *
 * Throws if the database cannot be reached; the caller shows a plain error.
 */
export type LinkOutcome = "sent" | "no_account" | "limited" | "invalid" | "send_failed";

export async function requestSignInLink(
  q: Query,
  rawEmail: string,
  ip: string,
  nextPath: string,
  deps: MailDeps & { counter?: Counter; now?: Date } = {},
): Promise<LinkOutcome> {
  const email = normaliseEmail(rawEmail);
  if (!isEmail(email)) return "invalid";
  const now = deps.now ?? new Date();
  const okEmail = await hit(`signin:email:${emailKey(email)}`, limits.signinPerEmail, now, deps.counter);
  const okIp = await hit(`signin:ip:${ip}`, limits.signinPerIp, now, deps.counter);
  if (!okEmail || !okIp) return "limited";

  const users = await q<{ id: string }>(`select id from users where email = $1`, [email]);
  const token = await issueToken(q, { email, purpose: "signin", userId: users[0]?.id ?? null, nextPath }, now);
  // Each request is its own trigger, keyed by its token.
  const ref = hashSecret(token).slice(0, 16);
  const recipient = { id: users[0]?.id ?? `email:${emailKey(email)}`, email };
  const result = users[0]
    ? await sendToUser(recipient, "signin_link", ref, signInLinkEmail(token), deps)
    : await sendToUser(recipient, "signin_no_account", ref, noAccountEmail(), deps);
  if (result === "failed") return "send_failed";
  return users[0] ? "sent" : "no_account";
}
