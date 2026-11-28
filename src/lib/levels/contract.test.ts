import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AGENT_FIELDS,
  AGENT_NEEDS,
  AGENT_ROLES,
  AGENT_RULES,
  AUTONOMY_LEVELS,
  AWAY_RULES,
  BLOCK_PATH,
  CADENCES,
  CREATED_BY,
  DELIVERS_TO,
  DOMAIN_KINDS,
  DOMAIN_STAGES,
  EVENT_SCOPES,
  formatLevelIssues,
  LEVEL_CONTRACT_VERSION,
  LEVEL_LIMITS,
  LEVEL_PLATFORMS,
  LEVEL_ZACK_VERSION,
  levelBlockV1,
  MEMORY_KINDS,
  parseLevelBlock,
  RECEIVED_ON_PATH,
  ROUTINE_HAS,
  ROUTINE_TRIGGERS,
  SKILL_ORIGINS,
  validateLevelBlock,
  type LevelValidation,
} from "@/lib/levels/contract";
import { caseText, contractEdgeCases, defaultAgent, FIXTURE_RECEIVED_ON, fixtureText, maximalBlock, minimalBlock, type ContractCase } from "@/test-helpers/level-fixtures";

const ROOT = join(__dirname, "..", "..", "..");
const FIXTURE_DIR = join(ROOT, "tests", "fixtures", "roger-level", "contract");
const CONTRACT_DOC = join(ROOT, "artifacts", "Roger Level Block Contract v1.md");
const WRITE = process.env.WRITE_LEVEL_FIXTURES === "1";

function run(c: ContractCase): LevelValidation {
  return c.validate === "object" ? parseLevelBlock(c.block, c.receivedOn) : validateLevelBlock(caseText(c), c.receivedOn);
}

/** Every property name in a JSON Schema, at any depth. */
function schemaKeys(schema: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) schema.forEach((s) => schemaKeys(s, out));
  else if (schema && typeof schema === "object") {
    const o = schema as Record<string, unknown>;
    if (o.properties && typeof o.properties === "object") for (const k of Object.keys(o.properties)) out.add(k);
    for (const v of Object.values(o)) schemaKeys(v, out);
  }
  return out;
}

/** Every string value in a value, at any depth. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

const normalise = (s: string) => s.replace(/\r\n/g, "\n");

afterEach(() => vi.restoreAllMocks());

describe("roger-level contract v1: the frozen shape", () => {
  it("matches the stored JSON Schema snapshot (a failure here means the contract changed: bump LEVEL_CONTRACT_VERSION and add levelBlockV2 instead)", () => {
    expect({
      version: LEVEL_CONTRACT_VERSION,
      zackVersion: LEVEL_ZACK_VERSION,
      limits: LEVEL_LIMITS,
      schema: z.toJSONSchema(levelBlockV1),
    }).toMatchSnapshot();
  });

  it("is version 1, for Zack 2.1", () => {
    expect(LEVEL_CONTRACT_VERSION).toBe(1);
    expect(LEVEL_ZACK_VERSION).toBe("2.1");
  });

  it("names Zack's four agents as platforms, plus other", () => {
    expect([...LEVEL_PLATFORMS].sort()).toEqual(["claude", "duet", "grok-bot", "hark", "other"]);
  });
});

describe("roger-level contract v1: edge cases", () => {
  const cases = contractEdgeCases();

  it("has unique case names, valid and invalid ones", () => {
    const names = cases.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(cases.filter((c) => c.expect.ok).length).toBeGreaterThan(10);
    expect(cases.filter((c) => !c.expect.ok).length).toBeGreaterThan(30);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const r = run(c);
    if (c.expect.ok) {
      expect(r).toMatchObject({ ok: true });
    } else {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues).toEqual(c.expect.issues);
    }
  });

  it("rejects a block one character over the limit as size, before parsing it", () => {
    const parse = vi.spyOn(JSON, "parse");
    const r = validateLevelBlock("x".repeat(LEVEL_LIMITS.blockChars + 1), FIXTURE_RECEIVED_ON);
    expect(r).toEqual({ ok: false, issues: [{ path: BLOCK_PATH, code: "size" }] });
    expect(parse).not.toHaveBeenCalled();
  });

  it("drops unknown keys from the parsed block", () => {
    const c = cases.find((x) => x.name === "valid-unknown-keys");
    const r = c && run(c);
    expect(r?.ok).toBe(true);
    if (r?.ok) {
      expect(r.block).not.toHaveProperty("zack_note");
      expect(r.block.inventory.agents[0]).not.toHaveProperty("favourite_colour");
      expect(r.block.activity_7d).not.toHaveProperty("tokens");
      const padded = cases.find((x) => x.name === "valid-exactly-max-chars");
      const p = padded && run(padded);
      expect(p?.ok && p.block).not.toHaveProperty("padding");
    }
  });

  it("never puts a value from the block in an issue: paths and codes only", () => {
    const keys = schemaKeys(z.toJSONSchema(levelBlockV1));
    for (const c of cases.filter((x) => !x.expect.ok)) {
      const r = run(c);
      if (r.ok) throw new Error(`${c.name} validated`);
      const issueText = JSON.stringify(r.issues);
      const values = c.text !== undefined ? [c.text] : strings(c.block);
      for (const v of values.filter((s) => s.length >= 3 && !keys.has(s) && s !== "2.1")) expect(issueText, `${c.name}: ${v}`).not.toContain(v);
      for (const i of r.issues) expect(Object.keys(i).sort()).toEqual(["code", "path"]);
    }
  });

  it("caps the number of issues for one block", () => {
    const b = minimalBlock() as unknown as Record<string, Record<string, unknown>>;
    for (const k of Object.keys(b.activity_7d)) b.activity_7d[k] = "x";
    for (const k of Object.keys(b.history_flags)) b.history_flags[k] = "x";
    const r = parseLevelBlock(b, FIXTURE_RECEIVED_ON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues).toHaveLength(LEVEL_LIMITS.issues);
  });

  it("refuses a receipt date that isn't YYYY-MM-DD (a caller bug, not a block issue)", () => {
    expect(() => validateLevelBlock("{}", "29/11/2026")).toThrow(/receivedOn/);
  });

  it("rejects an impossible receipt date as an issue, not a RangeError", () => {
    const text = JSON.stringify(minimalBlock());
    for (const d of ["2026-13-40", "2026-02-30", "2026-00-10"]) {
      expect(validateLevelBlock(text, d), d).toEqual({ ok: false, issues: [{ path: RECEIVED_ON_PATH, code: "invalid_format" }] });
      expect(parseLevelBlock(minimalBlock(), d), d).toEqual({ ok: false, issues: [{ path: RECEIVED_ON_PATH, code: "invalid_format" }] });
    }
    expect(validateLevelBlock(text, "2028-02-29").ok).toBe(true);
  });

  it("rejects a duplicate key anywhere, naming the path only as far as the schema's own keys", () => {
    const min = minimalBlock() as unknown as Record<string, unknown>;
    const json = JSON.stringify(min);
    const dupIn = (needle: string, extra: string) => json.replace(needle, `${needle},${extra}`);
    expect(validateLevelBlock(dupIn('"zack_version":"2.1"', '"zack_version":"2.1"'), FIXTURE_RECEIVED_ON)).toEqual({ ok: false, issues: [{ path: "zack_version", code: "duplicate_key" }] });
    expect(validateLevelBlock(dupIn('"voice_inputs":0', '"voice_inputs":5'), FIXTURE_RECEIVED_ON)).toEqual({ ok: false, issues: [{ path: "activity_7d.voice_inputs", code: "duplicate_key" }] });
    // Keys compare after unescaping, as JSON.parse sees them.
    expect(validateLevelBlock(dupIn('"scripts":0', '"scr\\u0069pts":3'), FIXTURE_RECEIVED_ON)).toEqual({ ok: false, issues: [{ path: "inventory.scripts", code: "duplicate_key" }] });
    // Inside an unknown key the path stops at the last known one, so no block text reaches the reason.
    const unknown = JSON.stringify({ ...min, secret_note: { "Ana Lopez": 1 } }).replace('"Ana Lopez":1', '"Ana Lopez":1,"Ana Lopez":2');
    expect(validateLevelBlock(unknown, FIXTURE_RECEIVED_ON)).toEqual({ ok: false, issues: [{ path: BLOCK_PATH, code: "duplicate_key" }] });
    // Same key in two different objects, or a key that looks like a string value, is fine.
    const agents = JSON.stringify({ ...min, inventory: { ...(min.inventory as object), agents: [defaultAgent("name"), defaultAgent("autonomy")] } });
    expect(validateLevelBlock(agents, FIXTURE_RECEIVED_ON).ok).toBe(true);
  });

  it("strips __proto__ keys, at the top level and inside inventory, without touching any prototype", () => {
    const json = JSON.stringify(minimalBlock());
    const text = json
      .replace('{"zack_version"', '{"__proto__":{"polluted":true},"zack_version"')
      .replace('"inventory":{', '"inventory":{"__proto__":{"polluted":true},');
    expect(text.match(/__proto__/g)).toHaveLength(2);
    const r = validateLevelBlock(text, FIXTURE_RECEIVED_ON);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.hasOwn(r.block, "__proto__")).toBe(false);
      expect(Object.hasOwn(r.block.inventory, "__proto__")).toBe(false);
      expect(Object.getPrototypeOf(r.block)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(r.block.inventory)).toBe(Object.prototype);
      expect((r.block as unknown as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  });

  it("formats issues as one bounded line for a stored reason", () => {
    expect(formatLevelIssues([{ path: "inventory.routines[3].cadence", code: "invalid_value" }, { path: "platform", code: "missing" }])).toBe(
      "inventory.routines[3].cadence: invalid_value; platform: missing",
    );
    const many = Array.from({ length: 200 }, (_, i) => ({ path: `self_report[${i}].item`, code: "unknown_item" as const }));
    expect(formatLevelIssues(many).length).toBeLessThanOrEqual(1_000);
  });
});

describe("roger-level contract v1: the maximal block", () => {
  it("uses every enum value at least once", () => {
    const used = new Set(strings(maximalBlock()));
    const lists = [AGENT_FIELDS, AUTONOMY_LEVELS, CREATED_BY, AGENT_RULES, AGENT_ROLES, AGENT_NEEDS, ROUTINE_TRIGGERS, CADENCES, ROUTINE_HAS, AWAY_RULES, EVENT_SCOPES, DELIVERS_TO, SKILL_ORIGINS, MEMORY_KINDS, DOMAIN_KINDS, DOMAIN_STAGES];
    for (const list of lists) for (const v of list) expect(used, v).toContain(v);
    const answers = maximalBlock().self_report.map((r) => r.answer);
    expect(answers).toContain(0);
    expect(answers).toContain(1);
  });
});

describe("roger-level contract v1: checked-in fixtures", () => {
  const cases = contractEdgeCases();

  it("regenerating the fixtures gives byte-identical files, with none left over", () => {
    if (WRITE) {
      mkdirSync(FIXTURE_DIR, { recursive: true });
      for (const c of cases) writeFileSync(join(FIXTURE_DIR, `${c.name}.json`), fixtureText(c));
    }
    const onDisk = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json")).sort();
    expect(onDisk).toEqual(cases.map((c) => `${c.name}.json`).sort());
    for (const c of cases) expect(normalise(readFileSync(join(FIXTURE_DIR, `${c.name}.json`), "utf8")), c.name).toBe(fixtureText(c));
  });

  it("every checked-in fixture validates as its file says", () => {
    for (const f of readdirSync(FIXTURE_DIR).filter((x) => x.endsWith(".json"))) {
      const c = JSON.parse(readFileSync(join(FIXTURE_DIR, f), "utf8")) as ContractCase;
      const r = run(c);
      expect(r.ok, f).toBe(c.expect.ok);
      if (!r.ok && !c.expect.ok) expect(r.issues, f).toEqual(c.expect.issues);
    }
  });

  it("has a README naming every fixture", () => {
    const readme = readFileSync(join(FIXTURE_DIR, "..", "README.md"), "utf8");
    expect(readme).toContain("WRITE_LEVEL_FIXTURES=1");
    for (const c of cases) expect(readme, c.name).toContain(c.name);
  });
});

describe("the contract document (artifacts/Roger Level Block Contract v1.md)", () => {
  const doc = existsSync(CONTRACT_DOC) ? normalise(readFileSync(CONTRACT_DOC, "utf8")) : "";
  const fence = /```roger-level\n([\s\S]*?)\n```/.exec(doc);

  it("has a full example in a roger-level fence that validates, and is the maximal fixture", () => {
    expect(fence).not.toBeNull();
    const text = fence?.[1] ?? "";
    expect(validateLevelBlock(text, FIXTURE_RECEIVED_ON)).toMatchObject({ ok: true });
    expect(JSON.parse(text)).toEqual(maximalBlock());
  });

  it("names every key the schema has, every enum value and every limit", () => {
    for (const k of schemaKeys(z.toJSONSchema(levelBlockV1))) expect(doc, k).toContain(`\`${k}\``);
    const lists = [LEVEL_PLATFORMS, AGENT_FIELDS, AUTONOMY_LEVELS, CREATED_BY, AGENT_RULES, AGENT_ROLES, AGENT_NEEDS, ROUTINE_TRIGGERS, CADENCES, ROUTINE_HAS, AWAY_RULES, EVENT_SCOPES, DELIVERS_TO, SKILL_ORIGINS, MEMORY_KINDS, DOMAIN_KINDS, DOMAIN_STAGES];
    for (const list of lists) for (const v of list) expect(doc, v).toContain(`\`${v}\``);
    for (const n of [LEVEL_LIMITS.blockChars, LEVEL_LIMITS.count, LEVEL_LIMITS.agents, LEVEL_LIMITS.routines, LEVEL_LIMITS.skills, LEVEL_LIMITS.selfReport]) expect(doc, String(n)).toContain(n.toLocaleString("en-US"));
  });

  it("states the contract version", () => {
    expect(doc).toContain(`Contract version ${LEVEL_CONTRACT_VERSION}`);
  });
});
