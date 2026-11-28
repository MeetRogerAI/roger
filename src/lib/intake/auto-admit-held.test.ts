import { beforeEach, describe, expect, it } from "vitest";
import { ModelUnavailable } from "@/lib/ai/errors";
import { mergePending } from "@/lib/cora/merge";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { DRAFT_NOTE, NO_REASON, OUTLINE_NOTE, PRIVACY_OUTLINE_NOTE, TITLE_NAME_REASON } from "./auto-admit";
import { autoAdmitHeld } from "./auto-admit-held";
import { ModelCutOff, type IntakeModel, type ReviewFinding } from "./model";

/**
 * The one-off backfill (scripts/auto-admit-held.ts) on a database holding a
 * play of each kind from before auto-admit: it drafts, redacts or outlines and
 * admits, or drops harm; a dry run changes nothing and calls no model; a
 * second run finds nothing to do; a model call that fails leaves its play
 * held for the next run.
 */
let query: Query;
let runId: string;

const DRAFTED = "## Trigger\nEach weekday morning.\n\n## Steps\n1. Read new mail.\n2. Draft replies and wait for a yes.";

const findingsFor = (text: string): ReviewFinding[] => {
  const out: ReviewFinding[] = [];
  if (text.includes("Dana Whitfield")) out.push({ playId: "p1", text: "Dana Whitfield", kind: "person", clear: false, reason: "" });
  if (text.includes("Obrien")) out.push({ playId: "p1", text: "O'Brien", kind: "person", clear: false, reason: "" });
  if (text.includes("the shared drive")) out.push({ playId: "p1", text: "copy it to the shared drive", kind: "harm", clear: false, reason: "sends data outside" });
  return out;
};

/** `review` and `draft` may be replaced per test; calls are counted, and each reviewed text kept. */
function fakeModel(o: { review?: (text: string, id: string) => Promise<ReviewFinding[]>; draft?: (title: string) => Promise<string> } = {}) {
  const calls = { review: 0, draft: 0, reviewed: [] as string[] };
  const m: IntakeModel = {
    readRun: async () => Promise.reject(new Error("unused")),
    async review(plays) {
      calls.review++;
      const text = plays[0].text;
      calls.reviewed.push(text);
      return o.review ? o.review(text, plays[0].id) : findingsFor(text);
    },
    async draftPlaybook(play) {
      calls.draft++;
      if (o.draft) return o.draft(play.title);
      return play.title === "Undraftable" ? "" : DRAFTED;
    },
  };
  return { m, calls };
}

const held = (reasons: string[]) => ({ reasons, fields: [] });

async function addPlay(position: number, title: string, flag: unknown, body: Record<string, unknown> = {}, run = runId): Promise<string> {
  const [{ id }] = await query<{ id: string }>(
    `insert into plays (run_id, user_id, week_of, set_, position, title, category, body, shareable, flag)
     select $1, r.user_id, '2026-11-23', 'A', $2, $3, 'Operations', $4, $5, $6 from runs r where r.id = $1 returning id`,
    [
      run,
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
const stillHeld = async () => (await query<{ title: string }>("select title from plays where flag is not null and not coalesce((flag->>'rejected')::boolean, false) order by title")).map((r) => r.title);

const REPORT = [
  "# Zack v1.9",
  "## Play 1: Inbox triage",
  "Each weekday morning the agent reads new mail and drafts replies.",
  "## Play 2: Undraftable",
  "Something the report hardly describes.",
  "## Review list",
  "**Proper nouns, tools and products in this report:** Zack.",
].join("\n");

beforeEach(async () => {
  ({ query } = await testDb());
  const [u] = await query<{ id: string }>("insert into users (email, status, sharing) values ('ana@example.com', 'active', 'share') returning id");
  [{ id: runId }] = await query<{ id: string }>(
    "insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, '2026-11-23', 'connector', 'claude', 'share', $2, 'flagged') returning id",
    [u.id, REPORT],
  );
  await addPlay(1, "Clean", null, { playbook_md: "1. Step." });
  await addPlay(2, "Inbox triage", held(["its playbook could not be found in the report"]));
  await addPlay(3, "Undraftable", held(["its playbook could not be found in the report"]));
  await addPlay(4, "Client thanks", held(["may contain a private person name"]), { description: "Thanks Dana Whitfield each Friday.", playbook_md: "1. Thank DANA WHITFIELD." });
  await addPlay(5, "Vague name", held(["may contain a private place name"]), { playbook_md: "1. Book the usual room." });
  await addPlay(6, "School events", held(["Zack marked it sensitive"]), { playbook_md: "1. Read the school email.\n2. Add events.", heavy_use_for: "Lena's school" });
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
    expect(calls).toMatchObject({ review: 0, draft: 0 });
    expect(await plays()).toEqual(before);
  });

  it("drafts, redacts, outlines and admits, drops harm, and does nothing the second time", async () => {
    const { m, calls } = fakeModel();
    const t = await autoAdmitHeld(query, m, { apply: true });
    expect(t).toEqual({ held: 8, dropped: 3, admitted: 5, drafted: 1, redacted: 1, outlined: 3, skipped: 0, left: 0 });

    // Quality: drafted and marked, or an outline when the draft gives nothing usable.
    expect(await byTitle("Inbox triage")).toMatchObject({ shareable: true, flag: null, auto_fixed: { actions: ["drafted"] }, body: { playbook_drafted: true, playbook_md: `${DRAFT_NOTE}\n\n${DRAFTED}` } });
    expect(await byTitle("Undraftable")).toMatchObject({
      shareable: true,
      flag: null,
      auto_fixed: { actions: ["outline_only"], reasons: ["its playbook could not be found in the report", "Roger could not draft its setup steps"] },
      body: { outline_only: true, playbook_md: OUTLINE_NOTE, description: "What Undraftable does." },
    });
    // Privacy: the name the review finds again is replaced everywhere; sensitive is a privacy outline, its own title only; a name not
    // found again is a privacy outline with a neutral title, never the member's (re-review G1).
    const thanks = await byTitle("Client thanks");
    expect(thanks).toMatchObject({ shareable: true, auto_fixed: { actions: ["redacted"] }, body: { description: "Thanks [a person] each Friday.", playbook_md: "1. Thank [a person]." } });
    expect(JSON.stringify(thanks)).not.toMatch(/dana/i);
    expect(await byTitle("An operations play")).toMatchObject({ shareable: true, auto_fixed: { actions: ["outline_only"] }, body: { outline_only: true, playbook_md: PRIVACY_OUTLINE_NOTE, description: "", job: "" } });
    expect(JSON.stringify(await plays())).not.toContain("Vague name");
    const school = await byTitle("School events");
    expect(school).toMatchObject({ shareable: true, auto_fixed: { actions: ["outline_only"], reasons: ["Zack marked it sensitive"] }, body: { outline_only: true, playbook_md: PRIVACY_OUTLINE_NOTE, description: "", heavy_use_for: "" } });
    expect(JSON.stringify(school.body)).not.toMatch(/Lena|school email/);
    // Harm, stored or found by the new review, is dropped and never admitted, whatever else it was held for.
    for (const t of ["Linked", "Sneaky", "Model harm"]) expect(await byTitle(t)).toMatchObject({ shareable: false, auto_fixed: null, flag: { rejected: true, auto: true } });
    expect(await byTitle("Clean")).toMatchObject({ shareable: true, flag: null, auto_fixed: null });
    expect((await query<{ status: string }>("select status from runs"))[0].status).toBe("accepted");

    // A second run: nothing held, no model call, nothing changed.
    const after = await plays();
    const used = { review: calls.review, draft: calls.draft };
    expect(await autoAdmitHeld(query, m, { apply: true })).toEqual({ held: 0, dropped: 0, admitted: 0, drafted: 0, redacted: 0, outlined: 0, skipped: 0, left: 0 });
    expect(calls).toMatchObject(used);
    expect(await plays()).toEqual(after);

    // The next merge places what was admitted, and never what was dropped.
    const merge = await mergePending(query, { sameJob: async () => null });
    expect(merge.created).toBe(6);
    const pool = await query<{ title: string; playbook_drafted: boolean }>("select title, playbook_drafted from pool_plays order by title");
    expect(pool.map((p) => p.title)).toEqual(["An operations play", "Clean", "Client thanks", "Inbox triage", "School events", "Undraftable"]);
    expect(pool.filter((p) => p.playbook_drafted).map((p) => p.title)).toEqual(["Inbox triage"]);
  });

  it("stops after `limit` plays and finishes on the next run", async () => {
    const { m } = fakeModel();
    expect(await autoAdmitHeld(query, m, { apply: true, limit: 3 })).toMatchObject({ held: 3, left: 5 });
    expect(await autoAdmitHeld(query, m, { apply: true, limit: 10 })).toMatchObject({ held: 5, left: 0 });
  });

  it("leaves a play held when its name review fails (an error, a time-out, a cut-off answer), and admits it on the next run (review F1)", async () => {
    for (const failure of [new Error("schema mismatch"), new Error("timeout"), new ModelCutOff("cut")]) {
      await query("delete from plays where title = 'Client thanks' or body->>'title' = 'Client thanks'");
      await addPlay(4, "Client thanks", held(["may contain a private person name"]), { description: "Thanks Dana Whitfield each Friday.", playbook_md: "1. Thank DANA WHITFIELD." });
      const { m } = fakeModel({ review: async (text) => (text.includes("Dana") ? Promise.reject(failure) : findingsFor(text)) });
      const t = await autoAdmitHeld(query, m, { apply: true });
      expect(t).toMatchObject({ skipped: 1, left: 1 });
      expect(await stillHeld()).toEqual(["Client thanks"]);
      expect(await byTitle("Client thanks")).toMatchObject({ shareable: false, auto_fixed: null, body: { description: "Thanks Dana Whitfield each Friday." } });
      expect(await autoAdmitHeld(query, fakeModel().m, { apply: true })).toMatchObject({ held: 1, admitted: 1, redacted: 1, skipped: 0, left: 0 });
      expect(await byTitle("Client thanks")).toMatchObject({ shareable: true, auto_fixed: { actions: ["redacted"] } });
    }
  });

  it("keeps the names it could replace when another cannot be placed, as a privacy outline with a neutral title, never the member's (review F1, re-review G1)", async () => {
    await query("delete from plays");
    await addPlay(1, "Thanks for Dana Whitfield", held(["may contain a private person name"]), { description: "Thanks Dana Whitfield and Obrien.", playbook_md: "1. Thank them." });
    await addPlay(2, "Call Obrien each Friday", held(["may contain a private person name"]), { description: "Calls Obrien.", playbook_md: "1. Call." });
    const t = await autoAdmitHeld(query, fakeModel().m, { apply: true });
    expect(t).toMatchObject({ held: 2, admitted: 2, dropped: 0, redacted: 1, outlined: 2, left: 0 });
    const [thanks, call] = await plays();
    expect(thanks).toMatchObject({ title: "An operations play", shareable: true, auto_fixed: { actions: ["redacted", "outline_only"] }, body: { title: "An operations play", category: "Operations", description: "", playbook_md: PRIVACY_OUTLINE_NOTE } });
    expect(call).toMatchObject({ title: "An operations play", shareable: true, auto_fixed: { actions: ["outline_only"] } });
    expect(JSON.stringify([thanks, call])).not.toMatch(/dana|obrien|thanks for|friday/i);
    expect((await query<{ status: string }>("select status from runs"))[0].status).toBe("accepted");
  });

  it("drops a sensitive play whose title, the one text it keeps, still holds a name the review found (review F1)", async () => {
    await query("delete from plays");
    await addPlay(1, "DanaWhitfield sync", held(["may contain a private person name", "Zack marked it sensitive"]), { description: "Calls Dana Whitfield.", playbook_md: "1. Call." });
    await addPlay(2, "Weekly sync", held(["may contain a private person name", "Zack marked it sensitive"]), { description: "Calls Dana Whitfield.", playbook_md: "1. Call." });
    expect(await autoAdmitHeld(query, fakeModel().m, { apply: true })).toMatchObject({ held: 2, admitted: 1, dropped: 1, left: 0 });
    const [dropped, kept] = await plays();
    expect(dropped).toMatchObject({ shareable: false, auto_fixed: null, flag: { reasons: ["may contain a private person name", "Zack marked it sensitive", TITLE_NAME_REASON], rejected: true, auto: true } });
    // Every name was placed and the play is only sensitive, so its own title is kept, checked.
    expect(kept).toMatchObject({ title: "Weekly sync", shareable: true, auto_fixed: { actions: ["redacted", "outline_only"] }, body: { description: "" } });
  });

  it("leaves a play held when drafting its steps hits a model error, and drafts it on the next run (review F6)", async () => {
    const { m } = fakeModel({ draft: async (title) => (title === "Inbox triage" ? Promise.reject(new Error("timeout")) : "") });
    expect(await autoAdmitHeld(query, m, { apply: true })).toMatchObject({ skipped: 1, left: 1 });
    expect(await stillHeld()).toEqual(["Inbox triage"]);
    expect(await autoAdmitHeld(query, fakeModel().m, { apply: true })).toMatchObject({ held: 1, admitted: 1, drafted: 1, left: 0 });
    expect(await byTitle("Inbox triage")).toMatchObject({ auto_fixed: { actions: ["drafted"] }, body: { playbook_drafted: true } });
  });

  it("stops at once when the model has no credits mid-way: what was written stays, the rest stays held, and a rerun finishes", async () => {
    let reviews = 0;
    const refused: string[] = [];
    const { m } = fakeModel({
      // Only the name reviews count (a draft has its own review, id "draft").
      review: async (text, id) => {
        if (id === "p1" && ++reviews === 2) {
          refused.push(text);
          return Promise.reject(Object.assign(new Error("Insufficient credits"), { statusCode: 402 }));
        }
        return findingsFor(text);
      },
    });
    await expect(autoAdmitHeld(query, m, { apply: true })).rejects.toSatisfy((e) => e instanceof ModelUnavailable || /credits/i.test(String(e)));
    expect(refused).toHaveLength(1);
    const left = await stillHeld();
    // The play whose review was refused is still held, untouched.
    const refusedTitle = ["Client thanks", "Vague name", "Sneaky"].find((t) => refused[0].includes(t))!;
    expect(left).toContain(refusedTitle);
    expect(left.length).toBeLessThan(8);
    expect(await autoAdmitHeld(query, fakeModel().m, { apply: true })).toMatchObject({ held: left.length, skipped: 0, left: 0 });
  });

  it("leaves alone a play changed between the read and the write (skipped), and handles it on the next run", async () => {
    const { m } = fakeModel({
      review: async (text) => {
        if (text.includes("Dana")) await query("update plays set revision = revision + 1 where title = 'Client thanks'");
        return findingsFor(text);
      },
    });
    expect(await autoAdmitHeld(query, m, { apply: true })).toMatchObject({ skipped: 1, left: 1, admitted: 4 });
    expect(await stillHeld()).toEqual(["Client thanks"]);
    expect(await autoAdmitHeld(query, fakeModel().m, { apply: true })).toMatchObject({ held: 1, admitted: 1, skipped: 0, left: 0 });
  });

  it("drops a play held with no reason stored, and says so in the log (review F9)", async () => {
    await query("delete from plays");
    await addPlay(1, "No reason", held([]));
    await addPlay(2, "Blank reason", held([" "]));
    const { m, calls } = fakeModel();
    expect(await autoAdmitHeld(query, m, { apply: false })).toMatchObject({ dropped: 2, admitted: 0 });
    expect(await autoAdmitHeld(query, m, { apply: true })).toMatchObject({ held: 2, dropped: 2, admitted: 0, left: 0 });
    expect(calls).toMatchObject({ review: 0, draft: 0 });
    for (const t of ["No reason", "Blank reason"]) expect(await byTitle(t)).toMatchObject({ shareable: false, auto_fixed: null, flag: { reasons: expect.arrayContaining([NO_REASON]), rejected: true, auto: true } });
  });

  it("settles a run left flagged with no open flag (a pass that stopped between the two writes), even with nothing held (review F10)", async () => {
    const [{ id: stuck }] = await query<{ id: string }>(
      "insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) select user_id, '2026-11-16', 'connector', 'claude', 'share', 'x', 'flagged' from runs where id = $1 returning id",
      [runId],
    );
    await addPlay(1, "Already admitted", null, {}, stuck);
    // A run flagged as a whole (no plays) is an admin's, and stays flagged.
    const [{ id: unreadable }] = await query<{ id: string }>(
      "insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) select user_id, '2026-11-09', 'connector', 'hark', 'share', 'x', 'flagged' from runs where id = $1 returning id",
      [runId],
    );
    await query("delete from plays where run_id = $1 and flag is not null", [runId]);
    await autoAdmitHeld(query, fakeModel().m, { apply: true });
    const status = async (id: string) => (await query<{ status: string }>("select status from runs where id = $1", [id]))[0].status;
    expect(await status(stuck)).toBe("accepted");
    expect(await status(runId)).toBe("accepted");
    expect(await status(unreadable)).toBe("flagged");
  });
});
