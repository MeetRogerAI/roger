import { beforeEach, describe, expect, it } from "vitest";
import { weekIdeas } from "@/lib/app/week";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { IDEA_CODE, MAX_PAST_IDEAS, normaliseTitle, readPastIdeas, recordAdoption, statusLevel } from "./adoption";
import { ideaIdLine } from "./idea-view";

/** B3 Unit 11 (Cora change 15): the next profile's past ideas stamp the member's own picks installed and used. */

let query: Query;
const PROFILE_WEEK = "2026-12-14";
const RECEIVED = "2026-12-12T20:00:00.000Z";
const NOW = new Date("2026-12-12T20:05:00Z");

async function user(email: string): Promise<string> {
  const [{ id }] = await query<{ id: string }>(`insert into users (email, status) values ($1, 'active') returning id`, [email]);
  return id;
}

async function play(title: string): Promise<string> {
  const [{ id }] = await query<{ id: string }>(
    `insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ($1, 'solo', 'd', 'p', 'i', '2026-10-01', '2026-10-01') returning id`,
    [title],
  );
  return id;
}

type PickRow = { idea_code: string; installed_at: string | null; used_at: string | null; adoption_seen_at: string | null };

async function pick(userId: string, playId: string, week: string, o: { position?: number; dryRun?: boolean; delivered?: string | null } = {}): Promise<PickRow & { week: string; position: number }> {
  const position = o.position ?? 1;
  await query(
    `insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run, delivered_at) values ($1, $2, $3, $4, 70, 3, 'r', $5, $6)`,
    [userId, week, position, playId, Boolean(o.dryRun), o.delivered === undefined ? `${week}T12:00:00Z` : o.delivered],
  );
  return { ...(await stamps(userId, week, position)), week, position };
}

async function stamps(userId: string, week: string, position = 1): Promise<PickRow> {
  const [r] = await query<PickRow>(
    `select idea_code, installed_at::text, used_at::text, adoption_seen_at::text from picks where user_id = $1 and week_of = $2 and position = $3`,
    [userId, week, position],
  );
  return r;
}

/** An accepted profile with these past ideas; a resubmission of the same week replaces it, as storeReport does. */
async function profile(userId: string, pastIdeas: unknown, o: { received?: string; test?: boolean; week?: string } = {}): Promise<string> {
  const [{ id }] = await query<{ id: string }>(
    `insert into zack_profiles (user_id, week_of, route, raw_text, parsed, status, is_test, received_at) values ($1, $2, 'connector', 'x', $3, 'accepted', $4, $5)
     on conflict (user_id, week_of, is_test) where status <> 'deleted' do update set parsed = excluded.parsed, received_at = excluded.received_at, revision = zack_profiles.revision + 1
     returning id`,
    [userId, o.week ?? PROFILE_WEEK, JSON.stringify({ past_ideas: pastIdeas }), Boolean(o.test), o.received ?? RECEIVED],
  );
  return id;
}

const ts = (iso: string) => new Date(iso).toISOString();
const at = (v: string | null) => (v === null ? null : ts(v));

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("the Roger idea ID", () => {
  it("is R- and 8 base32 characters, random per pick, and the same every time it is read", async () => {
    const m = await user("m@example.com");
    const p = await play("Showing brief");
    const a = await pick(m, p, "2026-12-07", { position: 1 });
    const b = await pick(m, p, "2026-12-07", { position: 2 });
    const other = await pick(await user("o@example.com"), p, "2026-12-07");
    for (const x of [a, b, other]) expect(x.idea_code).toMatch(IDEA_CODE);
    // The same play to the same member twice, and to another member: three different codes.
    expect(new Set([a.idea_code, b.idea_code, other.idea_code]).size).toBe(3);
    expect((await stamps(m, "2026-12-07", 1)).idea_code).toBe(a.idea_code);
  });

  it("is in the member's copied text for their delivered pick", async () => {
    const m = await user("m@example.com");
    const a = await pick(m, await play("Showing brief"), "2026-12-07");
    const [idea] = await weekIdeas(query, m, "2026-12-07", "Preface.");
    expect(idea.copyText).toContain(`\n\n${ideaIdLine(a.idea_code)}\n\n`);
  });
});

describe("recordAdoption", () => {
  it("'used this week (3 times)' by idea ID stamps used and installed at the job clock, and the profile's time as seen", async () => {
    const m = await user("m@example.com");
    const a = await pick(m, await play("Showing brief"), "2026-12-07");
    const id = await profile(m, [{ idea_id: a.idea_code, title: "Something else entirely", status: "used this week (3 times)" }]);
    expect(await recordAdoption(query, id, NOW)).toBe(1);
    const s = await stamps(m, "2026-12-07");
    expect([at(s.installed_at), at(s.used_at), at(s.adoption_seen_at)]).toEqual([NOW.toISOString(), NOW.toISOString(), RECEIVED]);
  });

  it("matches a lower-case ID with spaces around it", async () => {
    const m = await user("m@example.com");
    const a = await pick(m, await play("Showing brief"), "2026-12-07");
    expect(await recordAdoption(query, await profile(m, [{ idea_id: ` ${a.idea_code.toLowerCase()} `, status: "used this week (1 time)" }]), NOW)).toBe(1);
  });

  it("with no ID, matches the exact title with curly quotes, dashes and case folded, and stamps installed only", async () => {
    const m = await user("m@example.com");
    await pick(m, await play(`Morning "showing" brief - client's view`), "2026-11-30");
    const id = await profile(m, [{ idea_id: "", title: "morning “showing” brief — client’s  view", status: "installed, not used this week" }]);
    expect(await recordAdoption(query, id, NOW)).toBe(1);
    const s = await stamps(m, "2026-11-30");
    expect(at(s.installed_at)).toBe(NOW.toISOString());
    expect(s.used_at).toBeNull();
  });

  it("'changed by the member' counts as installed", async () => {
    const m = await user("m@example.com");
    const a = await pick(m, await play("Showing brief"), "2026-12-07");
    await recordAdoption(query, await profile(m, [{ idea_id: a.idea_code, status: "changed by the member" }]), NOW);
    expect((await stamps(m, "2026-12-07")).installed_at).not.toBeNull();
  });

  it("reaches 8 weeks back but not 9", async () => {
    const m = await user("m@example.com");
    const p = await play("Showing brief");
    const eight = await pick(m, p, "2026-10-19");
    const nine = await pick(m, p, "2026-10-12");
    const id = await profile(m, [
      { idea_id: eight.idea_code, status: "used this week (2 times)" },
      { idea_id: nine.idea_code, status: "used this week (2 times)" },
    ]);
    expect(await recordAdoption(query, id, NOW)).toBe(1);
    expect((await stamps(m, "2026-10-19")).used_at).not.toBeNull();
    expect((await stamps(m, "2026-10-12")).used_at).toBeNull();
  });

  it("'removed' stamps nothing, and a later 'used' still stamps", async () => {
    const m = await user("m@example.com");
    const a = await pick(m, await play("Showing brief"), "2026-12-07");
    for (const status of ["removed", "skipped at the member's request", "waiting on the member", "could not install (no calendar access)"]) {
      expect(await recordAdoption(query, await profile(m, [{ idea_id: a.idea_code, status }]), NOW)).toBe(0);
    }
    expect(await stamps(m, "2026-12-07")).toMatchObject({ installed_at: null, used_at: null, adoption_seen_at: null });
    const later = await profile(m, [{ idea_id: a.idea_code, status: "used this week (1 time)" }], { week: "2026-12-21", received: "2026-12-19T20:00:00Z" });
    expect(await recordAdoption(query, later, new Date("2026-12-19T20:05:00Z"))).toBe(1);
    expect((await stamps(m, "2026-12-07")).used_at).not.toBeNull();
  });

  it("first stamp wins: a later 'installed, not used' never clears used, and a resubmitted profile changes nothing", async () => {
    const m = await user("m@example.com");
    const a = await pick(m, await play("Showing brief"), "2026-12-07");
    const id = await profile(m, [{ idea_id: a.idea_code, status: "used this week (3 times)" }]);
    await recordAdoption(query, id, NOW);
    const first = await stamps(m, "2026-12-07");
    // The same profile again, then resubmitted, then a later week saying "installed, not used".
    expect(await recordAdoption(query, id, new Date("2026-12-13T09:00:00Z"))).toBe(0);
    expect(await recordAdoption(query, await profile(m, [{ idea_id: a.idea_code, status: "used this week (4 times)" }], { received: "2026-12-13T08:00:00Z" }), new Date("2026-12-13T09:00:00Z"))).toBe(0);
    const later = await profile(m, [{ idea_id: a.idea_code, status: "installed, not used this week" }], { week: "2026-12-21", received: "2026-12-19T20:00:00Z" });
    expect(await recordAdoption(query, later, new Date("2026-12-19T20:05:00Z"))).toBe(0);
    expect(await stamps(m, "2026-12-07")).toEqual(first);
  });

  it("an idea installed first and used later gains used, keeping its installed time", async () => {
    const m = await user("m@example.com");
    const a = await pick(m, await play("Showing brief"), "2026-12-07");
    await recordAdoption(query, await profile(m, [{ idea_id: a.idea_code, status: "installed, not used this week" }]), NOW);
    const later = await profile(m, [{ idea_id: a.idea_code, status: "used this week (1 time)" }], { week: "2026-12-21", received: "2026-12-19T20:00:00Z" });
    expect(await recordAdoption(query, later, new Date("2026-12-19T20:05:00Z"))).toBe(1);
    const s = await stamps(m, "2026-12-07");
    expect([at(s.installed_at), at(s.used_at), at(s.adoption_seen_at)]).toEqual([NOW.toISOString(), ts("2026-12-19T20:05:00Z"), ts("2026-12-19T20:00:00Z")]);
  });

  it("matches only the member's own picks: another member's ID or title stamps nothing of theirs", async () => {
    const a = await user("a@example.com");
    const b = await user("b@example.com");
    const theirs = await pick(a, await play("Showing brief"), "2026-12-07");
    const id = await profile(b, [{ idea_id: theirs.idea_code, title: "Showing brief", status: "used this week (9 times)" }]);
    expect(await recordAdoption(query, id, NOW)).toBe(0);
    expect(await stamps(a, "2026-12-07")).toMatchObject({ installed_at: null, used_at: null });
  });

  it("an unknown or garbled ID falls back to the title, and with no title stamps nothing", async () => {
    const m = await user("m@example.com");
    await pick(m, await play("Showing brief"), "2026-12-07", { position: 1 });
    await pick(m, await play("Inbox triage"), "2026-12-07", { position: 2 });
    const id = await profile(m, [
      { idea_id: "R-ZZZZZZZZ", title: "Showing brief", status: "used this week (1 time)" },
      { idea_id: "'; drop table picks; --", status: "used this week (1 time)" },
      { idea_id: 42, title: null, status: "used this week" },
      { idea_id: "R-" + "A".repeat(500), status: "used this week" },
      "not an object",
      null,
      [],
    ]);
    expect(await recordAdoption(query, id, NOW)).toBe(1);
    expect((await stamps(m, "2026-12-07", 1)).used_at).not.toBeNull();
    expect((await stamps(m, "2026-12-07", 2)).installed_at).toBeNull();
  });

  it("never stamps a dry run, an undelivered pick, or one delivered after the profile arrived", async () => {
    const m = await user("m@example.com");
    const p = await play("Showing brief");
    const dry = await pick(m, p, "2026-12-07", { position: 1, dryRun: true });
    const undelivered = await pick(m, p, "2026-12-07", { position: 2, delivered: null });
    const late = await pick(m, p, "2026-12-14", { position: 1, delivered: "2026-12-14T12:00:00Z" });
    const id = await profile(m, [dry, undelivered, late].map((x) => ({ idea_id: x.idea_code, status: "used this week" })));
    expect(await recordAdoption(query, id, NOW)).toBe(0);
  });

  it("a test profile, or one not accepted, stamps nothing", async () => {
    const m = await user("m@example.com");
    const a = await pick(m, await play("Showing brief"), "2026-12-07");
    expect(await recordAdoption(query, await profile(m, [{ idea_id: a.idea_code, status: "used this week" }], { test: true }), NOW)).toBe(0);
    const id = await profile(m, [{ idea_id: a.idea_code, status: "used this week" }]);
    await query(`update zack_profiles set status = 'rejected' where id = $1`, [id]);
    expect(await recordAdoption(query, id, NOW)).toBe(0);
    expect(await recordAdoption(query, "00000000-0000-4000-8000-000000000000", NOW)).toBe(0);
  });

  it("ignores past_ideas that isn't an array, and reads at most 50 entries", async () => {
    const m = await user("m@example.com");
    const a = await pick(m, await play("Showing brief"), "2026-12-07");
    expect(await recordAdoption(query, await profile(m, { idea_id: a.idea_code, status: "used" }), NOW)).toBe(0);
    const filler = Array.from({ length: MAX_PAST_IDEAS }, (_, i) => ({ title: `Other ${i}`, status: "used this week" }));
    expect(await recordAdoption(query, await profile(m, [...filler, { idea_id: a.idea_code, status: "used this week" }]), NOW)).toBe(0);
    expect(await recordAdoption(query, await profile(m, [{ idea_id: a.idea_code, status: "used this week" }, ...filler]), NOW)).toBe(1);
  });

  it("deleting the account removes the picks and their stamps", async () => {
    const m = await user("m@example.com");
    const a = await pick(m, await play("Showing brief"), "2026-12-07");
    await recordAdoption(query, await profile(m, [{ idea_id: a.idea_code, status: "used this week" }]), NOW);
    await query(`delete from users where id = $1`, [m]);
    expect(await query(`select 1 from picks where installed_at is not null or used_at is not null or adoption_seen_at is not null`)).toEqual([]);
  });
});

describe("statusLevel and normaliseTitle", () => {
  it("maps Zack's statuses, negatives first", () => {
    expect(statusLevel("used this week (3 times)")).toBe(2);
    expect(statusLevel("Used this week")).toBe(2);
    expect(statusLevel("installed, not used this week")).toBe(1);
    expect(statusLevel("changed by the member")).toBe(1);
    for (const s of ["removed", "skipped at the member's request", "waiting on the member", "could not install (missing Gmail)", "couldn’t install", "", "maybe"]) expect(statusLevel(s)).toBe(0);
    expect(statusLevel(3)).toBe(0);
  });

  it("folds case, curly quotes, dashes and spacing only", () => {
    expect(normaliseTitle("  Client’s “Brief” – Daily ")).toBe(normaliseTitle(`client's "brief" - daily`));
    expect(normaliseTitle("Brief A")).not.toBe(normaliseTitle("Brief B"));
  });

  it("drops entries that stamp nothing, or name nothing", () => {
    expect(readPastIdeas({ past_ideas: [{ status: "used" }, { title: "x", status: "removed" }, { title: "y", status: "used" }] })).toEqual([{ code: null, title: "y", level: 2 }]);
    expect(readPastIdeas(null)).toEqual([]);
    expect(readPastIdeas({ past_ideas: "nope" })).toEqual([]);
  });
});
