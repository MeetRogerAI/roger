import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

// The admin's settings reader, on a real Postgres: the tagged template the app uses, turned into a parameterised query.
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
const db = vi.hoisted(() => ({ query: null as Query | null, down: false }));
vi.mock("@/lib/db", () => ({
  hasDb: () => true,
  sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (db.down) throw new Error("database went away");
    const text = strings.reduce((out, part, i) => out + part + (i < values.length ? `$${i + 1}` : ""), "");
    return db.query!(text, values);
  },
}));

const { defaultSettings, getSettings } = await import("./settings");

beforeEach(async () => {
  ({ query: db.query } = await testDb());
  db.down = false;
});

describe("getSettings", () => {
  it("reads only its own keys, over the defaults", async () => {
    await db.query!(`insert into settings (key, value) values ('planPrice', '75'::jsonb), ('site.content', '{"draft":{}}'::jsonb), ('toString', '"x"'::jsonb)`);
    const s = await getSettings();
    expect(s).toEqual({ ...defaultSettings, planPrice: 75 });
    expect(Object.keys(s).sort()).toEqual(Object.keys(defaultSettings).sort());
  });

  it("gives the defaults when the database does not answer, and the stored values on the next call that succeeds", async () => {
    await db.query!(`insert into settings (key, value) values ('planPrice', '75'::jsonb)`);
    db.down = true;
    expect(await getSettings()).toEqual(defaultSettings);
    db.down = false;
    expect((await getSettings()).planPrice).toBe(75);
  });

  // In vitest "use cache" does nothing, so the test above passes either way: the shape is what keeps a failed read
  // out of the cache (docs/solutions/runtime-errors/catch-inside-use-cache-stores-the-fallback-2026-11-27.md).
  it("catches the failure outside the cached function", () => {
    const code = readFileSync(path.join(process.cwd(), "src/lib/settings.ts"), "utf8").replace(/\r\n/g, "\n");
    const cached = code.slice(code.indexOf("async function cachedSettings"), code.indexOf("export async function getSettings"));
    expect(cached).toContain('"use cache"');
    expect(cached).not.toMatch(/\bcatch\b|\btry\b/);
    const around = code.slice(code.indexOf("export async function getSettings"));
    expect(around).not.toContain('"use cache"');
    expect(around).toMatch(/try \{\s*return await cachedSettings\(\);\s*\} catch \{/);
  });
});
