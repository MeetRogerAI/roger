/**
 * The strings every site version's copy file must fill (plan KTD5, R7): only
 * what shared behaviour and fixed facts need. A version's file defines its own
 * page shape beyond this, so a later version can restructure its copy; leaving
 * one of these out is a type error.
 *
 * Below SharedCopy are the shapes the blocks take. They live here, not beside
 * the v1 components, so a later version's copy file can be checked against
 * them without importing from another version's look.
 *
 * Amounts are never typed into copy. A string marked "names amounts" may hold
 * {monthlyUsd}, {monthlyCad}, {higherUsd}, {higherCad}, {freeLists},
 * {firstPaidList}, {firstPaidWeek}, {lastFreeList} and {trialCloseDays}, filled by fillAmounts in
 * src/lib/site/amounts.ts.
 */

export type Question = { q: string; a: string };

/**
 * One line of a list a page prints, such as a problem statement. `id` is the item's name in the copy: it never
 * changes once it is live, because wording edited in the admin is stored under it, not under the item's place.
 */
export type TextItem = { id: string; text: string };

/** One heading on /faq with its questions. */
export type QuestionGroup = { id: string; title: string; items: Question[] };

/** The words of a price that are the same wherever a price is shown. */
export type PriceWords = {
  /** The label on the USD and CAD switch, for screen readers. */
  switchLabel: string;
  /** The unit word in "US$200 / month USD". */
  perMonth: string;
  /** The note under a price, by currency. Prices are shown before tax. */
  tax: { USD: string; CAD: string };
};

export type SharedCopy = {
  buttons: {
    /** The primary button on every page and in the header, to /start. Names amounts. */
    start: string;
    signIn: string;
    /** Shown to a signed-in visitor in place of the two above. */
    openApp: string;
  };
  /** The small line under a start button, saying a card is needed and when it is charged. Names amounts. */
  cardLine: string;
  /** Always directly under the prices. Names amounts. */
  trialLine: string;
  price: PriceWords;
  /** Above the paste box on /zack: check the report for private details first. */
  zackWarning: string;
  /** The questions, in the groups /faq shows. Answers name amounts. */
  questions: QuestionGroup[];
  /**
   * The labels of the header's links, which the footer repeats. The header and
   * footer are one component for every version, and src/lib/site/chrome.ts
   * holds their addresses.
   */
  nav: { howItWorks: string; pricing: string; library: string; faq: string; about: string };
  /** The footer's own labels, and the place named beside the contact email. */
  footer: { place: string; privacy: string; terms: string };
  /** The not-found page: what happened, and the link home. The start button follows. */
  notFound: { title: string; line: string; home: string };
  /** The browser title and the description search and shared links show. */
  meta: { title: string; description: string; headline: string };
};

// --- What each block takes ---

/** The price block: the shared price words, the block's own, the trial line and the button. */
export type PriceBlockCopy = PriceWords & {
  title: string;
  /** The line under the title. Names amounts. */
  sub: string;
  /** The one plan the marketing pages show. */
  monthly: { name: string; note: string };
  trialLine: string;
  /** The primary button's label. */
  start: string;
};

/**
 * The closing band: one line and the button's label. The line under the heading and the trial line under the
 * button are each printed only when given: the homepage gives neither (Peter, November 27, 2026).
 */
export type ClosingBandCopy = { line: string; sub?: string; start: string; trialLine?: string };

/** "You decide what Zack shares": each point is a short title and the sentences under it. */
export type ControlBlockCopy = {
  title: string;
  points: { id: string; title: string; body: string }[];
  link: { label: string; href: string };
};

/** The public names of Cora's five scores. */
export type ScoreNames = { hours: string; reach: string; ease: string; proof: string; surprise: string };

export type SampleCardCopy = {
  /** The card's first heading, and the labels of the two folded rows under it. */
  idea: { title: string; summary: string; copy: string };
  /** The line above the install prompt, and the copy button's label. Nothing is printed under the button. */
  install: { help: string; copy: string };
  scores: {
    title: string;
    /** After a score, as in "8 of 10". */
    outOf: string;
    /** In place of the number, when a play has some scores and not this one. */
    notScored: string;
    names: ScoreNames;
  };
  /** The card's second heading; the word after the count on its one folded row ("8 steps"); and that row's label when the playbook has no numbered parts. */
  playbook: { title: string; steps: string; whole: string };
};

/**
 * The caption under a brick stack. {week} and {bricks} are not amounts: they
 * are the week number and the brick count of a stack, from
 * src/data/site/compounding.ts, and compoundingCaption in
 * src/lib/site/compounding.ts puts them in.
 */
export type CompoundingCaptionCopy = { week: string; bricks: string };

export type BrickWords = {
  /** The words of each brick's label for screen readers: "Week 2, idea 1: set up". */
  week: string;
  idea: string;
  setUp: string;
  empty: string;
  caption: CompoundingCaptionCopy;
};
