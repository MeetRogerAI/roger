/**
 * Joins the numbers of the "It compounds" story (src/data/site/compounding.ts)
 * with a version's caption words, such as "Week {week}" and "{bricks} bricks".
 */
import type { CompoundingStep } from "@/data/site/compounding";
import type { CompoundingCaptionCopy } from "@/data/site/copy-types";

/**
 * The names a caption may hold. They are not amounts, so fillAmounts leaves
 * them in place for compoundingCaption to fill.
 */
export const captionNames: readonly string[] = ["week", "bricks"];

const fill = (text: string, step: CompoundingStep) => text.replaceAll("{week}", String(step.week)).replaceAll("{bricks}", String(step.bricks));

/** { week: "Week 26", bricks: "78 bricks" } */
export function compoundingCaption(copy: CompoundingCaptionCopy, step: CompoundingStep): CompoundingCaptionCopy {
  return { week: fill(copy.week, step), bricks: fill(copy.bricks, step) };
}
