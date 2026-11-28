/**
 * What an admin may edit on the marketing site, and under which name (plan
 * KTD3, R5, R6): the covered pages, each page's sections, and every editable
 * text with its label, its limit, the names it may hold in braces, and where
 * the wording rules check it.
 *
 * HOW A THING IS ADDRESSED. Nothing is addressed by its place in a list.
 *
 * - A field's id is its path in the copy, joined with dots: `buttons.start`,
 *   `home.hero.headline`. Where the path goes through a list, the item's `id`
 *   stands where its index would: `home.problem.statements.alone.text`,
 *   `questions.price-and-billing.items.cost.a`.
 * - A list's id is the path of its array: `home.problem.statements`.
 * - A section is its page's id and its own: `home` + `compounds`.
 *
 * The registry is BUILT FROM THE COPY, so a field cannot exist in one and not
 * the other. `buildRegistry` walks the copy and holds every string it finds
 * against the spec: the string is editable (it matches one field pattern) or
 * it is listed under `notEditable` with the reason. A string with no
 * decision, a pattern that matches nothing, and a list whose items lack
 * unique ids all throw, so adding a line to the copy file fails the tests
 * until someone says whether Pages may edit it.
 *
 * Nothing here reads the database or knows what is stored: see ./format.ts
 * for the stored shape and ./model.ts for applying it.
 */
import { exampleCopy } from "@/data/site/examples";
import { letter, letterShown } from "@/data/site/letter";
import { v1 } from "@/data/site/v1";
import type { Zone } from "../claims";
import { captionNames } from "../compounding";
import { DESTINATION_MAX, amountPlaceholderNames, plainLine, unknownPlaceholder, usableDestination } from "./text";

// ---------------------------------------------------------------------------
// The code model
// ---------------------------------------------------------------------------

/**
 * Peter's letter as /about prints it today: the paragraphs that are still true, each under its id, with the
 * wording the site shows. The approved original and the paragraphs that are held back stay in
 * src/data/site/letter.ts and are not editable.
 */
const letterCopy = {
  greeting: letter.greeting,
  paragraphs: letterShown.map((p) => ({ id: p.id, text: p.shown })),
  signOff: letter.signOff,
  signature: letter.signature,
};

/**
 * The code model: every word the covered pages print, as the code holds it (plan KTD1, the bottom layer). It is
 * the version's copy file with the letter and the homepage's examples (src/data/site/examples.ts) beside it.
 */
export const codeModel = { ...v1, letter: letterCopy, examples: exampleCopy };

/** The shape every layer resolves to: the code model's. */
export type SiteCopy = typeof codeModel;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * How a field's text is tidied and printed: `line` is one line of plain text; `block` keeps its line breaks (a
 * playbook); `destination` is the address of a link (plan KTD12); `toggle` is a switch of an item, which holds
 * "yes" or "no" and prints no words ("show this question on the homepage").
 */
export type FieldKind = "line" | "block" | "destination" | "toggle";

/** What a toggle holds, as text, so that it is stored, compared and reviewed like every other field. */
export const TOGGLE_ON = "yes";
export const TOGGLE_OFF = "no";

export type Field = {
  /** The path in the copy, joined with dots, a list item's id standing where its index would. */
  id: string;
  /** The same path, in parts. */
  path: readonly string[];
  /** The page and the section the admin finds it under. */
  page: string;
  section: string;
  /** What the admin reads beside it. For an item of a list it names the item: "Step “use”: Headline". */
  label: string;
  /** What the field is, without the item it belongs to: "Headline". The Pages screens name the item by its place on the page, never by its id. */
  name: string;
  kind: FieldKind;
  /** The most characters an admin may save. */
  max: number;
  /** The names it may hold in braces, without the braces. Any other name in braces is refused at save and dropped at read. */
  placeholders: readonly string[];
  /** Where the wording rules check it: the page's address and the zones it is printed in (src/lib/site/claims.ts). */
  claims: { path: string; zones: readonly Zone[] };
  /** The array it is an item of, by that array's id, the item's id, and what one item is called ("Step"; null where an item has no name of its own). Absent for a field outside any array. */
  item?: { array: string; id: string; noun: string | null };
  /**
   * For a toggle: where the copy holds it. The item has a list under `key`, and the toggle is on while that list
   * holds `value` (a question's `on` holds "home"). The last part of the field's path is the toggle's own name,
   * which the copy does not have: ./model.ts reads and writes a toggle through this.
   */
  toggle?: { key: string; value: string };
};

/** One field of an item of a list, as every item of the list has it: what a built-in item's field is, and what an added item's is made from. */
export type ItemField = {
  /** The field's key in the item: "q". The last part of the field's id. */
  name: string;
  /** "Question". */
  label: string;
  kind: FieldKind;
  max: number;
  placeholders: readonly string[];
  zones: readonly Zone[];
  toggle?: { key: string; value: string };
  /** What an item added in the admin holds here until it is given something: null for a text, which it must be given; "no" for a toggle. */
  fresh: string | null;
};

/** The three backgrounds a page's sections are painted on (globals.css). */
export type Ground = "night" | "ground" | "ground-2";

export type Section = {
  id: string;
  label: string;
  /** True for a group of fields that is not a section of the page an admin may switch off or move: a page's title, and everything under Shared. */
  fixed: boolean;
  /** The background the page paints it on, for a section an admin may move: two neighbours on the same one get a line between them (the page views). Null for a fixed section, and on /library, which draws no such lines. */
  ground: Ground | null;
  /** The id the section has in the page's markup, which a link can land on ("/#price"). Null for a section no link can land on. */
  anchor: string | null;
  /** In the order the admin reads them. Empty for a section with no words of its own, such as the start band. */
  fields: readonly Field[];
};

export type Page = {
  id: string;
  label: string;
  /** The page's address. Shared has none of its own: its words are checked, and previewed, on the homepage. */
  path: string;
  sections: readonly Section[];
};

/** A list an admin may add to, remove from and reorder (plan R8). */
export type List = {
  /** The path of the array in the copy, joined with dots. */
  id: string;
  label: string;
  /** What one item is called: "Step". */
  item: string;
  page: string;
  section: string;
  /** The built-in items' ids, in the copy's order. */
  items: readonly string[];
  /** The path of the array in the copy, in parts. */
  path: readonly string[];
  /** The address the wording rules check an item's text under: the page's. */
  claimsPath: string;
  /** Each field an item has, in the order the admin reads them. The first is the one whose wording names the item. */
  fields: readonly ItemField[];
  /** The fewest and the most items the page can draw (plan U7). Equal, the list can only be reordered. */
  min: number;
  max: number;
  /** What an item added in the admin holds beside its id and its texts: a question's empty `on`. */
  blank: Readonly<Record<string, unknown>>;
};

export type Registry = {
  pages: readonly Page[];
  /** Every editable field by its id. */
  fields: ReadonlyMap<string, Field>;
  /** Every list by its id. */
  lists: ReadonlyMap<string, List>;
};

// ---------------------------------------------------------------------------
// The spec
// ---------------------------------------------------------------------------

/**
 * A pattern is a field id in which "*" stands for any one part, which is how a pattern names "every item of
 * this list". Under `notEditable` a pattern may also end in "**", for everything below.
 */
export type FieldSpec = { label: string; max: number; kind?: FieldKind; placeholders?: readonly string[]; zones?: readonly Zone[] };

export type SectionSpec = {
  id: string;
  label: string;
  fixed?: boolean;
  ground?: Ground;
  anchor?: string;
  /** The zones every field of the section is printed in, unless the field names its own. */
  zones?: readonly Zone[];
  /** Pattern to field, in the order the admin reads them. */
  fields?: Record<string, FieldSpec>;
};

export type ArraySpec = {
  item: string | null;
  list?: string;
  /** For a list: the fewest and the most items the page can draw. Left out: none, and LIST_CAP. */
  min?: number;
  max?: number;
  /** For a list: the switches each item has, by name, each with its label and where the copy holds it (Field.toggle). They come after the item's texts. */
  toggles?: Record<string, { label: string; key: string; value: string }>;
};

/** The most items any list may hold, where its spec names no smaller number. The stored shape's own bound (./format.ts, LIST_MAX). */
export const LIST_CAP = 30;

export type PageSpec = { id: string; label: string; path: string; sections: SectionSpec[] };

export type RegistrySpec = {
  pages: PageSpec[];
  /**
   * Every array in the copy whose items hold editable text, by pattern. `item` is what one item is called in a
   * field's label (null to leave the label as it is). `list` is the list's label, for an array an admin may add
   * to, remove from and reorder; without it the items are edited as text only.
   */
  arrays: Record<string, ArraySpec>;
  /** Every string and array of the copy that Pages does not edit, by pattern, each with the reason. */
  notEditable: Record<string, string>;
};

/** The limits, by what a field is. A built-in wording never exceeds its own (a test holds the copy to it). */
const short = (label: string): FieldSpec => ({ label, max: 80 });
const line = (label: string): FieldSpec => ({ label, max: 200 });
const lead = (label: string): FieldSpec => ({ label, max: 400 });
const para = (label: string): FieldSpec => ({ label, max: 1500 });
/** The longest label a hero step may have: each is a button in the row above the picture (src/components/site/v1/blocks/hero-steps.tsx). */
export const HERO_STEP_LABEL_MAX = 10;

/**
 * THE HEADER'S AND THE FOOTER'S LINKS (plan U8, measured on November 27, 2026 in a browser).
 *
 * At 1024 pixels, the narrowest width that shows the header's links in a row, the five built-in links leave 34
 * pixels free beside "Sign in" and the start button: no sixth link fits there, and neither does a longer label
 * for one of the five. No count and no length limit can promise that edited labels fit at 1024 (twenty "W"s are
 * 324 pixels), so the header measures its own words instead (src/lib/site/header-fit.ts): links that do not fit
 * at 1024 are in the menu up to 1280, and links that do not fit at 1280 are in the menu at every width. The limits
 * here are what the menu and the footer can hold and still read well: six links in the header (seven rows of the
 * phone's menu with Sign in), eight in the footer (which wraps), a label of 24 characters.
 */
export const NAV_LABEL_MAX = 24;
export const NAV_LINKS_MAX = 6;
export const FOOTER_LINKS_MAX = 8;
/**
 * THE EXAMPLES (plan U8, measured). Below 640 pixels the short titles are stacked, one row each, so any number fits
 * at 375; from 640 they are one row of pills no wider than 44rem, where four of the longest titles take four lines
 * each at 640 and three at 768, and five take five. Four examples, and a short title no longer than the longest
 * built-in one by much.
 */
export const EXAMPLES_MAX = 4;
export const EXAMPLE_LABEL_MAX = 40;
/** The longest playbook: the built-in ones are about 3,000 characters. */
export const PLAYBOOK_MAX = 8000;

/** A section with no words of its own: the night band a reading page ends on. Its button and its line are under Shared. */
const startBand: SectionSpec = { id: "startBand", label: "Start button band", ground: "night" };

/**
 * The site's spec, from the copy: the five covered pages and Shared (plan R5), in the order Pages lists them.
 * A section's id is the name the page's code knows it by. /faq's sections are the copy's question groups, which
 * is why the spec is a function of the copy.
 */
export function siteSpec(copy: { questions: readonly { id: string; title: string }[] }): RegistrySpec {
  return {
    pages: [
      {
        id: "home",
        label: "Home",
        path: "/",
        sections: [
          {
            id: "hero",
            label: "Hero",
            ground: "night",
            fields: {
              "home.hero.headline": line("Headline"),
              "home.hero.sub": lead("Line under the headline"),
              // A button in a row of up to five, which shares a phone's width: about eight letters fit on one line
              // there. A longer word is hyphenated onto a second line inside its button (globals.css, .hero-steps),
              // never run out of it; past this limit it would take three.
              "home.hero.graphic.steps.*.label": { label: "Label", max: HERO_STEP_LABEL_MAX },
              "home.hero.graphic.steps.*.title": line("Headline"),
              "home.hero.graphic.steps.*.body": lead("Text"),
              "home.hero.graphic.pause": short("Pause button"),
              "home.hero.graphic.play": short("Play button"),
            },
          },
          { id: "problem", label: "The problem", ground: "ground", anchor: "problem", fields: { "home.problem.title": line("Heading"), "home.problem.statements.*.text": lead("Text") } },
          {
            id: "examples",
            label: "Cora Curation examples",
            ground: "ground",
            anchor: "examples",
            fields: {
              "sample.title": line("Heading"),
              "sample.idea.title": short("Card: first heading"),
              "sample.idea.summary": short("Card: summary row"),
              "sample.idea.copy": short("Card: what-to-copy row"),
              "sample.install.help": lead("Card: line above the install prompt"),
              "sample.install.copy": short("Card: copy button"),
              "sample.playbook.title": short("Card: second heading"),
              "sample.playbook.steps": short("Card: word after the step count"),
              "sample.playbook.whole": short("Card: row for a playbook with no numbered parts"),
              // The plays themselves (src/data/site/examples.ts): approved text, printed in the card's claims zone. No
              // name in braces: a play holds no amounts, and "{…}" would be read as one. The short title is the one
              // exception: it is printed on the row of tabs above the card, outside the card's zone (example-tabs.tsx),
              // so it is checked as the page checks it, where a figure in it is a claim.
              "examples.*.label": { label: "Short title, on the row of examples", max: EXAMPLE_LABEL_MAX, placeholders: [] },
              "examples.*.category": { label: "Line above the title", max: 80, placeholders: [], zones: ["sample"] },
              "examples.*.title": { label: "Title", max: 200, placeholders: [], zones: ["sample"] },
              "examples.*.summary": { label: "Summary", max: 1500, placeholders: [], zones: ["sample"] },
              "examples.*.install": { label: "What To Copy: the install prompt", max: 1500, placeholders: [], zones: ["sample"] },
              "examples.*.playbook": { label: "Playbook", kind: "block", max: PLAYBOOK_MAX, placeholders: [], zones: ["sample"] },
            },
          },
          {
            id: "compounds",
            label: "It compounds",
            ground: "ground-2",
            anchor: "compounds",
            // The one section that may print the loop's week numbers and counts.
            zones: ["compounding"],
            fields: {
              "home.compounds.title": line("Heading"),
              "home.compounds.line": lead("Line under the heading"),
              "home.compounds.loop.pause": short("Pause button"),
              "home.compounds.loop.play": short("Play button"),
              // The two names are filled for each stack, from src/data/site/compounding.ts. They are not amounts.
              "bricks.caption.week": { ...short("Caption: the week"), placeholders: captionNames },
              "bricks.caption.bricks": { ...short("Caption: the count of ideas"), placeholders: captionNames },
            },
          },
          { id: "testimonials", label: "What people say", ground: "ground", anchor: "say", fields: { "testimonials.title": line("Heading") } },
          {
            id: "control",
            label: "You decide what Zack shares",
            ground: "ground",
            anchor: "control",
            fields: {
              "control.title": line("Heading"),
              "control.points.*.title": line("Title"),
              "control.points.*.body": lead("Text"),
              "control.link.label": short("Link under the points"),
            },
          },
          {
            id: "price",
            label: "Price",
            ground: "night",
            anchor: "price",
            fields: {
              "priceBlock.title": line("Heading"),
              "priceBlock.sub": lead("Line under the heading"),
              "priceBlock.monthly.name": short("Plan name"),
              "priceBlock.monthly.note": lead("Note under the price"),
            },
          },
          { id: "questions", label: "Questions", ground: "ground", anchor: "questions", fields: { "questionsBlock.title": line("Heading"), "questionsBlock.more.label": short("Link to all questions") } },
          { id: "closing", label: "Closing band", ground: "night", fields: { "home.closing.line": line("Line"), "home.closing.start": short("Button") } },
        ],
      },
      {
        id: "howItWorks",
        label: "How it works",
        path: "/how-it-works",
        sections: [
          { id: "title", label: "Page title", fixed: true, fields: { "howItWorks.title": line("Title") } },
          {
            id: "week",
            label: "The week",
            ground: "ground",
            anchor: "week",
            fields: { "howItWorks.week.title": line("Heading"), "howItWorks.week.days.*.day": short("Day"), "howItWorks.week.days.*.body": para("Text") },
          },
          {
            id: "zack",
            label: "Zack, in detail",
            ground: "ground",
            // The copy's own: howItWorks.zack.id, which the control block's link names. A test holds the two together.
            anchor: "zack",
            fields: {
              "howItWorks.zack.title": line("Heading"),
              "howItWorks.zack.points.*.title": line("Title"),
              "howItWorks.zack.points.*.body": para("Text"),
              "howItWorks.zack.filesLink.label": line("Line above the Zack files"),
            },
          },
          { id: "cora", label: "Cora, in detail", ground: "ground", anchor: "cora", fields: { "howItWorks.cora.title": line("Heading"), "howItWorks.cora.body": para("Text") } },
          {
            id: "anatomy",
            label: "The anatomy of an idea",
            ground: "ground",
            anchor: "anatomy",
            fields: {
              "howItWorks.anatomy.title": line("Heading"),
              "howItWorks.anatomy.prefaceLabel": line("Label above the playbook preface"),
              "howItWorks.anatomy.notes.*.part": short("Part"),
              "howItWorks.anatomy.notes.*.note": line("Note"),
            },
          },
          { id: "firstWeeks", label: "Your first weeks", ground: "ground", anchor: "first-weeks", fields: { "howItWorks.firstWeeks.title": line("Heading"), "howItWorks.firstWeeks.steps.*.text": lead("Text") } },
          {
            id: "noAgent",
            label: "If you have no AI agent yet",
            ground: "ground",
            anchor: "no-agent",
            fields: { "howItWorks.noAgent.title": line("Heading"), "howItWorks.noAgent.body": para("Text"), "howItWorks.noAgent.link.label": short("Link") },
          },
          startBand,
        ],
      },
      {
        id: "library",
        label: "Use cases",
        path: "/library",
        sections: [
          {
            id: "intro",
            label: "Introduction",
            fields: {
              "library.title.first": short("Heading, first line"),
              "library.title.second": short("Heading, second line"),
              "library.intro": lead("Line beside the heading"),
              "library.watchLink": short("Link to the watch form"),
            },
          },
          // The rows are edited on the Use cases screen (plan R5).
          { id: "rows", label: "The use cases" },
          { id: "watch", label: "Not in the library yet?", anchor: "watch", fields: { "library.watch.title": line("Heading"), "library.watch.note": lead("Line under the watch form") } },
          { id: "band", label: "Closing band", fields: { "library.band": line("Line"), closingSub: lead("Line under it") } },
        ],
      },
      {
        id: "faq",
        label: "FAQ",
        path: "/faq",
        sections: [
          { id: "title", label: "Page title", fixed: true, fields: { "faq.title": line("Title") } },
          ...copy.questions.map((group) => ({
            id: group.id,
            label: group.title,
            ground: "ground" as const,
            anchor: group.id,
            fields: {
              [`questions.${group.id}.title`]: line("Heading"),
              [`questions.${group.id}.items.*.q`]: line("Question"),
              [`questions.${group.id}.items.*.a`]: para("Answer"),
            },
          })),
          startBand,
        ],
      },
      {
        id: "about",
        label: "About",
        path: "/about",
        sections: [
          { id: "title", label: "Page title", fixed: true, fields: { "about.title": line("Title") } },
          {
            id: "letter",
            label: "Peter’s letter",
            ground: "ground",
            fields: {
              "about.leadIn": line("Line above the letter"),
              // Peter's own words: the zone the page prints them in.
              "letter.greeting": { ...short("Greeting"), zones: ["letter"] },
              "letter.paragraphs.*.text": { ...para("Text"), zones: ["letter"] },
              "letter.signOff": { ...short("Sign-off"), zones: ["letter"] },
              "letter.signature": short("Name, typed when there is no signature file"),
            },
          },
          startBand,
        ],
      },
      {
        id: "shared",
        label: "Shared",
        path: "/",
        sections: [
          {
            id: "buttons",
            label: "Buttons",
            fixed: true,
            fields: { "buttons.start": short("Start button, on every page and in the header"), "buttons.signIn": short("Sign in"), "buttons.openApp": short("Open the app, for a signed-in visitor") },
          },
          {
            id: "nav",
            label: "Header links",
            fixed: true,
            fields: { "nav.*.label": { label: "Words", max: NAV_LABEL_MAX }, "nav.*.href": { label: "Goes to", kind: "destination", max: DESTINATION_MAX } },
          },
          {
            id: "footer",
            label: "Footer",
            fixed: true,
            fields: {
              "footer.place": short("Place, beside the contact email"),
              "footer.links.*.label": { label: "Words", max: NAV_LABEL_MAX },
              "footer.links.*.href": { label: "Goes to", kind: "destination", max: DESTINATION_MAX },
              "footer.privacy": short("Link to Privacy"),
              "footer.terms": short("Link to Terms"),
            },
          },
          {
            id: "price",
            label: "Price words",
            fixed: true,
            fields: {
              cardLine: line("Line under a start button"),
              trialLine: line("Line under the prices"),
              "price.perMonth": short("Unit after a price"),
              "price.tax.USD": short("Tax note, US dollars"),
              "price.tax.CAD": short("Tax note, Canadian dollars"),
            },
          },
          {
            id: "notFound",
            label: "Page not found",
            fixed: true,
            fields: { "notFound.title": line("Heading"), "notFound.line": line("Line"), "notFound.home": short("Link to the homepage") },
          },
        ],
      },
    ],
    arrays: {
      // HOW MANY ITEMS EACH LIST MAY HOLD is what its block can draw (plan U7). The blocks lay out by the count.
      //
      // The hero's picture shows one step at a time, with a row of one button for each above it, and each step's
      // stack is three squares taller than the one before. Five buttons are what the row holds on a phone, and
      // five rows of squares what the frame is drawn for. With one step there is nothing to step through.
      "home.hero.graphic.steps": { item: "Step", list: "Hero steps", min: 2, max: 5 },
      // Three columns: up to two rows of them. (One, two and four items get columns of their own count.)
      "home.problem.statements": { item: "Statement", list: "Problem statements", max: 6 },
      "control.points": { item: "Point", list: "Control points", max: 6 },
      // Rows down the page, which take any number. A week has seven days.
      "howItWorks.week.days": { item: "Day", list: "Days of the week", max: 7 },
      "howItWorks.firstWeeks.steps": { item: "Step", list: "First-weeks steps", max: 12 },
      // The groups are /faq's sections, not a list; each group's questions are one.
      questions: { item: null },
      "questions.*.items": { item: "Question", list: "Questions", max: 20, toggles: { home: { label: "Show on the homepage", key: "on", value: "home" } } },
      // The header keeps one link at least: below 375 pixels "Sign in" is reached through the menu, which a header
      // with no links does not draw. The footer may have none: it then shows its small print alone.
      nav: { item: "Link", list: "Header links", min: 1, max: NAV_LINKS_MAX },
      "footer.links": { item: "Link", list: "Footer links", max: FOOTER_LINKS_MAX },
      // Every example removed: the homepage has no examples section, and /how-it-works takes apart the first built-in one.
      examples: { item: "Example", list: "Cora Curation examples", max: EXAMPLES_MAX },
      // Text only: each anatomy note is paired with a playbook part by its place, and the Zack points follow the Zack instructions.
      "howItWorks.zack.points": { item: "Point" },
      "howItWorks.anatomy.notes": { item: "Note" },
      "letter.paragraphs": { item: "Paragraph" },
    },
    notEditable: {
      zackWarning: "Shown on /zack only, which Pages does not cover.",
      "meta.**": "Page titles and search descriptions stay in code.",
      "howItWorks.meta.**": "Page titles and search descriptions stay in code.",
      "faq.meta.**": "Page titles and search descriptions stay in code.",
      "about.meta.**": "Page titles and search descriptions stay in code.",
      "price.switchLabel": "A name only a screen reader hears.",
      "home.hero.graphic.name": "A name only a screen reader hears.",
      "home.compounds.loop.name": "A name only a screen reader hears.",
      "sample.nav": "A name only a screen reader hears.",
      "bricks.week": "A brick's label, which only a screen reader hears.",
      "bricks.idea": "A brick's label, which only a screen reader hears.",
      "bricks.setUp": "A brick's label, which only a screen reader hears.",
      "bricks.empty": "A brick's label, which only a screen reader hears.",
      "about.photoAlt": "Image alt text.",
      "about.signatureAlt": "Image alt text.",
      "sample.scores.**": "No public example has scores, so these words are on no public page.",
      "control.link.href": "An address in the code, not wording.",
      "questionsBlock.more.href": "An address in the code, not wording.",
      "howItWorks.noAgent.link.href": "An address in the code, not wording.",
      "howItWorks.zack.id": "The section's anchor, which the control block's link names.",
      "home.hero.graphic.nameAny": "A name only a screen reader hears.",
      "questions.*.items.*.on": "Which pages show a question. Not text: Pages edits it as the question’s “Show on the homepage” switch (arrays, toggles).",
    },
  };
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** What an id may be: a list item's, a section's, a page's. No dot, because a dot joins the parts of a field's id. */
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
export const ID_MAX = 80;
/** An item added in the admin has an id that starts with this (plan KTD3). No built-in item's id does. */
export const ADDED_PREFIX = "x-";

export const isId = (value: unknown): value is string => typeof value === "string" && value.length <= ID_MAX && ID_PATTERN.test(value);

const parts = (pattern: string) => pattern.split(".");

function matches(pattern: readonly string[], path: readonly string[]): boolean {
  if (pattern.at(-1) === "**") return path.length >= pattern.length - 1 && pattern.slice(0, -1).every((part, i) => part === "*" || part === path[i]);
  return pattern.length === path.length && pattern.every((part, i) => part === "*" || part === path[i]);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The registry of a copy under a spec. Throws, naming the path, when the two disagree:
 * - a string in the copy that no field pattern and no `notEditable` pattern matches, or that two match;
 * - an array that is neither in `arrays` nor in `notEditable`, or one in `arrays` whose items are not objects with
 *   unique ids (letters, digits, hyphens; not starting with "x-");
 * - a pattern of the spec that matches nothing in the copy;
 * - a list whose items' fields are not all in one section, or are not each one key of the item (an added item's
 *   field is `<list>.<item>.<key>`), or whose built-in items are fewer or more than the list may hold.
 */
export function buildRegistry(copy: unknown, spec: RegistrySpec): Registry {
  type Declared = { pattern: readonly string[]; text: string; page: PageSpec; section: SectionSpec; field: FieldSpec; order: number; used: boolean };
  const declared: Declared[] = [];
  for (const page of spec.pages) {
    if (!isId(page.id)) throw new Error(`Site content: "${page.id}" is not a usable page id.`);
    const seen = new Set<string>();
    for (const section of page.sections) {
      if (!isId(section.id) || seen.has(section.id)) throw new Error(`Site content: page "${page.id}" has an unusable or repeated section id "${section.id}".`);
      seen.add(section.id);
      for (const [text, field] of Object.entries(section.fields ?? {})) declared.push({ pattern: parts(text), text, page, section, field, order: declared.length, used: false });
    }
  }
  if (new Set(spec.pages.map((page) => page.id)).size !== spec.pages.length) throw new Error("Site content: two pages share an id.");
  const arrays = Object.entries(spec.arrays).map(([text, array]) => ({ pattern: parts(text), text, ...array, used: false }));
  const excluded = Object.keys(spec.notEditable).map((text) => ({ pattern: parts(text), text, used: false }));

  const found: { field: Field; order: number; walk: number }[] = [];
  const lists = new Map<string, List>();
  /** The array the walk is inside, innermost last, with the item it is in and where that array's fields sort. */
  type Inside = { id: string; item: string; noun: string | null; order: number };

  const skip = (path: readonly string[]) => {
    const hit = excluded.find((entry) => matches(entry.pattern, path));
    if (hit) hit.used = true;
    return Boolean(hit);
  };

  /** A key of the copy as one part of a field id. A dot in it would read as two parts, so two strings could share one id; a star would read as a pattern. */
  const part = (key: string, under: string): string => {
    if (key.includes(".") || key === "*" || key === "**") throw new Error(`Site content: the key "${key}" under "${under}" cannot be part of a field id.`);
    return key;
  };

  const walk = (node: unknown, path: readonly string[], inside: readonly Inside[]): void => {
    const at = path.join(".");
    if (typeof node === "string") {
      const hits = declared.filter((entry) => matches(entry.pattern, path));
      const out = skip(path);
      if (hits.length + (out ? 1 : 0) !== 1) {
        throw new Error(
          hits.length === 0 && !out
            ? `Site content: the copy has "${at}" and the registry has no decision for it. Add it to a section's fields, or to notEditable with the reason (src/lib/site/content/registry.ts).`
            : `Site content: more than one pattern of the registry matches "${at}".`,
        );
      }
      if (out) return;
      const [hit] = hits;
      hit.used = true;
      const array = inside.at(-1);
      // A field of an item of a list is one key of the item: `<list>.<item>.<key>` is how an added item's is addressed.
      const list = array ? lists.get(array.id) : undefined;
      if (list && path.length !== list.path.length + 2) throw new Error(`Site content: "${at}" is inside an item of the list "${list.id}", whose fields must each be one key of the item.`);
      found.push({
        // Every field of an array sorts where the array's first pattern is, so an item's fields stay together.
        order: array ? array.order : hit.order,
        walk: found.length,
        field: {
          id: at,
          path,
          page: hit.page.id,
          section: hit.section.id,
          label: array?.noun ? `${array.noun} “${array.item}”: ${hit.field.label}` : hit.field.label,
          name: hit.field.label,
          kind: hit.field.kind ?? "line",
          max: hit.field.max,
          placeholders: hit.field.placeholders ?? amountPlaceholderNames,
          claims: { path: hit.page.path, zones: hit.field.zones ?? hit.section.zones ?? [] },
          ...(array ? { item: { array: array.id, id: array.item, noun: array.noun } } : {}),
        },
      });
      return;
    }
    if (Array.isArray(node)) {
      if (skip(path)) return;
      const array = arrays.find((entry) => matches(entry.pattern, path));
      if (!array) throw new Error(`Site content: the copy has the list "${at}" and the registry has no decision for it. Add it to arrays, or to notEditable with the reason.`);
      array.used = true;
      const ids = new Set<string>();
      for (const item of node as unknown[]) {
        const id = isRecord(item) ? item.id : undefined;
        if (!isId(id) || id.startsWith(ADDED_PREFIX) || ids.has(id)) {
          throw new Error(`Site content: every item of "${at}" needs its own id (letters, digits and hyphens, not starting with "${ADDED_PREFIX}"). Found ${JSON.stringify(id)}.`);
        }
        ids.add(id);
      }
      // The patterns declared for this array's items say where its fields sort, and which section a list is found under.
      const own = declared.filter((entry) => entry.pattern.length > path.length && matches(entry.pattern.slice(0, path.length), path));
      if (array.list !== undefined) {
        const [first] = own;
        if (!first || own.some((entry) => entry.page !== first.page || entry.section !== first.section)) throw new Error(`Site content: the fields of the list "${at}" must all be in one section, and there must be one.`);
        const min = array.min ?? 0;
        const max = array.max ?? LIST_CAP;
        if (min > max || max > LIST_CAP || ids.size < min || ids.size > max) throw new Error(`Site content: the list "${at}" has ${ids.size} items and may hold ${min} to ${max} (and never more than ${LIST_CAP}).`);
        const fields: ItemField[] = own.map((entry) => ({
          name: entry.pattern.at(-1)!,
          label: entry.field.label,
          kind: entry.field.kind ?? "line",
          max: entry.field.max,
          placeholders: entry.field.placeholders ?? amountPlaceholderNames,
          zones: entry.field.zones ?? entry.section.zones ?? [],
          fresh: null,
        }));
        const blank: Record<string, unknown> = {};
        for (const [name, toggle] of Object.entries(array.toggles ?? {})) {
          if (!isId(name) || fields.some((field) => field.name === name)) throw new Error(`Site content: the list "${at}" has an unusable or repeated toggle "${name}".`);
          fields.push({ name, label: toggle.label, kind: "toggle", max: TOGGLE_ON.length, placeholders: [], zones: [], toggle: { key: toggle.key, value: toggle.value }, fresh: TOGGLE_OFF });
          blank[toggle.key] = [];
        }
        lists.set(at, { id: at, path, label: array.list, item: array.item ?? "Item", page: first.page.id, section: first.section.id, claimsPath: first.page.path, items: [...ids], fields, min, max, blank });
      }
      // A list the code has emptied still has its patterns: they are not a mistake in the spec.
      if (node.length === 0) for (const entry of own) entry.used = true;
      const order = Math.min(...own.map((entry) => entry.order));
      for (const item of node as Record<string, unknown>[]) {
        const here: Inside = { id: at, item: item.id as string, noun: array.item, order };
        for (const [key, value] of Object.entries(item)) if (key !== "id") walk(value, [...path, item.id as string, part(key, `${at}.${item.id as string}`)], [...inside, here]);
        // The item's switches, after its texts. They are fields like any other, though the copy holds them otherwise (Field.toggle).
        const list = lists.get(at);
        for (const field of list?.fields ?? []) if (field.toggle) found.push({ order, walk: found.length, field: itemField(list!, field, item.id as string) });
      }
      return;
    }
    if (isRecord(node)) {
      for (const [key, value] of Object.entries(node)) {
        walk(value, [...path, part(key, at)], inside);
      }
    }
    // A number, a boolean or nothing at all is not text, and is left alone.
  };
  walk(copy, [], []);

  const unused = [...declared, ...arrays, ...excluded].filter((entry) => !entry.used).map((entry) => entry.text);
  if (unused.length > 0) throw new Error(`Site content: the registry names what the copy does not have: ${unused.join(", ")}.`);

  found.sort((a, b) => a.order - b.order || a.walk - b.walk);
  const fields = new Map(found.map(({ field }) => [field.id, field]));

  const pages: Page[] = spec.pages.map((page) => ({
    id: page.id,
    label: page.label,
    path: page.path,
    sections: page.sections.map((section) => ({
      id: section.id,
      label: section.label,
      fixed: section.fixed ?? false,
      ground: section.fixed ? null : (section.ground ?? null),
      anchor: section.anchor ?? null,
      fields: found.map(({ field }) => field).filter((field) => field.page === page.id && field.section === section.id),
    })),
  }));
  return { pages, fields, lists };
}

/** One field of one item of a list, built-in or added: the list's item field, at that item. */
function itemField(list: List, field: ItemField, itemId: string): Field {
  return {
    id: `${list.id}.${itemId}.${field.name}`,
    path: [...list.path, itemId, field.name],
    page: list.page,
    section: list.section,
    label: `${list.item} “${itemId}”: ${field.label}`,
    name: field.label,
    kind: field.kind,
    max: field.max,
    placeholders: field.placeholders,
    claims: { path: list.claimsPath, zones: field.zones },
    item: { array: list.id, id: itemId, noun: list.item },
    ...(field.toggle ? { toggle: field.toggle } : {}),
  };
}

/** True for the id of an item added in the admin. */
export const isAddedId = (value: unknown): value is string => isId(value) && value.startsWith(ADDED_PREFIX) && value.length > ADDED_PREFIX.length;

/**
 * The field an id names: a built-in one, or a field of an item ADDED in the admin (plan KTD2, KTD3), whose id is
 * `<list>.<item>.<key>` with an item id that starts with "x-". Such a field is in no table: it is made here from
 * the list's own item fields, so it has the limit, the kind, the names in braces and the claims zones a built-in
 * item's field has. Undefined for anything else.
 *
 * Whether the item exists is not known here, only that the id is one an added item's field could have. Where an
 * overlay is applied, normalised or strictly read, the item is looked for (./model.ts, ./format.ts).
 */
export function resolveField(id: string, registry: Registry = siteRegistry): Field | undefined {
  const known = registry.fields.get(id);
  if (known || typeof id !== "string") return known;
  const key = id.lastIndexOf(".");
  const item = key > 0 ? id.lastIndexOf(".", key - 1) : -1;
  if (item <= 0) return undefined;
  const list = registry.lists.get(id.slice(0, item));
  const itemId = id.slice(item + 1, key);
  const field = list?.fields.find((entry) => entry.name === id.slice(key + 1));
  if (!list || !field || !isAddedId(itemId)) return undefined;
  return itemField(list, field, itemId);
}

/** Every field of one item of a list, in the order the admin reads them: the registry's own for a built-in item, made here for an added one. */
export function fieldsOfItem(list: List, itemId: string, registry: Registry = siteRegistry): Field[] {
  return list.fields.flatMap((field) => resolveField(`${list.id}.${itemId}.${field.name}`, registry) ?? []);
}

/** The site's registry: the code model under the site's spec. Built once, when the module loads, so a copy and a spec that disagree fail at once. */
export const siteRegistry: Registry = buildRegistry(codeModel, siteSpec(codeModel));

/** A place on the site a link can be pointed at by name (plan R9): a covered page, or a section of one that has an anchor. */
export type LinkTarget = { href: string; page: Page; section: Section | null };

/**
 * Every place a link of the header or the footer can be pointed at by name, in the order the pages and their
 * sections are listed: each covered page ("/faq"), then each of its sections that a link can land on ("/faq#cost"
 * is not one: only sections). The homepage's sections are "/#price", not "/#price" after another "/". Shared has
 * no page of its own and is not here.
 */
export function linkTargets(registry: Registry = siteRegistry): LinkTarget[] {
  const out: LinkTarget[] = [];
  for (const page of registry.pages) {
    if (page.id === "shared") continue;
    out.push({ href: page.path, page, section: null });
    for (const section of page.sections) if (section.anchor !== null) out.push({ href: `${page.path}#${section.anchor}`, page, section });
  }
  return out;
}

// ---------------------------------------------------------------------------
// What a field can hold
// ---------------------------------------------------------------------------

/**
 * True for a stored value a page can print in this field (plan R18, KTD10, KTD12): text, not empty, naming in
 * braces only what the field may name, and for a link's address, one a link may point at. Anything else is
 * dropped wherever stored content is read, and the field shows the wording below it.
 *
 * Length is not judged here. A text longer than the field's limit still prints; the limit is enforced where an
 * admin saves and where a release file is checked.
 */
export function usableValue(field: Field, value: unknown): value is string {
  // Empty once tidied: spaces alone, or only characters that print nothing, would leave a heading with no words.
  if (typeof value !== "string" || plainLine(value) === "") return false;
  if (field.kind === "toggle") return value === TOGGLE_ON || value === TOGGLE_OFF;
  if (field.kind === "destination") return usableDestination(value);
  return unknownPlaceholder(value, field.placeholders) === null;
}
