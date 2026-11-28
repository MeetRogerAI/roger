import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { coraWeek, flaggedPlay, FRIDAY, member, note, reply, run, WEEK } from "@/test-helpers/review-fixtures";
import { EVIDENCE_GONE, resolveEvidence } from "./evidence-view";

/** B3 Unit 10: a proposal's evidence references, rendered live from their sources at view time. */

const ADMIN = "admin@roger.test";
let q: Query;
beforeEach(async () => {
  ({ query: q } = await testDb());
});

const resolve = (refs: { kind: string; ref: string; why: string }[]) => resolveEvidence(q, refs, { now: FRIDAY, admins: [ADMIN] });

describe("resolveEvidence", () => {
  it("renders each kind from its source, with the bot's reason, and lists the members it shows by kind of read", async () => {
    const a = await member(q, "a@example.com", { cancelReason: "Too pricey", cancelAt: "2026-11-24T10:00:00Z" });
    const b = await member(q, "b@example.com");
    const r1 = await run(q, a, { status: "flagged", reason: "the play has a link" });
    const p = await flaggedPlay(q, r1, a, ["contains a link"]);
    const f = await note(q, a, "Too technical");
    const rep = await reply(q, b, "Loved it");
    await coraWeek(q, b, "short", "Only 2 eligible plays");

    const { items, reads } = await resolve([
      { kind: "feedback", ref: f, why: "says the ideas are hard" },
      { kind: "feedback", ref: rep, why: "liked" },
      { kind: "cancel_reason", ref: a, why: "price" },
      { kind: "play", ref: p, why: "links" },
      { kind: "run", ref: r1, why: "flagged" },
      { kind: "cora_user_week", ref: `${b}:${WEEK}`, why: "short list" },
      { kind: "counts", ref: `runs:${WEEK}:claude`, why: "volume" },
    ]);
    expect(items.map((i) => [i.label, i.text, i.why])).toEqual([
      [`A member's note on their list of ${WEEK}`, "Too technical", "says the ideas are hard"],
      ["A member's emailed reply, added by admin@roger.test", "Loved it", "liked"],
      ["A member's reason for cancelling", "Too pricey", "price"],
      ["A flagged play", `“A play”, for the list of ${WEEK}. Flagged: contains a link.`, "links"],
      ["A run", `Flagged run for the list of ${WEEK} from claude: the play has a link`, "flagged"],
      ["A Cora list", `The list for ${WEEK} was short: Only 2 eligible plays`, "short list"],
      ["Counts", `Runs for the list of ${WEEK} from claude: 1 in all (1 flagged). 0 of 1 read by the model rather than from the roger-run block.`, "volume"],
    ]);
    expect(items[0].link).toEqual({ href: `/admin/users/${a}`, label: "The member's page" });
    expect(items[3].link).toEqual({ href: `/admin/runs?id=${r1}`, label: "The run" });
    expect(items[4].link).toEqual({ href: `/admin/runs?id=${r1}`, label: "The run" });
    expect(items[6].member).toBe(false);
    expect(reads).toEqual([
      { what: "read_feedback", userIds: [a, b, a] },
      { what: "read_runs", userIds: [a, a] },
      { what: "read_picks", userIds: [b] },
    ]);
  });

  it("shows a source deleted with the member's account as no longer available, and reads nobody for it", async () => {
    const a = await member(q, "a@example.com", { cancelReason: "Too pricey", cancelAt: "2026-11-24T10:00:00Z" });
    const r1 = await run(q, a, { status: "flagged" });
    const p = await flaggedPlay(q, r1, a, ["contains a link"]);
    const f = await note(q, a, "Too technical");
    await coraWeek(q, a, "short");
    await q("delete from users where id = $1", [a]);

    const { items, reads } = await resolve([
      { kind: "feedback", ref: f, why: "w" },
      { kind: "cancel_reason", ref: a, why: "w" },
      { kind: "play", ref: p, why: "w" },
      { kind: "run", ref: r1, why: "w" },
      { kind: "cora_user_week", ref: `${a}:${WEEK}`, why: "w" },
    ]);
    expect(items.every((i) => i.text === null && !i.link)).toBe(true);
    expect(EVIDENCE_GONE).toContain("Deleted with the member's account");
    expect(reads.every((r) => r.userIds.length === 0)).toBe(true);
  });

  it("treats a deleted run, a malformed reference and an unknown kind as unavailable, without querying with them", async () => {
    const a = await member(q, "a@example.com");
    const r1 = await run(q, a, { status: "deleted" });
    const { items, reads } = await resolve([
      { kind: "run", ref: r1, why: "w" },
      { kind: "feedback", ref: "not-a-uuid'; drop table users; --", why: "w" },
      { kind: "cora_user_week", ref: "x:y", why: "w" },
      { kind: "counts", ref: "runs:yesterday:claude", why: "w" },
      { kind: "something", ref: "1", why: "w" },
    ]);
    expect(items.map((i) => i.text)).toEqual([null, null, null, null, null]);
    expect(reads.flatMap((r) => r.userIds)).toEqual([]);
    expect(await q("select 1 from users")).toHaveLength(1);
  });
});
