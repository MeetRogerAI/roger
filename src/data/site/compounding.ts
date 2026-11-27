/**
 * The "It compounds" loop (plan R10, KTD11): three ideas arrive each Monday
 * and each one set up stays set up. The loop shows seven weeks, 1, 2, 3, 4,
 * 10, 17 and 26, and ends at 78 bricks (Peter's decisions of November 26,
 * 2026: there is no state after week 26, and weeks 4, 10 and 17 were added in
 * his homepage review).
 *
 * This is the only place these week numbers live, and a brick count is always
 * its week times three, worked out here and nowhere else. They are the one
 * agreed exception to the "no hard-coded numbers" rule, and no number here is
 * about time or money.
 *
 * Numbers only. The words around them ("Week 26", "78 bricks") are in each
 * version's copy file, and compoundingCaption in src/lib/site/compounding.ts
 * joins the two.
 */
export const bricksPerWeek = 3;

export type CompoundingStep = {
  week: number;
  /** Bricks in the stack once that Monday's three have arrived. */
  bricks: number;
};

const step = (week: number): CompoundingStep => ({ week, bricks: week * bricksPerWeek });

/** The weeks the loop shows, in order. */
export const compoundingWeeks: readonly number[] = [1, 2, 3, 4, 10, 17, 26];

/** In order: 3, 6, 9, 12, 30, 51, then 78, the last. */
export const compoundingSteps: CompoundingStep[] = compoundingWeeks.map(step);

/** The finished picture, and the loop's last state: what shows with no script, and under reduced motion. */
export const compoundingFinal: CompoundingStep = compoundingSteps[compoundingSteps.length - 1];

/** Every number "It compounds" may print: each week and each brick count. The claims check allows these there and no others. */
export const compoundingNumbers: readonly number[] = [...new Set(compoundingSteps.flatMap((s) => [s.week, s.bricks]))];
