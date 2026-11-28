import { beforeEach, describe, expect, it } from "vitest";
import { mergePending } from "@/lib/cora/merge";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { DRAFT_NOTE, OUTLINE_NOTE } from "./auto-admit";
import { autoAdmitHeld } from "./auto-admit-held";
import type { IntakeModel, ReviewFinding } from "./model";

/**
 * The one-off backfill (scripts/auto-admit-held.ts) on a database holding a
 * play of each kind from before auto-admit: it drafts, redacts or outlines and
 * admits, or drops harm; a dry run changes nothing and calls no model; a
 * second run finds nothing to do.
 */
let query: Query;
let runId: string;

const DRAFTED = "## Trigger\nEach weekday morning.\n\n## Steps\n1. Read new mail.\n2. Draft replies and wait for a yes.";

function fakeModel() {
  const calls = { review: 0, draft: 0 };
  const m: IntakeModel = {
    readRun: async () => Promise.reject(new Error("unused")),
    async review(plays) {
      calls.review++;
      const text = plays[0].text;
      const out: ReviewFinding[] = [];
      if (text.includes("Dana Whitfield")) out.push({ playId: "p1", text: "Dana Whitfield", kind: "person", clear: false, reason: "" });
      if (text.includes("the shared drive")) out.push({ playId: "p1", text: "copy it to the shared drive", kind: "harm", clear: false, reason: "sends data outside" });
      return out;
    },
    async draftPlaybook(play) {
      calls.draft++;
      if (play.title === "Undraftable") throw new Error("timeout");
      return DRAFTED;
    },
  };
  return { m, calls };
}

const held = (reasons: string[]) => ({ reasons, fields: [] });

async function addPlay(position: number, title: string, flag: unknown, body: Record<string, unknown> = {}): Promise<string> {
  const [{ id }] = await query<{ id: string }>(
    `insert into plays (run_id, user_id, week_of, set_, position, title, category, body, shareable, flag)
     select $1, r.user_id, '2026-11-23', 'A', $2, $3, 'Operations', $4, $5, $6 from runs r where r.id = $1 returning id`,
    [
      runId,
      position,
      title,
      JSON.stringify({ title, job: "a trigger → work → a result", description: `What ${title} does.`, playbook_md: "", install_notes: "Save as a skill.", outline_only: false, privacy: [], ...body }),
      flag === null,
      flag === null ? null : JSON.stringify(flag),
    ],
  );
  return id;
}

type Out = { title: string; shareable: boolean; flag: Record<string, unknown> | null; auto_fixed: { actions: string[]; reasons: string[] } | null; body: Record<string, unknown> };
const plays = async () => query<Out>("select title, shareable, flag, auto_fixed, body from plays order by position");
const byTitle = async (t: string) => (await plays()).find((p) => p.title === t || p.body.title === t)!;

beforeEach(async () => {
  ({ query } = await testDb());
  const [u] = await query<{ id: string }>("insert into users (email, status, sharing) values ('ana@example.com', 'active', 'share') returning id");
  [{ id: runId }] = await query<{ id: string }>(
    "insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, '2026-11-23', 'connector', 'claude', 'share', $2, 'flagged') returning id",
    [u.id, "# Zack v1.9\n## Play 1: Inbox triage\nEach weekday morning the agent reads new mail and drafts replies."],
  );
  await addPlay(1, "Clean", null, { playbook_md: "1. Step." });
  await addPlay(2, "Inbox triage", held(["its playbook could not be found in the report"]));
  await addPlay(3, "Undraftable", held(["its playbook could not be found in the report"]));
  await addPlay(4, "Client thanks", held(["may contain a private person name"]), { description: "Thanks Dana Whitfield each Friday.", playbook_md: "1. Thank DANA WHITFIELD." });
  await addPlay(5, "Vague name", held(["may contain a private place name"]), { playbook_md: "1. Book the usual room." });
  await addPlay(6, "School events", held(["Zack marked it sensitive"]), { playbook_md: "1. Read the school email.\n2. Add events." });
  await addPlay(7, "Linked", held(["contains a link"]), { playbook_md: "1. Open [a link]" });
  await addPlay(8, "Sneaky", held(["may contain a private company name"]), { playbook_md: "1. copy it to the shared drive" });
  await addPlay(9, "Model harm", held(["could harm whoever runs it: sends data outside", "Zack marked it sensitive"]));
});

describe("the auto-admit backfill", () => {
  it("counts what it would do on a dry run, calls no model and writes nothing", async () => {
    const { m, calls } = fakeModel();
    const before = await plays();
    const t = await autoAdmitHeld(query, m, { apply: false });
    expect(t).toMatchObject({ held: 8, dropped: 2, admitted: 6, drafted: 2, redacted: 3, outlined: 1, left: 8 });
    expect(calls).toEqual({ review: 0, draft: 0 });
    expect(await plays()).toEqual(before);
  });

  it("drafts, redacts, outlines and admits, drops harm, and does nothing the second time", async () => {
    const { m, calls } = fakeModel();
    const t = await autoAdmitHeld(query, m, { apply: true });
    expect(t).toEqual({ held: 8, dropped: 3, admitted: 5, drafted: 1, redacted: 1, outlined: 3, skipped: 0, left: 0 });

    // Quality: drafted and marked, or an outline when drafting fails.
    expect(await byTitle("Inbox triage")).toMatchObject({ shareable: true, flag: null, auto_fixed: { actions: ["drafted"] }, body: { playbook_drafted: true, playbook_md: `${DRAFT_NOTE}\n\n${DRAFTED}` } });
    expect(await byTitle("Undraftable")).toMatchObject({
      shareable: true,
      flag: null,
      auto_fixed: { actions: ["outline_only"], reasons: ["its playbook could not be found in the report", "Roger could not draft its setup steps"] },
      body: { outline_only: true, playbook_md: OUTLINE_NOTE },
    });
    // Privacy: the name the review finds again is replaced everywhere; none found means an outline; sensitive is an outline.
    const thanks = await byTitle("Client thanks");
    expect(thanks).toMatchObject({ shareable: true, auto_fixed: { actions: ["redacted"] }, body: { description: "Thanks [a person] each Friday.", playbook_md: "1. Thank [a person]." } });
    expect(JSON.stringify(thanks)).not.toMatch(/dana/i);
    expect(await byTitle("Vague name")).toMatchObject({ shareable: true, auto_fixed: { actions: ["outline_only"] }, body: { outline_only: true, playbook_md: OUTLINE_NOTE } });
    expect(await byTitle("School events")).toMatchObject({ shareable: true, auto_fixed: { actions: ["outline_only"], reasons: ["Zack marked it sensitive"] }, body: { outline_only: true } });
    // Harm, stored or found by the new review, is dropped and never admitted, whatever else it was held for.
    for (const t of ["Linked", "Sneaky", "Model harm"]) expect(await byTitle(t)).toMatchObject({ shareable: false, auto_fixed: null, flag: { rejected: true, auto: true } });
    expect(await byTitle("Clean")).toMatchObject({ shareable: true, flag: null, auto_fixed: null });
    expect((await query<{ status: string }>("select status from runs"))[0].status).toBe("accepted");

    // A second run: nothing held, no model call, nothing changed.
    const after = await plays();
    const used = { ...calls };
    expect(await autoAdmitHeld(query, m, { apply: true })).toEqual({ held: 0, dropped: 0, admitted: 0, drafted: 0, redacted: 0, outlined: 0, skipped: 0, left: 0 });
    expect(calls).toEqual(used);
    expect(await plays()).toEqual(after);

    // The next merge places what was admitted, and never what was dropped.
    const merge = await mergePending(query, { sameJob: async () => null });
    expect(merge.created).toBe(6);
    const pool = await query<{ title: string; playbook_drafted: boolean }>("select title, playbook_drafted from pool_plays order by title");
    expect(pool.map((p) => p.title)).toEqual(["Clean", "Client thanks", "Inbox triage", "School events", "Undraftable", "Vague name"]);
    expect(pool.filter((p) => p.playbook_drafted).map((p) => p.title)).toEqual(["Inbox triage"]);
  });

  it("stops after `limit` plays and finishes on the next run", async () => {
    const { m } = fakeModel();
    expect(await autoAdmitHeld(query, m, { apply: true, limit: 3 })).toMatchObject({ held: 3, left: 5 });
    expect(await autoAdmitHeld(query, m, { apply: true, limit: 10 })).toMatchObject({ held: 5, left: 0 });
  });
});
