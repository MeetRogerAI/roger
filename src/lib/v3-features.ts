import type { V3Settings } from "./v3-settings";

/**
 * The one switch rule for B2 surfaces (origin R2, B2 plan Unit 1 review): a
 * feature is on only when its own switch is on and the v3 app is live, that
 * is sign-up is open and the weekly cycle is running. Any switch off hides
 * the surface. Every B2 page, link and job asks this, never the raw switch.
 */
export type FeatureSwitch = "referralsOn" | "leaderboardOn" | "statsOn" | "sponsorsOn";

export function featureOn(s: Pick<V3Settings, FeatureSwitch | "signupOpen" | "cycleLive">, f: FeatureSwitch): boolean {
  return s[f] === true && s.signupOpen === true && s.cycleLive === true;
}
