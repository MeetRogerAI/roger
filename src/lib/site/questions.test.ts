/**
 * The questions an admin edits (/admin/questions): what is stored, what a
 * page is given, and what a save refuses. The SQL runs against an in-process
 * Postgres, since each save and reset is one statement that must merge into,
 * or take a key out of, the one settings row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { builtInQuestions, questionsOn, questionsWith, v1, v1Copy } from "@/data/site/v1";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { amountsFrom } from "./amounts";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { ANSWER_MAX, QUESTION_MAX, QUESTIONS_KEY, getQuestionOverrides, pagesShowing, parseOverrides, plainLine, readQuestionOverrides, refusal, resetQuestion, saveQuestion } = await import("./questions");

const amounts = amountsFrom(v3Defaults);
const ADMIN = "admin@example.com";
const builtIn = (id: string) => builtInQuestions().find((item) => item.id === id)!;
const stored = async (query: Query) => (await query<{ value: unknown }>("select value from settings where key = $1", [QUESTIONS_KEY]))[0]?.value;
const log = (query: Query) => query<{ admin_email: string; action: string; detail: Record<string, unknown> }>("select admin_email, action, detail from admin_actions order by id");

let query: Query;
beforeEach(async () => {
  ({ query } = await testDb());
});

describe("the list an admin edits", () => {
  it("is every question of the copy file, each with its group and the pages that show it", () => {
    const all = builtInQuestions();
    expect(all).toHaveLength(18);
    expect(all.map((item) => item.id)).toEqual(v1.questions.flatMap((group) => group.items.map((item) => item.id)));
    expect(new Set(all.map((item) => item.group))).toEqual(new Set(["Getting started", "Zack and privacy", "Cora and the ideas", "Price and billing"]));
    // /faq shows every question; the homepage shows the seven tagged for it.
    expect(pagesShowing(builtIn("cost").on)).toEqual(["Homepage", "/faq"]);
    expect(pagesShowing(builtIn("refund").on)).toEqual(["/faq"]);
    expect(all.filter((item) => pagesShowing(item.on).includes("Homepage"))).toHaveLength(7);
    // The built-in wording still has its amounts as names, to be edited as such.
    expect(builtIn("cost").a).toContain("{monthlyUsd} a month");
  });
});

describe("reading the edits", () => {
  it("is empty before anyone has saved, so every page shows the built-in copy", async () => {
    expect(await readQuestionOverrides(query)).toEqual({});
    expect(await stored(query)).toBeUndefined();
  });

  it("is empty with no database, through the cached reader a page uses", async () => {
    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(await getQuestionOverrides()).toEqual({});
    // And the pages then render the built-in questions, unchanged.
    expect(v1Copy(amounts, await getQuestionOverrides()).copy.questions).toEqual(v1Copy(amounts).copy.questions);
  });

  it("keeps only what a page can use from a stored row: known ids, text parts, nothing else", () => {
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides("text")).toEqual({});
    expect(parseOverrides([{ q: "x" }])).toEqual({});
    expect(
      parseOverrides({
        cost: { a: "It is {monthlyUsd} a month.", extra: "dropped" },
        refund: { q: "  ", a: 12 },
        "not-a-question": { q: "Hello?", a: "Hello." },
        "who-sees": "text",
        "each-week": { q: "What is my part?" },
      }),
    ).toEqual({ cost: { a: "It is {monthlyUsd} a month." }, "each-week": { q: "What is my part?" } });
  });
});

describe("what a page is given", () => {
  it("is the edit where there is one and the built-in wording everywhere else, with the amounts of an edit filled in", () => {
    const { copy } = v1Copy(amounts, { cost: { a: "{monthlyUsd} a month ({monthlyCad} in Canada). Your first {freeLists} Cora Curations are free." }, "who-sees": { q: "Who can see my plays?" } });
    const all = copy.questions.flatMap((group) => group.items);
    expect(all).toHaveLength(18);
    expect(all.find((item) => item.id === "cost")).toMatchObject({ q: "What does it cost?", a: "US$200 a month (CA$280 in Canada). Your first two Cora Curations are free." });
    expect(all.find((item) => item.id === "who-sees")).toMatchObject({ q: "Who can see my plays?", a: v1Copy(amounts).copy.questions[1].items[3].a });
    // Every other question is untouched, and the homepage's subset follows.
    const plain = v1Copy(amounts).copy.questions.flatMap((group) => group.items);
    for (const item of all.filter((i) => !["cost", "who-sees"].includes(i.id))) expect(item).toEqual(plain.find((p) => p.id === item.id));
    expect(questionsOn(copy, "home").find((item) => item.q === "What does it cost?")?.a).toBe("US$200 a month (CA$280 in Canada). Your first two Cora Curations are free.");
    // The amounts follow the settings, in an edit as in the built-in copy.
    const dearer = v1Copy(amountsFrom({ ...v3Defaults, priceUsd: 230, priceCad: 310, freeRuns: 3 }), { cost: { a: "{monthlyUsd} a month. Your first {freeLists} are free." } });
    expect(dearer.copy.questions[3].items[0].a).toBe("US$230 a month. Your first three are free.");
  });

  it("falls back to the built-in wording for an edit it cannot print, and never throws", () => {
    const groups = questionsWith({ cost: { a: "It costs {nothing}." }, refund: { q: "", a: "   " } }, amounts);
    const all = groups.flatMap((group) => group.items);
    expect(all.find((item) => item.id === "cost")!.a).toBe(builtIn("cost").a);
    expect(all.find((item) => item.id === "refund")).toMatchObject({ q: builtIn("refund").q, a: builtIn("refund").a });
    expect(() => v1Copy(amounts, { cost: { a: "It costs {nothing}." } })).not.toThrow();
    // An id that is a property of every object is no question's.
    expect(questionsWith({ constructor: { a: "x" }, toString: { q: "y" } } as never, amounts)).toEqual(questionsWith({}, amounts));
  });
});

describe("saving an edit", () => {
  it("stores it under the question's id, shows it to the pages, and writes who did it to the admin log", async () => {
    const answer = "{monthlyUsd} a month, plus tax where it applies. In Canada it is {monthlyCad} a month, plus HST.";
    expect(await saveQuestion(query, ADMIN, { id: "cost", q: builtIn("cost").q, a: answer }, amounts)).toEqual({ ok: true, message: "Saved. The site shows it from the next page view." });
    // Only the part that differs from the built-in wording is stored.
    expect(await stored(query)).toEqual({ cost: { a: answer } });
    expect(await readQuestionOverrides(query)).toEqual({ cost: { a: answer } });
    expect(v1Copy(amounts, await readQuestionOverrides(query)).copy.questions[3].items[0].a).toBe("US$200 a month, plus tax where it applies. In Canada it is CA$280 a month, plus HST.");
    expect(await log(query)).toEqual([{ admin_email: ADMIN, action: "site_question_saved", detail: { id: "cost", a: answer } }]);
  });

  it("keeps every other question's edit when one is saved, changed or reset: one row, merged in one statement", async () => {
    await saveQuestion(query, ADMIN, { id: "cost", q: builtIn("cost").q, a: "{monthlyUsd} a month." }, amounts);
    await saveQuestion(query, ADMIN, { id: "refund", q: "Do you give refunds?", a: "No. You can cancel any time." }, amounts);
    await saveQuestion(query, ADMIN, { id: "cost", q: "What is the price?", a: "{monthlyUsd} a month." }, amounts);
    expect(await stored(query)).toEqual({ cost: { q: "What is the price?", a: "{monthlyUsd} a month." }, refund: { q: "Do you give refunds?", a: "No. You can cancel any time." } });
    expect(await query("select key from settings where key = $1", [QUESTIONS_KEY])).toHaveLength(1);
    expect(await resetQuestion(query, ADMIN, "cost")).toEqual({ ok: true, message: "Reset. The site shows the built-in wording from the next page view." });
    expect(await stored(query)).toEqual({ refund: { q: "Do you give refunds?", a: "No. You can cancel any time." } });
    // Other settings rows are not touched by any of it.
    await query("insert into settings (key, value) values ('v3.signupOpen', 'true')");
    await saveQuestion(query, ADMIN, { id: "each-week", q: builtIn("each-week").q, a: "Open your three ideas on Monday." }, amounts);
    expect(await query("select value from settings where key = 'v3.signupOpen'")).toEqual([{ value: true }]);
  });

  it("tidies what was typed to one line of plain text", async () => {
    expect(plainLine("  Yes.\r\n\r\nYou can\tcancel   any time. ")).toBe("Yes. You can cancel any time.");
    expect(plainLine(`A${String.fromCharCode(0)}B${String.fromCharCode(127)}C`)).toBe("A B C");
    await saveQuestion(query, ADMIN, { id: "refund", q: ` ${builtIn("refund").q}\n`, a: "No.\n\nYou can cancel any time." }, amounts);
    expect(await stored(query)).toEqual({ refund: { a: "No. You can cancel any time." } });
  });

  it("stores nothing for the built-in wording saved back, and removes an edit that is saved back to it", async () => {
    const item = builtIn("refund");
    expect(await saveQuestion(query, ADMIN, { id: "refund", q: item.q, a: item.a }, amounts)).toMatchObject({ ok: true });
    expect(await readQuestionOverrides(query)).toEqual({});
    await saveQuestion(query, ADMIN, { id: "refund", q: item.q, a: "No. You can cancel any time." }, amounts);
    expect(await readQuestionOverrides(query)).toEqual({ refund: { a: "No. You can cancel any time." } });
    await saveQuestion(query, ADMIN, { id: "refund", q: item.q, a: item.a }, amounts);
    expect(await readQuestionOverrides(query)).toEqual({});
  });
});

describe("resetting an edit", () => {
  it("removes it, so the built-in wording shows again, and logs it", async () => {
    await saveQuestion(query, ADMIN, { id: "refund", q: "Do you give refunds?", a: "No." }, amounts);
    expect(await resetQuestion(query, "second@example.com", "refund")).toMatchObject({ ok: true });
    expect(await readQuestionOverrides(query)).toEqual({});
    expect(v1Copy(amounts, await readQuestionOverrides(query)).copy.questions).toEqual(v1Copy(amounts).copy.questions);
    expect((await log(query)).map((row) => [row.admin_email, row.action, row.detail.id])).toEqual([
      [ADMIN, "site_question_saved", "refund"],
      ["second@example.com", "site_question_reset", "refund"],
    ]);
  });

  it("is harmless for a question with no edit, and refuses an id that is no question's", async () => {
    expect(await resetQuestion(query, ADMIN, "cost")).toMatchObject({ ok: true });
    expect(await resetQuestion(query, ADMIN, "not-a-question")).toEqual({ ok: false, message: "No such question." });
    expect(await saveQuestion(query, ADMIN, { id: "not-a-question", q: "Hello?", a: "Hello." }, amounts)).toEqual({ ok: false, message: "No such question." });
    expect(await stored(query)).toBeUndefined();
  });
});

describe("what a save refuses, naming the problem", () => {
  const refused = async (input: { q?: string; a?: string }) => {
    const item = builtIn("each-week");
    const r = await saveQuestion(query, ADMIN, { id: "each-week", q: input.q ?? item.q, a: input.a ?? item.a }, amounts);
    expect(r.ok, r.message).toBe(false);
    // A refused save stores nothing and logs nothing.
    expect(await stored(query)).toBeUndefined();
    expect(await log(query)).toEqual([]);
    return r.message;
  };

  it("“agent” without “AI” in front", async () => {
    expect(await refused({ a: "Paste each idea into your agent on Monday." })).toBe("The answer breaks the site’s rules: it says “agent” without “AI” in front (“agent” in “Paste each idea into your agent on Monday.”).");
    expect(await refused({ q: "What do my agents do each week?" })).toMatch(/^The question breaks the site’s rules: it says “agent” without “AI” in front \(“agents” in /);
  });

  it("a claim about income, about time saved, or about how many people use Roger", async () => {
    expect(await refused({ a: "Set up the ideas you want and earn more." })).toMatch(/^The answer breaks the site’s rules: it makes a claim about income \(“earn” in /);
    expect(await refused({ a: "Most people save 5 hours a week." })).toMatch(/^The answer breaks the site’s rules: it makes a claim about time saved \(“5 hours” in /);
    expect(await refused({ a: "Join thousands of people who open their ideas on Monday." })).toMatch(/it makes a claim about how many people use Roger/);
  });

  it("a number that is not an amount from the settings, a bare dollar sign, an exclamation mark, a hype word", async () => {
    expect(await refused({ a: "Open your 3 ideas on Monday." })).toMatch(/it has a number that does not come from the settings \(“3” in /);
    expect(await refused({ a: "It is $200 a month." })).toMatch(/it has a dollar sign without its country/);
    expect(await refused({ a: "Open your three ideas on Monday!" })).toMatch(/it has an exclamation mark or an emoji/);
    expect(await refused({ a: "Open your three ideas on Monday. It is effortless." })).toMatch(/it uses a hype word \(“effortless” in /);
  });

  it("an amount that does not exist, text that is empty or too long, and markup", async () => {
    expect(await refused({ a: "It costs {monthlyUsdd} a month." })).toMatch(/^The answer names an amount that does not exist, such as \{monthlyUsdd\}\. The amounts are \{monthlyUsd\}, \{monthlyCad\}, /);
    expect(await refused({ a: "   " })).toBe("The answer is empty.");
    expect(await refused({ q: "" })).toBe("The question is empty.");
    expect(await refused({ a: "Open your ideas. ".repeat(100) })).toBe(`The answer is 1699 characters long. The most is ${ANSWER_MAX}.`);
    expect(await refused({ q: `${"Why ".repeat(60)}?` })).toBe(`The question is 241 characters long. The most is ${QUESTION_MAX}.`);
    expect(await refused({ a: "Open your <b>three</b> ideas on Monday." })).toMatch(/^The answer has a “<” or a “>”\. It is printed as plain text/);
  });

  it("a name in braces that is no amount of a question's: the brick-stack caption's own {week} and {bricks}, which would be printed with their braces", async () => {
    expect(await refused({ a: "Open your ideas in {week}." })).toMatch(/^The answer names an amount that does not exist, such as \{week\}\. The amounts are \{monthlyUsd\}, /);
    expect(await refused({ q: "How many {bricks} do I get?" })).toMatch(/^The question names an amount that does not exist, such as \{bricks\}\./);
  });

  it("a word hidden from the rules by a character that prints nothing: the character is removed first, so the word is seen", async () => {
    // Built from code points, so this file holds none of them: a zero-width space, a soft hyphen, a word joiner, a right-to-left override.
    for (const code of [0x200b, 0x00ad, 0x2060, 0x202e]) {
      const hidden = `Paste each idea into your ag${String.fromCharCode(code)}ent on Monday.`;
      expect(plainLine(hidden), code.toString(16)).toBe("Paste each idea into your agent on Monday.");
      expect(await refused({ a: hidden }), code.toString(16)).toMatch(/it says “agent” without “AI” in front/);
    }
    // A control character of the second block is a space, like the first block's.
    expect(plainLine(`Yes.${String.fromCharCode(0x85)}Any time.`)).toBe("Yes. Any time.");
    // Letters with marks, and other scripts, are left as they are.
    expect(plainLine("Café, naïve, 日本語, עברית")).toBe("Café, naïve, 日本語, עברית");
  });

  it("but not the built-in wording, any of it: every question and answer in the copy file passes as it stands", () => {
    for (const item of builtInQuestions()) {
      expect(refusal("question", item.q, amounts), item.id).toBeNull();
      expect(refusal("answer", item.a, amounts), item.id).toBeNull();
    }
    // Nor an amount from the settings, by its name.
    expect(refusal("answer", "{monthlyUsd} a month, or {higherUsd} ({higherCad} in Canada) with sharing off. The trial closes after {trialCloseDays} days.", amounts)).toBeNull();
  });
});
