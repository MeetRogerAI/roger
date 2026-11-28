/**
 * The release export (plan U10, KTD9): public, read-only, published content
 * only, and never a partial answer. On an in-process Postgres.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { DRAFT_COOKIE, nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { testDb } from "@/test-helpers/pglite-db";

const db = vi.hoisted(() => ({ on: true }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
// An admin is signed in throughout: the export must not care.
vi.mock("@/lib/admin-auth", () => ({ isAdmin: async () => true, requireAdmin: async () => "admin@example.com" }));
vi.mock("@/lib/db", () => ({ hasDb: () => db.on, sql: Object.assign(async () => [], { query: async () => [] }) }));
let current: Query;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));

const route = await import("./route");
const { CONTENT_KEY } = await import("@/lib/site/content/store");
const { releasedOverlay } = await import("@/lib/site/content/model");
const { canonicalOverlay } = await import("@/lib/site/content/export");

const HEADLINE = "home.hero.headline";
const overlay = (text: Record<string, string>) => ({ format: 1, text, sections: {}, lists: {} });
const put = (value: unknown) => current("insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [CONTENT_KEY, JSON.stringify(value)]);

beforeEach(async () => {
  db.on = true;
  ({ query: current } = await testDb());
  // An admin in Draft Mode, with drafts waiting: the worst case for a leak.
  resetNextFakes({ [DRAFT_COOKIE]: "bypass" });
});

describe("the release export", () => {
  it("answers GET with what is published, never the draft, for an admin in Draft Mode with drafts present", async () => {
    await put({ draft: overlay({ [HEADLINE]: "Drafted, not published." }), published: overlay({ [HEADLINE]: "Published headline." }), previous: overlay({ [HEADLINE]: "An older headline." }) });
    const response = await route.GET();
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain("Drafted, not published.");
    expect(raw).not.toContain("An older headline.");
    const body = JSON.parse(raw);
    expect(body.text[HEADLINE]).toBe("Published headline.");
    // Only the format and the overlay: no admin address, no time, no draft or previous content.
    expect(Object.keys(body).sort()).toEqual(["format", "lists", "sections", "text"]);
    expect(raw).not.toMatch(/@|draft|previous|updated|20\d\d-/i);
  });

  it("sets no-store, noindex and the JSON type, and opens nothing to other sites", async () => {
    const response = await route.GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("exports GET and no other method", () => {
    expect(Object.keys(route).filter((name) => /^[A-Z]+$/.test(name))).toEqual(["GET"]);
  });

  it("with nothing published, is the build's own release file", async () => {
    const body = await (await route.GET()).json();
    expect(body).toEqual(canonicalOverlay(releasedOverlay));
    db.on = false;
    expect(await (await route.GET()).json()).toEqual(canonicalOverlay(releasedOverlay));
  });

  it("answers 503 with no overlay when the published content cannot be read", async () => {
    current = async () => {
      throw new Error("connection refused");
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await route.GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["error"]);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("answers 503 with no overlay when the stored row is not content it can read, never 'nothing published'", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const stored of ["a string", { draft: overlay({}), published: { ...overlay({ [HEADLINE]: "Published headline." }), format: 2 }, previous: null }]) {
      await put(stored);
      const response = await route.GET();
      expect(response.status, JSON.stringify(stored)).toBe(503);
      expect(Object.keys(await response.json())).toEqual(["error"]);
    }
    errors.mockRestore();
  });

  it("answers 409, listing it, when something published is stored in a form this code cannot read, rather than release without it", async () => {
    await put({ draft: overlay({}), published: overlay({ [HEADLINE]: "Published headline.", "home.hero.renamed": "Wording under a name the code lost." }), previous: null });
    const response = await route.GET();
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.problems).toHaveLength(1);
    expect(body.problems[0]).toContain("text.home.hero.renamed: no field of this name in this site's code");
    expect(body.problems[0]).toContain("A release taken now would lose it");
    expect(JSON.stringify(body)).not.toContain("Published headline.");
  });

  it("reads the database itself, not the pages' cached reader, which a publish on another server does not expire", async () => {
    const { readFileSync } = await import("node:fs");
    const code = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(code).not.toMatch(/content\/read"/);
    expect(code).toContain("readPublishedForRelease(query)");
  });

  it("answers 409 with what to fix when something published cannot be released, and no overlay", async () => {
    // A header label saved before the links were lists, under the old limit of 80 characters.
    await put({ draft: overlay({}), published: overlay({ "nav.pricing": "A header label of thirty chars" }), previous: null });
    const response = await route.GET();
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["error", "problems"]);
    expect(body.problems.join("\n")).toContain("nav.pricing.label");
  });
});
