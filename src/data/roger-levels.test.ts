import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  codeParts,
  electivesNeeded,
  FALLBACK_ITEM_IDS,
  fallbackElectivesAllowed,
  LEVEL_ITEM_IDS,
  LEVEL_QUIZ_VERSION,
  LEVEL_RULES,
  levelItems,
  LEVELS_AT_VERIFIED_CORE_MINIMUM,
  LEVELS_RULES_VERSION,
  levelsRulesVersion,
  rogerLevels,
  SELF_REPORT_ITEM_IDS,
  VERIFICATION_CODES,
  type LevelItem,
} from "@/data/roger-levels";
import { LEVEL_QUIZ_VERSION as QUIZ_VERSION, rogerLevels as quizLevels } from "@/data/roger-levels-quiz";
import { AUTONOMY_LEVELS, CADENCES, DELIVERS_TO, DOMAIN_STAGES, ITEM_ID_PATTERN, levelBlockV1 } from "@/lib/levels/contract";
import { DERIVED_EVIDENCE_FIELDS } from "@/lib/levels/evidence";
import { checkNodes, type LevelCheck, type LevelPred } from "@/lib/levels/vocabulary";

const LEVELS_FILE = join(__dirname, "..", "..", "artifacts", "Roger AI Agent Levels and Check Charts v1.1.md");

/** The check-chart rows of the levels file: `| ID | Statement | Type | Verified |`. */
function chartRows(): { id: string; statement: string; type: string; code: string }[] {
  const md = readFileSync(LEVELS_FILE, "utf8").replace(/\r\n/g, "\n");
  const rows: { id: string; statement: string; type: string; code: string }[] = [];
  for (const line of md.split("\n")) {
    const m = /^\| (\d\.(?:\d{2}|D\d)) \| (.*) \| ([CED]) \| ([^|]+) \|$/.exec(line);
    if (m) rows.push({ id: m[1], statement: m[2].replaceAll("**", ""), type: m[3], code: m[4].trim() });
  }
  return rows;
}

const byLevel = (k: number) => levelItems.filter((i) => i.level === k);
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ids = (xs: readonly LevelItem[]) => xs.map((i) => i.id);
const status = (s: LevelItem["status"]) => ids(levelItems.filter((i) => i.status === s));

// The B4 plan's verification-code mapping (docs/plans/2026-11-28-001-feat-roger-v3-b4-levels-plan.md), as planned.
const PLAN_FALLBACK = "1.06 1.08 1.09 1.11 2.04 2.06 2.08 2.11 2.D2 3.08 3.10 3.15 4.13 5.08 5.10 5.13 6.03 6.11 6.17 7.04 7.06 7.09 7.11 7.13 7.14 7.15 8.05 8.06 8.07 8.09 8.10 8.11 8.12 9.09 9.10 9.11".split(" ");
const PLAN_SELF = "1.04 1.05 2.05 2.12 3.06 4.03 4.15 5.06 6.07 6.13 6.22 7.10 9.02 9.04 9.05 9.07 9.08 9.12".split(" ");
const PLAN_PROXY = "1.03 1.10 2.07 2.10 3.09 3.12 3.16 3.D1 4.11 5.04 5.05 5.11 5.12 5.16 6.01 6.02 6.12 7.02 7.07 7.16 8.01 8.08 8.13 8.14 9.01".split(" ");

describe("the ten levels (B2 Unit 1b, used by quiz question 5)", () => {
  it("live in a slim module the quiz can load without the check charts", () => {
    const src = readFileSync(join(__dirname, "roger-levels-quiz.ts"), "utf8");
    const imports = [...src.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\bimport\s+["']([^"']+)["']/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    expect(imports).toEqual([]);
    expect(src).not.toMatch(/@\/lib\/levels|roger-levels["']/);
    expect(quizLevels).toBe(rogerLevels);
    expect(QUIZ_VERSION).toBe(LEVEL_QUIZ_VERSION);
    for (const f of ["src/components/app/quiz-form.tsx", "src/lib/signup/quiz.ts"]) {
      const text = readFileSync(join(__dirname, "..", "..", f), "utf8");
      expect(text, f).toContain('from "@/data/roger-levels-quiz"');
      expect(text, f).not.toMatch(/from "@\/data\/roger-levels"/);
    }
  });

  it("are unchanged: the same value as before B4", () => {
    expect(createHash("sha256").update(JSON.stringify(rogerLevels)).digest("hex")).toBe("953402cb1cccf3c0ae25cc540cf2b7a4e411da1a12be5c89813b4e33361301ec");
    expect(LEVEL_QUIZ_VERSION).toBe("1.1");
  });
});

describe("the check charts match the levels file, item by item", () => {
  const rows = chartRows();

  it("has 148 rows in the levels file and 148 items, in the same order", () => {
    expect(rows).toHaveLength(148);
    expect(levelItems).toHaveLength(148);
    expect(LEVEL_ITEM_IDS).toEqual(rows.map((r) => r.id));
  });

  it.each(rows.map((r) => [r.id, r] as const))("%s: statement, type and code word for word", (id, r) => {
    const item = levelItems.find((i) => i.id === id);
    expect(item?.statement).toBe(r.statement);
    expect(item?.kind).toBe({ C: "core", E: "elective", D: "design" }[r.type]);
    expect(item?.code).toBe(r.code);
    expect(item?.level).toBe(Number(id[0]));
  });

  it("has unique, well-formed IDs, design items marked D", () => {
    expect(new Set(LEVEL_ITEM_IDS).size).toBe(148);
    for (const i of levelItems) {
      expect(i.id).toMatch(ITEM_ID_PATTERN);
      expect(i.kind === "design", i.id).toBe(i.id.includes(".D"));
    }
  });

  it("counts match section 4: core, standard electives, design, and what 70% needs", () => {
    const count = (k: number, kind: LevelItem["kind"]) => byLevel(k).filter((i) => i.kind === kind).length;
    expect(LEVELS.map((k) => count(k, "core"))).toEqual([5, 5, 7, 6, 6, 7, 7, 6, 6]);
    expect(LEVELS.map((k) => count(k, "elective"))).toEqual([6, 7, 9, 14, 12, 15, 9, 8, 6]);
    expect(LEVELS.map((k) => count(k, "design"))).toEqual([1, 2, 1, 1, 1, 1, 0, 0, 0]);
    expect(levelItems.filter((i) => i.kind === "core")).toHaveLength(55);
    expect(levelItems.filter((i) => i.kind === "elective")).toHaveLength(86);
    expect(levelItems.filter((i) => i.kind === "design")).toHaveLength(7);
    expect(LEVELS.map((k) => electivesNeeded(count(k, "elective")))).toEqual([5, 5, 7, 10, 9, 11, 7, 6, 5]);
  });

  it("marks every guardrail item, and only those", () => {
    for (const i of levelItems) expect(i.guardrail, i.id).toBe(i.statement.startsWith("Guardrail:"));
    expect(ids(levelItems.filter((i) => i.guardrail))).toEqual(
      "1.04 1.05 2.05 3.05 3.06 3.07 4.05 4.06 5.05 5.06 6.05 6.06 6.07 6.22 7.06 7.07 8.05 8.06 9.04 9.05".split(" "),
    );
  });

  it("keeps 6.12 an elective and 9.06 core (R28), both marked as rulings", () => {
    const get = (id: string) => levelItems.find((i) => i.id === id);
    expect(get("6.12")?.kind).toBe("elective");
    expect(get("9.06")?.kind).toBe("core");
    expect(get("6.12")?.ruling).toMatch(/S23/);
    expect(get("9.06")?.ruling).toMatch(/S23/);
  });

  it("records 6.02's S23 threshold as data, even though contract v1 can't check it", () => {
    const i = levelItems.find((x) => x.id === "6.02");
    expect(i?.thresholds).toEqual({ cleanRuns: 5, undoTested: true });
    expect(i?.ruling).toMatch(/five clean runs/);
    expect(i?.status).toBe("proxy");
  });
});

describe("how each item is settled (the plan's verification-code mapping)", () => {
  it("has 69 full, 25 proxy, 36 fallback and 18 self items", () => {
    expect([status("full").length, status("proxy").length, status("fallback").length, status("self").length]).toEqual([69, 25, 36, 18]);
  });

  it("the fallback, self and proxy items are exactly the mapping's", () => {
    expect(status("fallback")).toEqual(PLAN_FALLBACK);
    expect(FALLBACK_ITEM_IDS).toEqual(PLAN_FALLBACK);
    expect(status("self")).toEqual(PLAN_SELF);
    expect(status("proxy")).toEqual(PLAN_PROXY);
    expect(ids(levelItems.filter((i) => i.kind === "core" && i.status === "fallback"))).toEqual(["2.04", "6.03", "7.04", "7.06", "8.05", "8.06"]);
  });

  it("fallback and self items are settled by a self-report and count as self-reported; the rest are not", () => {
    for (const i of levelItems) {
      const selfLike = i.status === "fallback" || i.status === "self";
      expect(i.check.kind === "self_report", i.id).toBe(selfLike);
      expect(i.source === "self", i.id).toBe(selfLike);
    }
  });

  it("an S part appears only in S-coded items, and every S + Z item needs both parts (rule 2.1, levels file line ~372)", () => {
    for (const i of levelItems.filter((x) => x.status === "full" || x.status === "proxy")) {
      const hasSelfPart = checkNodes(i.check).some((c) => c.kind === "self_report");
      expect(hasSelfPart, i.id).toBe(codeParts(i.code).includes("S"));
      if (hasSelfPart) {
        expect(i.check.kind, i.id).toBe("all_of");
        expect(i.source, i.id).toBe("zack");
      }
    }
    expect(ids(levelItems.filter((i) => i.status !== "self" && codeParts(i.code).includes("S")))).toEqual(["7.01", "7.08", "9.01"]);
    expect(levelItems.find((i) => i.id === "9.07")?.status).toBe("self");
  });

  it("every mixed-code item needs all its parts, each anywhere in the window", () => {
    for (const i of levelItems.filter((x) => x.code.includes("+") && x.status !== "self")) {
      expect(i.check.kind, i.id).toBe("all_of");
      expect(i.partsAcrossWindow, i.id).toBe(true);
    }
    expect(ids(levelItems.filter((i) => i.partsAcrossWindow))).toEqual(["4.01", "4.19", "4.20", "7.01", "7.08", "8.02", "8.13", "9.01"]);
  });

  it("Roger-settled items are 1.10, 9.03 and 9.06", () => {
    expect(ids(levelItems.filter((i) => i.source === "roger"))).toEqual(["1.10", "9.03", "9.06"]);
  });

  it("names a horizon only where the item names a period", () => {
    expect(Object.fromEntries(levelItems.filter((i) => i.horizonWeeks).map((i) => [i.id, i.horizonWeeks]))).toEqual({ "6.09": 5, "6.14": 13, "7.04": 5, "8.03": 8 });
  });

  it("every settled-by note is admin text with no Markdown left", () => {
    for (const i of levelItems) {
      expect(i.settledBy.length, i.id).toBeGreaterThan(3);
      expect(i.settledBy, i.id).not.toMatch(/[`*]/);
      if (i.status === "fallback") expect(i.settledBy, i.id).toMatch(/self-report fallback/);
    }
  });

  it("every item has a short label, without first person", () => {
    for (const i of levelItems) {
      expect(i.short.length, i.id).toBeGreaterThan(5);
      expect(i.short.length, i.id).toBeLessThanOrEqual(80);
      expect(i.short, i.id).not.toMatch(/\b(I|my|me|I'm|I've)\b/);
    }
  });
});

describe("rule 2.1 in the data: at least three Zack- or Roger-verified core items per level", () => {
  const verifiedCore = LEVELS.map((k) => byLevel(k).filter((i) => i.kind === "core" && (i.status === "full" || i.status === "proxy")).length);

  it("is 3, 3, 6, 5, 5, 5, 5, 4, 3 for Levels 1 to 9", () => {
    expect(verifiedCore).toEqual([3, 3, 6, 5, 5, 5, 5, 4, 3]);
  });

  it("holds for every level (a ruling that drops a level below 3 breaks rule 2.1 there)", () => {
    LEVELS.forEach((k, i) => expect(verifiedCore[i], `Level ${k}: rule 2.1 would break: fewer than ${LEVEL_RULES.minVerifiedCore} verified core items`).toBeGreaterThanOrEqual(LEVEL_RULES.minVerifiedCore));
  });

  it("flags Levels 1, 2 and 9 as at the minimum (one ruling moving a verified core item of theirs breaks rule 2.1)", () => {
    const atMin = LEVELS.filter((k, i) => verifiedCore[i] === LEVEL_RULES.minVerifiedCore);
    expect(atMin, "the levels at the minimum changed: update LEVELS_AT_VERIFIED_CORE_MINIMUM, and check rule 2.1 with Peter").toEqual([...LEVELS_AT_VERIFIED_CORE_MINIMUM]);
    expect([...LEVELS_AT_VERIFIED_CORE_MINIMUM]).toEqual([1, 2, 9]);
  });

  it("each level's needed electives are reachable within the fallback cap", () => {
    for (const k of LEVELS) {
      const needed = electivesNeeded(byLevel(k).filter((i) => i.kind === "elective").length);
      const electives = byLevel(k).filter((i) => i.kind !== "core");
      const nonFallback = electives.filter((i) => i.status !== "fallback").length;
      const fallback = electives.filter((i) => i.status === "fallback").length;
      expect(nonFallback + Math.min(fallback, fallbackElectivesAllowed(needed)), `Level ${k}`).toBeGreaterThanOrEqual(needed);
    }
    // The plan's "reachable without the fallback" row: Full, Proxy and S electives, standard plus design.
    expect(LEVELS.map((k) => byLevel(k).filter((i) => i.kind !== "core" && i.status !== "fallback").length)).toEqual([3, 5, 7, 14, 10, 14, 4, 3, 3]);
  });
});

describe("the check vocabulary as used by the data", () => {
  const everyChecks = levelItems.flatMap((i) => checkNodes(i.check).filter((c): c is Extract<LevelCheck, { kind: "every" }> => c.kind === "every").map((c) => [i.id, c] as const));

  it("every every(...) check has nonEmpty: true, so an empty collection is 0", () => {
    expect(everyChecks.map(([id]) => id)).toEqual(["4.04", "4.05", "4.06", "4.18", "4.19", "5.05", "6.01", "6.06", "6.16", "6.21", "7.07"]);
    for (const [id, c] of everyChecks) expect(c.nonEmpty, id).toBe(true);
  });

  it("every full or proxy item's check names only fields that exist in contract v1", () => {
    const schemaPaths = new Set<string>();
    const walk = (s: unknown, prefix: string) => {
      if (!s || typeof s !== "object") return;
      const o = s as Record<string, unknown>;
      if (o.properties) for (const [k, v] of Object.entries(o.properties as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${k}` : k;
        schemaPaths.add(path);
        walk(v, path);
      }
      if (o.items) walk(o.items, `${prefix}[]`);
      for (const key of ["anyOf", "oneOf"]) if (Array.isArray(o[key])) (o[key] as unknown[]).forEach((x) => walk(x, prefix));
    };
    walk(z.toJSONSchema(levelBlockV1), "");
    const collectionPath = (c: string) => (c === "domains" ? "domains" : `inventory.${c}`);
    const resolve = (path: string): string[] => [...(DERIVED_EVIDENCE_FIELDS[path] ?? [path])];
    const predPaths = (coll: string, p: LevelPred): string[] => {
      switch (p.op) {
        case "not":
          return predPaths(coll, p.pred);
        case "all_of":
        case "any_of":
          return p.preds.flatMap((q) => predPaths(coll, q));
        case "inside_cadence":
          return [`${coll}[].cadence`, `${coll}[].last_run`];
        case "owner_role":
          return resolve(`${coll}[].owner`);
        case "holds_every_service":
          return [`${coll}[].connections`];
        default:
          return resolve(`${coll}[].${p.field}`);
      }
    };
    const paths = (c: LevelCheck): string[] => {
      switch (c.kind) {
        case "count_at_least":
          return resolve(c.path);
        case "some":
        case "count_where":
          return predPaths(collectionPath(c.collection), c.where);
        case "every":
          return [...predPaths(collectionPath(c.collection), c.where), ...(c.among ? predPaths(collectionPath(c.collection), c.among) : [])];
        case "memory_has":
          return ["inventory.memory"];
        case "within_weeks":
          return [c.path];
        case "span_weeks":
          return [`${collectionPath(c.collection)}[].${c.field}`];
        case "changed_between_runs":
          return c.change === "system_skill_added" ? ["inventory.skills[].origin"] : c.change.includes("autonomy") ? ["inventory.agents[].autonomy", "inventory.routines"] : ["inventory.routines[].cadence"];
        case "all_of":
        case "any_of":
          return c.checks.flatMap(paths);
        default:
          return [];
      }
    };
    for (const i of levelItems.filter((x) => x.status === "full" || x.status === "proxy")) for (const path of paths(i.check)) expect(schemaPaths, `${i.id}: ${path}`).toContain(path);
  });

  it("the data's own value lists match the contract's enums", () => {
    expect([...LEVEL_RULES.fastCadences, ...LEVEL_RULES.slowCadences].every((c) => (CADENCES as readonly string[]).includes(c))).toBe(true);
    expect(Object.keys(LEVEL_RULES.cadenceGraceDays).sort()).toEqual([...CADENCES].sort());
    const values = JSON.stringify(levelItems.map((i) => i.check));
    for (const v of AUTONOMY_LEVELS) expect(values).toContain(`"${v}"`);
    for (const v of DOMAIN_STAGES) expect(values).toContain(`"${v}"`);
    for (const v of ["phone", "email", "text", "slack"]) expect(DELIVERS_TO as readonly string[]).toContain(v);
  });
});

describe("the rules, as data", () => {
  it("holds the levels file's numbers and the plan's recommendations", () => {
    expect(LEVEL_RULES).toMatchObject({
      windowRuns: 4,
      windowMaxAgeWeeks: 8,
      electiveShare: 0.7,
      maxFallbackElectiveShare: 0.5,
      minVerifiedCore: 3,
      guardrailSelfReportMaxWeeks: 26,
      reviewHoldLevels: [7, 8],
      reviewHoldAlertsPerDay: 5,
      platformsCombine: true,
    });
    expect(LEVEL_RULES.cadenceGraceDays).toMatchObject({ daily: 2, weekly: 9, monthly: 35 });
  });

  it("rounds 70% up and the fallback cap down, without floating-point drift", () => {
    expect([6, 7, 9, 10, 14, 20].map((n) => electivesNeeded(n))).toEqual([5, 5, 7, 7, 10, 14]);
    expect([5, 7, 6, 11, 1].map((n) => fallbackElectivesAllowed(n))).toEqual([2, 3, 3, 5, 0]);
  });

  it("has a member-facing 'how this is checked' text for every code an item uses", () => {
    const codes = new Set(levelItems.flatMap((i) => codeParts(i.code)));
    for (const c of codes) expect(VERIFICATION_CODES, c).toHaveProperty(c);
    expect(Object.keys(VERIFICATION_CODES).sort()).toEqual(["R", "S", "ZA", "ZH", "ZI", "fallback"]);
    for (const v of Object.values(VERIFICATION_CODES)) expect(v.howChecked).toMatch(/\.$/);
  });

  it("lists every item Zack may ask: the fallback items and every S-coded item (57)", () => {
    expect(SELF_REPORT_ITEM_IDS).toHaveLength(57);
    for (const id of [...PLAN_FALLBACK, ...PLAN_SELF, "7.01", "7.08", "9.01"]) expect(SELF_REPORT_ITEM_IDS).toContain(id);
  });

  it("versions the items and rules: stable for the same data, different for any change", () => {
    expect(LEVELS_RULES_VERSION).toMatch(/^[0-9a-f]{14}$/);
    expect(levelsRulesVersion(levelItems, LEVEL_RULES)).toBe(LEVELS_RULES_VERSION);
    expect(levelsRulesVersion(levelItems, { ...LEVEL_RULES, electiveShare: 0.6 })).not.toBe(LEVELS_RULES_VERSION);
    const edited = levelItems.map((i) => (i.id === "6.12" ? { ...i, kind: "core" as const } : i));
    expect(levelsRulesVersion(edited, LEVEL_RULES)).not.toBe(LEVELS_RULES_VERSION);
  });

  it("hashes only what scoring reads: wording edits leave the version alone, a threshold edit changes it", () => {
    const edit = (f: (i: LevelItem) => LevelItem) => levelsRulesVersion(levelItems.map((i) => (i.id === "6.02" ? f(i) : i)), LEVEL_RULES);
    expect(edit((i) => ({ ...i, settledBy: `${i.settledBy} (reworded)` }))).toBe(LEVELS_RULES_VERSION);
    expect(edit((i) => ({ ...i, short: "reworded" }))).toBe(LEVELS_RULES_VERSION);
    expect(edit((i) => ({ ...i, statement: "Reworded." }))).toBe(LEVELS_RULES_VERSION);
    expect(edit((i) => ({ ...i, ruling: "Reworded." }))).toBe(LEVELS_RULES_VERSION);
    expect(edit((i) => ({ ...i, thresholds: { cleanRuns: 6, undoTested: true } }))).not.toBe(LEVELS_RULES_VERSION);
    expect(edit((i) => ({ ...i, status: "fallback" }))).not.toBe(LEVELS_RULES_VERSION);
    expect(edit((i) => ({ ...i, horizonWeeks: 4 }))).not.toBe(LEVELS_RULES_VERSION);
    expect(edit((i) => ({ ...i, check: { kind: "self_report" } }))).not.toBe(LEVELS_RULES_VERSION);
    expect(levelsRulesVersion(levelItems, { ...LEVEL_RULES, cadenceGraceDays: { ...LEVEL_RULES.cadenceGraceDays, weekly: 8 } })).not.toBe(LEVELS_RULES_VERSION);
  });
});
