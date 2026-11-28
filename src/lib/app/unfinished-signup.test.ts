import { describe, expect, it } from "vitest";
import { unfinishedSignupGoesTo } from "./unfinished-signup";

describe("/app for someone whose sign-up is not finished", () => {
  it("sends an admin to the admin and everyone else back to sign-up", () => {
    expect(unfinishedSignupGoesTo(true)).toBe("/admin");
    expect(unfinishedSignupGoesTo(false)).toBe("/start");
  });
});
