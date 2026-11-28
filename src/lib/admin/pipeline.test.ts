import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb, testSponsor } from "@/test-helpers/pglite-db";
import { loadInterest } from "./interest";
import { loadPipeline, PIPELINE_PAGE } from "./pipeline";

/** B3 Unit 4: the pipeline, one row per person (by referralEmailKey) from first touch to paying. */

let query: Query;
beforeEach(async () => {
  ({ query } = await testDb());
});

async function user(email: string, cols: Record<string, unknown> = {}): Promise<string> {
  if (typeof cols.sponsor_id === "string") await testSponsor(query, cols.sponsor_id);
  const c = { status: "active", ...cols };
  const keys = Object.keys(c);
  const [{ id }] = await query<{ id: string }>(
    `insert into users (email, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`,
    [email, ...Object.values(c)],
  );
  return id;
}
const lead = (email: string, kind: string, at: string, utm = "") =>
  query(`insert into leads (email, kind, persona, utm, created_at, first_seen_at) values ($1, $2, 'v3', $3, $4, $4)`, [email, kind, utm, at]);
async function guest(inviter: string, email: string | null, at: string, session: string): Promise<string> {
  const [{ id }] = await query<{ id: string }>(
    `insert into session_guests (token_hash, inviter_id, session_date, name, email, created_at) values ($1, $2, $3, $4, $5, $6) returning id`,
    [`h-${Math.random()}`, inviter, session, email ? "Guest" : null, email, at],
  );
  return id;
}

const iso = (s: string) => new Date(s).toISOString();

describe("the pipeline (plan Unit 4)", () => {
  it("one address as a waitlist lead, then a guest, then a member who gets a list and pays, is one row", async () => {
    const inviter = await user("inviter@example.com", { display_name: "Bo", signup_finished_at: "2026-10-01T15:00:00Z", created_at: "2026-10-01T15:00:00Z" });
    await lead("ana@example.com", "not_open", "2026-11-01T15:00:00Z");
    await guest(inviter, "ana@example.com", "2026-11-05T15:00:00Z", "2026-11-11");
    const ana = await user("ana@example.com", {
      created_at: "2026-11-08T15:00:00Z",
      signup_finished_at: "2026-11-08T15:00:00Z",
      first_teaser_at: "2026-11-16T12:05:00Z",
      trial_started_at: "2026-11-16T13:00:00Z",
      first_charge_at: "2026-12-07T12:05:00Z",
    });
    await query(`insert into referrals (referrer_id, referred_user_id, source, stage, created_at) values ($1, $2, 'guest', 'paying', '2026-11-05T15:00:00Z')`, [inviter, ana]);

    const p = await loadPipeline(query, { adminEmails: [] });
    expect(p.total).toBe(2);
    const row = p.rows.find((r) => r.email === "ana@example.com")!;
    expect(row).toMatchObject({
      userId: ana,
      stage: "paying",
      firstTouch: { at: iso("2026-11-01T15:00:00Z"), source: "waitlist" },
      leadAt: iso("2026-11-01T15:00:00Z"),
      leadKind: "waitlist",
      guestAt: iso("2026-11-05T15:00:00Z"),
      invitedAt: iso("2026-11-05T15:00:00Z"),
      signedUpAt: iso("2026-11-08T15:00:00Z"),
      firstListAt: iso("2026-11-16T12:05:00Z"),
      cardAt: iso("2026-11-16T13:00:00Z"),
      payingAt: iso("2026-12-07T12:05:00Z"),
      endedAt: null,
      sponsor: null,
      via: { id: inviter, name: "Bo", kind: "guest" },
    });
    // Newest first touch first: the inviter (October 1) comes after Ana (November 1).
    expect(p.rows.map((r) => r.email)).toEqual(["ana@example.com", "inviter@example.com"]);
    expect(p.counts).toMatchObject({ paying: 1, signed_up: 1 });
  });

  it("a link-referred member came from a referral by the referrer, or 'a member' without a display name", async () => {
    const a = await user("a@example.com", { signup_finished_at: "2026-10-01T15:00:00Z" });
    const b = await user("b@example.com", { signup_finished_at: "2026-11-02T15:00:00Z", created_at: "2026-11-02T15:00:00Z" });
    await query(`insert into referrals (referrer_id, referred_user_id, source, stage, created_at) values ($1, $2, 'link', 'trial', '2026-11-02T15:00:00Z')`, [a, b]);
    const p = await loadPipeline(query, { adminEmails: [] });
    expect(p.rows.find((r) => r.userId === b)).toMatchObject({ via: { id: a, name: null, kind: "referral" }, firstTouch: { source: "referral" } });
  });

  it("merges addresses by referralEmailKey: Jane.Doe+x@gmail.com and janedoe@gmail.com are one person", async () => {
    await lead("Jane.Doe+x@gmail.com", "pack", "2026-11-01T15:00:00Z", "utm_source=x");
    await user("janedoe@gmail.com", { signup_finished_at: "2026-11-03T15:00:00Z", created_at: "2026-11-03T15:00:00Z", ref: "podcast" });
    const p = await loadPipeline(query, { adminEmails: [] });
    expect(p.total).toBe(1);
    expect(p.rows[0]).toMatchObject({ email: "janedoe@gmail.com", firstTouch: { source: "pack" }, leadKind: "pack", ref: "podcast", utm: "utm_source=x", stage: "signed_up" });
  });

  it("a sponsored member shows the sponsor and no card stage", async () => {
    await user("s@example.com", { signup_finished_at: "2026-11-03T15:00:00Z", sponsor_id: "00000000-0000-4000-8000-000000000001", first_teaser_at: "2026-11-09T12:05:00Z" });
    const p = await loadPipeline(query, { adminEmails: [] });
    expect(p.rows[0]).toMatchObject({ sponsor: "Test sponsor", stage: "sponsored", cardAt: null });
  });

  it("an admin's address never appears, however it is written", async () => {
    await user("Boss@Example.com", { signup_finished_at: "2026-11-03T15:00:00Z" });
    await lead("boss+lead@example.com", "not_open", "2026-11-01T15:00:00Z");
    const p = await loadPipeline(query, { adminEmails: ["boss@example.com"] });
    expect(p.total).toBe(0);
    expect(p.rows).toEqual([]);
  });

  it("a guest or invitation whose details were cleared is counted, not listed", async () => {
    const inviter = await user("inviter@example.com", { signup_finished_at: "2026-10-01T15:00:00Z" });
    // A guest purged 90 days after the session (its referral row lost its address too), and an open invitation.
    const [{ id: refId }] = await query<{ id: string }>(`insert into referrals (referrer_id, source, stage, created_at) values ($1, 'guest', 'invited', '2026-07-01T15:00:00Z') returning id`, [inviter]);
    const g = await guest(inviter, null, "2026-07-01T15:00:00Z", "2026-07-08");
    await query("update session_guests set referral_id = $1 where id = $2", [refId, g]);
    // A cleared invitation with no session row.
    await query(`insert into referrals (referrer_id, source, stage, created_at) values ($1, 'guest', 'invited', '2026-07-02T15:00:00Z')`, [inviter]);
    await query(`insert into referrals (referrer_id, referred_email, source, stage, created_at) values ($1, 'open@example.com', 'guest', 'invited', '2026-11-20T15:00:00Z')`, [inviter]);
    const p = await loadPipeline(query, { adminEmails: [] });
    expect(p.cleared).toBe(2);
    expect(p.rows.map((r) => r.email).sort()).toEqual(["inviter@example.com", "open@example.com"]);
    expect(p.rows.find((r) => r.email === "open@example.com")).toMatchObject({ stage: "invited", invitedAt: iso("2026-11-20T15:00:00Z"), via: { id: inviter, kind: "guest" } });
  });

  it("filters by furthest stage (trial: a first list or card saved) and by first-touch source", async () => {
    await user("signed@example.com", { signup_finished_at: "2026-11-03T15:00:00Z" });
    await user("listed@example.com", { signup_finished_at: "2026-11-03T15:00:00Z", first_teaser_at: "2026-11-09T12:05:00Z" });
    await user("card@example.com", { signup_finished_at: "2026-11-03T15:00:00Z", trial_started_at: "2026-11-04T15:00:00Z" });
    await user("paid@example.com", { signup_finished_at: "2026-11-03T15:00:00Z", trial_started_at: "2026-11-04T15:00:00Z", first_charge_at: "2026-11-09T12:05:00Z" });
    await user("half@example.com", { status: "signup" });
    await lead("w@example.com", "not_open", "2026-11-01T15:00:00Z");
    const trial = await loadPipeline(query, { stage: "trial", adminEmails: [] });
    expect(trial.rows.map((r) => r.email).sort()).toEqual(["card@example.com", "listed@example.com"]);
    // Stage counts are over everyone, whatever the filter.
    expect(trial.counts).toEqual({ lead: 1, invited: 0, started: 1, signed_up: 1, trial: 2, paying: 1, sponsored: 0 });
    expect(trial.total).toBe(2);
    const waitlist = await loadPipeline(query, { source: "waitlist", adminEmails: [] });
    expect(waitlist.rows.map((r) => r.email)).toEqual(["w@example.com"]);
  });

  it("pages hold 200 rows, newest first touch first", async () => {
    for (let i = 0; i < PIPELINE_PAGE + 1; i++) await lead(`l${i}@example.com`, "interest", new Date(Date.parse("2026-11-01T00:00:00Z") + i * 60_000).toISOString());
    const first = await loadPipeline(query, { adminEmails: [] });
    expect(first.rows).toHaveLength(PIPELINE_PAGE);
    expect(first.rows[0].email).toBe(`l${PIPELINE_PAGE}@example.com`);
    expect(first.pages).toBe(2);
    const second = await loadPipeline(query, { page: 2, adminEmails: [] });
    expect(second.rows.map((r) => r.email)).toEqual(["l0@example.com"]);
  });

  it("agrees with the Interest page's funnel on the same people", async () => {
    const at = "2026-11-30T15:00:00Z";
    await user("a@example.com", { created_at: at, signup_finished_at: at, first_teaser_at: "2026-12-07T12:05:00Z", trial_started_at: "2026-12-08T15:00:00Z", first_charge_at: "2026-12-21T11:05:00Z" });
    await user("b@example.com", { created_at: at, signup_finished_at: at, first_teaser_at: "2026-12-07T12:05:00Z", trial_started_at: "2026-12-08T15:00:00Z", status: "trial" });
    await user("c@example.com", { created_at: at, signup_finished_at: at, first_teaser_at: "2026-12-07T12:05:00Z", status: "trial" });
    await user("d@example.com", { created_at: "2026-12-07T15:00:00Z", status: "signup" });
    await user("boss@example.com", { created_at: at, signup_finished_at: at });
    await lead("lead@example.com", "not_open", at);
    const admins = ["boss@example.com"];
    const { funnel } = await loadInterest(query, { now: new Date("2026-12-22T15:00:00Z"), admins });
    const p = await loadPipeline(query, { adminEmails: admins });
    const sum = (k: "signedUp" | "firstTeaser" | "cardSaved" | "firstCharge") => funnel.reduce((n, f) => n + f[k], 0);
    const members = p.rows.filter((r) => r.userId && !r.sponsor);
    expect(members).toHaveLength(sum("signedUp"));
    expect(members.filter((r) => r.firstListAt).length).toBe(sum("firstTeaser"));
    expect(members.filter((r) => r.cardAt).length).toBe(sum("cardSaved"));
    expect(members.filter((r) => r.payingAt).length).toBe(sum("firstCharge"));
    expect(sum("signedUp")).toBe(4);
  });
});
