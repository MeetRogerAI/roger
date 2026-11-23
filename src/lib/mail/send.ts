import { siteConfig } from "@/data/config";
import { query as defaultQuery, type Query } from "@/lib/db-query";
import { adminEmails } from "@/lib/auth/admin-emails";
import { getSecret } from "@/lib/secrets";
import type { Rendered } from "./layout";

/**
 * Sending automatic email at most once per trigger (spec B.1 rule 6).
 *
 * Claim first, then send: a row in `notifications` keyed by (recipient, kind,
 * ref) is inserted before Resend is called, and only the caller whose insert
 * returned a row sends. A failed send can be claimed again by the next
 * trigger, up to three attempts; a send stuck in "sending" for 15 minutes can
 * be taken over. A sent row is never claimed again. Resend gets an
 * idempotency key built from the same three values, so a retry inside its
 * 24-hour window cannot send twice either.
 */

export const MAX_ATTEMPTS = 3;

/** Which emails a user can switch off (spec B.10). Everything else, billing included, always goes. */
export const optionalKinds: Record<string, "monday" | "friday_prompt"> = {
  monday_list: "monday",
  order_prompt: "friday_prompt",
};

/** Emails sent once per request, with a fresh ref each time: a failure is never retried by a later trigger. */
export const oneShotKinds = new Set(["signin_link", "signin_no_account", "signup_confirm", "email_change", "email_change_approve", "email_change_taken", "email_changed"]);

export type Recipient = { id: string; email: string; emailPrefs?: Record<string, unknown> | null };
export type SendResult = "sent" | "already" | "skipped" | "failed";

export type Transport = (msg: { to: string[]; subject: string; html: string; text: string; idempotencyKey: string }) => Promise<
  { ok: true } | { ok: false; error: string; retryable: boolean }
>;

export type MailDeps = { query?: Query; transport?: Transport; sleep?: (ms: number) => Promise<void> };

/** Claims (recipient, kind, ref). Returns the attempt number, or null if someone already has it. */
export async function claim(q: Query, recipient: string, kind: string, ref: string): Promise<number | null> {
  const rows = await q<{ attempts: number }>(
    `insert into notifications (recipient, kind, ref) values ($1, $2, $3)
     on conflict (recipient, kind, ref) do update
       set status = 'sending', attempts = notifications.attempts + 1, claimed_at = now(), error = null
       where (notifications.status = 'failed' and notifications.attempts < $4)
          or (notifications.status = 'sending' and notifications.claimed_at < now() - interval '15 minutes')
     returning attempts`,
    [recipient, kind, ref, MAX_ATTEMPTS],
  );
  return rows[0]?.attempts ?? null;
}

async function record(q: Query, recipient: string, kind: string, ref: string, status: "sent" | "failed" | "skipped", error?: string) {
  await q(
    `update notifications set status = $4, sent_at = case when $4 = 'sent' then now() else sent_at end, error = $5
     where recipient = $1 and kind = $2 and ref = $3`,
    [recipient, kind, ref, status, error ?? null],
  );
}

/** Resend's REST API, with an idempotency key. */
export const resendTransport: Transport = async ({ to, subject, html, text, idempotencyKey }) => {
  const key = await getSecret("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set", retryable: false };
  const from = process.env.EMAIL_FROM_SUPPORT ?? process.env.EMAIL_FROM ?? "Roger support <support@meetroger.ai>";
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({ from, to, subject, html, text, reply_to: siteConfig.contactEmail }),
      // A stalled provider must not hold a visitor's form, or leave a claim stuck.
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return { ok: false, error: `network: ${(e as Error).message}`, retryable: true };
  }
  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  // Quotas do not recover by retrying now; rate limits and in-flight duplicates do.
  const quota = /daily_quota_exceeded|monthly_quota_exceeded/.test(body);
  const retryable = !quota && (res.status === 429 || res.status === 409 || res.status >= 500);
  return { ok: false, error: `resend ${res.status} ${body.slice(0, 200)}`, retryable };
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Sends with up to two short in-process retries for rate limits and network blips. */
async function deliver(t: Transport, msg: Parameters<Transport>[0], sleep: (ms: number) => Promise<void>) {
  let last: Awaited<ReturnType<Transport>> = { ok: false, error: "not attempted", retryable: true };
  for (let i = 0; i < 3; i++) {
    last = await t(msg);
    if (last.ok || !last.retryable) return last;
    if (i < 2) await sleep(500 * 2 ** i);
  }
  return last;
}

/** One automatic email to one user, at most once for (user, kind, ref). */
export async function sendToUser(
  user: Recipient,
  kind: string,
  ref: string,
  message: Rendered,
  deps: MailDeps = {},
): Promise<SendResult> {
  const q = deps.query ?? defaultQuery;
  const attempt = await claim(q, user.id, kind, ref);
  if (attempt === null) return "already";

  const pref = optionalKinds[kind];
  if (pref && user.emailPrefs && user.emailPrefs[pref] === false) {
    await record(q, user.id, kind, ref, "skipped");
    return "skipped";
  }

  const result = await deliver(
    deps.transport ?? resendTransport,
    { to: [user.email], subject: message.subject, html: message.html, text: message.text, idempotencyKey: `${kind}/${user.id}/${ref}`.slice(0, 256) },
    deps.sleep ?? realSleep,
  );
  if (result.ok) {
    await record(q, user.id, kind, ref, "sent");
    return "sent";
  }
  await record(q, user.id, kind, ref, "failed", result.error);
  // Alert when nothing will try again: the last attempt, an error retrying cannot fix, or a
  // one-shot email (a sign-in link) whose next request makes a new row. One alert per kind
  // per hour, so an outage does not become one email per visitor.
  if (attempt >= MAX_ATTEMPTS || !result.retryable || oneShotKinds.has(kind)) {
    const hour = new Date().toISOString().slice(0, 13);
    await alertAdmins(`email_failed:${kind}`, hour, adminAlert(
      `Emails are failing: ${kind}`,
      [`First failure this hour: user ${user.id}, ${ref}, attempt ${attempt}.`, `Error: ${result.error}`],
    ), deps).catch(() => {});
  }
  return "failed";
}

/** One alert to both admins, at most once per (kind, ref). Never alerts about itself. */
export async function alertAdmins(kind: string, ref: string, message: Rendered, deps: MailDeps = {}): Promise<SendResult> {
  const q = deps.query ?? defaultQuery;
  const to = adminEmails();
  if (!to.length) return "skipped";
  const attempt = await claim(q, "admins", kind, ref);
  if (attempt === null) return "already";
  const result = await deliver(
    deps.transport ?? resendTransport,
    { to, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `${kind}/admins/${ref}`.slice(0, 256) },
    deps.sleep ?? realSleep,
  );
  await record(q, "admins", kind, ref, result.ok ? "sent" : "failed", result.ok ? undefined : result.error);
  if (!result.ok) console.error(`[mail] admin alert ${kind}/${ref} failed: ${result.error}`);
  return result.ok ? "sent" : "failed";
}

/** A plain admin alert body. */
export function adminAlert(subject: string, lines: string[]): Rendered {
  const text = lines.join("\n\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px">${lines
    .map((l) => `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
    .join("")}</body></html>`;
  return { subject: `[Roger] ${subject}`, html, text };
}
