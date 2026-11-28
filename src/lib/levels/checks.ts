import { LEVEL_RULES, type LevelItem, type LevelItemSource, type LevelRules } from "@/data/roger-levels";
import type { LevelEvidence } from "@/lib/levels/evidence";
import type { LevelCheck, LevelCollection, LevelPred, RogerFact } from "@/lib/levels/vocabulary";

/**
 * The check vocabulary's interpreter (B4 Unit 2). Pure: no clock, no database.
 *
 * A check is evaluated against one submission (`CheckContext`): its minimised
 * evidence, its date, the same platform's previous submission (for
 * `changed_between_runs`), Roger's facts and the member's self-report answers.
 * `evaluateItem` ORs an item over a window of such contexts. Choosing the
 * window (rule 2.2's 4 runs within 8 weeks, horizons, platforms) and expiring
 * self-reports is the engine's job (Unit 6), which passes the result in.
 */

export type RogerFacts = Readonly<Record<RogerFact, number>>;
export const NO_ROGER_FACTS: RogerFacts = {
  distinct_play_categories: 0,
  week_run_has_play: 0,
  past_ideas_listed: 0,
  adopters_any_play: 0,
  adopters_one_play: 0,
};

/** A member's latest self-report answer for an item, already expired by the engine where due. */
export type SelfAnswer = { answer: 0 | 1; date: string } | null;

export type CheckContext = {
  evidence: LevelEvidence;
  /** The submission's date (YYYY-MM-DD): cadences and "within N weeks" count back from it. */
  on: string;
  /** The same platform's previous submission, or null. */
  previous: LevelEvidence | null;
  roger: RogerFacts;
  selfReport: (itemId: string) => SelfAnswer;
  /** The rules the checks read; LEVEL_RULES when absent. */
  rules?: CheckRules;
};

/** The rules a check reads. LEVEL_RULES fits; a test or a ruling preview can pass others. */
export type CheckRules = {
  cadenceGraceDays: Readonly<Record<keyof LevelRules["cadenceGraceDays"], number>>;
  fastCadences: readonly string[];
};

const DAY_MS = 86_400_000;
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function numberAt(root: unknown, path: string): number {
  let v: unknown = root;
  for (const k of path.split(".")) v = v !== null && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
  if (Array.isArray(v)) return v.length;
  return typeof v === "number" ? v : 0;
}

function collection(e: LevelEvidence, c: LevelCollection): readonly Record<string, unknown>[] {
  const list = c === "domains" ? e.domains : e.inventory[c];
  return list as unknown as readonly Record<string, unknown>[];
}

/**
 * No more than `weeks` weeks before the submission, and no later than the day
 * after it (the contract accepts dates up to the receipt date + 1, as
 * `inside_cadence` does, for a time zone ahead of UTC).
 */
function withinWeeks(d: unknown, on: string, weeks: number): boolean {
  if (typeof d !== "string") return false;
  const days = daysBetween(d, on);
  return days >= -1 && days <= weeks * 7;
}

const HIGH_AUTONOMY = new Set(["schedule", "coordinate", "own"]);

function pred(p: LevelPred, el: Record<string, unknown>, ctx: CheckContext): boolean {
  switch (p.op) {
    case "has":
      return Array.isArray(el[p.field]) && (el[p.field] as unknown[]).includes(p.value);
    case "has_all":
      return Array.isArray(el[p.field]) && p.values.every((v) => (el[p.field] as unknown[]).includes(v));
    case "eq":
      return el[p.field] === p.value;
    case "in":
      return typeof el[p.field] === "string" && p.values.includes(el[p.field] as string);
    case "gte":
      return typeof el[p.field] === "number" && (el[p.field] as number) >= p.min;
    case "non_empty":
      return Array.isArray(el[p.field]) && (el[p.field] as unknown[]).length > 0;
    case "inside_cadence": {
      const grace = (ctx.rules ?? LEVEL_RULES).cadenceGraceDays;
      const cadence = el.cadence as keyof typeof grace;
      if (typeof el.last_run !== "string" || !(cadence in grace)) return false;
      const days = daysBetween(el.last_run, ctx.on);
      return days >= -1 && days <= grace[cadence];
    }
    case "within_weeks":
      return withinWeeks(el[p.field], ctx.on, p.weeks);
    case "owner_role": {
      const owner = el.owner;
      return typeof owner === "number" && ctx.evidence.inventory.agents[owner]?.role === p.role;
    }
    case "holds_every_service":
      return typeof el.distinct_connections === "number" && el.distinct_connections >= ctx.evidence.inventory.distinct_services;
    case "not":
      return !pred(p.pred, el, ctx);
    case "all_of":
      return p.preds.every((q) => pred(q, el, ctx));
    case "any_of":
      return p.preds.some((q) => pred(q, el, ctx));
  }
}

function changed(kind: Extract<LevelCheck, { kind: "changed_between_runs" }>["change"], cur: LevelEvidence, prev: LevelEvidence | null, rules: CheckRules): boolean {
  if (!prev) return false;
  const routines = (e: LevelEvidence) => e.inventory.routines.length;
  const fast = (e: LevelEvidence) => e.inventory.routines.filter((r) => rules.fastCadences.includes(r.cadence)).length;
  const high = (e: LevelEvidence) => e.inventory.agents.filter((a) => HIGH_AUTONOMY.has(a.autonomy)).length;
  const systemSkills = (e: LevelEvidence) => e.inventory.skills.filter((s) => s.origin === "system").length;
  switch (kind) {
    case "routines_fewer_or_slower":
      return routines(cur) < routines(prev) || fast(cur) < fast(prev);
    case "routine_gone":
      return routines(cur) < routines(prev);
    case "autonomy_up":
      // A count-based proxy (no names are kept): more agents at a high level
      // counts as a promotion only when the number of agents is unchanged, so
      // the rise is low-autonomy agents moving up, not a new agent. A promotion
      // in a run that also adds or retires an agent is missed here; Zack's
      // history_flags.promotions still settles 6.02 then.
      return high(cur) > high(prev) && cur.inventory.agents.length === prev.inventory.agents.length;
    case "autonomy_down_or_routine_off":
      return high(cur) < high(prev) || routines(cur) < routines(prev);
    case "system_skill_added":
      return systemSkills(cur) > systemSkills(prev);
  }
}

/** Whether `check` holds for one submission. `itemId` answers a `self_report` node. */
export function evaluateCheck(check: LevelCheck, ctx: CheckContext, itemId: string): boolean {
  const e = ctx.evidence;
  switch (check.kind) {
    case "valid_block":
      return true;
    case "count_at_least":
      return numberAt(e, check.path) >= check.min;
    case "some":
      return collection(e, check.collection).some((el) => pred(check.where, el, ctx));
    case "every": {
      const els = collection(e, check.collection).filter((el) => !check.among || pred(check.among, el, ctx));
      if (check.nonEmpty && els.length === 0) return false;
      return els.every((el) => pred(check.where, el, ctx));
    }
    case "count_where":
      return collection(e, check.collection).filter((el) => pred(check.where, el, ctx)).length >= check.min;
    case "memory_has":
      return check.any.some((m) => (e.inventory.memory as readonly string[]).includes(m));
    case "within_weeks":
      return withinWeeks(check.path === "inventory.memory_last_cleanup" ? e.inventory.memory_last_cleanup : null, ctx.on, check.weeks);
    case "span_weeks": {
      const dates = collection(e, check.collection)
        .map((el) => el[check.field])
        .filter((d): d is string => typeof d === "string")
        .sort();
      return dates.length >= 2 && daysBetween(dates[0], dates[dates.length - 1]) >= check.weeks * 7;
    }
    case "changed_between_runs":
      return changed(check.change, e, ctx.previous, ctx.rules ?? LEVEL_RULES);
    case "roger":
      return (ctx.roger[check.fact] ?? 0) >= check.min;
    case "self_report":
      return ctx.selfReport(itemId)?.answer === 1;
    case "all_of":
      return check.checks.every((c) => evaluateCheck(c, ctx, itemId));
    case "any_of":
      return check.checks.some((c) => evaluateCheck(c, ctx, itemId));
  }
}

export type ItemState = { live: boolean; source: LevelItemSource; lastEvidenceOn: string | null };

/**
 * An item's live state over a window of submissions (any platform): 1 when its
 * check holds in any of them. A `partsAcrossWindow` item needs each part of its
 * top-level `all_of` in some submission, not necessarily the same one. A
 * fallback or self item is its latest self-report answer (`selfAnswer`).
 */
export function evaluateItem(item: LevelItem, window: readonly CheckContext[], selfAnswer: SelfAnswer): ItemState {
  if (item.status === "fallback" || item.status === "self") {
    const live = selfAnswer?.answer === 1;
    return { live, source: "self", lastEvidenceOn: live ? selfAnswer.date : null };
  }
  const latestWhere = (c: LevelCheck): string | null => {
    let best: string | null = null;
    for (const ctx of window) if (evaluateCheck(c, ctx, item.id) && (best === null || ctx.on > best)) best = ctx.on;
    return best;
  };
  if (item.partsAcrossWindow && item.check.kind === "all_of") {
    const parts = item.check.checks.map(latestWhere);
    const live = parts.length > 0 && parts.every((d) => d !== null);
    return { live, source: item.source, lastEvidenceOn: live ? (parts as string[]).reduce((a, b) => (a < b ? a : b)) : null };
  }
  const on = latestWhere(item.check);
  return { live: on !== null, source: item.source, lastEvidenceOn: on };
}
