import type { Query } from "@/lib/db-query";
import { keyDomains, referralEmailKey } from "@/lib/referrals/attribution";
import { verifyGuestOptOut } from "./unsubscribe";

/**
 * Whether Roger must not email this address on behalf of a member (a guest
 * invitation, B2 Unit 9). Two per-address records: a guest's own opt-out
 * (`email_suppressions`, from the invitation's link: B2 whole-branch review)
 * and a watch alert's unsubscribe (`watches.unsubscribed_at`); bounces are
 * not tracked. Compared on the normalised address (`referralEmailKey`), so a
 * plus-tag or Gmail dots don't get around an opt-out.
 */
export async function isAddressSuppressed(q: Query, email: string): Promise<boolean> {
  const key = referralEmailKey(email);
  const [opted] = await q(`select 1 from email_suppressions where email_key = $1`, [key]);
  if (opted) return true;
  const rows = await q<{ email: string }>(
    `select email from watches where unsubscribed_at is not null and lower(split_part(email, '@', 2)) = any($1::text[])`,
    [keyDomains(key)],
  );
  return rows.some((r) => referralEmailKey(r.email) === key);
}

/** Where an opt-out came from (`email_suppressions.source`). */
export const GUEST_OPT_OUT = "guest_invite";

/**
 * A guest's opt-out (the /o/{token} button, or the one-click POST): the
 * token's address is suppressed for good. Safe to repeat. Null for a token
 * that does not verify, and then nothing is written.
 */
export async function optOutGuest(q: Query, token: string | null | undefined): Promise<{ emailKey: string } | null> {
  const emailKey = verifyGuestOptOut(token);
  if (!emailKey) return null;
  await q(`insert into email_suppressions (email_key, source) values ($1, $2) on conflict (email_key) do nothing`, [emailKey, GUEST_OPT_OUT]);
  return { emailKey };
}

/** Whether the token's address has opted out already (the page's "done" state). Null for a bad token. */
export async function guestOptedOut(q: Query, token: string | null | undefined): Promise<boolean | null> {
  const emailKey = verifyGuestOptOut(token);
  if (!emailKey) return null;
  const [r] = await q(`select 1 from email_suppressions where email_key = $1`, [emailKey]);
  return Boolean(r);
}
