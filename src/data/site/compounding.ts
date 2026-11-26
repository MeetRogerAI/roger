/**
 * The "It compounds" story (plan R10, KTD11): three ideas arrive each Monday
 * and each one set up stays set up. The story shows weeks 1, 2 and 3, then
 * jumps to week 26 and adds one more Monday.
 *
 * This is the only place these week numbers and brick counts live. They are
 * the one agreed exception to the "no hard-coded numbers" rule, and no number
 * here is about time or money.
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

/** In order: 3, 6, 9, then 78 and 81. */
export const compoundingSteps: CompoundingStep[] = [step(1), step(2), step(3), step(26), step(27)];

/** The finished picture: what shows with no script, and under reduced motion. */
export const compoundingFinal: CompoundingStep = step(26);
