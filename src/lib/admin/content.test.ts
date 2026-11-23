import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { SEED_TESTIMONIALS_SQL } from "../../../db/setup-rules.mjs";
import { chooseSample, clearSample, listTestimonials, moveTestimonial, publicTestimonials, saveTestimonial, setTestimonialCleared } from "./content";

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

describe("the sample idea", () => {
  const poolPlay = async (title: string) =>
    (
      await query<{ id: string }>(
        "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ($1, 'Marketing', 'd', 'p', 'i', '2026-11-30', '2026-12-07') returning id",
        [title],
      )
    )[0].id;

  it("refuses a play without the “I have read this play” tick", async () => {
    const id = await poolPlay("One");
    expect(await chooseSample(query, ADMIN, id, false)).toMatchObject({ ok: false });
    expect(await query("select 1 from pool_plays where is_public_sample")).toEqual([]);
    expect(await query("select 1 from admin_actions")).toEqual([]);
  });

  it("with the tick, shows exactly one play and records who read it", async () => {
    const a = await poolPlay("One");
    const b = await poolPlay("Two");
    await chooseSample(query, ADMIN, a, true);
    expect(await chooseSample(query, ADMIN, b, true)).toMatchObject({ ok: true });
    expect(await query("select title, sample_checked_by from pool_plays where is_public_sample")).toEqual([{ title: "Two", sample_checked_by: ADMIN }]);
    await clearSample(query, ADMIN);
    expect(await query("select 1 from pool_plays where is_public_sample")).toEqual([]);
  });

  it("refuses a retired play", async () => {
    const a = await poolPlay("Old");
    await query("update pool_plays set active = false");
    expect(await chooseSample(query, ADMIN, a, true)).toMatchObject({ ok: false });
  });
});
