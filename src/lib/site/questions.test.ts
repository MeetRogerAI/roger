/**
 * What the Edit Questions screen still owns until Pages replaces it (plan
 * U5): the list it shows, the fields a question is stored under, and what a
 * save refuses. Nothing here touches the database: the row, the reader and
 * the migration of the old row are tested with the store
 * (src/lib/site/content/store.pg.test.ts, read.test.ts) and the screen's
 * action (src/app/admin/questions/actions.test.ts).
 */
import { describe, expect, it } from "vitest";
import { v3Defaults } from "@/data/config";
import { builtInQuestions, v1 } from "@/data/site/v1";
import { amountsFrom } from "./amounts";
import { siteRegistry } from "./content/registry";
import { plainLine } from "./content/text";
import { ANSWER_MAX, QUESTION_MAX, pagesShowing, questionFields, refusal } from "./questions";

const amounts = amountsFrom(v3Defaults);
const builtIn = (id: string) => builtInQuestions().find((item) => item.id === id)!;

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

describe("the fields a question is stored under", () => {
  it("are the registry's: every question has its two, and each has this screen's limit", () => {
    for (const item of builtInQuestions()) {
      const ids = questionFields(item.id);
      expect(ids, item.id).not.toBeNull();
      expect(siteRegistry.fields.get(ids!.q), item.id).toMatchObject({ page: "faq", kind: "line", max: QUESTION_MAX, item: { id: item.id } });
      expect(siteRegistry.fields.get(ids!.a), item.id).toMatchObject({ page: "faq", kind: "line", max: ANSWER_MAX, item: { id: item.id } });
    }
    expect(questionFields("cost")).toEqual({ q: "questions.price-and-billing.items.cost.q", a: "questions.price-and-billing.items.cost.a" });
  });

  it("are none for an id that is no question's, a property of every object included", () => {
    for (const id of ["not-a-question", "", "constructor", "__proto__", "toString", "price-and-billing"]) expect(questionFields(id), id).toBeNull();
  });
});

describe("the tidy a save applies first", () => {
  it("makes what was typed one line of plain text", () => {
    expect(plainLine("  Yes.\r\n\r\nYou can\tcancel   any time. ")).toBe("Yes. You can cancel any time.");
    expect(plainLine(`A${String.fromCharCode(0)}B${String.fromCharCode(127)}C`)).toBe("A B C");
  });
});

describe("what a save refuses, naming the problem", () => {
  /** What a save of this question or this answer is refused with, tidied to one line as the action tidies it. */
  const refused = (input: { q?: string; a?: string }): string => {
    const item = builtIn("each-week");
    const message = refusal("question", plainLine(input.q ?? item.q), amounts) ?? refusal("answer", plainLine(input.a ?? item.a), amounts);
    expect(message, JSON.stringify(input)).not.toBeNull();
    return message!;
  };

  it("“agent” without “AI” in front", () => {
    expect(refused({ a: "Paste each idea into your agent on Monday." })).toBe("The answer breaks the site’s rules: it says “agent” without “AI” in front (“agent” in “Paste each idea into your agent on Monday.”).");
    expect(refused({ q: "What do my agents do each week?" })).toMatch(/^The question breaks the site’s rules: it says “agent” without “AI” in front \(“agents” in /);
  });

  it("a claim about income, about time saved, or about how many people use Roger", () => {
    expect(refused({ a: "Set up the ideas you want and earn more." })).toMatch(/^The answer breaks the site’s rules: it makes a claim about income \(“earn” in /);
    expect(refused({ a: "Most people save 5 hours a week." })).toMatch(/^The answer breaks the site’s rules: it makes a claim about time saved \(“5 hours” in /);
    expect(refused({ a: "Join thousands of people who open their ideas on Monday." })).toMatch(/it makes a claim about how many people use Roger/);
  });

  it("a number that is not an amount from the settings, a bare dollar sign, an exclamation mark, a hype word", () => {
    expect(refused({ a: "Open your 3 ideas on Monday." })).toMatch(/it has a number that does not come from the settings \(“3” in /);
    expect(refused({ a: "It is $200 a month." })).toMatch(/it has a dollar sign without its country/);
    expect(refused({ a: "Open your three ideas on Monday!" })).toMatch(/it has an exclamation mark or an emoji/);
    expect(refused({ a: "Open your three ideas on Monday. It is effortless." })).toMatch(/it uses a hype word \(“effortless” in /);
  });

  it("an amount that does not exist, text that is empty or too long, and markup", () => {
    expect(refused({ a: "It costs {monthlyUsdd} a month." })).toMatch(/^The answer names an amount that does not exist, such as \{monthlyUsdd\}\. The amounts are \{monthlyUsd\}, \{monthlyCad\}, /);
    expect(refused({ a: "   " })).toBe("The answer is empty.");
    expect(refused({ q: "" })).toBe("The question is empty.");
    expect(refused({ a: "Open your ideas. ".repeat(100) })).toBe(`The answer is 1699 characters long. The most is ${ANSWER_MAX}.`);
    expect(refused({ q: `${"Why ".repeat(60)}?` })).toBe(`The question is 241 characters long. The most is ${QUESTION_MAX}.`);
    expect(refused({ a: "Open your <b>three</b> ideas on Monday." })).toMatch(/^The answer has a “<” or a “>”\. It is printed as plain text/);
  });

  it("a name in braces that is no amount of a question's: the brick-stack caption's own {week} and {bricks}, which would be printed with their braces", () => {
    expect(refused({ a: "Open your ideas in {week}." })).toMatch(/^The answer names an amount that does not exist, such as \{week\}\. The amounts are \{monthlyUsd\}, /);
    expect(refused({ q: "How many {bricks} do I get?" })).toMatch(/^The question names an amount that does not exist, such as \{bricks\}\./);
  });

  it("a word hidden from the rules by a character that prints nothing: the character is removed first, so the word is seen", () => {
    // Built from code points, so this file holds none of them: a zero-width space, a soft hyphen, a word joiner, a right-to-left override.
    for (const code of [0x200b, 0x00ad, 0x2060, 0x202e]) {
      const hidden = `Paste each idea into your ag${String.fromCharCode(code)}ent on Monday.`;
      expect(plainLine(hidden), code.toString(16)).toBe("Paste each idea into your agent on Monday.");
      expect(refused({ a: hidden }), code.toString(16)).toMatch(/it says “agent” without “AI” in front/);
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
