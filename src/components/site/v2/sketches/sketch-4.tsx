import type { CSSProperties } from "react";
import Link from "next/link";
import { Bricolage_Grotesque } from "next/font/google";
import { StartLink } from "@/components/site/shared/start-link";
import { bricksPerWeek, compoundingSteps } from "@/data/site/compounding";
import { compoundingCaption } from "@/lib/site/compounding";
import { Placeholder } from "../placeholder";
import { LogoSlot, navItems, SkipLink, type SketchProps } from "../sketch-kit";
import { Sketch4Nav } from "./sketch-4-nav";
import "./sketch-4.css";

/**
 * Hero sketch 4, in the spirit of railcode.dev (plan U11, design guide B3 and
 * X2: Yakko's "it needed a whole park").
 *
 * Takes: an illustrated world of the product's own that the layout is built
 * around and that becomes the way into the next section; a header that takes
 * the colour of the section under it; a chunky button you can feel; lines and
 * shadows tinted warm. Does not take: pixel art, a pixel font, the sky-blue
 * and grass-green, or the yellow button.
 *
 * Roger's world is bricks, so this one is drawn, not left as a placeholder: a
 * wall under construction along the foot of the hero. The wall is the next
 * section's ground, and the four steps are laid into it as bricks. This
 * Monday's three ideas sit on top of the wall, on the two weeks before them,
 * with dashed slots where next Monday's go.
 *
 * Everything in the picture is an inline SVG in pixel units, so the bricks
 * are the same size at every screen width and the wall runs on to the right.
 * A commissioned or generated illustration would go over it: the dashed frame
 * in the hero marks where, and the four small frames in the steps mark the
 * spot drawings.
 */
const chunky = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-sk4", display: "swap", preload: false });

// The wall, in pixels. A brick is 64 by 28 with 4 of mortar; a course is 32 high.
const H = 360;
const BRICK = { w: 64, h: 28, pitchX: 68, pitchY: 32 };
const FULL_COURSES = 3;
const WALL_TOP = H - FULL_COURSES * BRICK.pitchY;
// The unfinished courses above, built up from the right: how many bricks each has, lowest first.
const RAKED = [15, 11, 7];
const BUILT_TOP = WALL_TOP - RAKED.length * BRICK.pitchY;
// The idea bricks on top of the wall.
const IDEA = { w: 54, h: 24, pitchX: 58, pitchY: 28, left: -300 };

// What the four spot drawings would show. Each is one asset on the checklist.
const spots = [
  "Spot drawing: a toolbox being opened",
  "Spot drawing: a notebook with a week of ticks",
  "Spot drawing: three bricks on a hod",
  "Spot drawing: a brick being set into a wall with a trowel",
];

export function Sketch4({ copy }: SketchProps) {
  const hero = copy.home.hero;
  const how = copy.home.how;
  const weeks = compoundingSteps.slice(0, 3);
  const latest = weeks[weeks.length - 1];
  const total = compoundingCaption(copy.bricks.caption, latest);
  const monday = copy.howItWorks.week.days[1].day;

  return (
    <div data-sketch="4" className={`sk4 ${chunky.variable}`}>
      <SkipLink to="sk4-hero" />
      <Sketch4Nav>
        <Link href="/" className="sk4-brand">
          <LogoSlot />
          Roger
        </Link>
        <nav aria-label="Main" className="sk4-links">
          <ul>
            {navItems(copy).map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sk4-account">
          <Link href="/signin" className="sk4-signin">
            {copy.buttons.signIn}
          </Link>
          <StartLink audience="re" className="sk4-btn sk4-btn-s">
            {copy.buttons.start}
          </StartLink>
        </div>
      </Sketch4Nav>

      <section id="sk4-hero" aria-labelledby="sk4-title" className="sk4-hero" data-sk4-zone="sky">
        <div className="sk4-sky" aria-hidden="true">
          <span className="sk4-sun" />
          <span className="sk4-cloud sk4-cloud-1" />
          <span className="sk4-cloud sk4-cloud-2" />
          <span className="sk4-cloud sk4-cloud-3" />
        </div>

        <div className="sk4-copy">
          <h1 id="sk4-title">{hero.headline}</h1>
          <p className="sk4-sub">{hero.sub}</p>
          <div className="sk4-actions">
            <StartLink audience="re" className="sk4-btn">
              {copy.buttons.start}
            </StartLink>
            <Link href={hero.secondary.href} className="sk4-link">
              {hero.secondary.label}
            </Link>
          </div>
          <p className="sk4-card">{copy.cardLine}</p>
        </div>

        <Placeholder
          className="sk4-art"
          label="Illustration to go over the drawn wall, in the same flat style: a hoist lowering this Monday's three bricks, a ladder, a wheelbarrow, two small figures at work"
          width={1600}
          height={900}
          format="SVG or transparent PNG"
        />

        {/* data-claims: the week numbers and the brick count of the compounding story, for the claims check. */}
        <svg className="sk4-world" width="100%" height={H} role="img" aria-label={`${total.week}: ${total.bricks}`} data-claims="compounding">
          <defs>
            <pattern id="sk4-bond" width={BRICK.pitchX} height={BRICK.pitchY * 2} patternUnits="userSpaceOnUse" patternTransform={`translate(0 ${WALL_TOP + 4})`}>
              <rect className="sk4-b1" x="0" y="0" width={BRICK.w} height={BRICK.h} rx="3" />
              <rect className="sk4-b2" x={-BRICK.pitchX / 2} y={BRICK.pitchY} width={BRICK.w} height={BRICK.h} rx="3" />
              <rect className="sk4-b2" x={BRICK.pitchX / 2} y={BRICK.pitchY} width={BRICK.w} height={BRICK.h} rx="3" />
            </pattern>
          </defs>

          {/* The finished courses: the full width of the page, and the top of the next section. */}
          <rect className="sk4-mortar" x="0" y={WALL_TOP} width="100%" height={H - WALL_TOP} />
          <rect x="0" y={WALL_TOP} width="100%" height={H - WALL_TOP} fill="url(#sk4-bond)" />

          {/* A pallet of spare bricks on the finished part, at the left. */}
          <g className="sk4-pallet" transform={`translate(72 ${WALL_TOP})`}>
            <rect className="sk4-plank" x="-8" y="-8" width="176" height="8" rx="2" />
            {[0, 1, 2].map((row) =>
              Array.from({ length: 3 - row }, (_, i) => <rect key={`${row}-${i}`} className="sk4-spare" x={i * 52 + row * 26} y={-8 - (row + 1) * 22} width="48" height="18" rx="2" />),
            )}
          </g>

          {/* Everything from here is measured from the right edge, so it stays in view on a phone. */}
          <svg x="100%" overflow="visible">
            {RAKED.map((count, course) => {
              const y = WALL_TOP - (course + 1) * BRICK.pitchY;
              const shift = course % 2 === 0 ? BRICK.pitchX / 2 : 0;
              return (
                <g key={course}>
                  <rect className="sk4-mortar" x={-count * BRICK.pitchX + shift - 4} y={y} width={count * BRICK.pitchX + 8} height={BRICK.pitchY} />
                  {Array.from({ length: count }, (_, i) => (
                    <rect key={i} className={(i + course) % 3 === 0 ? "sk4-b2" : "sk4-b1"} x={-(i + 1) * BRICK.pitchX + shift} y={y + 4} width={BRICK.w} height={BRICK.h} rx="3" />
                  ))}
                </g>
              );
            })}

            {/* A signpost: which day this is. */}
            <g className="sk4-sign">
              <rect className="sk4-post" x={IDEA.left - 26} y={BUILT_TOP - 128} width="6" height="128" rx="2" />
              <rect className="sk4-board" x={IDEA.left - 112} y={BUILT_TOP - 124} width="92" height="34" rx="6" />
              <text x={IDEA.left - 66} y={BUILT_TOP - 101} textAnchor="middle">
                {monday}
              </text>
            </g>

            {/* The ideas: three a week, oldest at the foot. The top row is this Monday's. */}
            {weeks.map((step, row) => {
              const y = BUILT_TOP - (row + 1) * IDEA.pitchY + 2;
              return (
                <g key={step.week} className="sk4-week" data-week={step.week} data-new={step.week === latest.week ? "" : undefined}>
                  {Array.from({ length: bricksPerWeek }, (_, i) => (
                    <rect key={i} className="sk4-idea" style={{ "--i": i } as CSSProperties} x={IDEA.left + i * IDEA.pitchX} y={y} width={IDEA.w} height={IDEA.h} rx="4" />
                  ))}
                  <text x={IDEA.left + bricksPerWeek * IDEA.pitchX + 8} y={y + 17}>
                    {compoundingCaption(copy.bricks.caption, step).week}
                  </text>
                </g>
              );
            })}
            {/* Next Monday's three go here. */}
            {Array.from({ length: bricksPerWeek }, (_, i) => (
              <rect key={i} className="sk4-slot" x={IDEA.left + i * IDEA.pitchX + 1} y={BUILT_TOP - (weeks.length + 1) * IDEA.pitchY + 3} width={IDEA.w - 2} height={IDEA.h - 2} rx="4" />
            ))}
          </svg>
        </svg>
      </section>

      <section id={how.id} aria-labelledby="sk4-how-title" className="sk4-next" data-sk4-zone="wall">
        <div className="sk4-bond" aria-hidden="true" />
        <h2 id="sk4-how-title">{how.title}</h2>
        <ol>
          {how.steps.map((step, i) => (
            <li key={step.title} className="sk4-step">
              <Placeholder compact label={spots[i]} width={480} height={480} format="SVG" />
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
