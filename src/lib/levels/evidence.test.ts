import { describe, expect, it } from "vitest";
import { validateLevelBlock } from "@/lib/levels/contract";
import { minimise, normaliseLabel } from "@/lib/levels/evidence";
import { defaultAgent, defaultDomain, defaultRoutine, defaultSkill, FIXTURE_RECEIVED_ON, levelBlock, maximalBlock } from "@/test-helpers/level-fixtures";

/** Every string in a value, at any depth. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

describe("minimise: the evidence a valid block becomes", () => {
  it("keeps no free text: no name, job sentence, connection label or model name", () => {
    const block = maximalBlock();
    expect(validateLevelBlock(JSON.stringify(block), FIXTURE_RECEIVED_ON).ok).toBe(true);
    const kept = new Set(strings(minimise(block)));
    const free = [
      ...block.inventory.agents.flatMap((a) => [a.name, a.job_sentence, ...a.connections]),
      ...block.inventory.routines.map((r) => r.name),
      ...block.inventory.skills.map((s) => s.name),
      ...block.inventory.models_used,
      ...block.domains.map((d) => d.name),
    ];
    for (const s of free) expect(kept.has(s), s).toBe(false);
    expect(JSON.stringify(minimise(block))).not.toMatch(/Gmail|Chief of staff|Listings marketing|Model A/);
  });

  it("turns links into positions and labels into distinct counts", () => {
    const b = levelBlock({
      inventory: {
        agents: [defaultAgent("Inbox", { connections: ["Gmail", "gmail ", "Smith Realty CRM"], job_sentence: "Sorts the inbox." }), defaultAgent("Host", { connections: ["GMAIL"] })],
        routines: [defaultRoutine("Digest", { owner_agent: "Host" }), defaultRoutine("Loose")],
        skills: [defaultSkill("Triage", { used_by: ["Inbox", "Digest", "Inbox"] })],
        models_used: ["Model A", "model  a", "Model B"],
        memory_last_cleanup: "none",
      },
    });
    const e = minimise(b);
    expect(e.inventory.distinct_services).toBe(2);
    expect(e.inventory.agents.map((a) => [a.distinct_connections, a.has_job_sentence])).toEqual([
      [2, true],
      [1, false],
    ]);
    expect(e.inventory.routines.map((r) => r.owner)).toEqual([1, null]);
    expect(e.inventory.skills[0]).toEqual({ origin: "me", used_by_agents: [0], used_by_routines: [0] });
    expect(e.inventory.distinct_models).toBe(2);
    expect(e.inventory.memory_last_cleanup).toBeNull();
  });

  it("doesn't count connection or model labels that normalise to nothing", () => {
    const e = minimise(
      levelBlock({
        inventory: {
          agents: [defaultAgent("A", { connections: [" ", "Gmail", "\u3000"] }), defaultAgent("B", { connections: ["  "] })],
          models_used: [" ", "Model A", "\t"],
        },
      }),
    );
    expect(e.inventory.agents.map((a) => a.distinct_connections)).toEqual([1, 0]);
    expect(e.inventory.distinct_services).toBe(1);
    expect(e.inventory.distinct_models).toBe(1);
  });

  it("keeps one self-report per item, the latest by date", () => {
    const e = minimise(
      levelBlock({
        self_report: [
          { item: "6.07", answer: 1, date: "2026-11-01" },
          { item: "1.04", answer: 1, date: "2026-11-10" },
          { item: "6.07", answer: 0, date: "2026-11-20" },
          { item: "6.07", answer: 1, date: "2026-11-15" },
        ],
      }),
    );
    expect(e.self_report).toEqual([
      { item: "1.04", answer: 1, date: "2026-11-10" },
      { item: "6.07", answer: 0, date: "2026-11-20" },
    ]);
  });

  it("keeps domains as kind and stages only, without repeats", () => {
    const e = minimise(levelBlock({ domains: [defaultDomain("Meals", { kind: "home", stages_covered: ["intake", "intake", "work"] })] }));
    expect(e.domains).toEqual([{ kind: "home", stages_covered: ["intake", "work"] }]);
  });

  it("normalises labels by case, spacing and Unicode form", () => {
    expect(normaliseLabel("  Google   Calendar ")).toBe("google calendar");
    expect(normaliseLabel("ＧＭＡＩＬ")).toBe("gmail");
  });
});
