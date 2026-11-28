import { electivesNeeded, fallbackElectivesAllowed, LEVEL_RULES, levelItems, type LevelItem } from "@/data/roger-levels";
import { evaluateCheck, evaluateItem, NO_ROGER_FACTS, type CheckContext, type RogerFacts } from "@/lib/levels/checks";
import {
  AGENT_FIELDS,
  AGENT_NEEDS,
  AGENT_RULES,
  AUTONOMY_LEVELS,
  BLOCK_PATH,
  CADENCES,
  CREATED_BY,
  DELIVERS_TO,
  DOMAIN_STAGES,
  LEVEL_LIMITS,
  LEVEL_PLATFORMS,
  MEMORY_KINDS,
  ROUTINE_HAS,
  SKILL_ORIGINS,
  type LevelBlockV1,
  type LevelIssue,
  type LevelPlatform,
} from "@/lib/levels/contract";
import { minimise } from "@/lib/levels/evidence";
import type { LevelCheck, LevelCollection, LevelPred, RogerFact } from "@/lib/levels/vocabulary";

/**
 * Fixtures for the `roger-level` contract v1 and the levels (B4 Units 1, 2).
 *
 * Everything here is generated deterministically from the contract and the
 * levels data file, and checked in under tests/fixtures/roger-level/
 * (`contract.test.ts` and `level-fixtures.test.ts` regenerate in memory and
 * compare). Dates are fixed relative to one receipt date.
 */

/** The receipt date every fixture is validated against (a Sunday, Zack's run day). */
export const FIXTURE_RECEIVED_ON = "2026-11-29";

type Agent = LevelBlockV1["inventory"]["agents"][number];
type Routine = LevelBlockV1["inventory"]["routines"][number];
type Skill = LevelBlockV1["inventory"]["skills"][number];
type Domain = LevelBlockV1["domains"][number];

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

function merge<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (over === undefined) return base;
  if (base === null || typeof base !== "object" || Array.isArray(base) || over === null || typeof over !== "object" || Array.isArray(over)) return over as unknown as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = merge(out[k], v as never);
  return out as T;
}

/** The smallest valid block: a platform, an empty inventory, zero activity, no answers. */
export function minimalBlock(platform: LevelPlatform = "claude"): LevelBlockV1 {
  return {
    zack_version: "2.1",
    platform,
    inventory: { agents: [], routines: [], skills: [], memory: [], memory_last_cleanup: "none", pages_dashboards: 0, models_used: [], scripts: 0 },
    activity_7d: {
      active_days: 0,
      multi_step_completions: 0,
      agent_to_agent_handoffs: 0,
      proactive_starts: 0,
      voice_inputs: 0,
      approvals: { parked: 0, approved: 0, batched: 0, sent_after_approval: 0 },
      exceptions_escalated: 0,
      others_served_directly: 0,
      browser_only_tasks: 0,
      longest_chat_size: 0,
      chat_resets: 0,
      verify_reports: { pass: 0, fail: 0 },
      self_change_proposals: { proposed: 0, adopted: 0 },
      design_activity: { directions_generated: 0, iterations: 0, playground_built: 0, screenshot_check: 0 },
    },
    history_flags: { promotions: 0, demotions: 0, retirements: 0, rule_fixes_after_error: 0, usage_cuts: 0, access_reviews: 0 },
    self_report: [],
    domains: [],
  };
}

/** A block built from the minimal one with deep overrides (objects merge, arrays replace). */
export function levelBlock(over?: DeepPartial<LevelBlockV1>): LevelBlockV1 {
  return merge<LevelBlockV1>(minimalBlock(), over);
}

export function defaultAgent(name: string, over: Partial<Agent> = {}): Agent {
  return { name, job_sentence: "", fields_present: [], autonomy: "observe", connections: [], created: null, created_by: "me", rules: [], role: "chat", needs_own: [], ...over };
}
export function defaultRoutine(name: string, over: Partial<Routine> = {}): Routine {
  return { name, owner_agent: null, trigger: "schedule", cadence: "other", last_run: null, has: [], away_rule: "none", event_scope: null, delivers_to: "app", ...over };
}
export function defaultSkill(name: string, over: Partial<Skill> = {}): Skill {
  return { name, origin: "me", used_by: [], ...over };
}
export function defaultDomain(name: string, over: Partial<Domain> = {}): Domain {
  return { name, kind: "work", stages_covered: [], ...over };
}

/** A block that uses every enum value of the contract at least once (the contract document's example). */
export function maximalBlock(): LevelBlockV1 {
  const on = FIXTURE_RECEIVED_ON;
  const agentNames = ["Chief of staff", "Inbox", "Listings", "Checker", "Routines host", "Catch-all"];
  const agents: Agent[] = agentNames.map((name, i) =>
    defaultAgent(name, {
      job_sentence: `${name} owns one job.`,
      fields_present: i === 0 ? [...AGENT_FIELDS] : ["owns", "done_when"],
      autonomy: AUTONOMY_LEVELS[i],
      connections: i === 0 ? ["Gmail", "Google Calendar", "Slack"] : i === 1 ? ["Gmail"] : i === 2 ? ["Listing site"] : [],
      created: addDays(on, -7 * (i + 1)),
      created_by: CREATED_BY[i % CREATED_BY.length],
      rules: i === 0 ? [...AGENT_RULES] : ["do_ask_stop", "stop_when_unsure"],
      role: (["coordinator", "specialist", "specialist", "checker", "routines_only", "catch_all"] as const)[i],
      needs_own: [AGENT_NEEDS[i % AGENT_NEEDS.length]],
    }),
  );
  agents[1] = { ...agents[1], role: "chat" };
  const routines: Routine[] = CADENCES.map((cadence, i) =>
    defaultRoutine(`Routine ${cadence}`, {
      owner_agent: i % 2 === 0 ? "Routines host" : null,
      trigger: i < 2 ? "event" : "schedule",
      cadence,
      last_run: i === CADENCES.length - 1 ? null : addDays(on, -1),
      has: i === 0 ? [...ROUTINE_HAS] : ["receipt", "nothing_today_rule", "source_check", "retry_limit"],
      away_rule: (["allow", "draft", "none"] as const)[i % 3],
      event_scope: i === 0 ? "narrow" : i === 1 ? "broad" : null,
      delivers_to: DELIVERS_TO[i % DELIVERS_TO.length],
    }),
  );
  return {
    zack_version: "2.1",
    platform: "grok-bot",
    inventory: {
      agents,
      routines,
      skills: SKILL_ORIGINS.map((origin, i) => defaultSkill(`Skill ${origin}`, { origin, used_by: i === 0 ? ["Inbox", "Routine daily"] : i === 1 ? ["Chief of staff"] : [] })),
      memory: [...MEMORY_KINDS],
      memory_last_cleanup: addDays(on, -10),
      pages_dashboards: 1,
      models_used: ["Model A", "Model B"],
      scripts: 2,
    },
    activity_7d: {
      active_days: 6,
      multi_step_completions: 12,
      agent_to_agent_handoffs: 4,
      proactive_starts: 9,
      voice_inputs: 3,
      approvals: { parked: 2, approved: 5, batched: 1, sent_after_approval: 5 },
      exceptions_escalated: 1,
      others_served_directly: 2,
      browser_only_tasks: 1,
      longest_chat_size: 140,
      chat_resets: 1,
      verify_reports: { pass: 7, fail: 1 },
      self_change_proposals: { proposed: 2, adopted: 1 },
      design_activity: { directions_generated: 5, iterations: 4, playground_built: 1, screenshot_check: 1 },
    },
    history_flags: { promotions: 1, demotions: 1, retirements: 1, rule_fixes_after_error: 2, usage_cuts: 1, access_reviews: 1 },
    self_report: [
      { item: "1.04", answer: 1, date: addDays(on, -14) },
      { item: "6.07", answer: 0, date: on },
    ],
    domains: [
      defaultDomain("Listings marketing", { kind: "work", stages_covered: [...DOMAIN_STAGES] }),
      defaultDomain("Family logistics", { kind: "home", stages_covered: ["intake", "work"] }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Contract edge cases (Unit 1)
// ---------------------------------------------------------------------------

export type ContractCase = {
  name: string;
  description: string;
  receivedOn: string;
  /** `text`: validated with validateLevelBlock. `object`: with parseLevelBlock (the text would exceed the character limit first). */
  validate: "text" | "object";
  expect: { ok: true } | { ok: false; issues: LevelIssue[] };
} & ({ block: unknown; text?: undefined } | { text: string; block?: undefined });

const iss = (path: string, code: LevelIssue["code"]): LevelIssue => ({ path, code });

/** The block text a case is validated as. */
export function caseText(c: ContractCase): string {
  return c.text ?? JSON.stringify(c.block);
}

const YAML_LIKE = [
  "roger-level:",
  "  zack_version: 2.1",
  "  platform: claude",
  "  inventory:",
  "    agents:",
  "      - name: Inbox, job_sentence: Sorts my email",
].join("\n");

function n<T>(count: number, make: (i: number) => T): T[] {
  return Array.from({ length: count }, (_, i) => make(i));
}

export function contractEdgeCases(): ContractCase[] {
  const on = FIXTURE_RECEIVED_ON;
  const base = { receivedOn: on, validate: "text" as const };
  const ok = { ok: true as const };
  const bad = (...issues: LevelIssue[]) => ({ ok: false as const, issues });
  const L = LEVEL_LIMITS;
  const cases: ContractCase[] = [];
  const add = (c: Omit<ContractCase, "receivedOn" | "validate"> & { validate?: "text" | "object" }) => cases.push({ ...base, ...c } as ContractCase);
  const withAgents = (agents: Agent[]) => levelBlock({ inventory: { agents } });
  const withRoutines = (routines: Routine[], agents: Agent[] = []) => levelBlock({ inventory: { agents, routines } });

  add({ name: "valid-minimal", description: "The smallest valid block: platform, zack_version, empty inventory, zero activity.", block: minimalBlock(), expect: ok });
  add({ name: "valid-maximal", description: "Every field, every enum value used at least once. The contract document's example.", block: maximalBlock(), expect: ok });
  for (const platform of LEVEL_PLATFORMS) add({ name: `valid-platform-${platform}`, description: `A minimal block from platform ${platform}.`, block: minimalBlock(platform), expect: ok });
  {
    const b = minimalBlock() as unknown as Record<string, unknown>;
    const text = JSON.stringify({ ...b, padding: "" });
    const padded = JSON.stringify({ ...b, padding: "x".repeat(L.blockChars - text.length) });
    add({ name: "valid-exactly-max-chars", description: `Exactly ${L.blockChars} characters (padded with an unknown key, which is dropped).`, text: padded, expect: ok });
    add({ name: "invalid-oversize", description: `${L.blockChars + 1} characters: rejected as size before parsing.`, text: `${padded} `, expect: bad(iss(BLOCK_PATH, "size")) });
  }
  add({
    name: "valid-unknown-keys",
    description: "Unknown keys at the top level, in an agent and in activity: not an error, and dropped.",
    block: { ...minimalBlock(), zack_note: "hi", inventory: { ...minimalBlock().inventory, agents: [{ ...defaultAgent("Inbox"), favourite_colour: "blue" }] }, activity_7d: { ...minimalBlock().activity_7d, tokens: 5 } },
    expect: ok,
  });
  add({
    name: "valid-boundary-values",
    description: "Counts at 10,000, active_days at 7, strings of exactly 120 characters, dates at 2020-01-01 and at receipt + 1 day.",
    block: levelBlock({
      inventory: {
        agents: [defaultAgent("A".repeat(L.string), { job_sentence: "j".repeat(L.string), connections: ["c".repeat(L.string)], created: L.earliestDate })],
        routines: [defaultRoutine("R".repeat(L.string), { owner_agent: "A".repeat(L.string), last_run: addDays(on, 1) })],
        memory_last_cleanup: L.earliestDate,
        pages_dashboards: L.count,
        scripts: L.count,
      },
      activity_7d: { active_days: 7, multi_step_completions: L.count, longest_chat_size: L.count },
      history_flags: { promotions: L.count },
      self_report: [{ item: "9.12", answer: 0, date: addDays(on, 1) }],
    }),
    expect: ok,
  });
  // Arrays at their limits, and one over.
  const limitCases: { key: string; path: string; at: (k: number) => LevelBlockV1; limit: number; validate?: "object" }[] = [
    { key: "agents", path: "inventory.agents", limit: L.agents, at: (k) => withAgents(n(k, (i) => defaultAgent(`Agent ${i + 1}`))) },
    { key: "routines", path: "inventory.routines", limit: L.routines, validate: "object", at: (k) => withRoutines(n(k, (i) => defaultRoutine(`Routine ${i + 1}`))) },
    { key: "skills", path: "inventory.skills", limit: L.skills, at: (k) => levelBlock({ inventory: { skills: n(k, (i) => defaultSkill(`S${i + 1}`)) } }) },
    { key: "connections", path: "inventory.agents[0].connections", limit: L.connectionsPerAgent, at: (k) => withAgents([defaultAgent("Inbox", { connections: n(k, (i) => `Service ${i + 1}`) })]) },
    { key: "models-used", path: "inventory.models_used", limit: L.modelsUsed, at: (k) => levelBlock({ inventory: { models_used: n(k, (i) => `Model ${i + 1}`) } }) },
    { key: "used-by", path: "inventory.skills[0].used_by", limit: L.usedBy, at: (k) => levelBlock({ inventory: { agents: [defaultAgent("Inbox")], skills: [defaultSkill("S1", { used_by: n(k, () => "Inbox") })] } }) },
    { key: "self-report", path: "self_report", limit: L.selfReport, at: (k) => levelBlock({ self_report: n(k, (i) => ({ item: "1.04", answer: (i % 2) as 0 | 1, date: on })) }) },
    { key: "domains", path: "domains", limit: L.domains, at: (k) => levelBlock({ domains: n(k, (i) => defaultDomain(`Domain ${i + 1}`)) }) },
    { key: "fields-present", path: "inventory.agents[0].fields_present", limit: L.enumList, at: (k) => withAgents([defaultAgent("Inbox", { fields_present: n(k, (i) => AGENT_FIELDS[i % AGENT_FIELDS.length]) })]) },
  ];
  for (const c of limitCases) {
    add({ name: `valid-${c.key}-at-limit`, description: `${c.path} with ${c.limit} entries (the limit).`, validate: c.validate, block: c.at(c.limit), expect: ok });
    add({ name: `invalid-${c.key}-over-limit`, description: `${c.path} with ${c.limit + 1} entries: one over.`, validate: c.validate, block: c.at(c.limit + 1), expect: bad(iss(c.path, "too_big")) });
  }

  // Not JSON, or not an object.
  add({ name: "invalid-yaml", description: "The build spec 1.1 layout written as YAML, not JSON.", text: YAML_LIKE, expect: bad(iss(BLOCK_PATH, "json")) });
  add({ name: "invalid-json", description: "Truncated JSON.", text: JSON.stringify(minimalBlock()).slice(0, 60), expect: bad(iss(BLOCK_PATH, "json")) });
  add({ name: "invalid-empty-text", description: "An empty fence.", text: "", expect: bad(iss(BLOCK_PATH, "json")) });
  add({ name: "invalid-json-array", description: "A JSON array instead of one object.", text: JSON.stringify([minimalBlock()]), expect: bad(iss(BLOCK_PATH, "invalid_type")) });
  add({ name: "invalid-json-null", description: "JSON null.", text: "null", expect: bad(iss(BLOCK_PATH, "invalid_type")) });
  {
    const min = JSON.stringify(minimalBlock());
    add({ name: "invalid-duplicate-key", description: "platform given twice (JSON.parse would keep the last silently).", text: min.replace('"platform":"claude"', '"platform":"claude","platform":"hark"'), expect: bad(iss("platform", "duplicate_key")) });
    const agent = JSON.stringify(withAgents([defaultAgent("Inbox", { autonomy: "approve" })]));
    add({ name: "invalid-duplicate-key-nested", description: "An agent's autonomy given twice.", text: agent.replace('"autonomy":"approve"', '"autonomy":"approve","autonomy":"own"'), expect: bad(iss("inventory.agents[0].autonomy", "duplicate_key")) });
  }

  // Top-level fields.
  add({ name: "invalid-zack-version-2.0", description: "zack_version 2.0 (contract v1 is Zack 2.1's).", block: { ...minimalBlock(), zack_version: "2.0" }, expect: bad(iss("zack_version", "invalid_value")) });
  add({ name: "invalid-zack-version-number", description: "zack_version as the number 2.1, not the string.", block: { ...minimalBlock(), zack_version: 2.1 }, expect: bad(iss("zack_version", "invalid_value")) });
  {
    const { platform: _platform, ...rest } = minimalBlock();
    void _platform;
    add({ name: "invalid-missing-platform", description: "No platform.", block: rest, expect: bad(iss("platform", "missing")) });
  }
  add({ name: "invalid-unknown-platform", description: "A platform that isn't one of Zack's agents or other.", block: { ...minimalBlock(), platform: "openclaw" }, expect: bad(iss("platform", "invalid_value")) });
  add({ name: "invalid-null-inventory", description: "inventory is null.", block: { ...minimalBlock(), inventory: null }, expect: bad(iss("inventory", "invalid_type")) });
  {
    const b = clone(minimalBlock()) as unknown as { activity_7d: Record<string, unknown> };
    delete b.activity_7d.voice_inputs;
    add({ name: "invalid-missing-count", description: "activity_7d without voice_inputs.", block: b, expect: bad(iss("activity_7d.voice_inputs", "missing")) });
  }

  // Counts.
  add({ name: "invalid-count-negative", description: "A negative count.", block: levelBlock({ activity_7d: { proactive_starts: -1 } }), expect: bad(iss("activity_7d.proactive_starts", "too_small")) });
  add({ name: "invalid-count-over", description: `A count of ${L.count + 1}.`, block: levelBlock({ history_flags: { usage_cuts: L.count + 1 } }), expect: bad(iss("history_flags.usage_cuts", "too_big")) });
  add({ name: "invalid-count-fraction", description: "A count of 1.5.", block: levelBlock({ inventory: { scripts: 1.5 } }), expect: bad(iss("inventory.scripts", "invalid_type")) });
  add({ name: "invalid-count-string", description: 'A count given as the string "3".', block: levelBlock({ activity_7d: { active_days: "3" as unknown as number } }), expect: bad(iss("activity_7d.active_days", "invalid_type")) });
  add({ name: "invalid-active-days-over-7", description: "active_days of 8 in a 7-day window.", block: levelBlock({ activity_7d: { active_days: 8 } }), expect: bad(iss("activity_7d.active_days", "too_big")) });

  // Strings and enums.
  add({ name: "invalid-string-too-long", description: `An agent name of ${L.string + 1} characters.`, block: withAgents([defaultAgent("A".repeat(L.string + 1))]), expect: bad(iss("inventory.agents[0].name", "too_big")) });
  add({ name: "invalid-empty-name", description: "An agent with an empty name.", block: withAgents([defaultAgent("")]), expect: bad(iss("inventory.agents[0].name", "too_small")) });
  add({ name: "invalid-unknown-cadence", description: 'A routine cadence of "fortnightly".', block: withRoutines([defaultRoutine("Digest", { cadence: "fortnightly" as never })]), expect: bad(iss("inventory.routines[0].cadence", "invalid_value")) });
  add({
    name: "invalid-away-rule-in-has",
    description: "away_rule written inside has, as build spec 1.1 lays it out; v1 makes it its own field.",
    block: withRoutines([defaultRoutine("Digest", { has: ["receipt", "away_rule: allow" as never] })]),
    expect: bad(iss("inventory.routines[0].has[1]", "invalid_value")),
  });
  add({ name: "invalid-unknown-rule", description: "An agent rule that isn't on the list.", block: withAgents([defaultAgent("Inbox", { rules: ["be_nice" as never] })]), expect: bad(iss("inventory.agents[0].rules[0]", "invalid_value")) });
  add({ name: "invalid-unknown-stage", description: "A domain stage that isn't on the list.", block: levelBlock({ domains: [defaultDomain("Money", { stages_covered: ["billing" as never] })] }), expect: bad(iss("domains[0].stages_covered[0]", "invalid_value")) });
  add({ name: "invalid-connections-not-list", description: "connections as one string.", block: withAgents([{ ...defaultAgent("Inbox"), connections: "Gmail" as never }]), expect: bad(iss("inventory.agents[0].connections", "invalid_type")) });

  // Dates.
  add({ name: "invalid-date-before-2020", description: "An agent created 2019-12-31.", block: withAgents([defaultAgent("Inbox", { created: "2019-12-31" })]), expect: bad(iss("inventory.agents[0].created", "date_out_of_range")) });
  add({ name: "invalid-date-after-receipt", description: "A routine last run two days after receipt.", block: withRoutines([defaultRoutine("Digest", { last_run: addDays(on, 2) })]), expect: bad(iss("inventory.routines[0].last_run", "date_out_of_range")) });
  add({ name: "invalid-date-not-iso", description: "A date written 27/11/2026.", block: levelBlock({ inventory: { memory_last_cleanup: "27/11/2026" } }), expect: bad(iss("inventory.memory_last_cleanup", "invalid_format")) });
  add({ name: "invalid-date-impossible", description: "A self-report dated 2026-02-30.", block: levelBlock({ self_report: [{ item: "1.04", answer: 1, date: "2026-02-30" }] }), expect: bad(iss("self_report[0].date", "invalid_format")) });

  // Links and item IDs.
  add({ name: "invalid-owner-agent-absent", description: "A routine whose owner_agent names no agent in the block.", block: withRoutines([defaultRoutine("Digest", { owner_agent: "Ghost" })], [defaultAgent("Inbox")]), expect: bad(iss("inventory.routines[0].owner_agent", "unknown_reference")) });
  add({
    name: "invalid-used-by-absent",
    description: "A skill used_by a name that is neither an agent nor a routine in the block.",
    block: levelBlock({ inventory: { agents: [defaultAgent("Inbox")], skills: [defaultSkill("Triage", { used_by: ["Inbox", "Ghost"] })] } }),
    expect: bad(iss("inventory.skills[0].used_by[1]", "unknown_reference")),
  });
  add({ name: "invalid-duplicate-agent-name", description: "Two agents with the same name.", block: withAgents([defaultAgent("Inbox"), defaultAgent("Inbox")]), expect: bad(iss("inventory.agents[1].name", "duplicate")) });
  add({ name: "invalid-duplicate-routine-name", description: "Two routines with the same name.", block: withRoutines([defaultRoutine("Digest"), defaultRoutine("Digest")]), expect: bad(iss("inventory.routines[1].name", "duplicate")) });
  add({ name: "invalid-self-report-item-shape", description: 'A self-report for item "10.01" (not an item ID shape).', block: levelBlock({ self_report: [{ item: "10.01", answer: 1, date: on }] }), expect: bad(iss("self_report[0].item", "invalid_format")) });
  add({ name: "invalid-self-report-item-unknown", description: 'A self-report for item "1.99" (the right shape, but no such item).', block: levelBlock({ self_report: [{ item: "1.99", answer: 1, date: on }] }), expect: bad(iss("self_report[0].item", "unknown_item")) });
  add({ name: "invalid-self-report-answer", description: "A self-report answer of 2.", block: levelBlock({ self_report: [{ item: "1.04", answer: 2 as never, date: on }] }), expect: bad(iss("self_report[0].answer", "invalid_union")) });
  return cases;
}

// ---------------------------------------------------------------------------
// Level fixtures (Unit 2): blocks that put a member at each level and boundary
// ---------------------------------------------------------------------------

/** A block plus the Roger facts some items read. */
export type LevelDraft = { block: LevelBlockV1; roger: Record<RogerFact, number>; on: string };

function newDraft(on: string): LevelDraft {
  return { block: minimalBlock(), roger: { ...NO_ROGER_FACTS }, on };
}

function contextOf(d: LevelDraft): CheckContext {
  const evidence = minimise(d.block);
  const answers = new Map(evidence.self_report.map((r) => [r.item, { answer: r.answer, date: r.date }]));
  return { evidence, on: d.on, previous: null, roger: d.roger, selfReport: (id) => answers.get(id) ?? null, rules: LEVEL_RULES };
}

type El = Record<string, unknown>;
function listOf(d: LevelDraft, c: LevelCollection): El[] {
  return (c === "domains" ? d.block.domains : d.block.inventory[c]) as unknown as El[];
}
function addElement(d: LevelDraft, c: LevelCollection): El {
  const list = listOf(d, c);
  const el =
    c === "agents"
      ? defaultAgent(`Agent ${list.length + 1}`)
      : c === "routines"
        ? defaultRoutine(`Routine ${list.length + 1}`)
        : c === "skills"
          ? defaultSkill(`Skill ${list.length + 1}`)
          : defaultDomain(`Domain ${list.length + 1}`);
  list.push(el as unknown as El);
  return el as unknown as El;
}
/** Whether `where` holds for element i, through the real interpreter (a `some` over a copy holding only that element). */
function predHolds(d: LevelDraft, c: LevelCollection, i: number, where: LevelPred): boolean {
  const copy = clone(d);
  const list = listOf(copy, c);
  const el = list[i];
  list.length = 0;
  list.push(el);
  return evaluateCheck({ kind: "some", collection: c, where }, contextOf(copy), "");
}

function pushOnce(el: El, field: string, value: string) {
  const list = (el[field] as string[]) ?? [];
  if (!list.includes(value)) list.push(value);
  el[field] = list;
}

/** Changes `el` (an element of collection `c`) so that `where` holds for it. */
function satisfy(d: LevelDraft, c: LevelCollection, el: El, where: LevelPred): void {
  switch (where.op) {
    case "has":
      return pushOnce(el, where.field, where.value);
    case "has_all":
      return where.values.forEach((v) => pushOnce(el, where.field, v));
    case "eq":
      if (c === "agents" && where.field === "has_job_sentence") {
        el.job_sentence = where.value ? `${String(el.name)} owns one job.` : "";
        return;
      }
      el[where.field] = where.value;
      return;
    case "in":
      if (!where.values.includes(el[where.field] as string)) el[where.field] = where.values[0];
      return;
    case "gte":
      if (c === "agents" && where.field === "distinct_connections") {
        const conns = el.connections as string[];
        for (let k = 1; new Set(conns.map((x) => x.toLowerCase())).size < where.min; k++) pushOnce(el, "connections", `${String(el.name)} source ${k}`);
        return;
      }
      el[where.field] = Math.max(Number(el[where.field] ?? 0), where.min);
      return;
    case "non_empty":
      if (c === "agents" && where.field === "needs_own") return pushOnce(el, "needs_own", "routines");
      if (c === "skills" && where.field === "used_by_agents") {
        const a = d.block.inventory.agents[0] ?? (addElement(d, "agents") as unknown as Agent);
        return pushOnce(el, "used_by", a.name);
      }
      if (c === "skills" && where.field === "used_by_routines") {
        const r = d.block.inventory.routines[0] ?? (addElement(d, "routines") as unknown as Routine);
        return pushOnce(el, "used_by", r.name);
      }
      throw new Error(`fixtures: can't make ${c}.${where.field} non-empty`);
    case "inside_cadence":
      el.last_run = d.on;
      return;
    case "within_weeks":
      el[where.field] = d.on;
      return;
    case "owner_role": {
      const host = d.block.inventory.agents.find((a) => a.role === where.role) ?? (addElement(d, "agents") as unknown as Agent);
      host.role = where.role as Agent["role"];
      el.owner_agent = host.name;
      return;
    }
    case "not":
      if (where.pred.op === "holds_every_service" && c === "agents") return pushOnce(el, "connections", `${String(el.name)} only`);
      throw new Error(`fixtures: can't satisfy not(${where.pred.op})`);
    case "all_of":
      return where.preds.forEach((q) => satisfy(d, c, el, q));
    case "any_of":
      return satisfy(d, c, el, where.preds[0]);
    case "holds_every_service":
      throw new Error("fixtures: can't satisfy holds_every_service");
  }
}

function hasChange(check: LevelCheck): boolean {
  return check.kind === "changed_between_runs" || ((check.kind === "all_of" || check.kind === "any_of") && check.checks.some(hasChange));
}

/** Adds the least evidence that makes `check` hold; `every` checks are deferred to the end, after all elements exist. */
function witness(d: LevelDraft, check: LevelCheck, itemId: string, deferred: LevelCheck[]): void {
  if (check.kind !== "every" && check.kind !== "all_of" && evaluateCheck(check, contextOf(d), itemId)) return;
  switch (check.kind) {
    case "valid_block":
      return;
    case "count_at_least": {
      const arrays: Record<string, LevelCollection> = { "inventory.agents": "agents", "inventory.routines": "routines", "inventory.skills": "skills", domains: "domains" };
      if (arrays[check.path]) {
        while (listOf(d, arrays[check.path]).length < check.min) addElement(d, arrays[check.path]);
        return;
      }
      if (check.path === "inventory.distinct_services") {
        const a = d.block.inventory.agents[0] ?? (addElement(d, "agents") as unknown as Agent);
        for (let k = 1; minimise(d.block).inventory.distinct_services < check.min; k++) pushOnce(a as unknown as El, "connections", `Service ${k}`);
        return;
      }
      if (check.path === "inventory.distinct_models") {
        for (let k = 1; minimise(d.block).inventory.distinct_models < check.min; k++) pushOnce(d.block.inventory as unknown as El, "models_used", `Model ${k}`);
        return;
      }
      const keys = check.path.split(".");
      let o = d.block as unknown as El;
      for (const k of keys.slice(0, -1)) o = o[k] as El;
      const last = keys[keys.length - 1];
      o[last] = Math.max(Number(o[last]), check.min);
      return;
    }
    case "some":
      return satisfy(d, check.collection, addElement(d, check.collection), check.where);
    case "count_where": {
      const list = listOf(d, check.collection);
      let have = list.filter((_, i) => predHolds(d, check.collection, i, check.where)).length;
      for (; have < check.min; have++) satisfy(d, check.collection, addElement(d, check.collection), check.where);
      return;
    }
    case "every":
      deferred.push(check);
      return;
    case "memory_has":
      return pushOnce(d.block.inventory as unknown as El, "memory", check.any[0]);
    case "within_weeks":
      d.block.inventory.memory_last_cleanup = d.on;
      return;
    case "span_weeks": {
      while (listOf(d, check.collection).length < 2) addElement(d, check.collection);
      const list = listOf(d, check.collection);
      list[0][check.field] = addDays(d.on, -7 * (check.weeks + 1));
      list[1][check.field] = d.on;
      return;
    }
    case "changed_between_runs":
      throw new Error(`fixtures: ${itemId} needs a previous run (${check.change})`);
    case "roger":
      d.roger[check.fact] = Math.max(d.roger[check.fact], check.min);
      return;
    case "self_report":
      d.block.self_report = d.block.self_report.filter((r) => r.item !== itemId);
      d.block.self_report.push({ item: itemId, answer: 1, date: d.on });
      return;
    case "all_of":
      return check.checks.forEach((c) => witness(d, c, itemId, deferred));
    case "any_of": {
      const first = check.checks.find((c) => !hasChange(c)) ?? check.checks[0];
      return witness(d, first, itemId, deferred);
    }
  }
}

function applyEvery(d: LevelDraft, check: Extract<LevelCheck, { kind: "every" }>): void {
  const list = listOf(d, check.collection);
  const matching = () => list.map((_, i) => i).filter((i) => !check.among || predHolds(d, check.collection, i, check.among));
  if (check.nonEmpty && matching().length === 0) {
    const el = addElement(d, check.collection);
    if (check.among) satisfy(d, check.collection, el, check.among);
  }
  for (const i of matching()) satisfy(d, check.collection, list[i], check.where);
}

const ITEM = new Map(levelItems.map((i) => [i.id, i]));

export type BuiltLevelBlock = { block: LevelBlockV1; roger: RogerFacts; receivedOn: string };

/** The least evidence (a valid contract v1 block, plus Roger facts) that makes each of `ids` live. */
export function blockForItems(ids: readonly string[], o: { on?: string; platform?: LevelPlatform; selfReportOnly?: readonly string[] } = {}): BuiltLevelBlock {
  return blockForChecks(
    ids.map((id) => {
      const item = ITEM.get(id);
      if (!item) throw new Error(`fixtures: unknown item ${id}`);
      return { id, check: item.check };
    }),
    o,
  );
}

/** The least evidence that makes each check hold (`id` answers its self-report parts). */
export function blockForChecks(entries: readonly { id: string; check: LevelCheck }[], o: { on?: string; platform?: LevelPlatform; selfReportOnly?: readonly string[] } = {}): BuiltLevelBlock {
  const d = newDraft(o.on ?? FIXTURE_RECEIVED_ON);
  d.block.platform = o.platform ?? "claude";
  const deferred: LevelCheck[] = [];
  for (const e of entries) witness(d, e.check, e.id, deferred);
  // Every-checks last, three rounds, so elements added by one (a connection) are covered by another (untrusted content).
  for (let round = 0; round < 3; round++) for (const c of deferred) applyEvery(d, c as Extract<LevelCheck, { kind: "every" }>);
  for (const id of o.selfReportOnly ?? []) {
    d.block.self_report = d.block.self_report.filter((r) => r.item !== id);
    d.block.self_report.push({ item: id, answer: 1, date: d.on });
  }
  d.block.self_report.sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
  return { block: d.block, roger: d.roger, receivedOn: d.on };
}

export type FixtureScore = { level: number; live: string[]; verifiedCoreByLevel: number[] };

/**
 * The fixtures' own oracle: every item over this one submission, then rule 2.3
 * with rule 2.1's verified-core test and the fallback cap. Independent of the
 * engine (Unit 6), which must agree with it on every fixture.
 */
export function scoreBuilt(b: BuiltLevelBlock, items: readonly LevelItem[] = levelItems, rules = LEVEL_RULES): FixtureScore {
  const ctx = contextOf({ block: b.block, roger: { ...b.roger }, on: b.receivedOn });
  const state = new Map(items.map((it) => [it.id, evaluateItem(it, [ctx], ctx.selfReport(it.id))]));
  const verifiedCoreByLevel: number[] = [];
  let level = 0;
  let stillEarning = true;
  for (let k = 1; k <= 9; k++) {
    const of = items.filter((i) => i.level === k);
    const core = of.filter((i) => i.kind === "core");
    const verified = core.filter((i) => state.get(i.id)?.live && state.get(i.id)?.source !== "self").length;
    verifiedCoreByLevel.push(verified);
    const needed = electivesNeeded(of.filter((i) => i.kind === "elective").length, rules);
    const met = of.filter((i) => i.kind !== "core" && state.get(i.id)?.live);
    const fallbackMet = met.filter((i) => i.status === "fallback").length;
    const counted = met.length - fallbackMet + Math.min(fallbackMet, fallbackElectivesAllowed(needed, rules));
    const earned = core.every((i) => state.get(i.id)?.live) && counted >= needed && verified >= rules.minVerifiedCore;
    if (stillEarning && earned) level = k;
    else stillEarning = false;
  }
  const live = items.filter((i) => state.get(i.id)?.live).map((i) => i.id);
  return { level, live, verifiedCoreByLevel };
}

const itemsAt = (k: number) => levelItems.filter((i) => i.level === k);
const coreAt = (k: number) => itemsAt(k).filter((i) => i.kind === "core").map((i) => i.id);
const neededAt = (k: number) => electivesNeeded(itemsAt(k).filter((i) => i.kind === "elective").length);
const capAt = (k: number) => fallbackElectivesAllowed(neededAt(k));
const STATUS_ORDER = { full: 0, proxy: 1, self: 2, fallback: 3 } as const;
/** A level's electives in the order fixtures use them: Zack-settled first, then self, then fallback; standard before design. */
const electivesAt = (k: number) =>
  itemsAt(k)
    .filter((i) => i.kind !== "core")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.kind === b.kind ? 0 : a.kind === "elective" ? -1 : 1));

/** The needed electives of level k: non-fallback first, fallback only up to the cap. */
function chosenElectives(k: number, count = neededAt(k), fallbackMax = capAt(k)): string[] {
  const all = electivesAt(k);
  const non = all.filter((i) => i.status !== "fallback").slice(0, count);
  const fb = all.filter((i) => i.status === "fallback").slice(0, Math.min(fallbackMax, count - non.length));
  const picked = [...non, ...fb].map((i) => i.id);
  if (picked.length < count) throw new Error(`fixtures: level ${k} can't reach ${count} electives`);
  return picked;
}

/** Every core item and exactly the needed electives of levels 1..L. */
export function itemsForLevel(L: number): string[] {
  const ids: string[] = [];
  for (let k = 1; k <= L; k++) ids.push(...coreAt(k), ...chosenElectives(k));
  return ids;
}

/** The least evidence that puts a member at level L (0 to 9). */
export function blockForLevel(L: number): BuiltLevelBlock {
  return blockForItems(itemsForLevel(L));
}

export type LevelFixture = {
  name: string;
  description: string;
  receivedOn: string;
  roger: RogerFacts;
  expect: FixtureScore;
  block: LevelBlockV1;
};

function fixture(name: string, description: string, b: BuiltLevelBlock, expectLevel: number, extra?: (s: FixtureScore) => string | null): LevelFixture {
  const score = scoreBuilt(b);
  if (score.level !== expectLevel) throw new Error(`fixtures: ${name} scores ${score.level}, not ${expectLevel}`);
  const problem = extra?.(score);
  if (problem) throw new Error(`fixtures: ${name}: ${problem}`);
  return { name, description, receivedOn: b.receivedOn, roger: b.roger, expect: score, block: b.block };
}

/** Every level fixture: level-0 to level-9, and each boundary. */
export function levelFixtures(): LevelFixture[] {
  const out: LevelFixture[] = [];
  for (let L = 0; L <= 9; L++) {
    const description = L === 0 ? "A minimal valid block and nothing else: Level 0." : `Every core item and the needed electives of Levels 1 to ${L}, and no more evidence than that: Level ${L}.`;
    out.push(fixture(`level-${L}`, description, blockForLevel(L), L));
  }
  for (let L = 1; L <= 9; L++) {
    const base = itemsForLevel(L);
    // Missing one core item of L: Zack-verified ones first.
    const candidates = itemsAt(L)
      .filter((i) => i.kind === "core")
      .sort((a, b) => (a.status === "self" ? 1 : 0) - (b.status === "self" ? 1 : 0));
    let missing: LevelFixture | null = null;
    for (const c of candidates) {
      const b = blockForItems(base.filter((id) => id !== c.id));
      const s = scoreBuilt(b);
      if (s.level === L - 1 && !s.live.includes(c.id)) {
        missing = fixture(`level-${L}-missing-core`, `Level ${L}'s evidence without core item ${c.id}: scores ${L - 1}.`, b, L - 1);
        break;
      }
    }
    if (!missing) throw new Error(`fixtures: no core item of level ${L} can be left out`);
    out.push(missing);

    // One elective short of the 70% at L. Some electives come live as a side effect of lower levels'
    // evidence (4.14's usage cut is also 6.12), so chosen ones are left out, last first, until the
    // count drops to one below what is needed.
    const chosen = chosenElectives(L);
    const dropped: string[] = [];
    let short: LevelFixture | null = null;
    for (const drop of [...chosen].reverse()) {
      dropped.push(drop);
      const b = blockForItems(base.filter((id) => !dropped.includes(id)));
      if (scoreBuilt(b).level === L - 1) {
        short = fixture(
          `level-${L}-elective-short`,
          `Level ${L}'s evidence with one elective fewer than the ${neededAt(L)} needed (${dropped.join(", ")} left out): scores ${L - 1}.`,
          b,
          L - 1,
        );
        break;
      }
    }
    if (!short) throw new Error(`fixtures: level ${L} can't be made one elective short`);
    out.push(short);

    // Every item of L claimed by self-report, with no Zack evidence added for L: a self-report can't stand in
    // for a Zack- or Roger-settled item, so L's verified core items stay 0 (except those lower levels' evidence
    // already shows) and it scores L - 1. With the real data every level has at least 3 verified core items,
    // so "all core live, fewer than 3 verified" can only be built with injected items (the engine's tests, Unit 6).
    const zackCore = itemsAt(L).filter((i) => i.kind === "core" && i.status !== "self" && i.status !== "fallback");
    out.push(
      fixture(
        `level-${L}-self-only-core`,
        `Level ${L - 1}'s evidence, plus a self-report of 1 for every item of Level ${L} and no Zack or Roger evidence added for it: self-reports don't settle Level ${L}'s ${zackCore.length} Zack- or Roger-settled core items, so it scores ${L - 1}.`,
        blockForItems(itemsForLevel(L - 1), { selfReportOnly: itemsAt(L).map((i) => i.id) }),
        L - 1,
        (s) =>
          !itemsAt(L).every((i) => i.kind !== "core" || i.status === "full" || i.status === "proxy" || s.live.includes(i.id))
            ? `a self-settled core item of level ${L} isn't live`
            : zackCore.every((i) => s.live.includes(i.id))
              ? `every Zack-settled core item of level ${L} is live`
              : null,
      ),
    );

    // Over the fallback cap: the raw count meets the 70%, but only the cap's worth of fallback answers counts.
    const fallbackElectives = electivesAt(L).filter((i) => i.status === "fallback");
    if (fallbackElectives.length > capAt(L)) {
      const non = chosenElectives(L, neededAt(L) - capAt(L) - 1, 0);
      const fb = fallbackElectives.slice(0, capAt(L) + 1).map((i) => i.id);
      const ids = [...base.filter((id) => !chosen.includes(id)), ...non, ...fb];
      out.push(
        fixture(
          `level-${L}-over-fallback-cap`,
          `Level ${L}'s core, ${non.length} Zack-settled or self electives and ${fb.length} fallback answers: ${neededAt(L)} electives met, but fallback counts for at most ${capAt(L)}, so it scores ${L - 1}.`,
          blockForItems(ids),
          L - 1,
        ),
      );
    }
  }
  return out;
}

/** A fixture file's text: two-space JSON, keys in the builder's fixed order, LF endings, a final newline. */
export function fixtureText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
