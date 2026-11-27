import type { Query } from "@/lib/db-query";
import { keyDomains, referralEmailKey } from "@/lib/referrals/attribution";

/**
 * Whether Roger must not email this address on behalf of a member (a guest
 * invitation, B2 Unit 9). The only per-address record Roger keeps is a watch
 * alert's unsubscribe (`watches.unsubscribed_at`); bounces are not tracked.
 * Compared on the normalised address (`referralEmailKey`), so a plus-tag or
 * Gmail dots don't get around an unsubscribe.
 */
export async function isAddressSuppressed(q: Query, email: string): Promise<boolean> {
  const key = referralEmailKey(email);
  const rows = await q<{ email: string }>(
    `select email from watches where unsubscribed_at is not null and lower(split_part(email, '@', 2)) = any($1::text[])`,
    [keyDomains(key)],
  );
  return rows.some((r) => referralEmailKey(r.email) === key);
}
