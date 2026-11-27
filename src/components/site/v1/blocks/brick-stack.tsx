import type { CSSProperties } from "react";
import { bricksPerWeek } from "@/data/site/compounding";
import type { BrickWords } from "@/data/site/copy-types";
import { compoundingCaption } from "@/lib/site/compounding";

/**
 * The brick stack, the site's one recurring picture (spec 0.7, A.4): three
 * bricks arrive each Monday and the stack grows from the bottom. A brick that
 * is set up is filled in its level colour; an empty slot is an outline.
 *
 * Colour is never the only signal: every brick carries its own text label for
 * screen readers, filled and outlined differ in shape, and the caption states
 * the week and the count in words.
 *
 * Nothing here moves. Each brick carries data-week, data-brick and --i (its
 * place in the stack) so the hero, "how it works" and the scroll story can
 * stage them (globals.css, "Bricks in motion").
 */
export type BrickLevel = 1 | 2 | 3 | 4 | 5;

// Level colours on ground, and the same hues lifted for night chapters (globals.css).
const fill: Record<BrickLevel, { ground: string; night: string }> = {
  1: { ground: "bg-level-1", night: "bg-f-reach-night" },
  2: { ground: "bg-level-2", night: "bg-f-ease-night" },
  3: { ground: "bg-level-3", night: "bg-f-proof-night" },
  4: { ground: "bg-level-4", night: "bg-f-surprise-night" },
  5: { ground: "bg-level-5", night: "bg-f-hours-night" },
};

const sizes = {
  s: { brick: "size-3 rounded-[3px]", gap: "gap-1", px: 12, gapPx: 4 },
  m: { brick: "size-5 rounded-[5px]", gap: "gap-1.5", px: 20, gapPx: 6 },
  l: { brick: "size-8 rounded-[8px]", gap: "gap-2", px: 32, gapPx: 8 },
  xl: { brick: "size-14 rounded-[8px]", gap: "gap-3", px: 56, gapPx: 12 },
};

type Size = keyof typeof sizes;

// The same sizes from the lg breakpoint up, for a stack that changes shape on a wide screen (`wide`).
const wideSizes: Record<Size, { brick: string; gap: string }> = {
  s: { brick: "lg:size-3 lg:rounded-[3px]", gap: "lg:gap-1" },
  m: { brick: "lg:size-5 lg:rounded-[5px]", gap: "lg:gap-1.5" },
  l: { brick: "lg:size-8 lg:rounded-[8px]", gap: "lg:gap-2" },
  xl: { brick: "lg:size-14 lg:rounded-[8px]", gap: "lg:gap-3" },
};

const widthOf = (size: Size, perRow: number) => perRow * sizes[size].px + (perRow - 1) * sizes[size].gapPx;

export function BrickStack({
  weeks,
  level = 1,
  setUp,
  size = "m",
  perRow = bricksPerWeek,
  wide,
  night = false,
  caption = false,
  words,
  className = "",
}: {
  /** How many Mondays have arrived. Each brings three bricks. */
  weeks: number;
  /** Which level colour the set-up bricks take. */
  level?: BrickLevel;
  /** How many bricks are set up, counted from the first. All of them when left out. */
  setUp?: number;
  size?: Size;
  /** Bricks across. Three makes a tower of weeks; more makes a wall. */
  perRow?: number;
  /** A different size or number across from the lg breakpoint up: a tower on a phone, a wall on a desk. */
  wide?: { size?: Size; perRow?: number };
  night?: boolean;
  /** Shows the week and the count under the stack, such as "Week 26" and "78 bricks", in the words of `words.caption`. */
  caption?: boolean;
  /** The words in each brick's label, and the caption's. */
  words: BrickWords;
  className?: string;
}) {
  const arrived = Math.max(0, Math.floor(weeks));
  const total = arrived * bricksPerWeek;
  const under = caption ? compoundingCaption(words.caption, { week: arrived, bricks: total }) : null;
  const filled = Math.min(total, Math.max(0, setUp ?? total));
  const s = sizes[size];
  const width = widthOf(size, perRow);
  const colour = night ? fill[level].night : fill[level].ground;
  const outline = night ? "border border-night-ink-2" : "border border-ink-2";
  const w = wide ? wideSizes[wide.size ?? size] : null;
  const brick = w ? `${s.brick} ${w.brick}` : s.brick;
  // With `wide` the width is two custom properties, so the breakpoint can choose between them.
  const row = w
    ? { className: `flex flex-wrap-reverse ${s.gap} ${w.gap} w-(--bricks-w) lg:w-(--bricks-w-lg)`, style: { "--bricks-w": `${width}px`, "--bricks-w-lg": `${widthOf(wide?.size ?? size, wide?.perRow ?? perRow)}px` } as CSSProperties }
    : { className: `flex flex-wrap-reverse ${s.gap}`, style: { width } };

  return (
    <figure className={`inline-flex flex-col items-center ${className}`}>
      {/* wrap-reverse: the first brick sits bottom left and the stack grows upward */}
      <ul {...row} data-bricks={total}>
        {Array.from({ length: total }, (_, i) => {
          const week = Math.floor(i / bricksPerWeek) + 1;
          const isSetUp = i < filled;
          return (
            <li
              key={i}
              data-week={week}
              data-brick={i + 1}
              data-set-up={isSetUp ? "yes" : "no"}
              style={{ "--i": i } as CSSProperties}
              className={`${brick} ${isSetUp ? colour : outline}`}
            >
              <span className="sr-only">{`${words.week} ${week}, ${words.idea} ${(i % bricksPerWeek) + 1}: ${isSetUp ? words.setUp : words.empty}`}</span>
            </li>
          );
        })}
      </ul>
      {under && (
        <figcaption className={`mt-4 text-center text-meta ${night ? "text-night-ink-2" : "text-ink-2"}`}>
          <span className={`block text-small font-[600] ${night ? "text-night-ink" : "text-ink"}`}>{under.week}</span>
          <span className="tabular">{under.bricks}</span>
        </figcaption>
      )}
    </figure>
  );
}
