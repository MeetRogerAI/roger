import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { approvePlay, editPlay, listFlags, rejectPlay } from "./flags";

let query: Query;
const ADMIN = "admin@example.com";
let uid: string;

async function flaggedRun(o: { runSharing?: string; isTest?: boolean; plays?: number } = {}): Promise<{ runId: string; playIds: string[] }> {
  const [{ id: runId }] = await query<{ id: string }>(
    "insert into runs (user_id, week_of, route, agent, sharing, raw_text, status, is_test) values ($1, '2026-12-14', 'connector', 'hark', $2, 'x', 'flagged', $3) returning id",
    [uid, o.runSharing ?? "share", o.isTest ?? false],
  );
  const playIds: string[] = [];
  for (let i = 1; i <= (o.plays ?? 1); i++) {
    const [{ id }] = await query<{ id: string }>(
      `insert into plays (run_id, user_id, week_of, set_, position, title, category, body, shareable, flag)
       values ($1, $2, '2026-12-14', 'A', $3, 'Lead follow-up', 'Marketing', $4, false, $5) returning id`,
      [runId, uid, i, JSON.stringify({ description: "d", playbook_md: "See https://example.com" }), JSON.stringify({ reasons: ["a link"], fields: ["playbook_md"] })],
    );
    playIds.push(id);
  }
  return { runId, playIds };
}
const play = async (id: string) => (await query<{ shareable: boolean; flag: unknown; cleared_by: string | null; title: string; body: Record<string, unknown> }>("select shareable, flag, cleared_by, title, body from plays where id = $1", [id]))[0];
const runStatus = async (id: string) => (await query<{ status: string }>("select status from runs where id = $1", [id]))[0].status;

beforeEach(async () => {
  ({ query } = await testDb());
  [{ id: uid }] = await query<{ id: string }>("insert into users (email, status, sharing) values ('ana@example.com', 'active', 'share') returning id");
});

describe("the flags queue", () => {
  it("approving clears the flag and sets shareable from the run, then marks the run accepted", async () => {
    const { runId, playIds } = await flaggedRun({ plays: 2 });
    expect(await listFlags(query)).toHaveLength(2);
    expect(await approvePlay(query, ADMIN, playIds[0])).toMatchObject({ ok: true });
    expect(await play(playIds[0])).toMatchObject({ shareable: true, flag: null, cleared_by: ADMIN });
    expect(await runStatus(runId)).toBe("flagged");
    await rejectPlay(query, ADMIN, playIds[1]);
    expect(await runStatus(runId)).toBe("accepted");
    expect(await listFlags(query)).toEqual([]);
    expect(await query("select admin_email, action from admin_actions order by id")).toEqual([
      { admin_email: ADMIN, action: "flag_approved" },
      { admin_email: ADMIN, action: "flag_rejected" },
    ]);
  });

  it("never makes a play shareable when the run is matching only, a test, or the member stopped sharing", async () => {
    const a = await flaggedRun({ runSharing: "match_only" });
    await approvePlay(query, ADMIN, a.playIds[0]);
    expect(await play(a.playIds[0])).toMatchObject({ shareable: false, flag: null });

    const b = await flaggedRun({ isTest: true });
    await query("delete from runs where id = $1", [a.runId]);
    await approvePlay(query, ADMIN, b.playIds[0]);
    expect((await play(b.playIds[0])).shareable).toBe(false);

    await query("delete from runs");
    await query("update users set sharing = 'match_only'");
    const c = await flaggedRun();
    await approvePlay(query, ADMIN, c.playIds[0]);
    expect((await play(c.playIds[0])).shareable).toBe(false);
  });

  it("editing replaces the text and approves; rejecting keeps it out for good", async () => {
    const { playIds } = await flaggedRun({ plays: 2 });
    expect(await editPlay(query, ADMIN, playIds[0], { title: "Lead follow-up, tidied", playbook_md: "No links now.", sneaky: "x" })).toMatchObject({ ok: true });
    const edited = await play(playIds[0]);
    expect(edited).toMatchObject({ title: "Lead follow-up, tidied", shareable: true, flag: null });
    expect(edited.body).toMatchObject({ description: "d", playbook_md: "No links now.", title: "Lead follow-up, tidied" });
    expect(edited.body.sneaky).toBeUndefined();

    await rejectPlay(query, ADMIN, playIds[1]);
    expect(await play(playIds[1])).toMatchObject({ shareable: false, flag: { rejected: true } });
    // A decided play can't be decided again.
    expect(await approvePlay(query, ADMIN, playIds[1])).toMatchObject({ ok: false });
  });
});
