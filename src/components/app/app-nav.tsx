import Link from "next/link";
import { Suspense } from "react";
import { featureOn } from "@/lib/v3-features";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

/** Shown only while referrals are switched on (B2 Unit 3: one switch rule for every B2 surface). */
async function ReferralsLink() {
  if (!featureOn(await getV3SettingsForDisplay(), "referralsOn")) return null;
  return (
    <Link href="/app/referrals" className="tlink">
      Referrals
    </Link>
  );
}

/** Shown only while the leaderboard is switched on (B2 Unit 7). */
async function LeaderboardLink() {
  if (!featureOn(await getV3SettingsForDisplay(), "leaderboardOn")) return null;
  return (
    <Link href="/app/leaderboard" className="tlink">
      Leaderboard
    </Link>
  );
}

/** The signed-in navigation. Sign out is a POST from this page (see /auth/signout). */
export function AppNav() {
  return (
    <nav aria-label="Your account" className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-[880px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-small sm:flex-nowrap sm:gap-6 sm:px-6">
        <Link href="/app" className="font-semibold">
          Roger
        </Link>
        <Link href="/app/zack" className="tlink">
          Zack
        </Link>
        <Link href="/app/billing" className="tlink">
          Billing
        </Link>
        <Suspense fallback={null}>
          <ReferralsLink />
        </Suspense>
        <Suspense fallback={null}>
          <LeaderboardLink />
        </Suspense>
        <Link href="/app/settings" className="tlink">
          Settings
        </Link>
        <form action="/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="tlink">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
