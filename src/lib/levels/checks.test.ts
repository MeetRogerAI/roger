import { describe, expect, it } from "vitest";
import { LEVEL_RULES, levelItems, type LevelItem } from "@/data/roger-levels";
import { evaluateCheck, evaluateItem, NO_ROGER_FACTS, type CheckContext, type RogerFacts, type SelfAnswer } from "@/lib/levels/checks";
import type { LevelBlockV1 } from "@/lib/levels/contract";
import { minimise, type LevelEvidence } from "@/lib/levels/evidence";
import type { LevelCheck } from "@/lib/levels/vocabulary";
import { addDays, blockForChecks, blockForItems, defaultAgent, defaultDomain, defaultRoutine, defaultSkill, FIXTURE_RECEIVED_ON, levelBlock, scoreBuilt } from "@/test-helpers/level-fixtures";

const ON = FIXTURE_RECEIVED_ON;
const item = (id: string): LevelItem => {
  const i = levelItems.find((x) => x.id === id);
  if (!i) throw new Error(id);
  return i;
};

function ctx(
  block: LevelBlockV1,
  o: { on?: string; previous?: LevelBlockV1; roger?: Partial<RogerFacts>; answers?: Record<string, 0 | 1>; rules?: CheckContext["rules"] } = {},
): CheckContext {
  const evidence = minimise(block);
  return {
    evidence,
    on: o.on ?? ON,
    previous: o.previous ? minimise(o.previous) : null,
    roger: { ...NO_ROGER_FACTS, ...o.roger },
    selfReport: (id) => (o.answers && id in o.answers ? { answer: o.answers[id], date: ON } : null),
    ...(o.rules ? { rules: o.rules } : {}),
  };
}
const answer = (c: CheckContext, id: string): SelfAnswer => c.selfReport(id);
/** An item over one submission. */
function live(id: string, block: LevelBlockV1, o: Parameters<typeof ctx>[1] = {}): boolean {
  const c = ctx(block, o);
  return evaluateItem(item(id), [c], answer(c, id)).live;
}

/**
 * Items that the least evidence for an item also turns on, beyond the two any
 * valid block turns on (1.01, 3.01). Reviewed: each is a real implication of
 * the mapping (for example 3.12's voice and multi-step completion are also
 * 1.07, 2.09 and 3.04; any agent at all satisfies 6.01, as the plan notes).
 */
const IMPLIED: Record<string, string[]> = {
  "1.03": ["1.02", "3.04"],
  "1.07": ["2.09"],
  "2.01": ["1.02"],
  "2.07": ["2.02", "2.03"],
  "2.09": ["1.07"],
  "2.10": ["6.04"],
  "2.D1": ["1.D1"],
  "3.02": ["3.09", "3.16", "6.01"],
  "3.03": ["6.01"],
  "3.05": ["6.01"],
  "3.07": ["6.01"],
  "3.09": ["6.01"],
  "3.11": ["3.03", "6.01"],
  "3.12": ["1.07", "2.09", "3.04"],
  "3.14": ["6.05"],
  "3.16": ["6.01"],
  "3.D1": ["1.D1"],
  "4.02": ["2.03", "6.01"],
  "4.01": ["7.03"],
  "4.11": ["5.12"],
  "4.12": ["6.01"],
  "4.14": ["6.12"],
  "4.20": ["2.10", "6.01", "6.04"],
  "4.D1": ["1.D1"],
  "5.01": ["6.01"],
  "5.02": ["6.01"],
  "5.04": ["2.02", "2.03", "2.07", "6.01"],
  "5.05": ["3.03", "3.11", "6.01"],
  "5.07": ["6.01"],
  "5.09": ["6.01"],
  "5.12": ["4.11"],
  "5.15": ["6.01"],
  "5.16": ["8.14"],
  "5.17": ["6.01"],
  "5.18": ["6.01"],
  "5.D1": ["1.D1"],
  "6.04": ["2.10"],
  "6.05": ["3.14"],
  "6.06": ["3.03", "6.01"],
  "6.12": ["4.14"],
  "6.15": ["8.04"],
  "6.16": ["6.01"],
  "6.18": ["6.01"],
  "6.21": ["6.01"],
  "6.D1": ["1.D1"],
  "7.02": ["7.03"],
  "7.07": ["3.05", "6.01", "7.12"],
  "7.16": ["4.10", "7.05"],
  "8.01": ["2.10", "6.04"],
  "8.03": ["6.01"],
  "8.04": ["6.15"],
  "8.08": ["2.07"],
  "8.14": ["5.16"],
  "9.01": ["7.05"],
};

describe("each checked item from its own least evidence", () => {
  const checked = levelItems.filter((i) => i.status === "full" || i.status === "proxy");
  const baseline = scoreBuilt(blockForItems([])).live;

  it("a minimal valid block turns on only 1.01 and 3.01", () => {
    expect(baseline).toEqual(["1.01", "3.01"]);
  });

  it.each(checked.map((i) => [i.id] as const))("%s is 1 from blockForItems, and turns on only what it implies", (id) => {
    const s = scoreBuilt(blockForItems([id]));
    expect(s.live).toContain(id);
    const extra = s.live.filter((x) => x !== id && !baseline.includes(x));
    expect(extra).toEqual(IMPLIED[id] ?? []);
  });

  it.each(checked.filter((i) => i.check.kind === "all_of").map((i) => [i.id] as const))("%s needs every part: with one part's evidence missing it is 0", (id) => {
    const i = item(id);
    const parts = (i.check as Extract<LevelCheck, { kind: "all_of" }>).checks;
    parts.forEach((_, drop) => {
      // Evidence for every other part only, then the real item.
      const b = blockForChecks(parts.filter((__, k) => k !== drop).map((check) => ({ id, check })));
      const c = ctx(b.block, { roger: b.roger, answers: Object.fromEntries(b.block.self_report.map((r) => [r.item, r.answer])) });
      expect(evaluateCheck(parts[drop], c, id), `${id}: part ${drop} is implied by the others`).toBe(false);
      expect(evaluateItem(i, [c], answer(c, id)).live, `${id} without part ${drop}`).toBe(false);
    });
  });
});

describe("nonEmpty: an empty collection is 0, never a vacuous 1", () => {
  it.each(["4.04", "4.05", "4.06", "4.18", "4.19", "6.01", "6.06", "6.16", "6.21", "7.07"].map((id) => [id] as const))("%s is 0 with no routines and no agents", (id) => {
    expect(live(id, levelBlock({ activity_7d: { verify_reports: { pass: 3, fail: 0 }, approvals: { batched: 2 } } }))).toBe(false);
  });

  it("6.06 is 0 when agents exist but none has a connection, and 1 once a connected agent has the rule", () => {
    expect(live("6.06", levelBlock({ inventory: { agents: [defaultAgent("A", { rules: ["untrusted_content"] })] } }))).toBe(false);
    expect(live("6.06", levelBlock({ inventory: { agents: [defaultAgent("A", { rules: ["untrusted_content"], connections: ["Gmail"] }), defaultAgent("B")] } }))).toBe(true);
    expect(live("6.06", levelBlock({ inventory: { agents: [defaultAgent("A", { rules: ["untrusted_content"], connections: ["Gmail"] }), defaultAgent("B", { connections: ["Web"] })] } }))).toBe(false);
  });

  it("4.05 is 0 as soon as one routine lacks the source check", () => {
    const r = (has: LevelBlockV1["inventory"]["routines"][number]["has"], name: string) => defaultRoutine(name, { has });
    expect(live("4.05", levelBlock({ inventory: { routines: [r(["source_check"], "a"), r(["source_check"], "b")] } }))).toBe(true);
    expect(live("4.05", levelBlock({ inventory: { routines: [r(["source_check"], "a"), r([], "b")] } }))).toBe(false);
  });
});

describe("the cadence rule (rule 2.2)", () => {
  // 4.01 also needs a proactive start (Z3); these cases vary only the routine.
  const routine = (cadence: LevelBlockV1["inventory"]["routines"][number]["cadence"], daysAgo: number) =>
    levelBlock({ inventory: { routines: [defaultRoutine("r", { cadence, last_run: addDays(ON, -daysAgo) })] }, activity_7d: { proactive_starts: 1 } });

  it("a monthly routine 34 days old counts, 36 days old doesn't (5 weeks)", () => {
    expect(live("4.01", routine("monthly", 34))).toBe(true);
    expect(live("4.01", routine("monthly", 35))).toBe(true);
    expect(live("4.01", routine("monthly", 36))).toBe(false);
  });

  it("daily counts within 2 days, weekly within 9, weekdays within 4 (a weekend)", () => {
    expect([live("4.01", routine("daily", 2)), live("4.01", routine("daily", 3))]).toEqual([true, false]);
    expect([live("4.01", routine("weekly", 9)), live("4.01", routine("weekly", 10))]).toEqual([true, false]);
    expect([live("4.01", routine("weekdays", 4)), live("4.01", routine("weekdays", 5))]).toEqual([true, false]);
  });

  it("a routine that never ran, or ran after the submission date, doesn't count", () => {
    expect(live("4.01", levelBlock({ inventory: { routines: [defaultRoutine("r", { cadence: "daily", last_run: null })] }, activity_7d: { proactive_starts: 1 } }))).toBe(false);
    expect(live("4.01", routine("daily", -2))).toBe(false);
  });

  it("4.01 needs a proactive start too (Z3): an in-cadence routine with proactive_starts 0 is 0", () => {
    const inCadence = (proactive: number) => levelBlock({ inventory: { routines: [defaultRoutine("r", { cadence: "daily", last_run: ON })] }, activity_7d: { proactive_starts: proactive } });
    expect(live("4.01", inCadence(0))).toBe(false);
    expect(live("4.01", inCadence(1))).toBe(true);
    expect(live("4.01", levelBlock({ activity_7d: { proactive_starts: 1 } }))).toBe(false);
    expect(item("4.01").partsAcrossWindow).toBe(true);
    // Each part may come from a different run in the window.
    expect(evaluateItem(item("4.01"), [ctx(inCadence(0)), ctx(levelBlock({ activity_7d: { proactive_starts: 1 } }))], null).live).toBe(true);
  });

  it("7.03 is settled by proactive_starts (Z3)", () => {
    expect(item("7.03").check).toEqual({ kind: "count_at_least", path: "activity_7d.proactive_starts", min: 1 });
    expect([live("7.03", levelBlock({ activity_7d: { proactive_starts: 0 } })), live("7.03", levelBlock({ activity_7d: { proactive_starts: 1 } }))]).toEqual([false, true]);
  });

  it("4.07 needs three routines inside their cadence", () => {
    const rs = (n: number) => levelBlock({ inventory: { routines: Array.from({ length: 3 }, (_, i) => defaultRoutine(`r${i}`, { cadence: "daily", last_run: i < n ? ON : addDays(ON, -20) })) } });
    expect([live("4.07", rs(3)), live("4.07", rs(2))]).toEqual([true, false]);
  });

  it("4.09 needs both a fast lane and a slow lane", () => {
    const rs = (...cs: LevelBlockV1["inventory"]["routines"][number]["cadence"][]) => levelBlock({ inventory: { routines: cs.map((cadence, i) => defaultRoutine(`r${i}`, { cadence })) } });
    expect(live("4.09", rs("daily", "weekly"))).toBe(true);
    expect(live("4.09", rs("hourly", "monthly"))).toBe(true);
    expect(live("4.09", rs("daily", "hourly"))).toBe(false);
    expect(live("4.09", rs("weekly", "monthly"))).toBe(false);
    expect(live("4.09", rs("other", "weekly"))).toBe(false);
  });
});

describe("mixed codes: both parts, and the source for rule 2.1", () => {
  const served = (n: number) => levelBlock({ activity_7d: { others_served_directly: n } });

  it("9.01 (S + ZA): a self-report of 1 alone is 0; with others served directly it is 1, verified by Zack", () => {
    const c0 = ctx(served(0), { answers: { "9.01": 1 } });
    expect(evaluateItem(item("9.01"), [c0], answer(c0, "9.01")).live).toBe(false);
    const c1 = ctx(served(1), { answers: { "9.01": 1 } });
    expect(evaluateItem(item("9.01"), [c1], answer(c1, "9.01"))).toEqual({ live: true, source: "zack", lastEvidenceOn: ON });
    const c2 = ctx(served(1), { answers: { "9.01": 0 } });
    expect(evaluateItem(item("9.01"), [c2], answer(c2, "9.01")).live).toBe(false);
  });

  it("7.01 and 7.08 (ZI + S): the domains and the self-report are both needed", () => {
    const full = (n: number) => levelBlock({ domains: Array.from({ length: n }, (_, i) => defaultDomain(`d${i}`, { stages_covered: ["intake", "work", "delivery", "follow_up"] })) });
    expect(live("7.01", full(1), { answers: { "7.01": 1 } })).toBe(true);
    expect(live("7.01", full(1))).toBe(false);
    expect(live("7.01", full(0), { answers: { "7.01": 1 } })).toBe(false);
    expect(live("7.01", levelBlock({ domains: [defaultDomain("d", { stages_covered: ["intake", "work", "delivery"] })] }), { answers: { "7.01": 1 } })).toBe(false);
    expect(live("7.08", full(2), { answers: { "7.08": 1 } })).toBe(true);
    expect(live("7.08", full(1), { answers: { "7.08": 1 } })).toBe(false);
    expect(item("7.01").source).toBe("zack");
  });

  it("9.07 (S + R, the R part out of scope) is settled by the self-report alone", () => {
    const c = ctx(levelBlock(), { answers: { "9.07": 1 } });
    expect(evaluateItem(item("9.07"), [c], answer(c, "9.07"))).toEqual({ live: true, source: "self", lastEvidenceOn: ON });
  });

  it("a fallback item is its self-report answer, counted as self-reported", () => {
    const c = ctx(levelBlock(), { answers: { "6.03": 1 } });
    expect(evaluateItem(item("6.03"), [c], answer(c, "6.03"))).toEqual({ live: true, source: "self", lastEvidenceOn: ON });
    expect(evaluateItem(item("6.03"), [c], null).live).toBe(false);
  });

  it("a self-report never settles a Zack-settled item", () => {
    expect(live("3.04", levelBlock(), { answers: { "3.04": 1 } })).toBe(false);
  });
});

describe("the window: OR over submissions, and mixed parts across it", () => {
  it("an item is 1 when any submission in the window shows it", () => {
    const window = [ctx(levelBlock(), { on: addDays(ON, -14) }), ctx(levelBlock({ activity_7d: { proactive_starts: 2 } }), { on: addDays(ON, -7) }), ctx(levelBlock(), { on: ON })];
    expect(evaluateItem(item("7.03"), window, null)).toEqual({ live: true, source: "zack", lastEvidenceOn: addDays(ON, -7) });
  });

  it("8.02 (ZA + ZH): proposed in one run and adopted in another counts; 3.12's two parts must be in one run", () => {
    const a = ctx(levelBlock({ activity_7d: { self_change_proposals: { proposed: 1, adopted: 0 }, voice_inputs: 1 } }), { on: addDays(ON, -7) });
    const b = ctx(levelBlock({ activity_7d: { self_change_proposals: { proposed: 0, adopted: 1 }, multi_step_completions: 1 } }), { on: ON });
    expect(evaluateItem(item("8.02"), [a, b], null)).toEqual({ live: true, source: "zack", lastEvidenceOn: addDays(ON, -7) });
    expect(evaluateItem(item("8.02"), [a], null).live).toBe(false);
    expect(evaluateItem(item("3.12"), [a, b], null).live).toBe(false);
  });

  it("an empty window is 0", () => {
    expect(evaluateItem(item("1.02"), [], null)).toEqual({ live: false, source: "zack", lastEvidenceOn: null });
  });
});

describe("history between runs (no names are kept, so counts are compared)", () => {
  const routines = (n: number, cadence: LevelBlockV1["inventory"]["routines"][number]["cadence"] = "daily") => Array.from({ length: n }, (_, i) => defaultRoutine(`r${i}`, { cadence }));
  const agents = (...autonomy: LevelBlockV1["inventory"]["agents"][number]["autonomy"][]) => autonomy.map((a, i) => defaultAgent(`a${i}`, { autonomy: a }));

  it("4.14: a routine gone, or slowed from daily to weekly, or a usage cut", () => {
    const before = levelBlock({ inventory: { routines: routines(2) } });
    expect(live("4.14", levelBlock({ inventory: { routines: routines(1) } }), { previous: before })).toBe(true);
    expect(live("4.14", levelBlock({ inventory: { routines: [defaultRoutine("r0", { cadence: "daily" }), defaultRoutine("r1", { cadence: "weekly" })] } }), { previous: before })).toBe(true);
    expect(live("4.14", before, { previous: before })).toBe(false);
    expect(live("4.14", before)).toBe(false);
    expect(live("4.14", levelBlock({ history_flags: { usage_cuts: 1 } }))).toBe(true);
  });

  it("6.02 and 6.08: autonomy moving up or down between runs", () => {
    const before = levelBlock({ inventory: { agents: agents("approve", "schedule") } });
    const up = levelBlock({ inventory: { agents: agents("own", "schedule") } });
    const down = levelBlock({ inventory: { agents: agents("approve", "prepare") } });
    expect([live("6.02", up, { previous: before }), live("6.08", up, { previous: before })]).toEqual([true, false]);
    expect([live("6.02", down, { previous: before }), live("6.08", down, { previous: before })]).toEqual([false, true]);
    expect(live("6.02", levelBlock({ history_flags: { promotions: 1 } }))).toBe(true);
  });

  it("6.02's autonomy_up counts only when the number of agents is unchanged (a count-based proxy)", () => {
    // A new agent added at own or schedule, nothing else changed: not a promotion.
    expect(live("6.02", levelBlock({ inventory: { agents: agents("approve", "own") } }), { previous: levelBlock({ inventory: { agents: agents("approve") } }) })).toBe(false);
    expect(live("6.02", levelBlock({ inventory: { agents: agents("approve", "schedule") } }), { previous: levelBlock({ inventory: { agents: agents("approve") } }) })).toBe(false);
    // One promoted (approve -> own) while another (approve) is retired in the same run: the agent count changed,
    // so counts can't tell a promotion from an addition and 6.02 stays 0 unless Zack reports the promotion.
    const before = levelBlock({ inventory: { agents: agents("approve", "approve", "schedule") } });
    const after = levelBlock({ inventory: { agents: agents("own", "schedule") } });
    expect(live("6.02", after, { previous: before })).toBe(false);
    expect(live("6.02", levelBlock({ inventory: { agents: agents("own", "schedule") }, history_flags: { promotions: 1 } }), { previous: before })).toBe(true);
    expect(item("6.02").settledBy).toMatch(/count-based proxy/);
  });

  it("4.14 reads the fast cadences from the injected rules, not LEVEL_RULES", () => {
    const rs = (...cs: LevelBlockV1["inventory"]["routines"][number]["cadence"][]) => levelBlock({ inventory: { routines: cs.map((cadence, i) => defaultRoutine(`r${i}`, { cadence })) } });
    const before = rs("weekly", "weekly");
    const after = rs("weekly", "monthly");
    expect(live("4.14", after, { previous: before })).toBe(false);
    expect(live("4.14", after, { previous: before, rules: { ...LEVEL_RULES, fastCadences: ["daily", "weekly"] } })).toBe(true);
  });

  it("6.15: a routine gone between runs, or a retirement flag", () => {
    expect(live("6.15", levelBlock({ inventory: { routines: routines(1) } }), { previous: levelBlock({ inventory: { routines: routines(2) } }) })).toBe(true);
    expect(live("6.15", levelBlock({ history_flags: { retirements: 1 } }))).toBe(true);
    expect(live("6.15", levelBlock())).toBe(false);
  });

  it("8.03: a system-built agent within 8 weeks, or a new system skill since the last run", () => {
    const sys = (weeks: number) => levelBlock({ inventory: { agents: [defaultAgent("a", { created_by: "system", created: addDays(ON, -7 * weeks) })] } });
    expect([live("8.03", sys(7)), live("8.03", sys(8)), live("8.03", sys(9))]).toEqual([true, true, false]);
    // The contract accepts dates up to the receipt date + 1 day, so a date one day after the submission counts.
    const sysOn = (created: string) => levelBlock({ inventory: { agents: [defaultAgent("a", { created_by: "system", created })] } });
    expect([live("8.03", sysOn(addDays(ON, 1))), live("8.03", sysOn(addDays(ON, 2)))]).toEqual([true, false]);
    expect(live("8.03", levelBlock({ inventory: { agents: [defaultAgent("a", { created_by: "me", created: ON })] } }))).toBe(false);
    const skills = (n: number) => levelBlock({ inventory: { skills: Array.from({ length: n }, (_, i) => defaultSkill(`s${i}`, { origin: "system" })) } });
    expect(live("8.03", skills(2), { previous: skills(1) })).toBe(true);
    expect(live("8.03", skills(1), { previous: skills(1) })).toBe(false);
  });
});

describe("other checks", () => {
  it("6.09: memory cleaned within 5 weeks; 'none' is 0", () => {
    expect([35, 36].map((d) => live("6.09", levelBlock({ inventory: { memory_last_cleanup: addDays(ON, -d) } })))).toEqual([true, false]);
    expect(live("6.09", levelBlock())).toBe(false);
  });

  it("5.05: with two agents and three services, no agent may hold every service", () => {
    const b = (a: string[], c: string[]) => levelBlock({ inventory: { agents: [defaultAgent("A", { connections: a }), defaultAgent("B", { connections: c })] } });
    expect(live("5.05", b(["Gmail", "Calendar"], ["CRM"]))).toBe(true);
    expect(live("5.05", b(["Gmail", "Calendar", "CRM"], ["CRM"]))).toBe(false);
    expect(live("5.05", b(["Gmail", "gmail "], ["CRM"]))).toBe(false);
    expect(live("5.05", levelBlock({ inventory: { agents: [defaultAgent("A", { connections: ["Gmail", "Calendar", "CRM"] })] } }))).toBe(false);
  });

  it("5.07: agents created at least 2 weeks apart", () => {
    const b = (days: number) => levelBlock({ inventory: { agents: [defaultAgent("A", { created: addDays(ON, -days) }), defaultAgent("B", { created: ON }), defaultAgent("C")] } });
    expect([live("5.07", b(14)), live("5.07", b(13))]).toEqual([true, false]);
  });

  it("5.17: a routine hosted by a routines-only agent", () => {
    const b = (role: LevelBlockV1["inventory"]["agents"][number]["role"]) =>
      levelBlock({ inventory: { agents: [defaultAgent("Host", { role })], routines: [defaultRoutine("r", { owner_agent: "Host" })] } });
    expect([live("5.17", b("routines_only")), live("5.17", b("chat"))]).toEqual([true, false]);
  });

  it("4.02: a skill used by an agent or a routine", () => {
    expect(live("4.02", levelBlock({ inventory: { routines: [defaultRoutine("r")], skills: [defaultSkill("s", { used_by: ["r"] })] } }))).toBe(true);
    expect(live("4.02", levelBlock({ inventory: { skills: [defaultSkill("s")] } }))).toBe(false);
  });

  it("3.11: distinct services across agents, labels compared without case or spacing", () => {
    const b = (a: string[], c: string[]) => levelBlock({ inventory: { agents: [defaultAgent("A", { connections: a }), defaultAgent("B", { connections: c })] } });
    expect(live("3.11", b(["Gmail", "Calendar"], ["CRM"]))).toBe(true);
    expect(live("3.11", b(["Gmail", "Calendar"], ["gmail", " Calendar "]))).toBe(false);
  });

  it("9.03 and 9.06 read Roger's adoption facts", () => {
    expect([live("9.03", levelBlock(), { roger: { adopters_any_play: 2, adopters_one_play: 2 } }), live("9.06", levelBlock(), { roger: { adopters_any_play: 2, adopters_one_play: 2 } })]).toEqual([true, false]);
    expect(live("9.06", levelBlock(), { roger: { adopters_any_play: 3, adopters_one_play: 3 } })).toBe(true);
    expect(item("9.06").source).toBe("roger");
  });

  it("1.03: a day of use and either a multi-step completion or a play in the week's run", () => {
    expect(live("1.03", levelBlock({ activity_7d: { active_days: 1 } }))).toBe(false);
    expect(live("1.03", levelBlock({ activity_7d: { active_days: 1 } }), { roger: { week_run_has_play: 1 } })).toBe(true);
    expect(live("1.03", levelBlock({ activity_7d: { active_days: 1, multi_step_completions: 1 } }))).toBe(true);
  });

  it("is pure: evaluating doesn't change the evidence", () => {
    const c = ctx(blockForItems(levelItems.filter((i) => i.level <= 5).map((i) => i.id)).block);
    const before: LevelEvidence = JSON.parse(JSON.stringify(c.evidence));
    for (const i of levelItems) evaluateItem(i, [c], answer(c, i.id));
    expect(c.evidence).toEqual(before);
  });
});
