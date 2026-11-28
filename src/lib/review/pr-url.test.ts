import { describe, expect, it } from "vitest";
import { REPO } from "./github";
import { isRepoPullUrl, PR_PREFIX } from "./pr-url";

describe("isRepoPullUrl", () => {
  it("accepts only a numbered pull request on this repo", () => {
    expect(PR_PREFIX).toBe(`https://github.com/${REPO}/pull/`);
    expect(isRepoPullUrl("https://github.com/MeetRogerAI/roger/pull/12")).toBe(true);
    for (const bad of [null, undefined, "https://github.com/evil/x", "https://github.com/MeetRogerAI/roger/pull/12/files", "https://github.com/MeetRogerAI/roger/pull/", "https://github.com.evil.com/MeetRogerAI/roger/pull/1", "javascript:alert(1)"]) {
      expect(isRepoPullUrl(bad)).toBe(false);
    }
  });
});
