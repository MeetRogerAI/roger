import type { ReactNode } from "react";
import type { SketchProps } from "../sketch-kit";
import { Sketch1 } from "./sketch-1";
import { Sketch2 } from "./sketch-2";
import { Sketch3 } from "./sketch-3";
import { Sketch4 } from "./sketch-4";
import { Sketch5 } from "./sketch-5";

/**
 * The five v2 hero sketches (plan U11, R15), one in the spirit of each of the
 * owner's five example sites, with the note the index page prints under each.
 * The longer record, with each sketch's placeholders and its weakest point, is
 * docs/site/v2-reference-board.md.
 *
 * This is the only file that knows all five. No sketch imports another.
 */
export type HeroSketch = {
  n: number;
  /** A short name for the direction. */
  name: string;
  /** The example site it is in the spirit of. */
  site: string;
  /** The one thing it takes from that site. */
  takes: string;
  /** What it leaves behind on purpose. */
  leaves: string;
  /** The real assets it would need. */
  needs: string;
  Component: (props: SketchProps) => ReactNode;
};

export const heroSketches: HeroSketch[] = [
  {
    n: 1,
    name: "One picture, one line",
    site: "theacademysf.com",
    takes: "the scale and calm of one very large, tightly set, centred headline over a single full-bleed picture, with a floating translucent header and one bright button.",
    leaves: "any picture of its own, and the rows of faces and names further down that site. The bricks sit on a glass ledge at the foot of the picture.",
    needs: "one hero photograph or silent looping film, and four step photographs.",
    Component: Sketch1,
  },
  {
    n: 2,
    name: "A story in the dark",
    site: "earth-ai.com",
    takes: "a story told as you scroll on a dark ground, in quiet type: a light serif for the statements, a mono voice for labels and a sans for reading.",
    leaves: "the loading screen and the large figures. The only numbers are the week labels and brick counts on the rail, which fills a week at a time as the story goes by.",
    needs: "one wide night still or slow film. Everything else is type and bricks.",
    Component: Sketch2,
  },
  {
    n: 3,
    name: "Warm, with the product on show",
    site: "maticrobots.com",
    takes: "the warmth, a headline at the scale of a greeting, a white pill button, the product in plain view, and a currency choice that is visible and simple.",
    leaves: "awards, press logos and reviews, because Roger has none to show. The product is a small window over the photograph, with this Monday’s three ideas landing in it.",
    needs: "one warm hero photograph, which may show a person, and one photograph for the next section. The product window is drawn in code.",
    Component: Sketch3,
  },
  {
    n: 4,
    name: "A world built of bricks",
    site: "railcode.dev",
    takes: "an illustrated world of the product’s own that the layout is built around and that becomes the way into the next section, a header that takes each section’s colour, and a chunky button.",
    leaves: "pixel art, the pixel font, the sky-blue and grass-green, and the yellow button. The wall is drawn in code, and the four steps are laid into it as bricks.",
    needs: "nothing to work as it is. An illustration over the drawn wall and four spot drawings would enrich it, and their frames are marked.",
    Component: Sketch4,
  },
  {
    n: 5,
    name: "One thing to play with",
    site: "olddogs.ai",
    takes: "one hero interaction that rewards attention, calm editorial type around it, and a short note from the founder in a narrow column.",
    leaves: "the cream paper, the Didot headline, the dogs and the logo rail. The wall of bricks takes colour where the pointer or the arrow keys go, and one brick shows the real sample idea.",
    needs: "one dithered illustration with nine bricks left clear. The full build would also need a real idea for each of a Monday’s three bricks.",
    Component: Sketch5,
  },
];

export function heroSketch(n: string | number): HeroSketch | undefined {
  return heroSketches.find((sketch) => String(sketch.n) === String(n));
}
