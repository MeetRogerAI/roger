import { describe, expect, it } from "vitest";
import { whoGetsAList, type ListFacts } from "./who-gets-a-list";

const f = (o: Partial<ListFacts>): ListFacts => ({
  status: "active",
  plan: "monthly",
  sponsored: false,
  sharing: "share",
  runArrived: true,
  ordered: false,
  charged: false,
  accessEnded: false,
  ...o,
});

describe("whoGetsAList (spec B.7 table), at send time", () => {
  it.each<[string, Partial<ListFacts>, boolean]>([
    ["trial, Zack on, no run", { status: "trial", runArrived: false }, false],
    ["trial, Zack on, run arrived", { status: "trial" }, true],
    ["trial, matching only, no run", { status: "trial", sharing: "match_only", runArrived: false }, false],
    ["trial, Zack off", { status: "trial", sharing: "off", runArrived: false }, true],
    ["monthly without a run", { runArrived: false }, true],
    ["sponsored one-at-a-time without an order", { plan: "per_run", sponsored: true, runArrived: false }, true],
    ["sponsored, in trial, no run", { status: "trial", sponsored: true, runArrived: false }, true],
    ["one at a time, no order", { plan: "per_run" }, false],
    ["one at a time, ordered, no run", { plan: "per_run", ordered: true, runArrived: false, charged: true }, false],
    ["one at a time, ordered, run, charge failed", { plan: "per_run", ordered: true }, false],
    ["one at a time, ordered, run, charged", { plan: "per_run", ordered: true, charged: true }, true],
    ["one at a time, cancelled within the paid month, ordered and charged", { status: "cancelled", plan: "per_run", ordered: true, charged: true }, true],
    ["held", { status: "held" }, false],
    ["held in trial", { status: "held", sharing: "off" }, false],
    ["cancelled, within the paid month", { status: "cancelled" }, true],
    ["cancelled and expired", { status: "cancelled", accessEnded: true }, false],
    ["closed", { status: "closed" }, false],
  ])("%s", (_, facts, gets) => {
    expect(whoGetsAList(f(facts), "send").gets).toBe(gets);
  });
});

describe("whoGetsAList at the 1:00 AM cutoff", () => {
  it("picks for a one-at-a-time order with a run before its 6:00 AM charge, so there is a list to charge for", () => {
    expect(whoGetsAList(f({ plan: "per_run", ordered: true, charged: false }), "pick").gets).toBe(true);
    expect(whoGetsAList(f({ plan: "per_run", ordered: true, charged: false }), "send").gets).toBe(false);
    expect(whoGetsAList(f({ plan: "per_run", ordered: true, runArrived: false }), "pick").gets).toBe(false);
  });
});
