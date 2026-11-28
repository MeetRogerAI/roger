import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb, testSponsor } from "@/test-helpers/pglite-db";
import { addReply, cleanText, deleteMemberNote, feedbackFor, memberNote, NOTE_MAX, REPLY_MAX, saveMemberNote } from "./feedback";

/**
 * B3 plan Unit 5 (R21): a member's weekly note, one per list week, edited in
 * place and deletable; admin-entered replies, logged without their text.
 */

let query: Query;
const WEEK = "2026-12-14";
const ADMIN = "peter@example.com";
const ZWSP = String.fromCharCode(0x200b);

async function member(email: string, weeks: string[] = [WEEK]): Promise<string> {
  const [{ id }] = await query<{ id: string }>("insert into users (email, status) values ($1, 'active') returning id", [email]);
  for (const w of weeks) {
    const [p] = await query<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('Idea', 'Sales', 'd', 'p', 'i', $1, $1) returning id",
      [w],
    );
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, delivered_at) values ($1, $2, 1, $3, 70, 3, 'r', now())", [id, w, p.id]);
  }
  return id;
}
const notes = () => query<{ user_id: string; week_of: string; source: string; body: string; entered_by: string | null }>("select user_id, to_char(week_of, 'YYYY-MM-DD') as week_of, source, body, entered_by from member_feedback order by created_at, id");

let ana: string;
beforeEach(async () => {
  ({ query } = await testDb());
  ana = await member("ana@example.com");
});

describe("cleanText", () => {
  it("removes zero-width characters, folds CRLF and trims", () => {
    expect(cleanText(`  a${ZWSP}b\r\nc  `)).toBe("ab\nc");
  });
});

describe("a member's note", () => {
  it("saves a note for a list week, edits it in place (still one row), then deletes it", async () => {
    expect(await saveMemberNote(query, ana, WEEK, "The second idea was great.")).toMatchObject({ ok: true });
    expect(await saveMemberNote(query, ana, WEEK, "Changed my mind: the first one.")).toMatchObject({ ok: true });
    expect(await notes()).toEqual([{ user_id: ana, week_of: WEEK, source: "member_note", body: "Changed my mind: the first one.", entered_by: null }]);
    expect(await memberNote(query, ana, WEEK)).toBe("Changed my mind: the first one.");
    expect(await deleteMemberNote(query, ana, WEEK)).toMatchObject({ ok: true });
    expect(await notes()).toEqual([]);
    expect(await memberNote(query, ana, WEEK)).toBeNull();
  });

  it("refuses a note over the limit with the length message, and stores it without zero-width characters", async () => {
    const r = await saveMemberNote(query, ana, WEEK, "x".repeat(NOTE_MAX + 1));
    expect(r).toEqual({ ok: false, message: "Keep your note to 2,000 characters or fewer." });
    expect(await notes()).toEqual([]);
    expect(await saveMemberNote(query, ana, WEEK, "x".repeat(NOTE_MAX))).toMatchObject({ ok: true });
    expect(await saveMemberNote(query, ana, WEEK, `Use${ZWSP}ful`)).toMatchObject({ ok: true });
    expect((await notes())[0].body).toBe("Useful");
  });

  it("refuses an empty note and a week the member got no ideas for", async () => {
    expect(await saveMemberNote(query, ana, WEEK, `  ${ZWSP} `)).toEqual({ ok: false, message: "Write your note first." });
    expect(await saveMemberNote(query, ana, "2026-12-21", "Hi")).toEqual({ ok: false, message: "You can leave a note only on a week you got ideas." });
    expect(await saveMemberNote(query, ana, "not-a-date", "Hi")).toMatchObject({ ok: false });
    // A dry-run or undelivered pick is not a list.
    await query("update picks set delivered_at = null");
    expect(await saveMemberNote(query, ana, WEEK, "Hi")).toMatchObject({ ok: false });
    expect(await notes()).toEqual([]);
  });

  it("returns the note as stored (normalised), for the form to show", async () => {
    expect(await saveMemberNote(query, ana, WEEK, `  Use${ZWSP}ful\r\nweek  `)).toEqual({ ok: true, message: "Note saved.", note: "Useful\nweek" });
  });

  it("leaves one row when two saves for the same member and week run at once", async () => {
    const [a, b] = await Promise.all([saveMemberNote(query, ana, WEEK, "First"), saveMemberNote(query, ana, WEEK, "Second")]);
    expect([a.ok, b.ok]).toEqual([true, true]);
    const rows = await notes();
    expect(rows).toHaveLength(1);
    expect(["First", "Second"]).toContain(rows[0].body);
  });

  it("refuses a held week, an undelivered week and a dry-run week, and accepts a sponsored member's delivered week", async () => {
    const pick = async (userId: string, week: string, o: { delivered: boolean; dryRun: boolean }) => {
      const [p] = await query<{ id: string }>(
        "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('Idea', 'Sales', 'd', 'p', 'i', $1, $1) returning id",
        [week],
      );
      await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run, delivered_at) values ($1, $2, 1, $3, 70, 3, 'r', $4, $5)", [
        userId,
        week,
        p.id,
        o.dryRun,
        o.delivered ? new Date() : null,
      ]);
    };
    // Held: a no-card trial's list, picked and decided but kept back until a card is saved.
    const [{ id: held }] = await query<{ id: string }>("insert into users (email, status) values ('held@example.com', 'trial') returning id");
    await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count) values ($1, $2, 'picked', 1)", [held, WEEK]);
    await pick(held, WEEK, { delivered: false, dryRun: false });
    expect(await saveMemberNote(query, held, WEEK, "Hi")).toMatchObject({ ok: false });
    // Undelivered (not yet sent) and dry-run (delivered, but only a rehearsal) weeks of an active member.
    await pick(ana, "2026-12-07", { delivered: false, dryRun: false });
    await pick(ana, "2026-11-30", { delivered: true, dryRun: true });
    expect(await saveMemberNote(query, ana, "2026-12-07", "Hi")).toMatchObject({ ok: false });
    expect(await saveMemberNote(query, ana, "2026-11-30", "Hi")).toMatchObject({ ok: false });
    expect(await notes()).toEqual([]);
    // A sponsored member's delivered week takes a note.
    const [{ id: sponsored }] = await query<{ id: string }>("insert into users (email, status, sponsor_id, sponsor_seat) values ('s@example.com', 'active', $1, 1) returning id", [
      await testSponsor(query),
    ]);
    await pick(sponsored, WEEK, { delivered: true, dryRun: false });
    expect(await saveMemberNote(query, sponsored, WEEK, "From a sponsored seat")).toMatchObject({ ok: true });
    expect(await notes()).toEqual([expect.objectContaining({ user_id: sponsored, body: "From a sponsored seat" })]);
  });

  it("keeps one member away from another's note", async () => {
    const ben = await member("ben@example.com", ["2026-12-07"]);
    await saveMemberNote(query, ana, WEEK, "Ana's note");
    // Ben has no list that week: he can't write a note there, and can't touch Ana's.
    expect(await saveMemberNote(query, ben, WEEK, "Overwrite")).toMatchObject({ ok: false });
    expect(await deleteMemberNote(query, ben, WEEK)).toMatchObject({ ok: false });
    expect(await memberNote(query, ben, WEEK)).toBeNull();
    expect(await notes()).toEqual([expect.objectContaining({ user_id: ana, body: "Ana's note" })]);
  });
});

describe("an admin reply", () => {
  it("is stored against the member with who entered it, shows in the member's list, and is logged without its text", async () => {
    await saveMemberNote(query, ana, WEEK, "My note");
    expect(await addReply(query, ADMIN, ana, { receivedOn: "2026-12-16", body: "Thanks, the inbox one saved me an hour." })).toMatchObject({ ok: true });
    const list = await feedbackFor(query, ana);
    expect(list.map((f) => [f.source, f.weekOf, f.body, f.enteredBy])).toEqual([
      ["admin_reply", WEEK, "Thanks, the inbox one saved me an hour.", ADMIN],
      ["member_note", WEEK, "My note", null],
    ]);
    const log = await query<{ admin_email: string; user_id: string; action: string; detail: Record<string, unknown> }>("select admin_email, user_id, action, detail from admin_actions");
    expect(log).toEqual([{ admin_email: ADMIN, user_id: ana, action: "add_feedback", detail: { feedbackId: expect.any(String), weekOf: WEEK, length: 39 } }]);
    expect(JSON.stringify(log)).not.toContain("inbox");
  });

  it("writes the reply and its log row in one statement: neither exists without the other", async () => {
    let statements = 0;
    const failing: Query = async (t, p) => {
      statements++;
      if (/insert into admin_actions/.test(t)) throw new Error("log down");
      return query(t, p);
    };
    await expect(addReply(failing, ADMIN, ana, { receivedOn: WEEK, body: "A reply" })).rejects.toThrow("log down");
    expect(statements).toBe(1);
    // The database itself rolls the reply back when the log insert fails (a bad admin_actions row).
    await query("alter table admin_actions add constraint no_add_feedback check (action <> 'add_feedback')");
    await expect(addReply(query, ADMIN, ana, { receivedOn: WEEK, body: "A reply" })).rejects.toThrow();
    expect(await notes()).toEqual([]);
    expect(await query("select 1 from admin_actions")).toEqual([]);
  });

  it("allows two replies in one week, and refuses empty, too long, a bad date or an unknown member", async () => {
    expect(await addReply(query, ADMIN, ana, { receivedOn: "2026-12-14", body: "One" })).toMatchObject({ ok: true });
    expect(await addReply(query, ADMIN, ana, { receivedOn: "2026-12-20", body: "Two" })).toMatchObject({ ok: true });
    expect(await addReply(query, ADMIN, ana, { receivedOn: "2026-12-14", body: " " })).toMatchObject({ ok: false });
    expect(await addReply(query, ADMIN, ana, { receivedOn: "2026-12-14", body: "x".repeat(REPLY_MAX + 1) })).toMatchObject({ ok: false });
    expect(await addReply(query, ADMIN, ana, { receivedOn: "2026-02-30", body: "Hi" })).toMatchObject({ ok: false, message: "Enter the date the reply came in." });
    expect(await addReply(query, ADMIN, "00000000-0000-4000-8000-000000000000", { receivedOn: "2026-12-14", body: "Hi" })).toEqual({ ok: false, message: "No such user." });
    expect((await notes()).map((n) => n.body)).toEqual(["One", "Two"]);
    expect(await query("select 1 from admin_actions")).toHaveLength(2);
  });
});

describe("deleting the account", () => {
  it("removes the member's notes and replies", async () => {
    await saveMemberNote(query, ana, WEEK, "My note");
    await addReply(query, ADMIN, ana, { receivedOn: WEEK, body: "A reply" });
    await query("delete from users where id = $1", [ana]);
    expect(await notes()).toEqual([]);
  });
});
