import { daysBetween } from "@/lib/clock";
import type { V3Settings } from "@/lib/v3-settings";

/**
 * Cora's numbers (spec B.7, Cora v1.1 with the 2.0 changes). Code computes
 * every figure here; no model is involved. "Never invent a number": a figure
 * nobody stated stays missing and scores from what exists.
 */

export type Confidence = "High" | "Medium" | "Low";

/** One contributor's play that was merged into a pool play, as intake stored it. */
export type Evidence = {
  /** A real user id, or "seed:<contributor id>": one person counts once, whatever agents they used. */
  contributor: string;
  weekOf: string;
  set: "A" | "B" | "runner_up";
  origin: "own" | "roger_idea" | "own_upgraded" | "";
  minutes: number | null;
  currentHours: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  heavyHours: number | null;
  basis: "Actual" | "Implied" | null;
  confidence: Confidence | null;
  weeksRunning: number | null;
  steps: number | null;
  connections: number | null;
  setupQuestions: number | null;
};

export type PoolPlay = {
  id: string;
  title: string;
  evidence: Evidence[];
  /** Active users who could use it (spec B.7 change 5; judged upstream). */
  reachCount: number;
  /** Its playbook was drafted by Roger, not written by a member's agent (2026-11-27). */
  drafted?: boolean;
};

type Weights = V3Settings["recencyWeights"];

/**
 * Evidence weight by age (v3.recencyWeights): the first weeks full, then
 * reduced, then the "older" weight for good. Retiring is decided for the
 * play as a whole (see isRetired), never by dropping one person's old evidence.
 */
export function recencyWeight(weekOf: string, asOf: string, w: Weights): number {
  const weeks = Math.floor(daysBetween(weekOf, asOf) / 7);
  if (weeks < 0) return 0;
  if (weeks < w.recentWeeks) return w.recent;
  if (weeks < w.midWeeks) return w.mid;
  return w.old;
}

/** A pool play with no evidence in the last `retireWeeks` weeks is retired from picking and kept on record. */
export function isRetired(evidence: Evidence[], asOf: string, w: Weights): boolean {
  return !evidence.some((e) => {
    const weeks = Math.floor(daysBetween(e.weekOf, asOf) / 7);
    return weeks >= 0 && weeks < w.retireWeeks;
  });
}

/** Median of values with weights; null when there is nothing to take a median of. */
export function weightedMedian(items: { value: number; weight: number }[]): number | null {
  const xs = items.filter((x) => x.weight > 0 && Number.isFinite(x.value)).sort((a, b) => a.value - b.value);
  const total = xs.reduce((t, x) => t + x.weight, 0);
  if (!xs.length || total <= 0) return null;
  let run = 0;
  for (let i = 0; i < xs.length; i++) {
    run += xs[i].weight;
    if (run > total / 2) return xs[i].value;
    // Exactly half: the median is the midpoint between this value and the next.
    if (Math.abs(run - total / 2) < 1e-9 && i + 1 < xs.length) return (xs[i].value + xs[i + 1].value) / 2;
  }
  return xs[xs.length - 1].value;
}

const LEVEL: Record<Confidence, number> = { Low: 1, Medium: 2, High: 3 };

/** Confidence, one level higher for a play used four weeks or more (Cora 2.0 change 6), to High at most. */
function confidencePoints(e: Evidence): number {
  const base = e.confidence ? LEVEL[e.confidence] : 0;
  if (!base) return 0;
  return Math.min(3, base + ((e.weeksRunning ?? 0) >= 4 ? 1 : 0));
}

export type Figures = {
  minutes: number | null;
  currentHours: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  heavyHours: number | null;
  hoursFigure: number | null;
  complexity: number | null;
  proof: number;
  surprise: number;
  contributors: number;
  actualContributors: number;
  /** The highest confidence any person's live evidence gave (v1.1 "Confidence: the highest"). */
  confidence: Confidence | null;
  newestWeek: string | null;
  retired: boolean;
};

/**
 * The merged figures for one pool play. Each piece of evidence counts by its
 * recency weight; Actual figures count twice in the hours median (v1.1).
 */
export function mergedFigures(p: PoolPlay, asOf: string, w: Weights): Figures {
  const live = p.evidence.map((e) => ({ e, r: recencyWeight(e.weekOf, asOf, w) })).filter((x) => x.r > 0);
  const newestWeek = p.evidence.reduce<string | null>((m, e) => (!m || e.weekOf > m ? e.weekOf : m), null);

  // One person counts once, in every figure: several weeks or several agents are still one person.
  const byPerson = new Map<string, { e: Evidence; r: number }[]>();
  for (const x of live) byPerson.set(x.e.contributor, [...(byPerson.get(x.e.contributor) ?? []), x]);
  const people = [...byPerson.values()];

  /**
   * Each person's own figure (their recency-weighted median), weighted by their
   * most recent evidence, then the median across people. Runners-up are
   * evidence that someone runs a play, never the play's own figures.
   */
  const median = (pick: (e: Evidence) => number | null, actualCountsDouble = false) =>
    weightedMedian(
      people.flatMap((xs) => {
        const rows = xs.filter(({ e }) => e.set !== "runner_up" && pick(e) != null);
        const v = weightedMedian(rows.map(({ e, r }) => ({ value: pick(e)!, weight: r })));
        if (v == null) return [];
        const r = Math.max(...rows.map((x) => x.r));
        return [{ value: v, weight: r * (actualCountsDouble && rows.some(({ e }) => e.basis === "Actual") ? 2 : 1) }];
      }),
    );
  // Size counts only when both steps and connections were stated: a missing part is not zero.
  const size = (e: Evidence) => (e.steps == null || e.connections == null ? null : e.steps + e.connections * 5 + (e.setupQuestions ?? 0));

  const main = live.filter(({ e }) => e.set !== "runner_up");
  const lows = main.map(({ e }) => e.rangeLow).filter((x): x is number => x != null);
  const highs = main.map(({ e }) => e.rangeHigh).filter((x): x is number => x != null);

  let proof = 0;
  let surprise = 0;
  let actualContributors = 0;
  for (const xs of people) {
    const strength = (x: { e: Evidence; r: number }) => confidencePoints(x.e) * (x.e.basis === "Actual" ? 2 : 1) * x.r;
    proof += Math.max(...xs.map(strength));
    if (xs.some(({ e }) => e.basis === "Actual")) actualContributors++;
    // Surprise counts people, not how recently they ran it, and leaves out those who run it
    // because Roger sent it (Cora 2.0 change 7).
    const own = xs.filter(({ e }) => e.origin !== "roger_idea");
    if (own.length) surprise += own.some(({ e }) => e.set === "A") ? 2 : 1;
  }

  const currentHours = median((e) => e.currentHours, true);
  const heavyHours = median((e) => e.heavyHours);
  const hoursFigure = currentHours == null && heavyHours == null ? null : Math.max(currentHours ?? 0, (heavyHours ?? 0) / 2);
  return {
    minutes: median((e) => e.minutes),
    currentHours,
    rangeLow: lows.length ? Math.min(...lows) : null,
    rangeHigh: highs.length ? Math.max(...highs) : null,
    heavyHours,
    hoursFigure,
    complexity: median(size),
    proof,
    surprise,
    contributors: byPerson.size,
    actualContributors,
    confidence: (["High", "Medium", "Low"] as const).find((c) => live.some(({ e }) => e.confidence === c)) ?? null,
    newestWeek,
    retired: isRetired(p.evidence, asOf, w),
  };
}

/**
 * Deciles across plays (v1.1): rank the figures, best first, and give the top
 * tenth 10 points down to 1 for the bottom tenth. Equal figures get equal
 * points. A missing figure scores 1. `best` says which end is best.
 */
export function deciles(values: (number | null)[], best: "high" | "low"): number[] {
  const known = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null);
  known.sort((a, b) => (best === "high" ? b.v - a.v : a.v - b.v));
  const n = known.length;
  const out = values.map(() => 1);
  for (let k = 0; k < n; k++) {
    const first = known.findIndex((x) => Math.abs(x.v - known[k].v) < 1e-9);
    out[known[k].i] = 10 - Math.floor((first * 10) / n);
  }
  return out;
}

export const WEIGHTS = { hours: 30, reach: 25, ease: 10, proof: 15, surprise: 20 } as const;

/**
 * Points off the network score (0 to 100) for a pool play whose playbook Roger
 * drafted from a member's report rather than one a member's agent wrote and
 * ran (Peter, 2026-11-27). Small on purpose: one point, the size of a single
 * Ease decile step and less than one of any other factor, so a proven setup
 * wins a tie or a near tie and a clearly better drafted play still ranks
 * above a weaker one. Outline-only plays are not penalised.
 */
export const DRAFTED_PENALTY = 1;

/** The network score from the factor scores: scaled so all tens is 100, less the drafted penalty. Not rounded. */
export function networkScore(f: { hours: number; reach: number; ease: number; proof: number; surprise: number }, drafted = false): number {
  const raw = f.hours * WEIGHTS.hours + f.reach * WEIGHTS.reach + f.ease * WEIGHTS.ease + f.proof * WEIGHTS.proof + f.surprise * WEIGHTS.surprise;
  return raw / 10 - (drafted ? DRAFTED_PENALTY : 0);
}

export type Scored = {
  id: string;
  title: string;
  figures: Figures;
  reachShare: number;
  f: { hours: number; reach: number; ease: number; proof: number; surprise: number };
  /** 0 to 100, scaled so all tens is 100. Not rounded, so ranking is exact. */
  score: number;
};

/** Scores every active (not retired) play against the others. Retired plays are returned unscored. */
export function scorePool(plays: PoolPlay[], o: { asOf: string; weights: Weights; activeUsers: number }): { scored: Scored[]; retired: string[] } {
  const withFigures = plays.map((p) => ({ p, fig: mergedFigures(p, o.asOf, o.weights) }));
  const active = withFigures.filter((x) => !x.fig.retired);
  const reach = active.map((x) => (o.activeUsers > 0 ? x.p.reachCount / o.activeUsers : 0));
  const h = deciles(active.map((x) => x.fig.hoursFigure), "high");
  const r = deciles(reach, "high");
  const e = deciles(active.map((x) => x.fig.complexity), "low");
  const pr = deciles(active.map((x) => x.fig.proof), "high");
  const s = deciles(active.map((x) => x.fig.surprise), "low");
  const scored = active.map((x, i) => {
    const f = { hours: h[i], reach: r[i], ease: e[i], proof: pr[i], surprise: s[i] };
    return { id: x.p.id, title: x.p.title, figures: x.fig, reachShare: reach[i], f, score: networkScore(f, x.p.drafted) };
  });
  return { scored: scored.sort(byRank), retired: withFigures.filter((x) => x.fig.retired).map((x) => x.p.id) };
}

/** Score, then v1.1's tie-breaks: Surprise, Reach, more Actual contributors, hours figure, title. The same order on every run. */
export function byRank(a: Scored, b: Scored): number {
  return (
    b.score - a.score ||
    b.f.surprise - a.f.surprise ||
    b.f.reach - a.f.reach ||
    b.figures.actualContributors - a.figures.actualContributors ||
    (b.figures.hoursFigure ?? -1) - (a.figures.hoursFigure ?? -1) ||
    a.title.localeCompare(b.title, "en") ||
    a.id.localeCompare(b.id)
  );
}

/** The personal score (spec B.7): network score × 0.75 + Fit × 5. */
export function personalScore(networkScore: number, fit: number): number {
  return networkScore * 0.75 + fit * 5;
}
