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
 */
export type FeatureSwitch = "referralsOn" | "leaderboardOn" | "statsOn" | "sponsorsOn";

export function featureOn(s: Pick<V3Settings, FeatureSwitch | "signupOpen" | "cycleLive">, f: FeatureSwitch): boolean {
  return s[f] === true && s.signupOpen === true && s.cycleLive === true;
}
