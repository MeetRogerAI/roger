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

  it("are an empty list when the database fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    rows = new Error("database is down");
    expect(await getTestimonials("agents")).toEqual([]);
    expect(asked).toBe(1);
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
