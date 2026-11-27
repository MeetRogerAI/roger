/**
 * The questions and answers an admin has edited (/admin/questions; Peter's
 * third homepage review, November 27, 2026).
 *
 * The built-in wording is in src/data/site/v1.ts, each question under an id
 * that never changes. An edit is stored apart from it, so "reset" is simply
 * removing the edit, and a question nobody has edited follows the copy file.
 *
 * Storage: ONE row of the `settings` table, key "site.questions", whose value
 * is a JSON object from question id to { q?, a? }. No table and no column was
 * added for this. Each save and each reset is a single statement that merges
 * into, or removes a key from, that object, so two admins saving different
 * questions at once do not undo each other (the database has no transactions
 * over HTTP).
 *
 * What may be saved: plain text only (a page prints it as text, never as
 * markup), within the length limits below, naming only amounts that exist
 * ({monthlyUsd} and the others in src/lib/site/amounts.ts), and passing the
 * site's claims and vocabulary rules (src/lib/site/claims.ts) once its amounts
 * are filled in. A refused save says which rule and which words.
 *
 * Reading: getQuestionOverrides is cached and tagged, as the testimonials are.
 * The admin's save and reset call updateTag with QUESTIONS_TAG, so the next
 * view of the homepage or /faq is rendered with the edit. With no database,
 * or on any error, there are no edits and every page shows the built-in text.
 */
import { cacheLife, cacheTag } from "next/cache";
import { compoundingNumbers } from "@/data/site/compounding";
import { builtInQuestions, type QuestionOverrides } from "@/data/site/v1";
import { logAdminAction } from "@/lib/admin/log";
import { hasDb } from "@/lib/db";
import { query, type Query } from "@/lib/db-query";
import { amountNames, fillAmounts, type Amounts } from "./amounts";
import { checkClaims, textPage, type Violation } from "./claims";

export type { QuestionOverrides };

export const QUESTIONS_KEY = "site.questions";
export const QUESTIONS_TAG = "site-questions";

/** The longest question and the longest answer an admin may save. */
export const QUESTION_MAX = 200;
export const ANSWER_MAX = 1500;

/** Where a question is shown, in the admin's words. /faq shows every question. */
export const pagesShowing = (on: readonly string[]): string[] => [...(on.includes("home") ? ["Homepage"] : []), "/faq"];

/** A stored value as overrides: only known ids, only strings. Anything else in the row is dropped, so a bad row cannot break a page. */
export function parseOverrides(value: unknown): QuestionOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const known = new Set(builtInQuestions().map((item) => item.id));
  const out: QuestionOverrides = {};
  for (const [id, edit] of Object.entries(value as Record<string, unknown>)) {
    if (!known.has(id) || !edit || typeof edit !== "object") continue;
    const { q, a } = edit as { q?: unknown; a?: unknown };
    const kept: { q?: string; a?: string } = {};
    if (typeof q === "string" && q.trim() !== "") kept.q = q;
    if (typeof a === "string" && a.trim() !== "") kept.a = a;
    if (kept.q !== undefined || kept.a !== undefined) out[id] = kept;
  }
  return out;
}

/** The edits as stored now. Not cached: the admin page and the tests read this. */
export async function readQuestionOverrides(q: Query): Promise<QuestionOverrides> {
  const rows = await q<{ value: unknown }>(`select value from settings where key = $1`, [QUESTIONS_KEY]);
  return parseOverrides(rows[0]?.value);
}

/** The cached read. It throws when the database cannot be read, so a failed read is never stored as "no edits". */
async function cachedQuestionOverrides(): Promise<QuestionOverrides> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(QUESTIONS_TAG);
  if (!hasDb()) return {};
  return readQuestionOverrides(query);
}

/**
 * The edits for a public page: cached, and empty with no database or on any error, so the page shows the built-in
 * text. The catch is outside the cached function: caught inside it, one dropped connection would be cached as "no
 * edits" and the built-in wording would be back on the site for the cache's whole hour.
 */
export async function getQuestionOverrides(): Promise<QuestionOverrides> {
  try {
    return await cachedQuestionOverrides();
  } catch {
    return {};
  }
}

/**
 * Characters that print nothing: the soft hyphen, zero-width spaces and joiners, the word joiner, and the marks
 * that change the direction text runs in. Text pasted from a document can carry them. Left in, one inside a word
 * hides that word from the claims check while the page still reads the same, and a direction mark can show an
 * answer's words in another order than the one that was checked.
 */
const UNSEEN = /[­͏؜᠎​-‏‪-‮⁠-⁯﻿￹-￻]/g;

/** One line of text: line breaks and runs of spaces become one space, and characters no page should print are removed. */
export function plainLine(text: string): string {
  let out = "";
  for (const ch of text.replace(UNSEEN, "")) {
    const code = ch.codePointAt(0) ?? 0;
    // Control characters (tab and line breaks included, and the second control block) become a space.
    out += code < 32 || (code >= 127 && code < 160) ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Every amount an answer may name, as it is written in an answer: "{monthlyUsd}". */
export const amountPlaceholders = (amounts: Amounts): string[] => Object.keys(amountNames(amounts)).map((name) => `{${name}}`);

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
  let filled: string;
  try {
    filled = fillAmounts(text, amounts);
  } catch {
    const name = /\{(\w*)\}/.exec(text)?.[0] ?? "{…}";
    return `${The} names an amount that does not exist, such as ${name}. The amounts are ${amountPlaceholders(amounts).join(", ")}.`;
  }
  // fillAmounts leaves the two names of a brick-stack caption, {week} and {bricks}, as they are. No answer is a caption, so one left here would be printed with its braces.
  const left = /\{\w+\}/.exec(filled);
  if (left) return `${The} names an amount that does not exist, such as ${left[0]}. The amounts are ${amountPlaceholders(amounts).join(", ")}.`;
  // /faq shows every question, and is held to every rule.
  const found = checkClaims(textPage("/faq", [filled]), { amounts, compounding: compoundingNumbers });
  if (found.length === 0) return null;
  const first = found[0];
  return `${The} breaks the site’s rules: ${ruleNames[first.rule]} (“${first.found}” in “${first.context.trim()}”).`;
}

export type Saved = { ok: true; message: string } | { ok: false; message: string };

/**
 * Saves an admin's wording for one question. A part that is the same as the
 * built-in wording is not stored, and when both are the same the edit is
 * removed, so the question follows the copy file again.
 */
export async function saveQuestion(q: Query, by: string, input: { id: string; q: string; a: string }, amounts: Amounts): Promise<Saved> {
  const builtIn = builtInQuestions().find((item) => item.id === input.id);
  if (!builtIn) return { ok: false, message: "No such question." };
  const question = plainLine(input.q);
  const answer = plainLine(input.a);
  const bad = refusal("question", question, amounts) ?? refusal("answer", answer, amounts);
  if (bad) return { ok: false, message: bad };

  const edit: { q?: string; a?: string } = {};
  if (question !== builtIn.q) edit.q = question;
  if (answer !== builtIn.a) edit.a = answer;
  if (edit.q === undefined && edit.a === undefined) {
    await removeEdit(q, input.id);
    await logAdminAction(q, { by, action: "site_question_reset", detail: { id: input.id, reason: "saved with the built-in wording" } });
    return { ok: true, message: "That is the built-in wording, so nothing is stored for this question." };
  }
  // One statement: merge this question into the object, whatever else is in it.
  await q(
    `insert into settings (key, value, updated_at) values ($1, jsonb_build_object($2::text, $3::jsonb), now())
     on conflict (key) do update set value = (case when jsonb_typeof(settings.value) = 'object' then settings.value else '{}'::jsonb end) || excluded.value, updated_at = now()`,
    [QUESTIONS_KEY, input.id, JSON.stringify(edit)],
  );
  await logAdminAction(q, { by, action: "site_question_saved", detail: { id: input.id, ...edit } });
  return { ok: true, message: "Saved. The site shows it from the next page view." };
}

async function removeEdit(q: Query, id: string): Promise<void> {
  await q(`update settings set value = value - $2::text, updated_at = now() where key = $1 and jsonb_typeof(value) = 'object'`, [QUESTIONS_KEY, id]);
}

/** Removes an admin's wording for one question, so the built-in wording shows again. */
export async function resetQuestion(q: Query, by: string, id: string): Promise<Saved> {
  if (!builtInQuestions().some((item) => item.id === id)) return { ok: false, message: "No such question." };
  await removeEdit(q, id);
  await logAdminAction(q, { by, action: "site_question_reset", detail: { id } });
  return { ok: true, message: "Reset. The site shows the built-in wording from the next page view." };
}
