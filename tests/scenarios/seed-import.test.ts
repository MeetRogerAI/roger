import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNUP_ACTOR, setContributorEmail } from "@/lib/admin/contributors";
import { linkContributor } from "@/lib/admin/users";
import { importSeedRun, SeedRunExists } from "@/lib/cora/seed-import";
import { delivered, firstList, newWorld, play, report, signUp, weeksWithRuns, type Member, type World } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * After the seed import (R23, R25; spec B.7 "Seed data"): the pilot runs are
 * imported under nine hidden contributor records, three of the people with
 * runs from more than one agent (13 files in all, as in artifacts/Zack
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
    // Pilots sign up with no card: the first list is held and unlocked by the card that Wednesday (plan 2026-11-26-001).
    const weeks = ["2026-12-07", "2026-12-14", "2026-12-21"];
    await firstList(w, pilots.map(([, m]) => m), weeks[0]);
    await weeksWithRuns(w, pilots.map(([, m]) => m), weeks.slice(1));
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

  it("links pilots by email at sign-up, all of one person's records, and never picks them a play from any of those records", async () => {
    // One person, two records (their name written two ways), imported with their address in two cases.
    const chrisTitles: string[] = [];
    for (const [label, agent, email] of [["Chris M", "hark", "CMarinakos@RoyalLepage.ca"], ["Christopher", "claude", "cmarinakos@royallepage.ca"]]) {
      const plays = [play(`${label} ${agent} idea 1`), play(`${label} ${agent} idea 2`)];
      const r = await importSeedRun(w.query, { label, agent, text: report(plays), ranOn: "2026-11-13", email, by: "ehab@example.com" }, { model: w.cora.intake, merge: w.cora.merge, query: w.query, transport: w.cora.transport, sleep: async () => {} });
      expect(r.intake).toBe("accepted");
      chrisTitles.push(...plays.map((p) => p.title));
    }
    expect(await setContributorEmail(w.query, "ehab@example.com", contributor.get("Rob")!, "Rob@Pilot.example.com")).toMatchObject({ ok: true });

    await w.at("2026-12-02T16:00:00Z");
    const c = await signUp(w, { email: "cmarinakos@royallepage.ca", currency: "CAD", country: "CA", byLink: true });
    const rob = await signUp(w, { email: "rob@pilot.example.com", currency: "CAD", country: "CA", byLink: true });
    const ana = await signUp(w, { email: "ana@pilot.example.com", currency: "CAD", country: "CA", byLink: true });
    const links = await w.query<{ label: string; user_id: string | null }>(`select label, user_id from seed_contributors where user_id is not null order by label`);
    expect(links).toEqual([
      { label: "Chris M", user_id: c.id },
      { label: "Christopher", user_id: c.id },
      { label: "Rob", user_id: rob.id },
    ]);
    expect(await w.query(`select distinct admin_email from admin_actions where action = 'link_contributor'`)).toEqual([{ admin_email: SIGNUP_ACTOR }]);

    const pilots: [string[], Member][] = [[chrisTitles, c], [titlesBy.get("Rob")!, rob], [titlesBy.get("Ana")!, ana]];
    const weeks = ["2026-12-07", "2026-12-14", "2026-12-21"];
    await firstList(w, pilots.map(([, m]) => m), weeks[0]);
    await weeksWithRuns(w, pilots.map(([, m]) => m), weeks.slice(1));
    const gotBy = new Map<string, string[]>();
    for (const [, m] of pilots) gotBy.set(m.id, (await Promise.all(weeks.map((wk) => delivered(w, m.id, wk)))).flat());
    for (const [own, m] of pilots.slice(0, 2)) {
      const got = gotBy.get(m.id)!;
      expect(got).toHaveLength(9);
      expect(got.filter((t) => own.includes(t))).toEqual([]);
    }
    // Ana is not linked (no address on her record): the seed plays of others are open to her, Chris's included.
    expect(gotBy.get(ana.id)).toHaveLength(9);
    const [cw] = await w.query<{ eligible_count: number }>(`select eligible_count from cora_user_weeks where user_id = $1 and week_of = '2026-12-07'`, [c.id]);
    const [aw] = await w.query<{ eligible_count: number }>(`select eligible_count from cora_user_weeks where user_id = $1 and week_of = '2026-12-07'`, [ana.id]);
    // Both of Chris's records are left out of his eligible count, not just one.
    expect(aw.eligible_count - cw.eligible_count).toBe(chrisTitles.length);
  });
});
