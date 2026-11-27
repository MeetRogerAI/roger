import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { SEED_TESTIMONIALS_SQL } from "../../../db/setup-rules.mjs";
import { listTestimonials, moveTestimonial, publicTestimonials, saveTestimonial, setTestimonialCleared } from "./content";

let query: Query;
const ADMIN = "admin@example.com";

beforeEach(async () => {
  ({ query } = await testDb());
  await query(SEED_TESTIMONIALS_SQL, [readFileSync(new URL("../../../db/seeds/testimonials.json", import.meta.url), "utf8")]);
});

describe("testimonials (spec check 32)", () => {
  it("switching one off removes it from what the public site reads, and on brings it back", async () => {
    const all = await listTestimonials(query);
    expect(all).toHaveLength(4);
    expect(await publicTestimonials(query)).toHaveLength(4);
    await setTestimonialCleared(query, ADMIN, all[1].id, false);
    // What the public site reads (spec 0.6): testimonials where cleared.
    const site = await query<{ id: string }>("select id from testimonials where cleared");
    expect(site.map((r) => r.id)).not.toContain(all[1].id);
    expect((await publicTestimonials(query)).map((t) => t.id)).not.toContain(all[1].id);
    await setTestimonialCleared(query, ADMIN, all[1].id, true);
    expect(await publicTestimonials(query)).toHaveLength(4);
    expect(await query("select action from admin_actions")).toEqual([{ action: "testimonial_cleared" }, { action: "testimonial_cleared" }]);
  });

  it("adds one hidden until cleared, edits it, and orders it", async () => {
    expect(await saveTestimonial(query, ADMIN, { person: "Grace", attribution: "Real estate, Toronto", quote: "Useful.", saidOn: "2026-11-20", audience: "re", position: 9, cleared: false })).toMatchObject({ ok: true });
    expect((await publicTestimonials(query)).map((t) => t.person)).not.toContain("Grace");
    const grace = (await listTestimonials(query)).find((t) => t.person === "Grace")!;
    await saveTestimonial(query, ADMIN, { ...grace, saidOn: grace.saidOn ?? "", quote: "Very useful.", cleared: true });
    expect((await publicTestimonials(query)).find((t) => t.person === "Grace")?.quote).toBe("Very useful.");
    await moveTestimonial(query, ADMIN, grace.id, "up");
    const order = (await listTestimonials(query)).map((t) => t.person);
    expect(order.indexOf("Grace")).toBe(3);
    expect(await saveTestimonial(query, ADMIN, { person: "", attribution: "", quote: "", saidOn: "", audience: "re", position: 0, cleared: false })).toMatchObject({ ok: false });
    expect(await saveTestimonial(query, ADMIN, { person: "X", attribution: "", quote: "Q", saidOn: "Nov 20", audience: "re", position: 0, cleared: false })).toMatchObject({ ok: false });
  });
});
