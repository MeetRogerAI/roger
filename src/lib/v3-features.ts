import type { V3Settings } from "./v3-settings";

/**
 * The one switch rule for B2 surfaces (origin R2, B2 plan Unit 1 review): a
 * feature is on only when its own switch is on and the v3 app is live, that
 * is sign-up is open and the weekly cycle is running. Any switch off hides
 * the surface. Every B2 page, link and job asks this, never the raw switch.
 *
 * One deliberate exception: referral credit posting (credit.ts, credit-post.ts)
 * reads the raw `v3.referralsOn`. Credit is money owed, not a surface: a grant
 * recorded while the switch is off waits as `pending_switch` and posts once it
 * is on, whatever sign-up or the cycle are doing then. Gating it on
 * `featureOn` would park grants (and flip them back and forth) every time
 * sign-up is paused, with no member-facing reason to.
 *
 * B3 (plan 2026-11-27-003, Unit 1): `feedbackOn` (the member's weekly note) is a
 * member-facing surface and goes through featureOn like the B2 switches. Two
 * B3 switches are read raw, by design:
 *
 * - `v3.reviewBotOn`: the review bot is admin-only (the Friday run and the PR
 *   flow, which stays in dry-run while it is off). Nothing a member sees
 *   depends on it, so it is not tied to sign-up or the cycle: the team can
 *   review proposals before go-live.
 * - `v3.coraUpgradesOn`: a behaviour of the Cora job, which already runs only
 *   while `cycleLive` is on. Gating it on sign-up as well would switch upgrades
 *   off for members already in the cycle whenever sign-up is paused.
 *
 * B4 (plan 2026-11-28-001, Unit 3): `levelsLive` goes through featureOn for
 * what a member sees (the dashboard check chart, the /app summary and nav
 * link, the stats email's Level line). It is read raw, by design, in two places:
 *
 * - the level engine (scoring after a profile, and the hourly `levels_rescore`):
 *   pausing sign-up must not stop levels being kept current for members
 *   already in the cycle, and the earned level never goes down anyway;
 * - Cora's use of levels (change 8, eligibility, the three slots, the review
 *   hold): like `coraUpgradesOn`, a behaviour of the Cora job, which runs only
 *   while `cycleLive` is on. Gating it on sign-up as well would change
 *   members' picks mid-cycle whenever sign-up is paused.
 *
 * The ops screen's Level column also reads the raw switch (admin-only, and
 * absent while it's off, so the B1 screen is unchanged). `/admin/levels`
 * works whatever the switch. `v3.levelTagsOn` (start the seed tagging in the
 * hourly pass) is read raw: admin-only, needed before go-live, and nothing a
 * member sees depends on it.
 */
export type FeatureSwitch = "referralsOn" | "leaderboardOn" | "statsOn" | "sponsorsOn" | "feedbackOn" | "levelsLive";

export function featureOn(s: Pick<V3Settings, FeatureSwitch | "signupOpen" | "cycleLive">, f: FeatureSwitch): boolean {
  return s[f] === true && s.signupOpen === true && s.cycleLive === true;
}
