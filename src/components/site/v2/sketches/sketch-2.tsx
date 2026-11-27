import type { CSSProperties } from "react";
import Link from "next/link";
import { IBM_Plex_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import { StartLink } from "@/components/site/shared/start-link";
import { compoundingSteps } from "@/data/site/compounding";
import { compoundingCaption } from "@/lib/site/compounding";
import { Placeholder } from "../placeholder";
import { bricksFor, LogoSlot, navItems, SkipLink, type SketchProps, sketchWords } from "../sketch-kit";
import { Sketch2Stage } from "./sketch-2-stage";
import "./sketch-2.css";

/**
 * Hero sketch 2, in the spirit of earth-ai.com (plan U11, design guide B3).
 *
 * Takes: a story told as you scroll on a dark ground, in quiet type: a light
 * serif for the statements, a mono voice for labels, a sans for reading. Does
 * not take: the loading screen, or the large figures. The only numbers here
 * are the week labels and brick counts of the compounding story.
 *
 * The bricks are a rail that stays beside the story. Week 1's three are there
 * when the page opens, and a week arrives as each of the next two statements
 * comes up the screen. With no script, or with reduced motion, all three weeks
 * are in place from the start.
 */
const serif = Newsreader({ subsets: ["latin"], weight: ["300", "400"], variable: "--font-sk2-serif", display: "swap", preload: false });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-sk2-mono", display: "swap", preload: false });
const sans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-sk2-sans", display: "swap", preload: false });

export function Sketch2({ copy }: SketchProps) {
  const hero = copy.home.hero;
  const problem = copy.home.problem;
  const { how, secondary } = sketchWords(copy);
  const weeks = compoundingSteps.slice(0, 3);

  return (
    <div data-sketch="2" className={`sk2 ${serif.variable} ${mono.variable} ${sans.variable}`}>
      <SkipLink to="sk2-hero" />
      <header className="sk2-nav">
        <Link href="/" className="sk2-brand">
          <LogoSlot />
          Roger
        </Link>
        <nav aria-label="Main" className="sk2-links">
          <ul>
            {navItems(copy).map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sk2-account">
          <Link href="/signin" className="sk2-signin">
            {copy.buttons.signIn}
          </Link>
          <StartLink audience="re" className="sk2-btn-line">
            {copy.buttons.start}
          </StartLink>
        </div>
      </header>

      <div className="sk2-body">
        <div className="sk2-story">
          <section id="sk2-hero" aria-labelledby="sk2-title" className="sk2-hero" data-sk2-week="1">
            <h1 id="sk2-title">{hero.headline}</h1>
            <p className="sk2-sub">{hero.sub}</p>
            <div className="sk2-actions">
              <StartLink audience="re" className="sk2-btn">
                {copy.buttons.start}
              </StartLink>
              <Link href={secondary.href} className="sk2-link">
                {secondary.label}
              </Link>
            </div>
            <p className="sk2-card">{copy.cardLine}</p>
          </section>

          <Placeholder className="sk2-still" label="Wide still or slow silent film: the rooftops of a residential street at night, seen from above, one window lit, very dark, fine grain" width={2800} height={1200} format="JPG or MP4" />

          <section aria-labelledby="sk2-problem-title" className="sk2-problem">
            <h2 id="sk2-problem-title" className="sk2-label">
              {problem.title}
            </h2>
            {problem.statements.map((statement, i) => (
              // The first two statements each bring a week of bricks onto the rail.
              <p key={statement} className="sk2-statement" data-sk2-week={i < 2 ? i + 2 : undefined}>
                {statement}
              </p>
            ))}
          </section>

          <section id={how.id} aria-labelledby="sk2-how-title" className="sk2-how">
            <h2 id="sk2-how-title" className="sk2-label">
              {how.title}
            </h2>
            <ol>
              {how.steps.map((step) => (
                <li key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* data-claims: the week numbers and brick counts of the compounding story, for the claims check. */}
        <aside className="sk2-rail" data-claims="compounding" aria-label={copy.home.compounds.title}>
          <div className="sk2-rows">
            {weeks.map((step) => {
              const caption = compoundingCaption(copy.bricks.caption, step);
              return (
                <div key={step.week} className="sk2-row" data-week={step.week}>
                  <ul data-bricks={step.bricks}>
                    {bricksFor(copy.bricks, step.week)
                      .filter((brick) => brick.week === step.week)
                      .map((brick, i) => (
                        <li key={i} style={{ "--i": i } as CSSProperties}>
                          <span className="sk2-sr">{brick.label}</span>
                        </li>
                      ))}
                  </ul>
                  <p>
                    <span>{caption.week}</span>
                    <span>{caption.bricks}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
      <Sketch2Stage />
    </div>
  );
}
