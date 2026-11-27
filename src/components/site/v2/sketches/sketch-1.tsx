import Link from "next/link";
import { Inter_Tight } from "next/font/google";
import { StartLink } from "@/components/site/shared/start-link";
import { bricksPerWeek, compoundingSteps } from "@/data/site/compounding";
import { compoundingCaption } from "@/lib/site/compounding";
import { Placeholder } from "../placeholder";
import { bricksFor, LogoSlot, navItems, SkipLink, type SketchProps, sketchWords } from "../sketch-kit";
import "./sketch-1.css";

/**
 * Hero sketch 1, in the spirit of theacademysf.com (plan U11, design guide B3).
 *
 * Takes: the scale and confidence of one very large, tightly set, centred
 * headline over a calm full-bleed picture, a floating translucent header, and
 * one bright button. Does not take: any picture of its own. The picture is a
 * placeholder for a photograph or silent film Peter generates.
 *
 * The bricks sit on a glass ledge at the foot of the picture: weeks 1, 2 and 3
 * side by side, each Monday's three in the button's colour on top of the ones
 * already there.
 *
 * The font is loaded here and applied to this sketch's own wrapper, so no
 * other page asks for it.
 */
const display = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sk1", display: "swap", preload: false });

// What the four step tiles would show. Each is one asset on the checklist.
const stepPictures = [
  "Step photograph: a laptop open on a kitchen table in the early evening, nobody in the frame",
  "Step photograph: a quiet home office on a Sunday, one lamp on, nobody in the frame",
  "Step photograph: first light through a window onto a tidy desk",
  "Step photograph: hands at a laptop keyboard, close, in natural light",
];

export function Sketch1({ copy }: SketchProps) {
  const hero = copy.home.hero;
  const { how, secondary } = sketchWords(copy);
  const weeks = compoundingSteps.slice(0, 3);

  return (
    <div data-sketch="1" className={`sk1 ${display.variable}`}>
      <SkipLink to="sk1-hero" />
      <header className="sk1-nav">
        <Link href="/" className="sk1-brand">
          <LogoSlot />
          Roger
        </Link>
        <nav aria-label="Main" className="sk1-links">
          <ul>
            {navItems(copy).map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sk1-account">
          <Link href="/signin" className="sk1-signin">
            {copy.buttons.signIn}
          </Link>
          <StartLink audience="re" className="sk1-btn sk1-btn-s">
            {copy.buttons.start}
          </StartLink>
        </div>
      </header>

      <section id="sk1-hero" aria-labelledby="sk1-title" className="sk1-hero">
        <Placeholder fill label="Hero photograph or silent looping film: a quiet street of houses at first light on a Monday, wide and calm, nobody in the frame" width={2880} height={1800} format="JPG or MP4" />
        <div className="sk1-scrim" aria-hidden="true" />

        <div className="sk1-center">
          <h1 id="sk1-title">{hero.headline}</h1>
          <p className="sk1-sub">{hero.sub}</p>
          <div className="sk1-actions">
            <StartLink audience="re" className="sk1-btn">
              {copy.buttons.start}
            </StartLink>
            <Link href={secondary.href} className="sk1-link">
              {secondary.label}
            </Link>
          </div>
          <p className="sk1-card">{copy.cardLine}</p>
        </div>

        {/* data-claims: the week numbers and brick counts of the compounding story, for the claims check. */}
        <figure className="sk1-ledge" data-claims="compounding">
          {weeks.map((step, s) => {
            const caption = compoundingCaption(copy.bricks.caption, step);
            return (
              <div key={step.week} className="sk1-stack" style={{ "--s": s } as React.CSSProperties}>
                <ul data-bricks={step.bricks}>
                  {bricksFor(copy.bricks, step.week).map((brick, i) => (
                    <li key={i} data-new={brick.week === step.week ? "" : undefined} style={{ "--i": i % bricksPerWeek } as React.CSSProperties}>
                      <span className="sk1-sr">{brick.label}</span>
                    </li>
                  ))}
                </ul>
                <p>
                  <strong>{caption.week}</strong>
                  <span>{caption.bricks}</span>
                </p>
              </div>
            );
          })}
        </figure>
      </section>

      <section id={how.id} aria-labelledby="sk1-how-title" className="sk1-next">
        <h2 id="sk1-how-title">{how.title}</h2>
        <ol>
          {how.steps.map((step, i) => (
            <li key={step.title}>
              <Placeholder compact label={stepPictures[i]} width={1200} height={1500} format="JPG" />
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
