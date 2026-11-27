/**
 * The server action behind /admin/questions, on the new store (plan U4). A
 * server action is a public endpoint, so the admin check is the action's own:
 * nobody but an admin can change a word, whatever page the call came from.
 *
 * Until Pages replaces the screen it keeps what it did: a saved answer is
 * live at the next view of the homepage and /faq, a refused one stores
 * nothing, and the edits saved before this release are still there.
 */
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builtInQuestions } from "@/data/site/v1";
import type { Query } from "@/lib/db-query";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";
import { testDb } from "@/test-helpers/pglite-db";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://test.invalid/none";
});

const cache = vi.hoisted(() => ({ tags: [] as string[], refreshed: 0 }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  cacheLife: () => {},
  cacheTag: () => {},
  refresh: () => {
    cache.refreshed++;
  },
  updateTag: (tag: string) => {
    cache.tags.push(tag);
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/headers", () => nextHeaders);

let current: Query;
let admin: string | null = null;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
// The settings the amounts come from are not this test's subject: the defaults, whatever the database holds.
vi.mock("@/lib/v3-settings-display", async () => {
  const { mergeV3 } = await import("@/lib/v3-settings");
  return { getV3SettingsForDisplay: async () => mergeV3([]) };
});
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => {
    if (!admin) throw new Error("Not signed in");
    return admin;
  },
  isAdmin: async () => Boolean(admin),
}));

const { saveQuestionAction } = await import("./actions");
const { default: QuestionsPage } = await import("./page");
const { CONTENT_TAG, getSiteContent } = await import("@/lib/site/content/read");
const { CONTENT_KEY, LEGACY_QUESTIONS_KEY, readStored } = await import("@/lib/site/content/store");
const { newOverlay } = await import("@/lib/site/content/format");
const { V1Faq } = await import("@/components/site/v1/faq");
const { V1Home } = await import("@/components/site/v1/home");

const REFUND_Q = "questions.price-and-billing.items.refund.q";
const REFUND_A = "questions.price-and-billing.items.refund.a";
const COST_A = "questions.price-and-billing.items.cost.a";
const edits = (text: Record<string, string>) => ({ ...newOverlay(), text });
const builtIn = (id: string) => builtInQuestions().find((item) => item.id === id)!;

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const idle = { status: "idle" as const };
const stored = async (key = CONTENT_KEY) => (await current<{ value: unknown }>("select value from settings where key = $1", [key]))[0]?.value;
const logged = () => current<{ admin_email: string; action: string; detail: Record<string, unknown> }>("select admin_email, action, detail from admin_actions order by id");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const faq = async () => text(await pageMarkup(createElement(V1Faq, { version: "v1" })));
const home = async () => text(await pageMarkup(createElement(V1Home, { version: "v1" })));

beforeEach(async () => {
  ({ query: current } = await testDb());
  admin = null;
  cache.tags = [];
  cache.refreshed = 0;
  resetNextFakes({}, { "x-vercel-ip-country": "US" });
});

describe("saveQuestionAction", () => {
  it("refuses anyone who is not an admin, before reading the form: nothing is stored, logged or refreshed", async () => {
    await expect(saveQuestionAction(idle, form({ id: "refund", q: "Do you give refunds?", a: "No." }))).rejects.toThrow("Not signed in");
    await expect(saveQuestionAction(idle, form({ id: "refund", reset: "yes" }))).rejects.toThrow("Not signed in");
    expect(await stored()).toBeUndefined();
    expect(await logged()).toEqual([]);
    expect(cache).toEqual({ tags: [], refreshed: 0 });
  });

  it("saves for an admin and publishes in the same action: the answer is live on /faq and the homepage at the next view", async () => {
    admin = "owner@example.com";
    expect(await faq()).toContain(builtIn("cost").q);
    const answer = "{monthlyUsd} a month, plus tax where it applies. In Canada it is {monthlyCad} a month, plus HST.";
    const state = await saveQuestionAction(idle, form({ id: "cost", q: builtIn("cost").q, a: answer }));
    expect(state).toMatchObject({ status: "ok", message: "Saved. The site shows it from the next page view." });
    // Only the part that differs from the built-in wording is stored, as draft and as published.
    expect(await stored()).toEqual({ draft: edits({ [COST_A]: answer }), published: edits({ [COST_A]: answer }), previous: newOverlay() });
    expect((await getSiteContent()).text).toEqual({ [COST_A]: answer });
    // "cost" is one of the questions the homepage shows too, and its amounts are filled in on both.
    const shown = "US$200 a month, plus tax where it applies. In Canada it is CA$280 a month, plus HST.";
    expect(await faq()).toContain(shown);
    expect(await home()).toContain(shown);
    // One row in the admin log, with who and which question, and the pages' cached copy expired once.
    expect(await logged()).toEqual([{ admin_email: "owner@example.com", action: "site_content_published", detail: { from: "questions", id: "cost", changed: [COST_A] } }]);
    expect(cache.tags).toEqual([CONTENT_TAG]);
    expect(cache.refreshed).toBe(1);
  });

  it("keeps every other question's edit when one is saved, changed or reset", async () => {
    admin = "owner@example.com";
    await saveQuestionAction(idle, form({ id: "cost", q: builtIn("cost").q, a: "{monthlyUsd} a month." }));
    await saveQuestionAction(idle, form({ id: "refund", q: "Do you give refunds?", a: "No. You can cancel any time." }));
    await saveQuestionAction(idle, form({ id: "cost", q: "What is the price?", a: "{monthlyUsd} a month." }));
    expect((await readStored(current)).published.text).toEqual({
      "questions.price-and-billing.items.cost.q": "What is the price?",
      [COST_A]: "{monthlyUsd} a month.",
      [REFUND_Q]: "Do you give refunds?",
      [REFUND_A]: "No. You can cancel any time.",
    });
    await saveQuestionAction(idle, form({ id: "cost", reset: "yes" }));
    expect((await readStored(current)).published.text).toEqual({ [REFUND_Q]: "Do you give refunds?", [REFUND_A]: "No. You can cancel any time." });
    expect(await current("select key from settings")).toEqual([{ key: CONTENT_KEY }]);
  });

  it("tidies what was typed to one line of plain text before it is stored", async () => {
    admin = "owner@example.com";
    await saveQuestionAction(idle, form({ id: "refund", q: ` ${builtIn("refund").q}\n`, a: "No.\n\nYou can cancel any time." }));
    expect((await readStored(current)).published.text).toEqual({ [REFUND_A]: "No. You can cancel any time." });
  });

  it("stores nothing for the built-in wording saved back, and removes an edit that is saved back to it", async () => {
    admin = "owner@example.com";
    const item = builtIn("refund");
    expect(await saveQuestionAction(idle, form({ id: "refund", q: item.q, a: item.a }))).toMatchObject({ status: "ok", message: "That is the built-in wording, so nothing is stored for this question." });
    expect(await stored()).toBeUndefined();
    // Nothing went live, so nothing is logged. The cached copy is expired all the same: see "a publish that landed" below.
    expect(cache.tags).toEqual([CONTENT_TAG]);
    expect(await logged()).toEqual([]);
    await saveQuestionAction(idle, form({ id: "refund", q: item.q, a: "No. You can cancel any time." }));
    expect(await faq()).toContain("No. You can cancel any time.");
    await saveQuestionAction(idle, form({ id: "refund", q: item.q, a: item.a }));
    expect((await readStored(current)).published.text).toEqual({});
    expect(await faq()).not.toContain("No. You can cancel any time.");
    expect(cache.tags).toEqual([CONTENT_TAG, CONTENT_TAG, CONTENT_TAG]);
  });

  it("expires the cached copy for a publish that landed before the action failed, and again when the save is tried again", async () => {
    admin = "owner@example.com";
    const working = current;
    // The statement that publishes is stored, and then the log row cannot be written.
    current = (async (statement: string, params?: unknown[]) => {
      if (statement.includes("insert into admin_actions")) throw new Error("fetch failed");
      return working(statement, params);
    }) as Query;
    await expect(saveQuestionAction(idle, form({ id: "refund", q: "Do you give refunds?", a: "No." }))).rejects.toThrow("fetch failed");
    current = working;
    // It is live in the database, so the pages' cached copy must not outlive it.
    expect((await readStored(current)).published.text).toEqual({ [REFUND_Q]: "Do you give refunds?", [REFUND_A]: "No." });
    expect(cache.tags).toEqual([CONTENT_TAG]);
    // The admin saves again. Nothing changes in the database, and the cached copy is expired again.
    expect(await saveQuestionAction(idle, form({ id: "refund", q: "Do you give refunds?", a: "No." }))).toMatchObject({ status: "ok", message: "Saved. The site shows it from the next page view." });
    expect(cache.tags).toEqual([CONTENT_TAG, CONTENT_TAG]);
    expect(cache.refreshed).toBe(1);
  });

  it("resets for an admin: the built-in wording is back at the next view, and the cached copy is expired again", async () => {
    admin = "owner@example.com";
    await saveQuestionAction(idle, form({ id: "refund", q: "Do you give refunds?", a: "No." }));
    expect(await faq()).toContain("Do you give refunds?");
    const state = await saveQuestionAction(idle, form({ id: "refund", q: "ignored", a: "ignored", reset: "yes" }));
    expect(state).toMatchObject({ status: "ok", message: "Reset. The site shows the built-in wording from the next page view." });
    expect(state.values).toBeUndefined();
    expect((await readStored(current)).published).toEqual(newOverlay());
    expect(await faq()).not.toContain("Do you give refunds?");
    expect(await faq()).toContain(builtIn("refund").q);
    expect((await logged()).map((row) => [row.action, row.detail.id, row.detail.reset])).toEqual([
      ["site_content_published", "refund", undefined],
      ["site_content_published", "refund", true],
    ]);
    expect(cache.tags).toEqual([CONTENT_TAG, CONTENT_TAG]);
    // Resetting a question nobody has edited is harmless.
    expect(await saveQuestionAction(idle, form({ id: "cost", reset: "yes" }))).toMatchObject({ status: "ok" });
    expect(await logged()).toHaveLength(2);
  });

  it("refuses an answer that breaks the claims rules, says why, hands back what was typed, and leaves the site as it was", async () => {
    admin = "owner@example.com";
    const before = await faq();
    const typed = { id: "refund", q: "Can I get a refund?", a: "No, but your agent will earn it back." };
    const state = await saveQuestionAction(idle, form(typed));
    expect(state.status).toBe("error");
    expect(state.message).toBe("The answer breaks the site’s rules: it says “agent” without “AI” in front (“agent” in “No, but your agent will earn it back.”).");
    expect(state.values).toEqual({ q: typed.q, a: typed.a });
    expect(await stored()).toBeUndefined();
    expect(await logged()).toEqual([]);
    expect(await faq()).toBe(before);
    // Nothing changed, so nothing is expired.
    expect(cache.tags).toEqual([]);
  });

  it("refuses a text over the limit by its length, not by cutting it short", async () => {
    admin = "owner@example.com";
    const state = await saveQuestionAction(idle, form({ id: "refund", q: "Can I get a refund?", a: "No refunds. ".repeat(200) }));
    expect(state).toMatchObject({ status: "error", message: "The answer is 2399 characters long. The most is 1500." });
    expect(await stored()).toBeUndefined();
  });

  it("refuses an id that is no question's", async () => {
    admin = "owner@example.com";
    expect(await saveQuestionAction(idle, form({ id: "not-a-question", q: "Hello?", a: "Hello." }))).toMatchObject({ status: "error", message: "No such question." });
    expect(await saveQuestionAction(idle, form({ id: "not-a-question", reset: "yes" }))).toMatchObject({ status: "error", message: "No such question." });
    expect(await saveQuestionAction(idle, form({ id: "constructor", q: "Hello?", a: "Hello." }))).toMatchObject({ status: "error", message: "No such question." });
    expect(await stored()).toBeUndefined();
    expect(cache.tags).toEqual([]);
  });
});

describe("the edits this screen saved before the content row existed (plan R10)", () => {
  const legacy = { refund: { q: "Do you give refunds?", a: "No. You can cancel any time." }, cost: { a: "{monthlyUsd} a month, plus tax." } };
  beforeEach(async () => {
    await current("insert into settings (key, value) values ($1, $2::jsonb)", [LEGACY_QUESTIONS_KEY, JSON.stringify(legacy)]);
    admin = "owner@example.com";
  });

  it("are on the public pages unchanged, with no content row and nothing written", async () => {
    expect(await faq()).toContain("Do you give refunds? No. You can cancel any time.");
    expect(await faq()).toContain("US$200 a month, plus tax.");
    expect(await home()).toContain("US$200 a month, plus tax.");
    expect(await stored()).toBeUndefined();
  });

  it("are shown on the screen as edited, each with its built-in wording", async () => {
    const markup = await pageMarkup(await QuestionsPage());
    const item = (id: string) => new RegExp(`<li data-question="${id}"[\\s\\S]*?</li>`).exec(markup)![0];
    expect(item("refund")).toContain("data-edited");
    expect(item("refund")).toContain('value="Do you give refunds?"');
    expect(text(item("refund"))).toContain("No. You can cancel any time.");
    expect(text(item("refund"))).toContain(builtIn("refund").a);
    expect(item("cost")).toContain("data-edited");
    expect(text(item("cost"))).toContain("{monthlyUsd} a month, plus tax.");
    expect(item("each-week")).not.toContain("data-edited");
    expect(text(item("each-week"))).toContain("Built-in wording");
  });

  it("stay live when another question is saved: the first save stores them with its own change", async () => {
    await saveQuestionAction(idle, form({ id: "each-week", q: builtIn("each-week").q, a: "Open your three ideas on Monday." }));
    const page = await faq();
    expect(page).toContain("Do you give refunds? No. You can cancel any time.");
    expect(page).toContain("US$200 a month, plus tax.");
    expect(page).toContain("Open your three ideas on Monday.");
    const row = await readStored(current);
    expect(row.stored).toBe(true);
    expect(Object.keys(row.published.text).sort()).toEqual(["questions.getting-started.items.each-week.a", COST_A, REFUND_A, REFUND_Q].sort());
    // The old row is as it was.
    expect(await stored(LEGACY_QUESTIONS_KEY)).toEqual(legacy);
  });

  it("can be reset from the screen, and do not come back from the old row", async () => {
    await saveQuestionAction(idle, form({ id: "refund", reset: "yes" }));
    const page = await faq();
    expect(page).not.toContain("Do you give refunds?");
    expect(page).toContain(builtIn("refund").q);
    expect(page).toContain("US$200 a month, plus tax.");
    await saveQuestionAction(idle, form({ id: "cost", reset: "yes" }));
    expect((await readStored(current)).published).toEqual(newOverlay());
    expect(await faq()).not.toContain("plus tax.");
  });
});

describe("the reader the public pages use, when the database cannot be read", () => {
  it("gives no edits, so the pages show the built-in wording, and gives the edits again as soon as the database answers", async () => {
    admin = "owner@example.com";
    await saveQuestionAction(idle, form({ id: "refund", q: "Do you give refunds?", a: "No." }));
    const working = current;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      current = (async () => {
        throw new Error("fetch failed");
      }) as Query;
      await expect(getSiteContent()).resolves.toEqual(newOverlay());
      const down = await faq();
      expect(down).not.toContain("Do you give refunds?");
      expect(down).toContain(builtIn("refund").q);
      current = working;
      expect((await getSiteContent()).text).toEqual({ [REFUND_Q]: "Do you give refunds?", [REFUND_A]: "No." });
      expect(await faq()).toContain("Do you give refunds? No.");
    } finally {
      current = working;
      errors.mockRestore();
    }
  });
});
