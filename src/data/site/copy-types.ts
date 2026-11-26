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
 * {monthlyUsd}, {monthlyCad}, {listUsd}, {listCad}, {higherUsd}, {higherCad},
 * {freeLists}, {firstPaidList}, {lastFreeList} and {trialCloseDays}, filled by fillAmounts in
 * src/lib/site/amounts.ts.
 */

export type Question = { q: string; a: string };

/** One heading on /faq with its questions. */
export type QuestionGroup = { id: string; title: string; items: Question[] };

/** The words of a price that are the same wherever a price is shown. */
export type PriceWords = {
  /** The label on the USD and CAD switch, for screen readers. */
  switchLabel: string;
  /** The unit words in "US$200 / month USD" and "US$200 / list USD". */
  perMonth: string;
  perList: string;
  /** The mark on monthly. */
  popular: string;
  /** The note under a price, by currency. Prices are shown before tax. */
  tax: { USD: string; CAD: string };
};

export type SharedCopy = {
  buttons: {
    /** The primary button on every page, to /start. Names amounts. */
    start: string;
    /** The short form for the header. */
    startShort: string;
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
};

// --- What each block takes ---

/** The price block: the shared price words, the block's own, the trial line and the button. */
export type PriceBlockCopy = PriceWords & {
  title: string;
  monthly: { name: string; note: string };
  list: { name: string; note: string };
  trialLine: string;
  /** The primary button's label. */
  start: string;
};

/** The closing band: one line, the primary button's label and the trial line. */
export type ClosingBandCopy = { line: string; start: string; trialLine: string };

/** "You decide what Zack shares": each point is a short title and the sentences under it. */
export type ControlBlockCopy = {
  title: string;
  points: { title: string; body: string }[];
  link: { label: string; href: string };
};

/** The public names of Cora's five scores. */
export type ScoreNames = { hours: string; reach: string; ease: string; proof: string; surprise: string };

export type SampleCardCopy = {
  install: { title: string; help: string; copy: string; writtenOn: string; writtenOnNote: string };
  scores: {
    title: string;
    /** After a score, as in "8 of 10". */
    outOf: string;
    /** In place of the number, when a play has some scores and not this one. */
    notScored: string;
    names: ScoreNames;
  };
  playbook: { title: string };
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
