import { NoObjectGeneratedError } from "ai";
import { describe, expect, it, vi } from "vitest";

let behaviour: () => Promise<unknown>;
vi.mock("ai", async (orig) => ({ ...(await orig<typeof import("ai")>()), generateText: () => behaviour() }));

const { gatewayModel, ModelCutOff, slicePlaybook } = await import("./model");

const truncated = () =>
  new NoObjectGeneratedError({
    message: "could not parse",
    text: '{"plays":[{"title":"Inbox',
    response: { id: "r", timestamp: new Date(), modelId: "m" },
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } as never,
    finishReason: "length",
  });

describe("gatewayModel", () => {
  it("turns ai@7's truncated-object error into ModelCutOff, so the smaller retry runs", async () => {
    behaviour = async () => Promise.reject(truncated());
    await expect(gatewayModel.readRun("report", { maxPlays: 4 })).rejects.toBeInstanceOf(ModelCutOff);
    await expect(gatewayModel.review([{ id: "p1", text: "x" }])).rejects.toBeInstanceOf(ModelCutOff);
  });

  it("passes other failures through unchanged", async () => {
    behaviour = async () => Promise.reject(new Error("gateway down"));
    await expect(gatewayModel.readRun("report", { maxPlays: 4 })).rejects.toThrow("gateway down");
  });

  it("treats a finished answer that stopped for length as cut off too", async () => {
    behaviour = async () => ({ output: { plays: [], also_runs: [] }, finishReason: "length" });
    await expect(gatewayModel.readRun("report", { maxPlays: 4 })).rejects.toBeInstanceOf(ModelCutOff);
  });
});

describe("slicePlaybook", () => {
  const report = "## Play 1: Inbox\n**Steps:** 1. Read mail.\n2. Draft “replies” — then stop.\n\n## Play 2: Calendar\n1. Read mail.\n2. Book it.\n\n## Review list\nAcme";

  it("tolerates dropped markdown and changed quotes and dashes", () => {
    expect(slicePlaybook(report, "Steps: 1. Read mail.", 'Draft "replies" - then stop.')).toBe("**Steps:** 1. Read mail.\n2. Draft “replies” — then stop.");
  });

  it("starts from the play's own title, so generic first words find the right play", () => {
    expect(slicePlaybook(report, "1. Read mail.", "2. Book it.", "Play 2: Calendar")).toBe("1. Read mail.\n2. Book it.");
  });

  it("never runs into the review list, and returns nothing when the words are not there", () => {
    expect(slicePlaybook(report, "1. Read mail.", "Acme", "Play 2: Calendar")).toBe("");
    expect(slicePlaybook(report, "not in the report", "Book it.")).toBe("");
  });
});
