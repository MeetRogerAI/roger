import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * B3 plan Unit 5: the member's weekly note. The box is under a delivered list
 * only while v3.feedbackOn is on (through featureOn); the save action refuses
 * while it is off; the saved text is shown as plain text, never as HTML.
 */

const db: { query: Query | null; userId: string; feedbackOn: boolean; cycleLive: boolean } = { query: null, userId: "", feedbackOn: true, cycleLive: true };
let refreshed = 0;
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({ refresh: () => void refreshed++ }));
vi.mock("@/lib/auth/access", () => ({
  requireUser: async () => ({ userId: db.userId }),
  requireUserForAction: async () => {
    if (!db.userId) throw new Error("Not signed in");
    return { userId: db.userId };
  },
}));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/v3-settings", async (orig) => {
  const m = await orig<typeof import("@/lib/v3-settings")>();
  return { ...m, readV3Settings: async () => ({ ...m.mergeV3([]), signupOpen: true, cycleLive: db.cycleLive, feedbackOn: db.feedbackOn }) };
});

const { default: WeekPage } = await import("@/app/app/week/[date]/page");
const { saveWeekNoteAction, deleteWeekNoteAction } = await import("@/app/app/actions");
const { WeekNote } = await import("./week-note");

const WEEK = "2026-12-14";
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const save = (note: string, week = WEEK) => saveWeekNoteAction({ status: "idle" }, form({ week, note }));
const html = async (node: React.ReactElement) => (await new Response((await prerender(node)).prelude).text()).replaceAll("<!-- -->", "");
const page = () => html(<WeekPage params={Promise.resolve({ date: WEEK })} searchParams={Promise.resolve({})} />);
const notes = () => db.query!<{ user_id: string; body: string }>("select user_id, body from member_feedback");

beforeEach(async () => {
  const { query } = await testDb();
  db.query = query;
  db.feedbackOn = true;
  db.cycleLive = true;
  refreshed = 0;
  const [u] = await query<{ id: string }>("insert into users (email, status, plan, trial_started_at) values ('a@example.com', 'active', 'monthly', now()) returning id");
  db.userId = u.id;
  await query("insert into cora_weeks (week_of, status, phase) values ($1, 'sent', 'ready')", [WEEK]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count, delivered_at) values ($1, $2, 'picked', 1, now())", [u.id, WEEK]);
  const [p] = await query<{ id: string }>(
    "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('Inbox triage', 'Sales', 'd', 'p', 'i', $1, $1) returning id",
    [WEEK],
  );
  await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, delivered_at) values ($1, $2, 1, $3, 70, 3, 'r', now())", [u.id, WEEK, p.id]);
});

describe("the note box on the week page", () => {
  it("is under the delivered list while v3.feedbackOn is on, and hidden when it or the cycle is off", async () => {
    expect(await page()).toContain("A note for us");
    db.feedbackOn = false;
    expect(await page()).not.toContain("A note for us");
    db.feedbackOn = true;
    db.cycleLive = false;
    expect(await page()).not.toContain("A note for us");
  });

  it("isn't offered on a week with no list", async () => {
    await db.query!("delete from picks");
    expect(await page()).not.toContain("A note for us");
  });

  it("shows a saved note as plain text, never as HTML", async () => {
    expect(await save("<b>bold</b><script>alert(1)</script>")).toMatchObject({ status: "saved" });
    const out = await page();
    expect(out).toContain("&lt;b&gt;bold&lt;/b&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toContain("<b>bold</b>");
    expect(out).not.toContain("<script>alert");
    expect(out).toContain("Delete note");
  });
});

describe("the note actions", () => {
  it("save stores the member's own note and refreshes; a second save edits it", async () => {
    expect(await save("Useful week.")).toEqual({ status: "saved", message: "Note saved.", note: "Useful week.", at: expect.any(Number) });
    expect(await save("Very useful week.")).toMatchObject({ status: "saved" });
    expect(await notes()).toEqual([{ user_id: db.userId, body: "Very useful week." }]);
    expect(refreshed).toBe(2);
  });

  it("save refuses while v3.feedbackOn is off, and stores nothing", async () => {
    db.feedbackOn = false;
    expect(await save("Hello")).toMatchObject({ status: "error", message: "Notes are switched off just now." });
    expect(await notes()).toEqual([]);
    expect(refreshed).toBe(0);
  });

  it("refuses a note that is too long with the length message, then slows down repeated failures only", async () => {
    expect(await save("x".repeat(2001))).toMatchObject({ status: "error", message: "Keep your note to 2,000 characters or fewer." });
    for (let i = 0; i < 19; i++) await save("");
    expect(await save("x".repeat(2001))).toMatchObject({ status: "error", message: "Too many tries. Wait a few minutes." });
    // A valid note is never refused by the limit.
    expect(await save("Fine now.")).toMatchObject({ status: "saved" });
  });

  it("delete removes the note, even with the switch off", async () => {
    await save("To delete");
    db.feedbackOn = false;
    expect(await deleteWeekNoteAction({ status: "idle" }, form({ week: WEEK }))).toMatchObject({ status: "deleted", message: "Note deleted." });
    expect(await notes()).toEqual([]);
    expect(await deleteWeekNoteAction({ status: "idle" }, form({ week: WEEK }))).toMatchObject({ status: "error" });
  });

  it("refuses anyone not signed in", async () => {
    db.userId = "";
    await expect(save("Hi")).rejects.toThrow("Not signed in");
  });
});

describe("WeekNote", () => {
  it("renders the note in a textarea, escaped, with the privacy line and a delete button", async () => {
    const out = await html(<WeekNote week={WEEK} note={"<img src=x onerror=alert(1)>"} />);
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(out).not.toContain("<img");
    expect(out).toContain("Only you and the Roger team see this.");
    expect(out).toContain('maxLength="2000"');
    expect(out).toContain("Delete note");
  });

  it("offers no delete before there is a note", async () => {
    expect(await html(<WeekNote week={WEEK} note={null} />)).not.toContain("Delete note");
  });
});
