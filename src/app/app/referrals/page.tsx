import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ReferralsComingSoon, ReferralsPanel } from "@/components/app/referrals-panel";
import { requireUser } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { ensureReferralCode, referralLink } from "@/lib/referrals/code";
import { referralsFor } from "@/lib/referrals/stage";
import { featureOn } from "@/lib/v3-features";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

export const metadata: Metadata = { title: "Referrals" };

/** The member's referral link, the script and the people they referred (spec B.15, B2 plan Unit 3). */
async function Referrals() {
  await connection();
  const session = await requireUser("/app/referrals");
  const on = featureOn(await getV3SettingsForDisplay(), "referralsOn");
  // The code is made the first time it is needed, here (race-safe: two first visits get one code).
  const [code, people] = on ? await Promise.all([ensureReferralCode(query, session.userId), referralsFor(query, session.userId)]) : [null, []];
  if (on && !code) console.error("[referrals] no referral code could be made", { userId: session.userId });
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-h2">Referrals</h1>
        <p className="mt-3 text-small text-ink-2">Share your link. Everyone who signs up through it shows here.</p>
      </header>
      {!on ? (
        <ReferralsComingSoon />
      ) : code ? (
        <ReferralsPanel link={referralLink(code)} people={people} />
      ) : (
        <p role="alert" className="text-small text-error">
          We couldn’t make your link just now. Try again in a minute.
        </p>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-lead text-ink-2">Loading…</p>}>
      <Referrals />
    </Suspense>
  );
}
