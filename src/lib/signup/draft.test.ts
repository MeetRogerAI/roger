import { describe, expect, it } from "vitest";
import { accountPath, decodeDraft, encodeDraft, type SignupDraft } from "./draft";

const draft: SignupDraft = {
  answers: { work: "real_estate", role: "Broker", uses: "not_yet", agent: "not_sure", agentOther: "", count: "none", help: [], software: "avoid" },
  path: "not_ready",
  continuedAnyway: true,
  source: "re",
  cur: "CAD",
  ref: null,
  zack: null,
  utm: "fall",
};

describe("signup draft", () => {
  it("round-trips", () => {
    expect(decodeDraft(encodeDraft(draft))).toEqual(draft);
  });

  it("refuses a tampered or broken cookie instead of failing", () => {
    expect(decodeDraft("not-base64-json")).toBeNull();
    const bad = Buffer.from(JSON.stringify({ ...draft, cur: "EUR" })).toString("base64url");
    expect(decodeDraft(bad)).toBeNull();
    expect(decodeDraft(undefined)).toBeNull();
  });

  it("puts 'start anyway' on the new path with the not-ready tag", () => {
    expect(accountPath(draft)).toEqual({ path: "new", notReady: true });
    expect(accountPath({ ...draft, path: "running" })).toEqual({ path: "running", notReady: false });
  });
});
