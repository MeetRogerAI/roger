import { describe, expect, it } from "vitest";
import { featureOn } from "./v3-features";
import { mergeV3 } from "./v3-settings";

/** The one B2 switch rule (B2 plan Unit 1 review, origin R2): the feature's own switch and the live app. */
describe("featureOn", () => {
  const live = { ...mergeV3([]), signupOpen: true, cycleLive: true, referralsOn: true };

  it("is on only when the feature's switch, sign-up and the cycle are all on", () => {
    expect(featureOn(live, "referralsOn")).toBe(true);
    expect(featureOn({ ...live, referralsOn: false }, "referralsOn")).toBe(false);
    expect(featureOn({ ...live, signupOpen: false }, "referralsOn")).toBe(false);
    expect(featureOn({ ...live, cycleLive: false }, "referralsOn")).toBe(false);
  });

  it("gates the B3 member note (feedbackOn) like the B2 surfaces", () => {
    const on = { ...live, feedbackOn: true };
    expect(featureOn(on, "feedbackOn")).toBe(true);
    expect(featureOn({ ...on, feedbackOn: false }, "feedbackOn")).toBe(false);
    expect(featureOn({ ...on, signupOpen: false }, "feedbackOn")).toBe(false);
    expect(featureOn({ ...on, cycleLive: false }, "feedbackOn")).toBe(false);
  });

  it("reads each feature's own switch", () => {
    expect(featureOn(live, "leaderboardOn")).toBe(false);
    expect(featureOn({ ...live, leaderboardOn: true }, "leaderboardOn")).toBe(true);
  });

  it("is off with the defaults", () => {
    expect(featureOn(mergeV3([]), "referralsOn")).toBe(false);
    expect(featureOn(mergeV3([]), "feedbackOn")).toBe(false);
  });
});
