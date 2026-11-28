import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

// The display reader of the v3 settings and the two cached readers built on it (the site's amounts, the playbook
// preface), on a real Postgres: the tagged template the app uses, turned into a parameterised query.
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
vi.spyOn(console, "error").mockImplementation(() => {});

const { getV3SettingsForDisplay } = await import("./v3-settings-display");
const { getAmounts } = await import("./site/amounts");
const { getPlaybookPreface } = await import("./site/sample");
const { mergeV3 } = await import("./v3-settings");

beforeEach(async () => {
  ({ query: db.query } = await testDb());
  db.down = false;
  await db.query!(`insert into settings (key, value) values ('v3.priceUsd', '250'::jsonb), ('v3.playbookPreface', '"Saved preface"'::jsonb)`);
});

describe("the v3 settings for display", () => {
  it("give the defaults when the database does not answer, and the saved values on the next call that succeeds", async () => {
    db.down = true;
    expect(await getV3SettingsForDisplay()).toEqual(mergeV3([]));
    expect((await getAmounts()).monthly.USD).toBe(mergeV3([]).priceUsd);
    expect(await getPlaybookPreface()).toBe(mergeV3([]).playbookPreface);
    db.down = false;
    expect((await getV3SettingsForDisplay()).priceUsd).toBe(250);
    expect((await getAmounts()).monthly.USD).toBe(250);
    expect(await getPlaybookPreface()).toBe("Saved preface");
  });

  // In vitest "use cache" does nothing, so the test above passes either way. What keeps a failed read out of every
  // cache is the shape: each cached reader reads the throwing cached function, and the fallback is given outside
  // (docs/solutions/runtime-errors/catch-inside-use-cache-stores-the-fallback-2026-11-27.md; src/lib/use-cache-shape.test.ts
  // checks that no cached body catches).
  it("are read by the cached amounts and preface from the cached function, never from the fallback", () => {
    for (const file of ["src/lib/site/amounts.ts", "src/lib/site/sample.ts"]) {
      const code = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(code, file).toContain("cachedV3SettingsForDisplay()");
      expect(code, file).not.toContain("getV3SettingsForDisplay");
    }
  });
});
