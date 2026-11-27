/**
 * What the Edit Questions screen (/admin/questions) still owns until Pages
 * replaces it (plan U5): the limits of a question and an answer, where a
 * question is shown, the fields a question is stored under, and what a save
 * refuses.
 *
 * NOTHING IS STORED OR READ HERE ANY MORE (plan U4). A question's wording is
 * site content like every other word: it lives in the "site.content" row
 * (src/lib/site/content/store.ts), under the two field ids questionFields
 * gives, and the public pages read it through getSiteContent
 * (src/lib/site/content/read.ts). The edits this screen saved before that row
 * existed, in the row "site.questions", are carried over by the store.
 *
 * What may be saved from this screen is what it always took: plain text only
 * (a page prints it as text, never as markup), within the length limits
 * below, naming only amounts that exist ({monthlyUsd} and the others in
 * src/lib/site/amounts.ts), and passing the site's claims and vocabulary
 * rules (src/lib/site/claims.ts) once its amounts are filled in. A refused
 * save says which rule and which words.
 */
import { compoundingNumbers } from "@/data/site/compounding";
import { fillAmounts, type Amounts } from "./amounts";
import { checkClaims, textPage, type Violation } from "./claims";
import { codeModel } from "./content/model";
import { amountPlaceholderNames, amountPlaceholders, unknownPlaceholder } from "./content/text";

/** The longest question and the longest answer an admin may save. They are the limits of the two fields in the registry. */
export const QUESTION_MAX = 200;
export const ANSWER_MAX = 1500;

/** Where a question is shown, in the admin's words. /faq shows every question. */
export const pagesShowing = (on: readonly string[]): string[] => [...(on.includes("home") ? ["Homepage"] : []), "/faq"];

/** The two content fields a question is stored under, by the question's id, or null for an id that is no question's. */
export function questionFields(id: string): { q: string; a: string } | null {
  for (const group of codeModel.questions) {
    if (group.items.some((item) => item.id === id)) return { q: `questions.${group.id}.items.${id}.q`, a: `questions.${group.id}.items.${id}.a` };
  }
  return null;
}

const ruleNames: Record<Violation["rule"], string> = {
  vocabulary: "it says “agent” without “AI” in front",
  "bare-dollar": "it has a dollar sign without its country (write an amount as {monthlyUsd} or {monthlyCad})",
  "time-saved": "it makes a claim about time saved",
  income: "it makes a claim about income",
  "user-count": "it makes a claim about how many people use Roger",
  number: "it has a number that does not come from the settings",
  "exclamation-emoji": "it has an exclamation mark or an emoji",
  hype: "it uses a hype word",
  brokerage: "it names a brokerage",
};

/** Why a question or an answer cannot be saved, or null when it can. `amounts` are the ones the pages show now. */
export function refusal(what: "question" | "answer", text: string, amounts: Amounts): string | null {
  const The = what === "question" ? "The question" : "The answer";
  const max = what === "question" ? QUESTION_MAX : ANSWER_MAX;
  if (text === "") return `${The} is empty.`;
  if (text.length > max) return `${The} is ${text.length} characters long. The most is ${max}.`;
  if (/[<>]/.test(text)) return `${The} has a “<” or a “>”. It is printed as plain text, so markup would show as written.`;
  // The names of a brick-stack caption, {week} and {bricks}, are no amounts: no answer is a caption, so one left here would be printed with its braces.
  const unknown = unknownPlaceholder(text, amountPlaceholderNames);
  if (unknown) return `${The} names an amount that does not exist, such as ${unknown}. The amounts are ${amountPlaceholders.join(", ")}.`;
  const filled = fillAmounts(text, amounts);
  // /faq shows every question, and is held to every rule.
  const found = checkClaims(textPage("/faq", [filled]), { amounts, compounding: compoundingNumbers });
  if (found.length === 0) return null;
  const first = found[0];
  return `${The} breaks the site’s rules: ${ruleNames[first.rule]} (“${first.found}” in “${first.context.trim()}”).`;
}
