/**
 * The check vocabulary (B4 Unit 2): the small, declarative language the levels
 * data file uses to say how each item is settled from minimised evidence
 * (src/lib/levels/evidence.ts) and Roger's own data. `checks.ts` interprets it.
 *
 * Checks are plain JSON-able objects, so the data file can be hashed into
 * `LEVELS_RULES_VERSION` and a ruling is a one-line data edit. This module is
 * types and builders only (no imports), so the data file stays light.
 */

/** A collection a check can range over. */
export type LevelCollection = "agents" | "routines" | "skills" | "domains";

/** Every number a check can compare; an array path compares its length. */
export type LevelNumberPath =
  | "inventory.agents"
  | "inventory.routines"
  | "inventory.skills"
  | "inventory.pages_dashboards"
  | "inventory.distinct_models"
  | "inventory.scripts"
  | "inventory.distinct_services"
  | "domains"
  | "activity_7d.active_days"
  | "activity_7d.multi_step_completions"
  | "activity_7d.agent_to_agent_handoffs"
  | "activity_7d.proactive_starts"
  | "activity_7d.voice_inputs"
  | "activity_7d.approvals.parked"
  | "activity_7d.approvals.approved"
  | "activity_7d.approvals.batched"
  | "activity_7d.approvals.sent_after_approval"
  | "activity_7d.exceptions_escalated"
  | "activity_7d.others_served_directly"
  | "activity_7d.browser_only_tasks"
  | "activity_7d.longest_chat_size"
  | "activity_7d.chat_resets"
  | "activity_7d.verify_reports.pass"
  | "activity_7d.verify_reports.fail"
  | "activity_7d.self_change_proposals.proposed"
  | "activity_7d.self_change_proposals.adopted"
  | "activity_7d.design_activity.directions_generated"
  | "activity_7d.design_activity.iterations"
  | "activity_7d.design_activity.playground_built"
  | "activity_7d.design_activity.screenshot_check"
  | "history_flags.promotions"
  | "history_flags.demotions"
  | "history_flags.retirements"
  | "history_flags.rule_fixes_after_error"
  | "history_flags.usage_cuts"
  | "history_flags.access_reviews";

/** A top-level date field. */
export type LevelDatePath = "inventory.memory_last_cleanup";

/**
 * What changed between this submission and the platform's previous one.
 * Minimised evidence keeps no names, so these compare counts, not identities.
 */
export type LevelChange =
  /** Fewer routines, or fewer at daily-or-faster cadences (4.14). */
  | "routines_fewer_or_slower"
  /** Fewer routines (6.15). */
  | "routine_gone"
  /** More agents at `schedule`, `coordinate` or `own`, with the number of agents unchanged (6.02; a count-based proxy). */
  | "autonomy_up"
  /** Fewer agents at `schedule`, `coordinate` or `own`, or fewer routines (6.08). */
  | "autonomy_down_or_routine_off"
  /** More skills of origin `system` (8.03). */
  | "system_skill_added";

/** Facts from Roger's own data, as numbers (a yes is 1). */
export type RogerFact =
  /** Distinct play categories across the window's accepted runs (1.10). */
  | "distinct_play_categories"
  /** The week's accepted run has at least one play (1.03). */
  | "week_run_has_play"
  /** The latest accepted roger-profile lists past ideas (8.13). */
  | "past_ideas_listed"
  /** Distinct other people with a Zack-confirmed adoption of any pool play this member contributed to (9.03). */
  | "adopters_any_play"
  /** The most distinct other people with a Zack-confirmed adoption of one such play (9.06). */
  | "adopters_one_play";

/** A predicate over one element of a collection. Field names are the element's evidence keys. */
export type LevelPred =
  | { op: "has"; field: string; value: string }
  | { op: "has_all"; field: string; values: string[] }
  | { op: "eq"; field: string; value: string | number | boolean }
  | { op: "in"; field: string; values: string[] }
  | { op: "gte"; field: string; min: number }
  | { op: "non_empty"; field: string }
  /** A routine whose `last_run` is inside its cadence plus grace (`LEVEL_RULES.cadenceGraceDays`), counted from the submission date. */
  | { op: "inside_cadence" }
  /** A date field no more than `weeks` before the submission date. */
  | { op: "within_weeks"; field: string; weeks: number }
  /** A routine whose hosting agent has this role. */
  | { op: "owner_role"; role: string }
  /** An agent connected to every distinct service in the block. */
  | { op: "holds_every_service" }
  | { op: "not"; pred: LevelPred }
  | { op: "all_of"; preds: LevelPred[] }
  | { op: "any_of"; preds: LevelPred[] };

export type LevelCheck =
  /** Any valid contract v1 block (an AI account, an agent platform). */
  | { kind: "valid_block" }
  | { kind: "count_at_least"; path: LevelNumberPath; min: number }
  | { kind: "some"; collection: LevelCollection; where: LevelPred }
  /**
   * Every element (of those matching `among`, when given) satisfies `where`.
   * `nonEmpty: true` makes an empty collection a 0, never a vacuous 1; every
   * "every X" item in the data file carries it.
   */
  | { kind: "every"; collection: LevelCollection; where: LevelPred; nonEmpty: boolean; among?: LevelPred }
  | { kind: "count_where"; collection: LevelCollection; where: LevelPred; min: number }
  | { kind: "memory_has"; any: string[] }
  | { kind: "within_weeks"; path: LevelDatePath; weeks: number }
  /** The non-null dates of `field` across the collection span at least `weeks` weeks. */
  | { kind: "span_weeks"; collection: LevelCollection; field: string; weeks: number }
  | { kind: "changed_between_runs"; change: LevelChange }
  | { kind: "roger"; fact: RogerFact; min: number }
  /** The member's latest self-report answer for this item is 1. */
  | { kind: "self_report" }
  | { kind: "all_of"; checks: LevelCheck[] }
  | { kind: "any_of"; checks: LevelCheck[] };

/** Check builders, so the data file reads as one line per item. */
export const ck = {
  validBlock: (): LevelCheck => ({ kind: "valid_block" }),
  count: (path: LevelNumberPath, min: number): LevelCheck => ({ kind: "count_at_least", path, min }),
  some: (collection: LevelCollection, where: LevelPred): LevelCheck => ({ kind: "some", collection, where }),
  every: (collection: LevelCollection, where: LevelPred, nonEmpty: boolean, among?: LevelPred): LevelCheck =>
    among ? { kind: "every", collection, where, nonEmpty, among } : { kind: "every", collection, where, nonEmpty },
  countWhere: (collection: LevelCollection, where: LevelPred, min: number): LevelCheck => ({ kind: "count_where", collection, where, min }),
  memoryHas: (...any: string[]): LevelCheck => ({ kind: "memory_has", any }),
  withinWeeks: (path: LevelDatePath, weeks: number): LevelCheck => ({ kind: "within_weeks", path, weeks }),
  spanWeeks: (collection: LevelCollection, field: string, weeks: number): LevelCheck => ({ kind: "span_weeks", collection, field, weeks }),
  changed: (change: LevelChange): LevelCheck => ({ kind: "changed_between_runs", change }),
  roger: (fact: RogerFact, min: number): LevelCheck => ({ kind: "roger", fact, min }),
  selfReport: (): LevelCheck => ({ kind: "self_report" }),
  allOf: (...checks: LevelCheck[]): LevelCheck => ({ kind: "all_of", checks }),
  anyOf: (...checks: LevelCheck[]): LevelCheck => ({ kind: "any_of", checks }),
};

/** Predicate builders. */
export const p = {
  has: (field: string, value: string): LevelPred => ({ op: "has", field, value }),
  hasAll: (field: string, ...values: string[]): LevelPred => ({ op: "has_all", field, values }),
  eq: (field: string, value: string | number | boolean): LevelPred => ({ op: "eq", field, value }),
  in: (field: string, values: readonly string[]): LevelPred => ({ op: "in", field, values: [...values] }),
  gte: (field: string, min: number): LevelPred => ({ op: "gte", field, min }),
  nonEmpty: (field: string): LevelPred => ({ op: "non_empty", field }),
  insideCadence: (): LevelPred => ({ op: "inside_cadence" }),
  withinWeeks: (field: string, weeks: number): LevelPred => ({ op: "within_weeks", field, weeks }),
  ownerRole: (role: string): LevelPred => ({ op: "owner_role", role }),
  holdsEveryService: (): LevelPred => ({ op: "holds_every_service" }),
  not: (pred: LevelPred): LevelPred => ({ op: "not", pred }),
  allOf: (...preds: LevelPred[]): LevelPred => ({ op: "all_of", preds }),
  anyOf: (...preds: LevelPred[]): LevelPred => ({ op: "any_of", preds }),
};

/** Every check node in a tree (the root first). */
export function checkNodes(check: LevelCheck): LevelCheck[] {
  const out: LevelCheck[] = [check];
  if (check.kind === "all_of" || check.kind === "any_of") for (const c of check.checks) out.push(...checkNodes(c));
  return out;
}
