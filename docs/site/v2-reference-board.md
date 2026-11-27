# Version 2 reference board and the five hero sketches

Plan unit U11 (R15, R17, R19, F3). Written November 26, 2026.

Version 2 follows the five example sites Peter sent. It starts with five homepage hero sketches, one in the spirit of each site. Peter picks one, or names a mix, and the whole of version 2 is then built in that look.

- Index of all five: `/site-preview`
- One sketch, full page: `/site-preview/hero/1` to `/site-preview/hero/5`
- Screenshots: `docs/site/v2/sketches/hero-<n>-1440.png`, `hero-<n>-375.png` and `index-1440.png`

These addresses are served on a preview link and in local development only. In production they are not found.

## Peter's pick

Awaiting Peter's choice: one sketch, or a mix (say which part of which).

## What every sketch keeps

- The words are the version 1 words, read from `src/data/site/v1.ts`: the headline, the sub-line, the start button, "See how it works" and the card line under the buttons. No line was retyped or changed.
- The claims rules hold. Each sketch's rendered text passes the claims check in `src/lib/site/claims.ts`. The only numbers are the week labels and brick counts of the compounding story.
- Every picture is a labelled placeholder at the real asset's shape. No picture was generated.
- The bricks are in every sketch: three arrive each Monday and the stack grows.
- The logo is an empty labelled slot beside the word "Roger".
- Each sketch has its own fonts and colours, loaded and scoped to that sketch only. No other page changes.

Words in the sketches that are not version 1 copy: "Skip to content", the word "logo" in the logo slot, the placeholder labels, and one hint in sketch 5 ("Point at a brick, or use the arrow keys."). Peter may cut or reword the hint.

## How the five sites were looked at

The five addresses were fetched on November 26, 2026 with a tool that returns a page's text, not its picture. That gave the wording and section order of four sites. For railcode.dev it returned the page title only. No screenshot or stylesheet was seen. So everything below about how a site looks (type, colour, layout, motion) is taken from section B3 and appendix X1 and X2 of `artifacts/marketing-site-design-guide-roger.md`, whose author loaded the sites on the same day. Each entry says which is which.

Nothing was copied from any site: no text, logo, image or layout.

### 1. theacademysf.com: "One picture, one line"

- **Fetched (text only):** one headline, one "Apply" button, a header of five links, then a row of speaker faces and names.
- **From the guide (B3):** a full-bleed photo or film hero under a very large, tightly set, centred two-line headline; a floating translucent header; one bright orange-red button.
- **The one thing taken:** the scale and calm of one huge centred headline over one picture, with one bright button.
- **Not taken:** any picture of theirs, and the rows of faces and names. Roger shows no people as proof.
- **The sketch:** one full-bleed picture in a rounded frame set a little inside the page edge. The headline is centred over it in white at very large size. The header is a translucent panel that floats and stays as the page scrolls. The button is orange with dark text. The bricks sit on a dark glass ledge at the foot of the picture: weeks 1, 2 and 3 side by side, each Monday's three in the button's orange. The next section is white, with a large centred "How it works" and four tall photograph tiles.
- **Fonts and colours:** Inter Tight. White on a dark scrim over the picture, orange `#ff5a1f`, a white page below.
- **Weakest point:** it depends on the photograph more than any other sketch. With a weak picture it is a headline on a dark box, and the bricks are the smallest here.

### 2. earth-ai.com: "A story in the dark"

- **Fetched (text only):** a large statement headline with a smaller line under it, a header of two links, then sections that each lead with a figure.
- **From the guide (B3):** dark, with a loading screen; a serif, a sans and a mono together; the story told section by section with large figures.
- **The one thing taken:** a story told as you scroll on a dark ground, in quiet type.
- **Not taken:** the loading screen and the large figures. Roger states no results in numbers.
- **The sketch:** a green-black ground. The headline sits low and left in a light serif. Labels, links and the card line are in a mono face, and reading text is in a sans. Each of the three "problem" statements has most of a screen to itself. A rail of clay bricks stays in view: week 1's three are there when the page opens, and weeks 2 and 3 arrive as the next two statements come up. On a phone the rail is a bar along the foot of the screen. With reduced motion, or no script, all three weeks are in place from the start.
- **Fonts and colours:** Newsreader (serif), IBM Plex Mono, Instrument Sans. Ground `#0d100e`, bone `#ece7db`, three clay tones for the bricks.
- **Weakest point:** it is the least visual of the five and the most text-led, which is the opposite of "more visual, less text". It also sits near the "near-black with one accent" look the guide warns about in B4. The serif, the green-black and the clay bricks keep it apart, but not by much.

### 3. maticrobots.com: "Warm, with the product on show"

- **Fetched (text only):** a greeting headline, a short offer line, a "Shop now" button, a currency label in the header, then a strip of award and press logos.
- **From the guide (B3):** a warm photographic product hero, a white pill button, an awards strip, a CAD selector in the header.
- **The one thing taken:** the warmth, with the product in plain view and a currency choice that is visible and simple.
- **Not taken:** awards, press logos and reviews. Roger has none, and invented proof is banned.
- **The sketch:** a warm sand page. The words are at the left at the scale of a greeting, with a white pill button. A tall warm photograph is at the right. Over its corner sits a small product window, titled "What arrives on Monday": this Monday's three ideas landing one after another, each marked "set up" or "not set up yet", with the stack they join underneath. Under the card line is the monthly price with a USD and CAD switch. The switch uses the site's own currency store, so the choice is carried by the start button. The next section is a white sheet with round shoulders laid over the sand.
- **Fonts and colours:** Figtree. Sand `#efe5d6`, cocoa `#2a1c13`, a white pill, persimmon, olive and ochre bricks.
- **Weakest point:** the product window shows bars where the idea titles go, because only one real sample idea exists. It is also the closest of the five to a familiar product-page layout: words left, picture right.

### 4. railcode.dev: "A world built of bricks"

- **Fetched (text only):** the page title only. Nothing of the page itself came back.
- **From the guide (B3, X2):** an illustrated world of the product's own, placed along the foot of the hero, that becomes the colour change into the next section; a header that takes the colour of the section in view; a chunky yellow button with a darker bottom edge; lines and shadows tinted warm.
- **The one thing taken:** an illustration the layout is built around, which becomes the way into the next section.
- **Not taken:** pixel art, the pixel font, the sky-blue and grass-green, and the yellow button.
- **The sketch:** a morning sky. Along the foot of the hero is a brick wall under construction, drawn in code. The wall is the next section's ground, and the four steps are laid into it as cream bricks in running bond, with dashed slots still to fill. On top of the wall sit the idea bricks: weeks 1, 2 and 3, three to a week, with dashed slots for next Monday and a signpost that says "Monday". The header is a floating slab that turns from sky to brick as the wall comes under it. The button is a dark teal block with an edge under it that goes down when pressed.
- **Fonts and colours:** Bricolage Grotesque. Sky `#d6e7ee` to `#f7ead7`, brick `#b5532f`, wall `#8a3a21`, teal button `#1f4f4a`.
- **Weakest point:** the drawing is simple flat shapes. It reads as a diagram more than as an illustrated world until real illustration goes over it. Brick red as the next section's ground is a strong colour to carry down a whole long page.

### 5. olddogs.ai: "One thing to play with"

- **Fetched (text only):** a headline over one full-width illustration, one "Talk to us" button, a logo strip, a short manifesto paragraph, four numbered steps.
- **From the guide (B3, X1.8):** a greyscale engraved scene made of small cells in which hovering reveals a dog in full colour; a large light serif headline; a short founder note in a narrow column.
- **The one thing taken:** one hero interaction that rewards attention.
- **Not taken:** the cream paper, the Didot headline, the dogs and the logo strip.
- **The sketch:** cool grey paper. Across the top is a dithered illustration with a wall of nine bricks on it, drawn in grey outline. Bricks take colour as the pointer comes near, and a caption says which brick it is. One brick holds the real sample idea and shows its title, "Client email in two tones". That brick is the one chosen when the page opens, so its title is readable with no interaction. By keyboard the wall is one Tab stop: the arrow keys, Home and End move between bricks, and Enter or Space chooses one. Below are the headline in a serif, then the opening of Peter's letter in a narrow column, word for word.
- **Fonts and colours:** Fraunces (serif), DM Mono. Paper `#ecebe6`, ink `#151515`, cobalt, vermilion and amber bricks.
- **Weakest point:** the headline and button sit under the illustration, low on a laptop's first screen. Only one brick has a real idea to show, so the other eight reward attention with a label only. The full build needs three real, cleared ideas.

## Placeholders: the seed of the asset checklist

Sizes are in pixels. Each placeholder holds the asset's shape, so the real file can replace it without moving the layout. The file names, generation prompts and final list belong to U12 (R18a, R18b).

| Sketch | Asset | Size | Format | Where it sits |
| --- | --- | --- | --- | --- |
| all | Logo mark (the owner leans to a magnifying glass) | not set | SVG | Header, left of the word "Roger" |
| 1 | Hero photograph or silent looping film: a quiet street of houses at first light on a Monday, wide and calm, nobody in the frame | 2880 × 1800 | JPG or MP4 | Full-bleed behind the headline, cropped to the hero frame |
| 1 | Step photograph: a laptop open on a kitchen table in the early evening, nobody in the frame | 1200 × 1500 | JPG | "How it works", step 1 tile |
| 1 | Step photograph: a quiet home office on a Sunday, one lamp on, nobody in the frame | 1200 × 1500 | JPG | "How it works", step 2 tile |
| 1 | Step photograph: first light through a window onto a tidy desk | 1200 × 1500 | JPG | "How it works", step 3 tile |
| 1 | Step photograph: hands at a laptop keyboard, close, in natural light | 1200 × 1500 | JPG | "How it works", step 4 tile |
| 2 | Wide still or slow silent film: the rooftops of a residential street at night, seen from above, one window lit, very dark, fine grain | 2800 × 1200 | JPG or MP4 | A band between the hero and the first statement |
| 3 | Hero photograph: a person at a kitchen table on a Monday morning, laptop open, coffee beside it, warm light from a window | 1800 × 2000 | JPG | Right half of the hero, behind the product window |
| 3 | Photograph: a phone on a wooden kitchen counter showing a short list, morning light, a hand reaching for it | 1800 × 1200 | JPG | "How it works", under the heading |
| 4 | Illustration to go over the drawn wall, in the same flat style: a hoist lowering this Monday's three bricks, a ladder, a wheelbarrow, two small figures at work | 1600 × 900 | SVG or transparent PNG | Hero, right, over the wall and the idea bricks |
| 4 | Spot drawing: a toolbox being opened | 480 × 480 | SVG | Step 1 brick |
| 4 | Spot drawing: a notebook with a week of ticks | 480 × 480 | SVG | Step 2 brick |
| 4 | Spot drawing: three bricks on a hod | 480 × 480 | SVG | Step 3 brick |
| 4 | Spot drawing: a brick being set into a wall with a trowel | 480 × 480 | SVG | Step 4 brick |
| 5 | Dithered illustration: a brick wall half built on a hillside above the rooftops of a town, in greyscale halftone, with nine of its bricks left clear to take colour | 2880 × 1400 | PNG | Full width across the top of the hero, behind the brick wall |

Not placeholders, and drawn in code: the bricks in every sketch, the product window in sketch 3, and the wall, sky, sun, clouds, signpost and pallet in sketch 4.

## People in pictures (R19)

Three labels describe a person or part of one: sketch 3's hero photograph, sketch 1's "hands at a laptop keyboard", and the "two small figures" in sketch 4's illustration. None is beside a quote, a name, a role or a testimonial heading, and no label calls anyone a Roger user. A test holds this.

Sketch 5 prints Peter's name and letter. Its one illustration has no person in it. If sketch 5 is mixed with a picture of a person, that picture must not sit beside the letter.

## What the sketches do not settle

- The menu on a phone. Below about 1000 pixels each sketch's header shows the logo slot and the start button only.
- Every page other than the homepage's first screen.
- Whether the copy is shortened for a more visual page (R18). The sketches use the version 1 words as they are.
- The asset manifest and the swap from placeholder to real file (U12, KTD14).
