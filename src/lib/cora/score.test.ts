import { describe, expect, it } from "vitest";
import { v3Defaults } from "@/data/config";
import { deciles, mergedFigures, personalScore, recencyWeight, scorePool, weightedMedian, type Evidence, type PoolPlay } from "./score";

const W = v3Defaults.recencyWeights;
const AS_OF = "2026-11-30";
const ev = (o: Partial<Evidence> = {}): Evidence => ({
  contributor: "u1",
  weekOf: AS_OF,
  set: "A",
  origin: "own",
  minutes: 20,
  currentHours: 1,
  rangeLow: null,
  rangeHigh: null,
  heavyHours: null,
  basis: "Implied",
  confidence: "Low",
  weeksRunning: null,
  steps: 1,
  connections: 0,
  setupQuestions: 0,
  ...o,
});

/**
 * Hand-worked pool (spec check 18). Play i (0 to 9) has one contributor, hours
 * 10 − i, complexity i + 1 and reach i. Proof and Surprise are equal for all,
 * so every play gets 10 on both. Then:
 *   Hours 10 − i, Reach i + 1, Ease 10 − i, Proof 10, Surprise 10
 *   raw = 30(10 − i) + 25(i + 1) + 10(10 − i) + 150 + 200 = 775 − 15i
 *   score = raw / 10 = 77.5 − 1.5i
 */
const handPool: PoolPlay[] = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  title: `Play ${i}`,
  reachCount: i,
  evidence: [ev({ contributor: `u${i}`, currentHours: 10 - i, steps: i + 1 })],
}));

describe("scorePool on a hand-worked pool (spec check 18)", () => {
  const { scored } = scorePool(handPool, { asOf: AS_OF, weights: W, activeUsers: 10 });
  it.each(Array.from({ length: 10 }, (_, i) => i))("play %i matches the hand calculation", (i) => {
    const s = scored.find((x) => x.id === `p${i}`)!;
    expect(s.f).toEqual({ hours: 10 - i, reach: i + 1, ease: 10 - i, proof: 10, surprise: 10 });
    expect(s.score).toBeCloseTo(77.5 - 1.5 * i, 10);
    expect(personalScore(s.score, 5)).toBeCloseTo((77.5 - 1.5 * i) * 0.75 + 25, 10);
  });

  it("ranks by score", () => {
    expect(scored.map((s) => s.id)).toEqual(handPool.map((p) => p.id));
  });

  it("scores all tens as 100", () => {
    const one = scorePool([{ id: "x", title: "X", reachCount: 1, evidence: [ev()] }], { asOf: AS_OF, weights: W, activeUsers: 1 });
    expect(one.scored[0].score).toBe(100);
  });
});

describe("deciles", () => {
  it("gives equal figures equal points and a missing figure 1", () => {
    // Three known figures: places 0, 0 and 2 → 10, 10 and 10 − ⌊20 / 3⌋ = 4.
    expect(deciles([5, 5, 1, null], "high")).toEqual([10, 10, 4, 1]);
    expect(deciles([1, 2, 3, 4], "low")).toEqual([10, 8, 5, 3]);
  });
});

describe("merged figures", () => {
  it("weights an Actual figure twice in the hours median (v1.1)", () => {
    const p: PoolPlay = { id: "p", title: "t", reachCount: 0, evidence: [ev({ contributor: "a", basis: "Actual", currentHours: 2 }), ev({ contributor: "b", currentHours: 5 })] };
    expect(mergedFigures(p, AS_OF, W).currentHours).toBe(2);
    expect(weightedMedian([{ value: 2, weight: 1 }, { value: 5, weight: 1 }])).toBe(3.5);
  });

  it("uses half the heavy-user hours when that is higher", () => {
    const p: PoolPlay = { id: "p", title: "t", reachCount: 0, evidence: [ev({ currentHours: 1, heavyHours: 6 })] };
    expect(mergedFigures(p, AS_OF, W).hoursFigure).toBe(3);
  });

  it("weights evidence by age and retires a play whose newest evidence is 27 weeks old", () => {
    expect(recencyWeight("2026-11-23", AS_OF, W)).toBe(1);
    expect(recencyWeight("2026-10-26", AS_OF, W)).toBe(0.5);
    expect(recencyWeight("2026-08-03", AS_OF, W)).toBe(0.25);
    const old: PoolPlay = { id: "old", title: "Old", reachCount: 0, evidence: [ev({ weekOf: "2026-05-25" })] }; // week 27
    const r = scorePool([old, handPool[0]], { asOf: AS_OF, weights: W, activeUsers: 1 });
    expect(r.retired).toEqual(["old"]);
    expect(r.scored.map((s) => s.id)).toEqual(["p0"]);
  });

  it("counts one person's three seed runs from three agents as one user in Proof, Surprise and contributors", () => {
    const one: PoolPlay = {
      id: "p",
      title: "t",
      reachCount: 0,
      evidence: [ev({ contributor: "seed:rob" }), ev({ contributor: "seed:rob" }), ev({ contributor: "seed:rob" })],
    };
    const f = mergedFigures(one, AS_OF, W);
    expect(f.contributors).toBe(1);
    expect(f.proof).toBe(1);
    expect(f.surprise).toBe(2);
  });

  it("raises confidence one level after four weeks running, to High at most, and doubles an Actual basis", () => {
    const p = (o: Partial<Evidence>): PoolPlay => ({ id: "p", title: "t", reachCount: 0, evidence: [ev(o)] });
    expect(mergedFigures(p({ confidence: "Medium", weeksRunning: 4 }), AS_OF, W).proof).toBe(3);
    expect(mergedFigures(p({ confidence: "High", weeksRunning: 10 }), AS_OF, W).proof).toBe(3);
    expect(mergedFigures(p({ confidence: "Low", basis: "Actual" }), AS_OF, W).proof).toBe(2);
  });

  it("leaves users who run it because Roger sent it out of Surprise", () => {
    const p: PoolPlay = { id: "p", title: "t", reachCount: 0, evidence: [ev({ contributor: "a" }), ev({ contributor: "b", origin: "roger_idea" })] };
    expect(mergedFigures(p, AS_OF, W).surprise).toBe(2);
  });

  it("uses size as steps + connections × 5 + setup questions (Cora 2.0 change 5)", () => {
    const p: PoolPlay = { id: "p", title: "t", reachCount: 0, evidence: [ev({ steps: 6, connections: 2, setupQuestions: 3 })] };
    expect(mergedFigures(p, AS_OF, W).complexity).toBe(19);
  });

  it("never invents a figure: nothing stated stays missing", () => {
    const p: PoolPlay = { id: "p", title: "t", reachCount: 0, evidence: [ev({ currentHours: null, minutes: null, steps: null, connections: null })] };
    const f = mergedFigures(p, AS_OF, W);
    expect([f.currentHours, f.minutes, f.hoursFigure, f.complexity]).toEqual([null, null, null, null]);
  });
});

describe("tie-breaks", () => {
  it("breaks equal scores by Surprise, Reach, Actual contributors, hours, then title, the same way every run", () => {
    const twin = (id: string, title: string, o: Partial<Evidence> = {}): PoolPlay => ({ id, title, reachCount: 1, evidence: [ev({ contributor: id, ...o })] });
    const plays = [twin("b", "Beta"), twin("a", "Alpha"), twin("c", "Gamma")];
    const first = scorePool(plays, { asOf: AS_OF, weights: W, activeUsers: 2 }).scored.map((s) => s.id);
    const again = scorePool([...plays].reverse(), { asOf: AS_OF, weights: W, activeUsers: 2 }).scored.map((s) => s.id);
    expect(first).toEqual(["a", "b", "c"]);
    expect(again).toEqual(first);
  });
});

describe("review follow-ups", () => {
  it("puts the recency boundaries where the settings say: 4 weeks full, to 12 half, older a quarter, retired from 26", () => {
    expect(recencyWeight("2026-11-02", AS_OF, W)).toBe(0.5); // week 4: the fifth week
    expect(recencyWeight("2026-11-09", AS_OF, W)).toBe(1); // week 3
    expect(recencyWeight("2026-09-07", AS_OF, W)).toBe(0.25); // week 12
    expect(recencyWeight("2026-09-14", AS_OF, W)).toBe(0.5); // week 11
    expect(recencyWeight("2026-12-07", AS_OF, W)).toBe(0); // a future week
  });

  it("keeps a person's old evidence at the low weight while the play is active", () => {
    const p: PoolPlay = {
      id: "p",
      title: "t",
      reachCount: 0,
      evidence: [ev({ contributor: "alice", weekOf: "2026-04-27", confidence: "High", basis: "Actual" }), ev({ contributor: "bob" })],
    };
    const f = mergedFigures(p, AS_OF, W);
    expect(f.retired).toBe(false);
    expect(f.contributors).toBe(2);
    expect(f.proof).toBe(1 + 6 * 0.25);
  });

  it("counts each person once in the medians too, across weeks and agents", () => {
    const p: PoolPlay = {
      id: "p",
      title: "t",
      reachCount: 0,
      evidence: [
        ev({ contributor: "seed:rob", currentHours: 10 }),
        ev({ contributor: "seed:rob", currentHours: 10 }),
        ev({ contributor: "seed:rob", currentHours: 10 }),
        ev({ contributor: "alice", currentHours: 1 }),
        ev({ contributor: "bob", currentHours: 1 }),
      ],
    };
    expect(mergedFigures(p, AS_OF, W).currentHours).toBe(1);
  });

  it("leaves size missing when steps or connections were not stated, and keeps runners-up out of minutes", () => {
    const p = (o: Partial<Evidence>[]): PoolPlay => ({ id: "p", title: "t", reachCount: 0, evidence: o.map((x, i) => ev({ contributor: `u${i}`, ...x })) });
    expect(mergedFigures(p([{ steps: null, connections: 1 }]), AS_OF, W).complexity).toBeNull();
    expect(mergedFigures(p([{ minutes: 10 }, { minutes: 120, set: "runner_up" }]), AS_OF, W).minutes).toBe(10);
  });


});
