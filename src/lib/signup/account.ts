import type { Query } from "@/lib/db-query";
import { issueToken } from "@/lib/auth/login-link";
import { emailKey, hashSecret, normaliseEmail } from "@/lib/auth/tokens";
import { isEmail } from "@/lib/form";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { signInLinkEmail, startConfirmEmail } from "@/lib/mail/templates/sign-in";
import { hit, limits, type Counter } from "@/lib/rate-limit";
import { accountPath, type SignupDraft } from "./draft";

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

  const d = input.draft;
  const { path, notReady } = accountPath(d);
  const token = await issueToken(
    q,
    {
      email,
      purpose: "signin",
      nextPath: "/start/plan",
      newAccount: {
        name,
        path,
        notReady,
        profile: { ...d.answers, source: d.source },
        agent: d.answers.agent === "other" ? d.answers.agentOther : d.answers.agent,
        currency: d.cur,
        ref: d.ref ?? "",
        utm: d.utm,
        zack: d.zack,
      },
    },
    now,
  );
  const r = await sendToUser({ id: `email:${emailKey(email)}`, email }, "signup_confirm", hashSecret(token).slice(0, 16), startConfirmEmail(token), deps);
  return r === "failed" ? "send_failed" : "new";
}
