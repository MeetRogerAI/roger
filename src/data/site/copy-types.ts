/**
 * The strings every site version's copy file must fill (plan KTD5, R7): only
 * what shared behaviour and fixed facts need. A version's file defines its own
 * page shape beyond this, so a later version can restructure its copy; leaving
 * one of these out is a type error.
 *
 * Amounts are never typed into copy. A string marked "names amounts" may hold
 * {monthlyUsd}, {monthlyCad}, {listUsd}, {listCad}, {higherUsd}, {higherCad},
 * {freeLists}, {firstPaidList} and {trialCloseDays}, filled by fillAmounts in
 * src/lib/site/amounts.ts.
 */

export type Question = { q: string; a: string };

/** One heading on /faq with its questions. */
export type QuestionGroup = { id: string; title: string; items: Question[] };

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
  price: {
    /** The label on the USD and CAD switch, for screen readers. */
    switchLabel: string;
    /** The unit words in "US$200 / month USD" and "US$200 / list USD"; priceLine writes the rest. */
    perMonth: string;
    perList: string;
    /** The mark on monthly. */
    popular: string;
  };
  /** Above the paste box on /zack: check the report for private details first. */
  zackWarning: string;
  /** The questions, in the groups /faq shows. Answers name amounts. */
  questions: QuestionGroup[];
};
