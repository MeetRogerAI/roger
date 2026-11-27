import { lookupSession } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { creditBalance, creditLedgerSummary } from "@/lib/referrals/credit-balance";
import { ensureReferralCode, referralLink } from "@/lib/referrals/code";
import { referralsFor } from "@/lib/referrals/stage";
import { featureOn } from "@/lib/v3-features";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

/**
 * GET /api/referrals (B2 whole-branch review: the agent surface for
 * /app/referrals). Signed in with the same session cookie as the app, and
 * only ever about the caller. Read-only (like the page, the first call makes
 * the member's code):
 * - `open`: whether referrals are switched on (`v3.referralsOn`); while off,
 *   no link or code, as the page shows "coming soon";
 * - `link` and `code`: the member's referral link;
 * - `people`: who they referred, each with its stage (never an address);
 * - `credit.balance`: the referral credit on their Stripe balance as last
 *   read (`asOf`), or null if never read; `credit.ledger`: earned, waiting
 *   and taken back, from the credit ledger.
 */
export async function GET() {
  const l = await lookupSession();
  if (l.state === "error") return Response.json({ error: "We couldn’t check your sign-in just now. Try again in a minute." }, { status: 503 });
  if (l.state === "none") return Response.json({ error: "Not signed in." }, { status: 401 });
  const userId = l.session.userId;
  const [u] = await query<{ status: string }>(`select status from users where id = $1`, [userId]);
  if (!u || u.status === "signup") return Response.json({ error: "Finish signing up first." }, { status: 403 });

  const open = featureOn(await getV3SettingsForDisplay(), "referralsOn");
  const [code, people, balance, ledger] = await Promise.all([
    open ? ensureReferralCode(query, userId) : Promise.resolve(null),
    open ? referralsFor(query, userId) : Promise.resolve([]),
    creditBalance(query, userId),
    creditLedgerSummary(query, userId),
  ]);
  if (open && !code) return Response.json({ error: "We couldn’t make your link just now. Try again in a minute." }, { status: 503 });
  return Response.json(
    {
      open,
      code,
      link: code ? referralLink(code) : null,
      people: people.map((p) => ({ who: p.who, stage: p.stage })),
      credit: { balance: balance ? { cents: balance.cents, currency: balance.currency, asOf: balance.asOf.toISOString() } : null, ledger },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
