import { beforeEach, describe, expect, it, vi } from "vitest";
import { linkContributor } from "@/lib/admin/users";
import { importSeedRun, SeedRunExists } from "@/lib/cora/seed-import";
import { delivered, newWorld, play, report, signUp, weeksWithRuns, type Member, type World } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * After the seed import (R23, R25; spec B.7 "Seed data"): the pilot runs are
 * imported under nine hidden contributor records, three of the people with
 * runs from more than one agent (13 files in all, as in artifacts/v3/Zack
 * Runs/). Pilot accounts are linked to their records, and over several Mondays
 * no pilot is ever picked a play from their own seed files; one person's runs
 * from three agents count as one contributor.
 */
let w: World;
// Nine people; Rob, Kim and Lee ran Zack in more than one agent the same week (13 files).
const FILES: [string, string][] = [
  ["Rob", "hark"], ["Rob", "claude"], ["Rob", "grok-bot"],
  ["Kim", "hark"], ["Kim", "duet"],
  ["Lee", "claude"], ["Lee", "hark"],
  ["Ana", "hark"], ["Ben", "claude"], ["Cy", "duet"], ["Dee", "grok-bot"], ["Eve", "hark"], ["Fay", "claude"],
];
const titlesBy = new Map<string, string[]>();
const contributor = new Map<string, string>();

beforeEach(async () => {
  titlesBy.clear();
  contributor.clear();
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  for (const [label, agent] of FILES) {
    const plays = [play(`${label} ${agent} idea 1`), play(`${label} ${agent} idea 2`)];
    const r = await importSeedRun(w.query, { label, agent, text: report(plays), ranOn: "2026-11-13" }, { model: w.cora.intake, merge: w.cora.merge, query: w.query, transport: w.cora.transport, sleep: async () => {} });
    expect(r.intake).toBe("accepted");
    titlesBy.set(label, [...(titlesBy.get(label) ?? []), ...plays.map((p) => p.title)]);
    contributor.set(label, r.contributorId);
  }
});

describe("after the seed import", () => {
  it("keeps one record per person, and a second file for the same person, agent and week is refused", async () => {
    expect(await w.query(`select count(*)::int as n from seed_contributors`)).toEqual([{ n: 9 }]);
    expect(await w.query(`select count(*)::int as n from runs where route = 'seed'`)).toEqual([{ n: 13 }]);
    expect(await w.query(`select count(*)::int as n from pool_plays`)).toEqual([{ n: 26 }]);
    // No seed play is attributed to a real account.
    expect(await w.query(`select count(*)::int as n from runs where route = 'seed' and user_id is not null`)).toEqual([{ n: 0 }]);
    await expect(importSeedRun(w.query, { label: "rob", agent: "Hark", text: report([play()]), ranOn: "2026-11-14" }, { model: w.cora.intake, merge: w.cora.merge, query: w.query })).rejects.toBeInstanceOf(SeedRunExists);
  });

  it("never picks a linked pilot a play from their own seed files, whichever agent it came from", async () => {
    await w.at("2026-12-02T16:00:00Z");
    const pilots: [string, Member][] = [];
    for (const label of ["Rob", "Kim", "Ana"]) {
      const m = await signUp(w, { email: `${label.toLowerCase()}@pilot.example.com`, currency: "CAD", country: "CA" });
      expect((await linkContributor(w.query, "ehab@example.com", contributor.get(label)!, m.id)).ok).toBe(true);
      pilots.push([label, m]);
    }
    // Three Mondays: two free lists and the first paid one. Pilots' own runs carry new plays, which they are never sent either.
    const weeks = ["2026-12-07", "2026-12-14", "2026-12-21"];
    await weeksWithRuns(w, pilots.map(([, m]) => m), weeks);
    for (const [label, m] of pilots) {
      const own = new Set(titlesBy.get(label));
      const got = (await Promise.all(weeks.map((wk) => delivered(w, m.id, wk)))).flat();
      expect(got).toHaveLength(9);
      expect(got.filter((t) => own.has(t))).toEqual([]);
      expect(new Set(got).size).toBe(9);
    }
    // The eligible count Cora recorded leaves the person's own seed plays out (R16 is worked out after this).
    const [rob] = await w.query<{ eligible_count: number }>(`select eligible_count from cora_user_weeks where user_id = $1 and week_of = '2026-12-07'`, [pilots[0][1].id]);
    const [ana] = await w.query<{ eligible_count: number }>(`select eligible_count from cora_user_weeks where user_id = $1 and week_of = '2026-12-07'`, [pilots[2][1].id]);
    expect(ana.eligible_count - rob.eligible_count).toBe(titlesBy.get("Rob")!.length - titlesBy.get("Ana")!.length);
  });
});
