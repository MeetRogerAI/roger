import type { CSSProperties } from "react";
import Link from "next/link";
import { Figtree } from "next/font/google";
import { StartLink } from "@/components/site/shared/start-link";
import { bricksPerWeek, compoundingSteps } from "@/data/site/compounding";
import { currencies, priceLine } from "@/lib/site/amounts";
import { compoundingCaption } from "@/lib/site/compounding";
import { Placeholder } from "../placeholder";
import { bricksFor, LogoSlot, navItems, SkipLink, type SketchProps } from "../sketch-kit";
import { SketchPrice } from "../sketch-price";
import "./sketch-3.css";

/**
 * Hero sketch 3, in the spirit of maticrobots.com (plan U11, design guide B3).
 *
 * Takes: the warmth, a product you can see, a headline at the scale of a
 * greeting, a white pill button, and a currency choice that is visible and
 * simple. Does not take: awards, press logos or reviews. Roger has none to
 * show.
 *
 * The product is on show as a small window over the photograph: this Monday's
 * three ideas landing, with the stack they join underneath. The window is
 * drawn in code. The photograph is a placeholder.
 *
 * R19: the photograph may show a person. Nothing beside it is a quote, a name
 * or a role, and its label calls nobody a Roger user.
 */
const friendly = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sk3", display: "swap", preload: false });

// The window shows the third Monday: two weeks in place, three ideas just arrived, the first already set up.
const WEEK = compoundingSteps[2];
const SET_UP = WEEK.bricks - 2;

export function Sketch3({ copy, amounts }: SketchProps) {
  const hero = copy.home.hero;
  const how = copy.home.how;
  const bricks = bricksFor(copy.bricks, WEEK.week, SET_UP);
  const caption = compoundingCaption(copy.bricks.caption, WEEK);

  return (
    <div data-sketch="3" className={`sk3 ${friendly.variable}`}>
      <SkipLink to="sk3-hero" />
      <header className="sk3-nav">
        <Link href="/" className="sk3-brand">
          <LogoSlot />
          Roger
        </Link>
        <nav aria-label="Main" className="sk3-links">
          <ul>
            {navItems(copy).map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sk3-account">
          <Link href="/signin" className="sk3-signin">
            {copy.buttons.signIn}
          </Link>
          <StartLink audience="re" className="sk3-pill sk3-pill-dark">
            {copy.buttons.start}
          </StartLink>
        </div>
      </header>

      <section id="sk3-hero" aria-labelledby="sk3-title" className="sk3-hero">
        <div className="sk3-copy">
          <h1 id="sk3-title">{hero.headline}</h1>
          <p className="sk3-sub">{hero.sub}</p>
          <div className="sk3-actions">
            <StartLink audience="re" className="sk3-pill">
              {copy.buttons.start}
            </StartLink>
            <Link href={hero.secondary.href} className="sk3-link">
              {hero.secondary.label}
            </Link>
          </div>
          <p className="sk3-card">{copy.cardLine}</p>
          <SketchPrice
            label={copy.price.switchLabel}
            name={copy.priceBlock.monthly.name}
            options={currencies.map((currency) => ({ currency, line: priceLine(currency, amounts.monthly[currency], copy.price.perMonth), tax: copy.price.tax[currency] }))}
          />
        </div>

        <div className="sk3-scene">
          <Placeholder
            className="sk3-photo"
            label="Hero photograph: a person at a kitchen table on a Monday morning, laptop open, coffee beside it, warm light from a window"
            width={1800}
            height={2000}
            format="JPG"
          />
          {/* data-claims: the week number and brick count of the compounding story, for the claims check. */}
          <figure className="sk3-window" data-claims="compounding">
            <figcaption>{copy.sample.title}</figcaption>
            <ul data-bricks={bricksPerWeek} className="sk3-ideas">
              {bricks
                .filter((brick) => brick.week === WEEK.week)
                .map((brick, i) => (
                  <li key={brick.idea} data-set-up={brick.setUp ? "yes" : "no"} style={{ "--i": i } as CSSProperties}>
                    <span className="sk3-brick" />
                    {/* Two bars stand for an idea's title and its one line. The full build prints real ones. */}
                    <span className="sk3-bars" aria-hidden="true">
                      <i />
                      <i />
                    </span>
                    <span className="sk3-status" aria-hidden="true">
                      {brick.setUp ? copy.bricks.setUp : copy.bricks.empty}
                    </span>
                    <span className="sk3-sr">{brick.label}</span>
                  </li>
                ))}
            </ul>
            <div className="sk3-stack">
              <ul data-bricks={WEEK.bricks}>
                {bricks.map((brick, i) => (
                  <li key={i} data-set-up={brick.setUp ? "yes" : "no"} data-row={brick.week}>
                    <span className="sk3-sr">{brick.label}</span>
                  </li>
                ))}
              </ul>
              <p>
                <strong>{caption.week}</strong>
                <span>{caption.bricks}</span>
              </p>
            </div>
          </figure>
        </div>
      </section>

      <section id={how.id} aria-labelledby="sk3-how-title" className="sk3-next">
        <div className="sk3-next-lead">
          <h2 id="sk3-how-title">{how.title}</h2>
          <Placeholder className="sk3-photo-2" label="Photograph: a phone on a wooden kitchen counter showing a short list, morning light, a hand reaching for it" width={1800} height={1200} format="JPG" />
        </div>
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
