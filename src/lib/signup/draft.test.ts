import { describe, expect, it } from "vitest";
import { accountPath, decodeDraft, encodeDraft, type SignupDraft } from "./draft";

const draft: SignupDraft = {
  answers: { work: "real_estate", role: "Broker", uses: "not_yet", agents: ["not_sure"], agentOther: "", primary: "", level: 0, count: "none", help: [], software: "avoid" },
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

  it("resumes a draft saved before levels v1.1, with level 8 and no marker", () => {
    const old = { ...draft, answers: { ...draft.answers, level: 8 } };
    const raw = Buffer.from(JSON.stringify(old)).toString("base64url");
    const back = decodeDraft(raw);
    expect(back?.answers.level).toBe(8);
    expect(back?.answers.levelQuiz).toBeUndefined();
  });

  it("round-trips a levels v1.1 answer, and refuses an unknown levels marker", () => {
    const v11: SignupDraft = { ...draft, answers: { ...draft.answers, level: 9, levelQuiz: "1.1" } };
    expect(decodeDraft(encodeDraft(v11))).toEqual(v11);
    const unknown = Buffer.from(JSON.stringify({ ...v11, answers: { ...v11.answers, levelQuiz: "2.0" } })).toString("base64url");
    expect(decodeDraft(unknown)).toBeNull();
  });

  it("puts 'start anyway' on the new path with the not-ready tag", () => {
    expect(accountPath(draft)).toEqual({ path: "new", notReady: true });
    expect(accountPath({ ...draft, path: "running" })).toEqual({ path: "running", notReady: false });
  });
});
