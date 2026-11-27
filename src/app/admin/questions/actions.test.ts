/**
 * The server action behind /admin/questions. A server action is a public
 * endpoint, so the admin check is the action's own: nobody but an admin can
 * change a word, whatever page the call came from.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
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

let current: Query;
let admin: string | null = null;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => {
    if (!admin) throw new Error("Not signed in");
    return admin;
  },
  isAdmin: async () => Boolean(admin),
}));

const { saveQuestionAction } = await import("./actions");
const { QUESTIONS_KEY, QUESTIONS_TAG, getQuestionOverrides } = await import("@/lib/site/questions");

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const idle = { status: "idle" as const };
const stored = async () => (await current<{ value: unknown }>("select value from settings where key = $1", [QUESTIONS_KEY]))[0]?.value;
const logged = () => current<{ admin_email: string; action: string }>("select admin_email, action from admin_actions order by id");

beforeEach(async () => {
  ({ query: current } = await testDb());
  admin = null;
  cache.tags = [];
  cache.refreshed = 0;
});

describe("the reader the public pages use, when the database cannot be read", () => {
  it("gives no edits, so the pages show the built-in wording, and gives the edits again as soon as the database answers", async () => {
    admin = "owner@example.com";
    await saveQuestionAction(idle, form({ id: "refund", q: "Do you give refunds?", a: "No." }));
    const working = current;
    process.env.DATABASE_URL = "postgres://test.invalid/none";
    try {
      current = (async () => {
        throw new Error("fetch failed");
      }) as Query;
      await expect(getQuestionOverrides()).resolves.toEqual({});
      current = working;
      expect(await getQuestionOverrides()).toEqual({ refund: { q: "Do you give refunds?", a: "No." } });
    } finally {
      delete process.env.DATABASE_URL;
    }
  });

  it("catches the failure outside the cached function, so a failed read is never what the cache keeps", () => {
    const code = readFileSync(path.join(process.cwd(), "src/lib/site/questions.ts"), "utf8").replace(/\r\n/g, "\n");
    const cached = /async function cachedQuestionOverrides\(\)[^{]*\{([\s\S]*?)\n\}/.exec(code)![1];
    expect(cached).toContain('"use cache";');
    expect(cached).toContain("cacheTag(QUESTIONS_TAG);");
    expect(cached).not.toMatch(/\bcatch\b/);
    // The one "use cache" of the file is that function's.
    expect(code.match(/"use cache";/g)).toHaveLength(1);
    expect(/export async function getQuestionOverrides\(\)[^{]*\{([\s\S]*?)\n\}/.exec(code)![1]).toMatch(/try \{\s*return await cachedQuestionOverrides\(\);\s*\} catch \{\s*return \{\};\s*\}/);
  });
});

describe("saveQuestionAction", () => {
  it("refuses anyone who is not an admin, before reading the form: nothing is stored, logged or refreshed", async () => {
    await expect(saveQuestionAction(idle, form({ id: "refund", q: "Do you give refunds?", a: "No." }))).rejects.toThrow("Not signed in");
    await expect(saveQuestionAction(idle, form({ id: "refund", reset: "yes" }))).rejects.toThrow("Not signed in");
    expect(await stored()).toBeUndefined();
    expect(await logged()).toEqual([]);
    expect(cache).toEqual({ tags: [], refreshed: 0 });
  });

  it("saves for an admin, logs who, and expires the pages' cached copy so the next view shows the edit", async () => {
    admin = "owner@example.com";
    const state = await saveQuestionAction(idle, form({ id: "refund", q: "Do you give refunds?", a: "No. You can cancel any time." }));
    expect(state).toMatchObject({ status: "ok", message: "Saved. The site shows it from the next page view." });
    expect(await stored()).toEqual({ refund: { q: "Do you give refunds?", a: "No. You can cancel any time." } });
    expect(await logged()).toEqual([{ admin_email: "owner@example.com", action: "site_question_saved" }]);
    expect(cache.tags).toEqual([QUESTIONS_TAG]);
    expect(cache.refreshed).toBe(1);
  });

  it("resets for an admin, and expires the cached copy again", async () => {
    admin = "owner@example.com";
    await saveQuestionAction(idle, form({ id: "refund", q: "Do you give refunds?", a: "No." }));
    const state = await saveQuestionAction(idle, form({ id: "refund", q: "ignored", a: "ignored", reset: "yes" }));
    expect(state).toMatchObject({ status: "ok", message: "Reset. The site shows the built-in wording from the next page view." });
    expect(await stored()).toEqual({});
    expect((await logged()).map((row) => row.action)).toEqual(["site_question_saved", "site_question_reset"]);
    expect(cache.tags).toEqual([QUESTIONS_TAG, QUESTIONS_TAG]);
  });

  it("refuses an answer that breaks the claims rules, says why, hands back what was typed, and leaves the site as it was", async () => {
    admin = "owner@example.com";
    const typed = { id: "refund", q: "Can I get a refund?", a: "No, but your agent will earn it back." };
    const state = await saveQuestionAction(idle, form(typed));
    expect(state.status).toBe("error");
    expect(state.message).toBe("The answer breaks the site’s rules: it says “agent” without “AI” in front (“agent” in “No, but your agent will earn it back.”).");
    expect(state.values).toEqual({ q: typed.q, a: typed.a });
    expect(await stored()).toBeUndefined();
    expect(await logged()).toEqual([]);
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
    expect(cache.tags).toEqual([]);
  });
});
