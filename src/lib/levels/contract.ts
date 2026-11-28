import { z } from "zod";
import { LEVEL_ITEM_IDS } from "@/data/roger-levels";

/**
 * The `roger-level` block, contract version 1 (B4 Unit 1).
 *
 * Build spec 1.1 ("Roger Levels Build Spec - Zack 2.1, Cora 2.1 and Dashboard
 * v1.2.md") frozen as JSON: one object per block, fenced ```roger-level, inside
 * the private profile, with `zack_version: "2.1"`. The keys and nesting are the
 * build spec's; what it left loose is fixed here and explained, for whoever
 * writes Zack 2.1, in "artifacts/Roger Level Block Contract v1.md".
 *
 * FROZEN. `contract.test.ts` snapshots `z.toJSONSchema(levelBlockV1)`, so any
 * change to this shape fails a test. A Zack that emits another layout gets a
 * new schema (`levelBlockV2`) and a new version number, never an edit to v1.
 *
 * Strict: a block that fails anywhere is rejected whole (the profile it came
 * with is never affected). Unknown keys are not an error, and are dropped.
 * Issues name paths and codes only, never a value from the block.
 */
export const LEVEL_CONTRACT_VERSION = 1 as const;
/** The Zack version that emits contract v1. */
export const LEVEL_ZACK_VERSION = "2.1" as const;

export const LEVEL_LIMITS = {
  /** The block's text, in characters (UTF-16 code units), checked before parsing. The whole report is already capped at 80,000. */
  blockChars: 30_000,
  /** Every count is an integer from 0 to this. */
  count: 10_000,
  /** Every string (names, labels, the job sentence). */
  string: 120,
  agents: 60,
  routines: 200,
  skills: 200,
  connectionsPerAgent: 40,
  modelsUsed: 20,
  /** A skill's `used_by` names. */
  usedBy: 40,
  selfReport: 160,
  domains: 12,
  /** Any list of enum values (`fields_present`, `rules`, `has`, `memory`, …). */
  enumList: 20,
  /** The earliest date accepted anywhere in the block. The latest is the receipt date + 1 day. */
  earliestDate: "2020-01-01",
  /** At most this many issues are reported for one rejected block. */
  issues: 20,
} as const;

/** The agent account's platform: one of Zack's agents, or `other`. */
export const LEVEL_PLATFORMS = ["claude", "grok-bot", "hark", "duet", "other"] as const;
export const AGENT_FIELDS = ["owns", "inputs", "may", "must_ask", "done_when"] as const;
export const AUTONOMY_LEVELS = ["observe", "prepare", "approve", "schedule", "coordinate", "own"] as const;
/** `installed` = from a marketplace, a colleague or a Roger idea. */
export const CREATED_BY = ["me", "system", "installed"] as const;
export const AGENT_RULES = [
  "do_ask_stop",
  "stop_when_unsure",
  "untrusted_content",
  "no_raw_errors",
  "usage_rules",
  "rules_in_description",
  "general_rule_on_correction",
  "fetch_live_facts",
  "loop_cap",
] as const;
export const AGENT_ROLES = ["chat", "routines_only", "catch_all", "coordinator", "checker", "specialist"] as const;
export const AGENT_NEEDS = ["routines", "logins", "private_context", "channel"] as const;
export const ROUTINE_TRIGGERS = ["schedule", "event"] as const;
/** An enum, not free text: items 4.09 and 4.17 compare cadences. */
export const CADENCES = ["hourly", "several_daily", "daily", "weekdays", "weekly", "monthly", "other"] as const;
/** Build spec 1.1 lists `away_rule` inside `has`; v1 makes it its own field on the routine. */
export const ROUTINE_HAS = ["receipt", "nothing_today_rule", "source_check", "retry_limit", "end_condition", "change_check", "verify_checklist"] as const;
export const AWAY_RULES = ["allow", "draft", "none"] as const;
export const EVENT_SCOPES = ["narrow", "broad"] as const;
export const DELIVERS_TO = ["app", "phone", "email", "text", "slack", "page"] as const;
export const SKILL_ORIGINS = ["me", "system", "installed"] as const;
export const MEMORY_KINDS = ["instructions", "profile_file", "project_pages", "decisions_log", "knowledge_base"] as const;
export const DOMAIN_KINDS = ["work", "home"] as const;
export const DOMAIN_STAGES = ["intake", "work", "delivery", "follow_up"] as const;

export type LevelPlatform = (typeof LEVEL_PLATFORMS)[number];
export type AgentField = (typeof AGENT_FIELDS)[number];
export type Autonomy = (typeof AUTONOMY_LEVELS)[number];
export type CreatedBy = (typeof CREATED_BY)[number];
export type AgentRule = (typeof AGENT_RULES)[number];
export type AgentRole = (typeof AGENT_ROLES)[number];
export type AgentNeed = (typeof AGENT_NEEDS)[number];
export type RoutineTrigger = (typeof ROUTINE_TRIGGERS)[number];
export type Cadence = (typeof CADENCES)[number];
export type RoutineHas = (typeof ROUTINE_HAS)[number];
export type AwayRule = (typeof AWAY_RULES)[number];
export type EventScope = (typeof EVENT_SCOPES)[number];
export type DeliversTo = (typeof DELIVERS_TO)[number];
export type SkillOrigin = (typeof SKILL_ORIGINS)[number];
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type DomainKind = (typeof DOMAIN_KINDS)[number];
export type DomainStage = (typeof DOMAIN_STAGES)[number];

/** The shape of an item ID (`4.01`, `1.D1`). Membership in the data file is checked after the schema. */
export const ITEM_ID_PATTERN = /^[1-9]\.(\d{2}|D\d)$/;

const L = LEVEL_LIMITS;
const count = z.number().int().min(0).max(L.count);
const name = z.string().min(1).max(L.string);
const label = z.string().min(1).max(L.string);
const date = z.iso.date();
const enumList = <T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values)).max(L.enumList);

const agentV1 = z.object({
  name,
  /** One sentence stating the agent's job; "" when it has none. Never stored. */
  job_sentence: z.string().max(L.string),
  fields_present: enumList(AGENT_FIELDS),
  autonomy: z.enum(AUTONOMY_LEVELS),
  /** Service names only (Z2). Reduced to counts at intake; no label is stored. */
  connections: z.array(label).max(L.connectionsPerAgent),
  /** null when Zack can't see the creation date. */
  created: date.nullable(),
  created_by: z.enum(CREATED_BY),
  rules: enumList(AGENT_RULES),
  role: z.enum(AGENT_ROLES),
  needs_own: enumList(AGENT_NEEDS),
});

const routineV1 = z.object({
  name,
  /** The `name` of the agent that hosts it (Z7); null when it runs on the account itself. */
  owner_agent: name.nullable(),
  trigger: z.enum(ROUTINE_TRIGGERS),
  /** For an event trigger: how often it typically fires, or `other`. */
  cadence: z.enum(CADENCES),
  /** null when it has never run. */
  last_run: date.nullable(),
  has: enumList(ROUTINE_HAS),
  away_rule: z.enum(AWAY_RULES),
  /** null unless the trigger is `event`. */
  event_scope: z.enum(EVENT_SCOPES).nullable(),
  delivers_to: z.enum(DELIVERS_TO),
});

const skillV1 = z.object({
  name,
  origin: z.enum(SKILL_ORIGINS),
  /** Names of agents or routines in this block that use the skill. */
  used_by: z.array(name).max(L.usedBy),
});

const selfReportV1 = z.object({
  item: z.string().regex(ITEM_ID_PATTERN),
  answer: z.union([z.literal(0), z.literal(1)]),
  date,
});

const domainV1 = z.object({
  name,
  kind: z.enum(DOMAIN_KINDS),
  stages_covered: enumList(DOMAIN_STAGES),
});

export const levelBlockV1 = z.object({
  zack_version: z.literal(LEVEL_ZACK_VERSION),
  platform: z.enum(LEVEL_PLATFORMS),
  inventory: z.object({
    agents: z.array(agentV1).max(L.agents),
    routines: z.array(routineV1).max(L.routines),
    skills: z.array(skillV1).max(L.skills),
    memory: enumList(MEMORY_KINDS),
    memory_last_cleanup: z.union([date, z.literal("none")]),
    pages_dashboards: count,
    models_used: z.array(label).max(L.modelsUsed),
    scripts: count,
  }),
  /** The agent account's own work in the 7 days before the run, excluding Zack's own run. */
  activity_7d: z.object({
    active_days: z.number().int().min(0).max(7),
    multi_step_completions: count,
    agent_to_agent_handoffs: count,
    proactive_starts: count,
    voice_inputs: count,
    approvals: z.object({ parked: count, approved: count, batched: count, sent_after_approval: count }),
    exceptions_escalated: count,
    others_served_directly: count,
    browser_only_tasks: count,
    /** Messages in the longest chat. */
    longest_chat_size: count,
    chat_resets: count,
    verify_reports: z.object({ pass: count, fail: count }),
    self_change_proposals: z.object({ proposed: count, adopted: count }),
    design_activity: z.object({ directions_generated: count, iterations: count, playground_built: count, screenshot_check: count }),
  }),
  /** Counts of events since the previous Zack run (not running totals). */
  history_flags: z.object({
    promotions: count,
    demotions: count,
    retirements: count,
    rule_fixes_after_error: count,
    usage_cuts: count,
    access_reviews: count,
  }),
  self_report: z.array(selfReportV1).max(L.selfReport),
  domains: z.array(domainV1).max(L.domains),
});

export type LevelBlockV1 = z.output<typeof levelBlockV1>;

/** Why a block was rejected: a path into the block and a code, never a value. */
export type LevelIssue = { path: string; code: LevelIssueCode };
export type LevelIssueCode =
  | "size"
  | "json"
  | "missing"
  | "invalid_type"
  | "invalid_value"
  | "invalid_format"
  | "invalid_union"
  | "too_big"
  | "too_small"
  | "date_out_of_range"
  | "duplicate"
  | "duplicate_key"
  | "unknown_reference"
  | "unknown_item"
  | "invalid";

export type LevelValidation = { ok: true; block: LevelBlockV1 } | { ok: false; issues: LevelIssue[] };

/** The path the whole block is reported under. */
export const BLOCK_PATH = "(block)";
/** The path an impossible receipt date is reported under (a caller's value, not the block's). */
export const RECEIVED_ON_PATH = "(received_on)";

function pathString(path: readonly PropertyKey[]): string {
  let s = "";
  for (const p of path) s += typeof p === "number" ? `[${p}]` : s === "" ? String(p) : `.${String(p)}`;
  return s === "" ? BLOCK_PATH : s;
}

function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let v: unknown = root;
  for (const p of path) {
    if (v === null || typeof v !== "object") return undefined;
    v = (v as Record<PropertyKey, unknown>)[p];
  }
  return v;
}

const ZOD_CODES = new Set<string>(["invalid_type", "invalid_value", "invalid_format", "invalid_union", "too_big", "too_small"]);

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ITEM_IDS: ReadonlySet<string> = new Set(LEVEL_ITEM_IDS);

/** The checks a JSON Schema can't express: date bounds, unique names, links, known item IDs. */
function crossCheck(block: LevelBlockV1, receivedOn: string): LevelIssue[] {
  const issues: LevelIssue[] = [];
  const latest = addDays(receivedOn, 1);
  const checkDate = (path: string, d: string | null) => {
    if (d !== null && d !== "none" && (d < L.earliestDate || d > latest)) issues.push({ path, code: "date_out_of_range" });
  };
  const { agents, routines, skills } = block.inventory;
  const agentNames = new Set<string>();
  agents.forEach((a, i) => {
    if (agentNames.has(a.name)) issues.push({ path: `inventory.agents[${i}].name`, code: "duplicate" });
    agentNames.add(a.name);
    checkDate(`inventory.agents[${i}].created`, a.created);
  });
  const routineNames = new Set<string>();
  routines.forEach((r, i) => {
    if (routineNames.has(r.name)) issues.push({ path: `inventory.routines[${i}].name`, code: "duplicate" });
    routineNames.add(r.name);
    if (r.owner_agent !== null && !agentNames.has(r.owner_agent)) issues.push({ path: `inventory.routines[${i}].owner_agent`, code: "unknown_reference" });
    checkDate(`inventory.routines[${i}].last_run`, r.last_run);
  });
  skills.forEach((s, i) =>
    s.used_by.forEach((u, j) => {
      if (!agentNames.has(u) && !routineNames.has(u)) issues.push({ path: `inventory.skills[${i}].used_by[${j}]`, code: "unknown_reference" });
    }),
  );
  checkDate("inventory.memory_last_cleanup", block.inventory.memory_last_cleanup);
  block.self_report.forEach((r, i) => {
    if (!ITEM_IDS.has(r.item)) issues.push({ path: `self_report[${i}].item`, code: "unknown_item" });
    checkDate(`self_report[${i}].date`, r.date);
  });
  return issues;
}

/**
 * Checks the receipt date: not YYYY-MM-DD at all is a caller bug (throws); a
 * well-formed but impossible date (2026-13-40, 2026-02-30) is an issue, so a
 * bad clock or input can't throw a RangeError out of intake.
 */
function receiptIssue(receivedOn: string): LevelValidation | null {
  if (!ISO_DATE.test(receivedOn)) throw new Error("parseLevelBlock: receivedOn must be YYYY-MM-DD");
  const t = Date.parse(`${receivedOn}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== receivedOn) return { ok: false, issues: [{ path: RECEIVED_ON_PATH, code: "invalid_format" }] };
  return null;
}

type Segment = string | number;

/**
 * The path of the first key repeated within one object, or null. `text` must
 * already be valid JSON (JSON.parse accepted it, keeping the last value
 * silently). Keys compare unescaped, as JSON.parse sees them.
 */
function duplicateKeyPath(text: string): Segment[] | null {
  type Frame = { obj: true; path: Segment[]; keys: Set<string>; key: string; expectKey: boolean } | { obj: false; path: Segment[]; index: number };
  const stack: Frame[] = [];
  const childPath = (): Segment[] => {
    const top = stack[stack.length - 1];
    if (!top) return [];
    return top.obj ? [...top.path, top.key] : [...top.path, top.index];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      const top = stack[stack.length - 1];
      if (top?.obj && top.expectKey) {
        const key = JSON.parse(text.slice(i, j + 1)) as string;
        if (top.keys.has(key)) return [...top.path, key];
        top.keys.add(key);
        top.key = key;
        top.expectKey = false;
      }
      i = j;
    } else if (c === "{") stack.push({ obj: true, path: childPath(), keys: new Set(), key: "", expectKey: true });
    else if (c === "[") stack.push({ obj: false, path: childPath(), index: 0 });
    else if (c === "}" || c === "]") stack.pop();
    else if (c === ",") {
      const top = stack[stack.length - 1];
      if (top?.obj) top.expectKey = true;
      else if (top) top.index++;
    }
  }
  return null;
}

let schemaKeyNames: ReadonlySet<string> | null = null;
/** Every property name in contract v1, built only when a duplicate key is found. */
function contractKeys(): ReadonlySet<string> {
  if (schemaKeyNames) return schemaKeyNames;
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.properties && typeof o.properties === "object") for (const k of Object.keys(o.properties)) out.add(k);
      Object.values(o).forEach(walk);
    }
  };
  walk(z.toJSONSchema(levelBlockV1));
  schemaKeyNames = out;
  return out;
}

/** A path cut before its first key that isn't a contract key, so no text from the block reaches an issue. */
function knownPrefix(path: readonly Segment[]): Segment[] {
  const keys = contractKeys();
  const out: Segment[] = [];
  for (const s of path) {
    if (typeof s === "string" && !keys.has(s)) break;
    out.push(s);
  }
  return out;
}

/**
 * Validates an already-parsed value against contract v1. `receivedOn` is the
 * receipt date (YYYY-MM-DD), the bound for every date in the block.
 */
export function parseLevelBlock(value: unknown, receivedOn: string): LevelValidation {
  const bad = receiptIssue(receivedOn);
  if (bad) return bad;
  const r = levelBlockV1.safeParse(value);
  if (!r.success) {
    const issues = r.error.issues.map((i): LevelIssue => {
      const missing = valueAt(value, i.path) === undefined;
      return { path: pathString(i.path), code: missing ? "missing" : ZOD_CODES.has(i.code) ? (i.code as LevelIssueCode) : "invalid" };
    });
    return { ok: false, issues: issues.slice(0, L.issues) };
  }
  const issues = crossCheck(r.data, receivedOn);
  return issues.length ? { ok: false, issues: issues.slice(0, L.issues) } : { ok: true, block: r.data };
}

/**
 * Validates the text of one `roger-level` block (the fence's contents): the
 * receipt date, the character limit before anything is parsed, then
 * `JSON.parse`, a repeated key in any object (JSON.parse would keep the last
 * one silently), then the schema and the cross-checks. A `__proto__` key is an
 * ordinary unknown key to JSON.parse and is dropped by the schema.
 */
export function validateLevelBlock(text: string, receivedOn: string): LevelValidation {
  const bad = receiptIssue(receivedOn);
  if (bad) return bad;
  if (text.length > L.blockChars) return { ok: false, issues: [{ path: BLOCK_PATH, code: "size" }] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, issues: [{ path: BLOCK_PATH, code: "json" }] };
  }
  const dup = duplicateKeyPath(text);
  if (dup) return { ok: false, issues: [{ path: pathString(knownPrefix(dup)), code: "duplicate_key" }] };
  return parseLevelBlock(value, receivedOn);
}

/** Issues as one line for a stored rejection reason ("path: code; …"), at most `max` characters. */
export function formatLevelIssues(issues: readonly LevelIssue[], max = 1_000): string {
  let s = "";
  for (const i of issues) {
    const part = `${s ? "; " : ""}${i.path}: ${i.code}`;
    if (s.length + part.length > max) break;
    s += part;
  }
  return s;
}
