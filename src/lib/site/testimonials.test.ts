import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Testimonial } from "./testimonials";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});

const tags: string[] = [];
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: (t: string) => void tags.push(t) }));

let rows: Testimonial[] | Error = [];
let asked = 0;
vi.mock("@/lib/db-query", () => ({
  query: async () => {
    asked++;
    if (rows instanceof Error) throw rows;
    return rows;
  },
}));

const { forAudience, getTestimonials } = await import("./testimonials");

const row = (person: string, audience: Testimonial["audience"], cleared = true): Testimonial => ({
  id: person,
  person,
  attribution: "",
  quote: `${person} said this.`,
  saidOn: null,
  audience,
  position: 0,
  cleared,
});

afterEach(() => {
  vi.unstubAllEnvs();
  rows = [];
  asked = 0;
});

describe("public testimonials", () => {
  it("are an empty list with no database, without asking for one", async () => {
    rows = [row("Ana", "re")];
    expect(await getTestimonials("re")).toEqual([]);
    expect(asked).toBe(0);
  });

  it("are an empty list when the database fails, and the stored rows on the next call that succeeds", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    rows = new Error("database is down");
    expect(await getTestimonials("agents")).toEqual([]);
    expect(asked).toBe(1);
    rows = [row("Ben", "agents")];
    expect((await getTestimonials("agents")).map((t) => t.person)).toEqual(["Ben"]);
  });

  // In vitest "use cache" does nothing, so the test above passes either way: the shape is what keeps a failed read
  // out of the cache for an hour (docs/solutions/runtime-errors/catch-inside-use-cache-stores-the-fallback-2026-11-27.md).
  it("catch the failure outside the cached function", () => {
    const code = readFileSync(path.join(process.cwd(), "src/lib/site/testimonials.ts"), "utf8").replace(/\r\n/g, "\n");
    const cached = code.slice(code.indexOf("async function clearedTestimonials"), code.indexOf("/** A row marked for both audiences"));
    expect(cached).toContain('"use cache"');
    expect(cached).not.toMatch(/\bcatch\b|\btry\b/);
    const around = code.slice(code.indexOf("export async function getTestimonials"));
    expect(around).not.toContain('"use cache"');
    expect(around).toMatch(/try \{\s*rows = await clearedTestimonials\(\);\s*\} catch \{/);
  });

  it("are the cleared rows for the page's audience, with rows for both", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    rows = [row("Ana", "re"), row("Ben", "agents"), row("Cy", "both"), row("Dee", "re", false)];
    expect((await getTestimonials("re")).map((t) => t.person)).toEqual(["Ana", "Cy"]);
    expect((await getTestimonials("agents")).map((t) => t.person)).toEqual(["Ben", "Cy"]);
  });

  it("carry the tag the admin actions refresh", async () => {
    tags.length = 0;
    await getTestimonials("re");
    expect(tags).toEqual(["testimonials"]);
  });

  it("filter without changing the order", () => {
    const all = [row("Cy", "both"), row("Ben", "agents"), row("Ana", "re")];
    expect(forAudience(all, "re").map((t) => t.person)).toEqual(["Cy", "Ana"]);
  });
});
