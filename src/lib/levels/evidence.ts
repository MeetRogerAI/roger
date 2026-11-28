import type {
  AgentField,
  AgentNeed,
  AgentRole,
  AgentRule,
  Autonomy,
  AwayRule,
  Cadence,
  CreatedBy,
  DeliversTo,
  DomainKind,
  DomainStage,
  EventScope,
  LevelBlockV1,
  LevelPlatform,
  MemoryKind,
  RoutineHas,
  RoutineTrigger,
  SkillOrigin,
} from "@/lib/levels/contract";
import { LEVEL_CONTRACT_VERSION } from "@/lib/levels/contract";

/**
 * The minimised evidence a valid contract v1 block becomes: what the level
 * checks read, and nothing else. No free text survives: agent, routine, skill
 * and domain names, job sentences, connection labels and model names are used
 * only to resolve links and count distinct labels, then dropped. Links become
 * array positions. Every other key keeps the contract's name and place, so a
 * check's path is a contract path (see DERIVED_EVIDENCE_FIELDS for the rest).
 *
 * B4 Unit 2 builds this for the check vocabulary; Unit 5 stores it.
 */
export type AgentEvidence = {
  has_job_sentence: boolean;
  fields_present: AgentField[];
  autonomy: Autonomy;
  distinct_connections: number;
  created: string | null;
  created_by: CreatedBy;
  rules: AgentRule[];
  role: AgentRole;
  needs_own: AgentNeed[];
};
export type RoutineEvidence = {
  /** Position of the hosting agent in `inventory.agents`, or null. */
  owner: number | null;
  trigger: RoutineTrigger;
  cadence: Cadence;
  last_run: string | null;
  has: RoutineHas[];
  away_rule: AwayRule;
  event_scope: EventScope | null;
  delivers_to: DeliversTo;
};
export type SkillEvidence = { origin: SkillOrigin; used_by_agents: number[]; used_by_routines: number[] };
export type DomainEvidence = { kind: DomainKind; stages_covered: DomainStage[] };

export type LevelEvidence = {
  contract_version: typeof LEVEL_CONTRACT_VERSION;
  zack_version: LevelBlockV1["zack_version"];
  platform: LevelPlatform;
  inventory: {
    agents: AgentEvidence[];
    routines: RoutineEvidence[];
    skills: SkillEvidence[];
    memory: MemoryKind[];
    /** null for "none". */
    memory_last_cleanup: string | null;
    pages_dashboards: number;
    distinct_models: number;
    scripts: number;
    /** Distinct connection labels across all agents. */
    distinct_services: number;
  };
  activity_7d: LevelBlockV1["activity_7d"];
  history_flags: LevelBlockV1["history_flags"];
  /** One answer per item, the latest by date (a tie keeps the later entry). */
  self_report: LevelBlockV1["self_report"];
  domains: DomainEvidence[];
};

/** Evidence fields that aren't contract fields, and the contract fields they're computed from. */
export const DERIVED_EVIDENCE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "inventory.agents[].has_job_sentence": ["inventory.agents[].job_sentence"],
  "inventory.agents[].distinct_connections": ["inventory.agents[].connections"],
  "inventory.routines[].owner": ["inventory.routines[].owner_agent", "inventory.agents[].role"],
  "inventory.skills[].used_by_agents": ["inventory.skills[].used_by"],
  "inventory.skills[].used_by_routines": ["inventory.skills[].used_by"],
  "inventory.distinct_models": ["inventory.models_used"],
  "inventory.distinct_services": ["inventory.agents[].connections"],
};

/** Labels compare after Unicode normalisation, case folding and collapsing spaces ("Gmail", "gmail " are one). A blank label becomes "" and isn't counted. */
export function normaliseLabel(s: string): string {
  return s.normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/** Distinct normalised labels; a label that normalises to "" (only spaces) isn't one. */
const distinctLabels = (xs: readonly string[]): Set<string> => new Set(xs.map(normaliseLabel).filter((l) => l !== ""));

/** Minimises a block that `validateLevelBlock` accepted. */
export function minimise(block: LevelBlockV1): LevelEvidence {
  const inv = block.inventory;
  const agentAt = new Map<string, number>();
  inv.agents.forEach((a, i) => agentAt.set(a.name, i));
  const routineAt = new Map<string, number>();
  inv.routines.forEach((r, i) => routineAt.set(r.name, i));
  const services = new Set<string>();
  const agents = inv.agents.map((a): AgentEvidence => {
    const own = distinctLabels(a.connections);
    for (const c of own) services.add(c);
    return {
      has_job_sentence: a.job_sentence.trim() !== "",
      fields_present: uniq(a.fields_present),
      autonomy: a.autonomy,
      distinct_connections: own.size,
      created: a.created,
      created_by: a.created_by,
      rules: uniq(a.rules),
      role: a.role,
      needs_own: uniq(a.needs_own),
    };
  });
  const latest = new Map<string, LevelBlockV1["self_report"][number]>();
  for (const r of block.self_report) {
    const prev = latest.get(r.item);
    if (!prev || r.date >= prev.date) latest.set(r.item, r);
  }
  return {
    contract_version: LEVEL_CONTRACT_VERSION,
    zack_version: block.zack_version,
    platform: block.platform,
    inventory: {
      agents,
      routines: inv.routines.map((r) => ({
        owner: r.owner_agent === null ? null : (agentAt.get(r.owner_agent) ?? null),
        trigger: r.trigger,
        cadence: r.cadence,
        last_run: r.last_run,
        has: uniq(r.has),
        away_rule: r.away_rule,
        event_scope: r.event_scope,
        delivers_to: r.delivers_to,
      })),
      skills: inv.skills.map((s) => ({
        origin: s.origin,
        used_by_agents: uniq(s.used_by.filter((u) => agentAt.has(u)).map((u) => agentAt.get(u) as number)),
        used_by_routines: uniq(s.used_by.filter((u) => routineAt.has(u)).map((u) => routineAt.get(u) as number)),
      })),
      memory: uniq(inv.memory),
      memory_last_cleanup: inv.memory_last_cleanup === "none" ? null : inv.memory_last_cleanup,
      pages_dashboards: inv.pages_dashboards,
      distinct_models: distinctLabels(inv.models_used).size,
      scripts: inv.scripts,
      distinct_services: services.size,
    },
    activity_7d: block.activity_7d,
    history_flags: block.history_flags,
    self_report: [...latest.values()].sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0)),
    domains: block.domains.map((d) => ({ kind: d.kind, stages_covered: uniq(d.stages_covered) })),
  };
}
