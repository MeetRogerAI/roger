import Link from "next/link";
import { DM_Mono, Fraunces } from "next/font/google";
import { StartLink } from "@/components/site/shared/start-link";
import { compoundingSteps } from "@/data/site/compounding";
import { letter, letterShown } from "@/data/site/letter";
import { firstExample } from "@/data/site/examples";
import { Placeholder } from "../placeholder";
import { bricksFor, LogoSlot, navItems, SkipLink, type SketchProps, sketchWords } from "../sketch-kit";
import { Sketch5Wall } from "./sketch-5-wall";
import "./sketch-5.css";

/**
 * Hero sketch 5, in the spirit of olddogs.ai (plan U11, design guide B3, B6
 * and X1: Kamens's "the most magical thing you can think of").
 *
 * Takes: one hero interaction that rewards attention, calm editorial type
 * around it, and a short note from the founder in a narrow column. Does not
 * take: the cream paper, the Didot headline, the dogs, or a logo rail.
 *
 * The interaction is the brick wall. It is drawn in grey over a dithered
 * illustration, and takes colour where the pointer goes or where the keyboard
 * moves. One brick holds the real sample idea and shows its title; the full
 * build would give each of a Monday's three bricks a real idea to show.
 *
 * The illustration is a placeholder. The note is the opening of Peter's
 * letter, word for word.
 */
const serif = Fraunces({ subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"], variable: "--font-sk5-serif", display: "swap", preload: false });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-sk5-mono", display: "swap", preload: false });

// Three Mondays: the first two set up, the third just arrived.
const WEEK = compoundingSteps[2];
const SET_UP = compoundingSteps[1].bricks;
/** How many paragraphs of the letter the note prints. */
const NOTE_PARAGRAPHS = 2;

export function Sketch5({ copy }: SketchProps) {
  const hero = copy.home.hero;
  const { how, secondary } = sketchWords(copy);
  const who = sketchWords(copy).whoRuns;
  const bricks = bricksFor(copy.bricks, WEEK.week, SET_UP);

  return (
    <div data-sketch="5" className={`sk5 ${serif.variable} ${mono.variable}`}>
      <SkipLink to="sk5-hero" />
      <header className="sk5-nav">
        <Link href="/" className="sk5-brand">
          <LogoSlot />
          Roger
        </Link>
        <nav aria-label="Main" className="sk5-links">
          <ul>
            {navItems(copy).map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sk5-account">
          <Link href="/signin" className="sk5-signin">
            {copy.buttons.signIn}
          </Link>
          <StartLink audience="re" className="sk5-btn sk5-btn-s">
            {copy.buttons.start}
          </StartLink>
        </div>
      </header>

      <section id="sk5-hero" aria-labelledby="sk5-title" className="sk5-hero">
        <div className="sk5-art">
          <Placeholder
            fill
            label="Dithered illustration: a brick wall half built on a hillside above the rooftops of a town, in greyscale halftone, with nine of its bricks left clear to take colour"
            width={2880}
            height={1400}
            format="PNG"
          />
          <Sketch5Wall
            bricks={bricks}
            sampleAt={SET_UP}
            sample={{ title: firstExample.play.title, line: sketchWords(copy).sampleLine }}
            groupLabel={copy.home.compounds.title}
            hint="Point at a brick, or use the arrow keys."
          />
          <div className="sk5-dissolve" aria-hidden="true" />
        </div>

        <div className="sk5-copy">
          <h1 id="sk5-title">{hero.headline}</h1>
          <p className="sk5-sub">{hero.sub}</p>
          <div className="sk5-actions">
            <StartLink audience="re" className="sk5-btn">
              {copy.buttons.start}
            </StartLink>
            <Link href={secondary.href} className="sk5-link">
              {secondary.label}
            </Link>
          </div>
          <p className="sk5-card">{copy.cardLine}</p>
        </div>
      </section>

      <section aria-labelledby="sk5-note-title" className="sk5-note">
        <h2 id="sk5-note-title">{who.title}</h2>
        <p className="sk5-lead">{who.leadIn}</p>
        {/* data-claims: Peter's letter, word for word, for the claims check. */}
        <div data-claims="letter" className="sk5-letter">
          <p>{letter.greeting}</p>
          {letterShown.slice(0, NOTE_PARAGRAPHS).map((paragraph) => (
            <p key={paragraph.id}>{paragraph.shown}</p>
          ))}
          <p className="sk5-signature">{letter.signature}</p>
        </div>
        <Link href={who.link.href} className="sk5-link">
          {who.link.label}
        </Link>
      </section>

      <section id={how.id} aria-labelledby="sk5-how-title" className="sk5-how">
        <h2 id="sk5-how-title">{how.title}</h2>
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
  );
}
