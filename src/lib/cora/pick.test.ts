import { describe, expect, it } from "vitest";
import { isEligible, whyNot, type UserContext } from "./eligible";
import { pickThree, type Fitted } from "./pick";
import { byRank, type Scored } from "./score";

const play = (id: string, score: number, title = id): Scored => ({
  id,
  title,
  score,
  reachShare: 0,
  f: { hours: 5, reach: 5, ease: 5, proof: 5, surprise: 5 },
  figures: {
    minutes: null,
    currentHours: null,
    rangeLow: null,
    rangeHigh: null,
    heavyHours: null,
    hoursFigure: null,
    complexity: null,
    proof: 0,
    surprise: 0,
    contributors: 1,
    actualContributors: 0,
    confidence: null,
    newestWeek: null,
    retired: false,
  },
});
const c = (id: string, score: number, fit: 1 | 3 | 5, o: Partial<Fitted> = {}): Fitted => ({ play: play(id, score), fit, frictionMatch: false, installable: true, ...o });

describe("pickThree", () => {
  it("takes the three highest personal scores at Fit 3 or more", () => {
    const r = pickThree([c("a", 90, 1), c("b", 60, 5), c("c", 70, 3), c("d", 50, 5), c("e", 40, 3)]);
    // Personal: b 70, c 67.5, d 62.5, e 45. a is Fit 1.
    expect(r).toMatchObject({ outcome: "picked" });
    expect(r.picks.map((p) => [p.play.id, p.position, p.personal])).toEqual([
      ["b", 1, 70],
      ["c", 2, 67.5],
      ["d", 3, 62.5],
    ]);
  });

  it("fills from Fit 1 by network score when fewer than three qualify", () => {
    const r = pickThree([c("a", 50, 5), c("b", 90, 1), c("c", 80, 1), c("d", 95, 1)]);
    expect(r.picks.map((p) => p.play.id)).toEqual(["a", "d", "b"]);
  });

  it("gives two picks when two are eligible, and records none when there are none (R13, R15)", () => {
    expect(pickThree([c("a", 50, 5), c("b", 40, 1)])).toMatchObject({ outcome: "short", picks: [{ position: 1 }, { position: 2 }] });
    expect(pickThree([])).toEqual({ outcome: "none", picks: [] });
  });

  it("ranks a play the user cannot install below every play they can (Cora 2.0 change 9)", () => {
    const r = pickThree([c("a", 99, 5, { installable: false }), c("b", 40, 3), c("c", 30, 3), c("d", 20, 3)]);
    expect(r.picks.map((p) => p.play.id)).toEqual(["b", "c", "d"]);
  });

  it("lets a friction match win a tie in personal score (Cora 2.0 change 10)", () => {
    const r = pickThree([c("a", 60, 5), c("b", 60, 5, { frictionMatch: true })]);
    expect(r.picks[0].play.id).toBe("b");
  });

  it("is the same on every run, whatever order the candidates come in", () => {
    const xs = [c("x", 50, 3), c("y", 50, 3), c("z", 50, 3), c("w", 50, 3)];
    const ids = pickThree(xs).picks.map((p) => p.play.id);
    expect(pickThree([...xs].reverse()).picks.map((p) => p.play.id)).toEqual(ids);
    expect(ids).toEqual(["w", "x", "y"]);
  });
});

describe("eligible (spec check 13, R25)", () => {
  const u: UserContext = {
    alreadyRuns: new Set(["runs"]),
    ownContributions: new Set(["mine", "my-seed"]),
    sent: new Set(["sent"]),
    declined: new Set(["removed"]),
  };
  it.each([
    ["runs", "already_runs"],
    ["mine", "own_contribution"],
    ["my-seed", "own_contribution"],
    ["sent", "already_sent"],
    ["removed", "declined"],
  ])("leaves out %s (%s)", (id, why) => {
    expect(whyNot({ id, retired: false }, u)).toBe(why);
  });

  it("leaves out a retired play, and keeps everything else", () => {
    expect(whyNot({ id: "new", retired: true }, u)).toBe("retired");
    expect(isEligible({ id: "new", retired: false }, u)).toBe(true);
  });
});

describe("pickThree, mixed installability and fit", () => {
  it("puts every installable play, Fit 1 included, before any play the user cannot install", () => {
    const r = pickThree([c("d", 40, 3), c("a", 99, 5, { installable: false }), c("b", 90, 1), c("cc", 80, 1)]);
    expect(r.picks.map((p) => p.play.id)).toEqual(["d", "b", "cc"]);
  });

  it("offers a play the user cannot install when nothing else fits", () => {
    expect(pickThree([c("a", 99, 5, { installable: false })]).picks.map((p) => p.play.id)).toEqual(["a"]);
  });

  it("lets a higher personal score beat a friction match", () => {
    expect(pickThree([c("a", 70, 5), c("b", 60, 5, { frictionMatch: true })]).picks[0].play.id).toBe("a");
  });
});

describe("eligible, resending (Cora 2.0 change 12)", () => {
  it("sends again an idea that could not be installed once the user's setup has what it needed", () => {
    const u: UserContext = { alreadyRuns: new Set(), ownContributions: new Set(), sent: new Set(["x"]), declined: new Set(), resendable: new Set(["x"]) };
    expect(isEligible({ id: "x", retired: false }, u)).toBe(true);
    expect(isEligible({ id: "x", retired: false }, { ...u, declined: new Set(["x"]) })).toBe(false);
  });
});

describe("byRank tie-breaks (v1.1), one level at a time", () => {
  const s = (id: string, o: { surprise?: number; reach?: number; actual?: number; hours?: number } = {}) => {
    const p = play(id, 50);
    p.f = { ...p.f, surprise: o.surprise ?? 5, reach: o.reach ?? 5 };
    p.figures = { ...p.figures, actualContributors: o.actual ?? 0, hoursFigure: o.hours ?? 1 };
    return p;
  };
  it.each([
    ["Surprise", s("z", { surprise: 6 }), s("a")],
    ["Reach", s("z", { reach: 6 }), s("a")],
    ["Actual contributors", s("z", { actual: 1 }), s("a")],
    ["hours", s("z", { hours: 2 }), s("a")],
    ["title", s("a"), s("b")],
  ])("%s decides an equal score", (_, winner, loser) => {
    expect([loser, winner].sort(byRank)[0].id).toBe(winner.id);
  });
});

describe("fit bounds and reason lines (11c review)", () => {
  it("never lets the model bury a play below the code fit, or lift it to 5 without a match code can see", async () => {
    const { boundFit } = await import("./fit");
    expect(boundFit({ id: "x", fit: 1, frictionMatch: false, why: "general" }, 3).fit).toBe(3);
    expect(boundFit({ id: "x", fit: 5, frictionMatch: false, why: "role" }, 1).fit).toBe(1);
    expect(boundFit({ id: "x", fit: 5, frictionMatch: true, why: "friction" }, 1)).toEqual({ fit: 5, frictionMatch: true, why: "friction" });
    expect(boundFit({ id: "x", fit: 5, frictionMatch: false, why: "role" }, 3).fit).toBe(5);
    expect(boundFit(undefined, 3)).toEqual({ fit: 3, frictionMatch: false, why: "category" });
  });

  it("writes reasons from fixed templates, with plain words only from the play's category and role", async () => {
    const { reasonFor, needsLine } = await import("./fit");
    expect(reasonFor("friction", { category: "Listings", heavy_use_for: "x" })).toBe("Matches something your week still had you doing by hand.");
    expect(reasonFor("role", { category: "Listings", heavy_use_for: "Agents at evil.com; call 555-0199" })).toBe("Made for agents at evil com call.");
    expect(reasonFor("category", { category: "Email and calendar", heavy_use_for: "" })).toBe("Fits the email and calendar work your week shows.");
    expect(needsLine({ connections: ["Gmail", "Visit evil.example now", "x".repeat(50)], features: ["browser"] })).toBe(" It needs Gmail, browser.");
  });
});
