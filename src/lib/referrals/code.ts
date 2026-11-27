import { randomBytes } from "node:crypto";
import type { Query } from "@/lib/db-query";
import { appUrl } from "@/lib/mail/layout";

/**
 * Referral codes (spec B.15, B2 plan Unit 3): 10 characters of base32, 50
 * random bits, so a code cannot be guessed. The alphabet leaves out 0, 1, l
 * and o, which read alike. Codes are made lazily, the first time a member
 * needs one (their /app/referrals page, later the stats email), and stored in
 * the unique `users.referral_code`.
 */
export const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const CODE_LENGTH = 10;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function newReferralCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  // 256 is a multiple of 32, so each byte modulo 32 is uniform.
  for (const b of bytes) out += CODE_ALPHABET[b % 32];
  return out;
}

/** The code as typed or pasted, lower-cased, or null when it cannot be a code. */
export function cleanCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().toLowerCase();
  return CODE_RE.test(c) ? c : null;
}

/**
 * The member's code, made the first time it is asked for. Race-safe: the
 * write only fills an empty code, so two first visits at once both end up
 * with whichever was stored first. A clash with another member's code (50
 * bits: practically never) tries a fresh one.
 */
export async function ensureReferralCode(q: Query, userId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [have] = await q<{ referral_code: string | null }>(`select referral_code from users where id = $1`, [userId]);
    if (!have) return null;
    if (have.referral_code) return have.referral_code;
    try {
      const [set] = await q<{ referral_code: string }>(
        `update users set referral_code = $2 where id = $1 and referral_code is null returning referral_code`,
        [userId, newReferralCode()],
      );
      if (set) return set.referral_code;
      // Another request stored one first: read it on the next pass.
    } catch (e) {
      if (!/unique|duplicate/i.test((e as Error).message)) throw e;
    }
  }
  const [after] = await q<{ referral_code: string | null }>(`select referral_code from users where id = $1`, [userId]);
  return after?.referral_code ?? null;
}

/** The member a code belongs to, or null for an unknown or malformed code. */
export async function referrerForCode(q: Query, raw: string | null | undefined): Promise<{ id: string } | null> {
  const code = cleanCode(raw);
  if (!code) return null;
  const [u] = await q<{ id: string }>(`select id from users where referral_code = $1`, [code]);
  return u ?? null;
}

/** The member's shareable link, /r/{code}, on this deployment's address. */
export function referralLink(code: string): string {
  return appUrl(`/r/${code}`);
}
