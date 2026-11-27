"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { Brick } from "../sketch-kit";

/**
 * The one interaction of hero sketch 5: a wall of nine bricks drawn in grey
 * that takes colour where the pointer goes, and a caption that says which
 * brick is under it. One brick holds the real sample idea and shows its title.
 *
 * It works without a pointer. The wall is one stop for the Tab key; the arrow
 * keys, Home and End move between bricks, and Enter or Space keeps one chosen.
 * Nothing is only reachable this way: every brick's label is in the markup for
 * a screen reader, and the sample idea's brick is the one chosen when the page
 * opens, so its title is on the page before anyone touches anything.
 */
const PER_ROW = 3;
/** How far from the pointer a brick still takes some colour, in pixels. */
const REACH = 230;

export function Sketch5Wall({
  bricks,
  sampleAt,
  sample,
  groupLabel,
  hint,
}: {
  /** Oldest first, three to a week. */
  bricks: Brick[];
  /** Which brick holds the sample idea. */
  sampleAt: number;
  sample: { title: string; line: string };
  /** The wall's name for a screen reader. */
  groupLabel: string;
  hint: string;
}) {
  const [chosen, setChosen] = useState(sampleAt);
  // The brick under the pointer, and the brick with keyboard focus. The pointer wins while it is over the wall.
  const [under, setUnder] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const frame = useRef(0);
  const shown = under ?? focused ?? chosen;

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const { clientX, clientY } = event;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = layer.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${clientX - box.left}px`);
      el.style.setProperty("--my", `${clientY - box.top}px`);
      el.dataset.live = "";
      for (const button of buttons.current) {
        if (!button) continue;
        const r = button.getBoundingClientRect();
        const distance = Math.hypot(clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2));
        button.style.setProperty("--near", String(Math.max(0, 1 - distance / REACH).toFixed(3)));
      }
    });
  };
  const onLeave = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    const el = layer.current;
    if (el) delete el.dataset.live;
    for (const button of buttons.current) button?.style.removeProperty("--near");
    setUnder(null);
  };

  // Up is the newer week: the wall is drawn with week 1 at the foot.
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const moves: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowUp: i + PER_ROW, ArrowDown: i - PER_ROW, Home: 0, End: bricks.length - 1 };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    if (to < 0 || to >= bricks.length) return;
    buttons.current[to]?.focus();
  };

  const tabStop = focused ?? chosen;

  return (
    <div ref={layer} className="sk5-layer" onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="sk5-wash" aria-hidden="true" />
      <div role="group" aria-label={groupLabel} className="sk5-wall">
        <ul data-bricks={bricks.length}>
          {bricks.map((brick, i) => (
            <li key={i} style={{ gridRow: PER_ROW + 1 - brick.week, gridColumn: brick.idea, "--col": brick.idea } as CSSProperties} data-week={brick.week}>
              <button
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                className="sk5-brick"
                aria-pressed={i === chosen}
                data-shown={i === shown ? "" : undefined}
                data-sample={i === sampleAt ? "" : undefined}
                tabIndex={i === tabStop ? 0 : -1}
                onClick={() => setChosen(i)}
                onFocus={() => setFocused(i)}
                onBlur={() => setFocused(null)}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") setUnder(i);
                }}
                onKeyDown={(event) => onKey(event, i)}
              >
                <span className="sk5-sr">{brick.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sk5-caption" aria-live="polite">
        {shown === sampleAt && (
          // data-claims: the sample idea's own title, for the claims check.
          <p className="sk5-caption-idea" data-claims="sample">
            <strong>{sample.title}</strong>
            <span>{sample.line}</span>
          </p>
        )}
        {/* data-bricks: a brick's own label, "Week 2, idea 3: set up", for the claims check. */}
        <p className="sk5-caption-label" data-bricks="caption">
          {bricks[shown].label}
        </p>
        <p className="sk5-hint">{hint}</p>
      </div>
    </div>
  );
}
