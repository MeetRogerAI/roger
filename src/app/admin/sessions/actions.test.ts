import { createElement } from "react";
import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { nextHeaders, nextNavigation, resetNextFakes } from "@/test-helpers/next-fakes";

/**
 * B2 plan Unit 9 (origin R5): /admin/sessions. Only an admin can tick
 * attendance; each tick and untick is stored with the admin's email and
 * written to the admin action log.
 */

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const db: { query: Query | null; admin: string | null } = { query: null, admin: null };
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => {
    if (!db.admin) throw new Error("Not signed in");
    return db.admin;
  },
  isAdmin: async () => Boolean(db.admin),
}));
vi.mock("@/lib/v3-settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/v3-settings")>()),
  readV3Settings: async () => ({ ...mergeV3([]), sessionDay: "Tuesday", sessionTime: "12:00", sessionLink: "https://meet.google.com/abc-defg-hij" }),
}));

const { setAttendanceAction } = await import("./actions");
const { default: Page } = await import("./page");

const DATE = "2026-12-01";
const tick = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ date: DATE, attended: "1", ...o })) fd.append(k, v);
  return setAttendanceAction({ status: "idle" }, fd);
};

let ana: string;
let guest: string;
beforeEach(async () => {
  ({ query: db.query } = await testDb());
  resetNextFakes();
  db.admin = "peter@meetroger.ai";
  [{ id: ana }] = await db.query!<{ id: string }>(`insert into users (email, name, status) values ('ana@example.com', 'Ana', 'active') returning id`);
  [{ id: guest }] = await db.query!<{ id: string }>(
    `insert into session_guests (token_hash, inviter_id, session_date, name, email) values ('h1', $1, $2::date, 'Bo Guest', 'bo@example.com') returning id`,
    [ana, DATE],
  );
});

describe("setAttendanceAction", () => {
  it("refuses anyone who isn't an admin, and writes nothing", async () => {
    db.admin = null;
    await expect(tick({ kind: "member", id: ana })).rejects.toThrow("Not signed in");
    expect(await db.query!("select 1 from session_attendance")).toHaveLength(0);
    expect(await db.query!("select 1 from admin_actions")).toHaveLength(0);
  });

  it("ticks a member, with the admin's email on the row and in the log", async () => {
    expect(await tick({ kind: "member", id: ana })).toMatchObject({ status: "ok" });
    expect(await db.query!("select user_id, session_date::text as d, marked_by from session_attendance")).toEqual([{ user_id: ana, d: DATE, marked_by: "peter@meetroger.ai" }]);
    expect(await db.query!("select admin_email, user_id, action, detail from admin_actions")).toEqual([
      { admin_email: "peter@meetroger.ai", user_id: ana, action: "session_attended", detail: { sessionDate: DATE } },
    ]);
    // Ticking again changes nothing but is still logged.
    await tick({ kind: "member", id: ana });
    expect(await db.query!("select 1 from session_attendance")).toHaveLength(1);
  });

  it("ticks a guest of that session, and unticks", async () => {
    expect(await tick({ kind: "guest", id: guest })).toMatchObject({ status: "ok" });
    expect(await db.query!("select guest_id, user_id from session_attendance")).toEqual([{ guest_id: guest, user_id: null }]);
    expect(await tick({ kind: "guest", id: guest, attended: "0" })).toMatchObject({ status: "ok" });
    expect(await db.query!("select 1 from session_attendance")).toHaveLength(0);
    expect((await db.query!<{ action: string }>("select action from admin_actions order by id")).map((r) => r.action)).toEqual(["session_attended", "session_attended_undo"]);
  });

  it("refuses a guest of another session, a bad date and a bad id", async () => {
    expect(await tick({ kind: "guest", id: guest, date: "2026-12-08" })).toMatchObject({ status: "error" });
    expect(await tick({ kind: "member", id: ana, date: "2026-13-45" })).toMatchObject({ status: "error" });
    expect(await tick({ kind: "member", id: "not-a-uuid" })).toMatchObject({ status: "error" });
    expect(await tick({ kind: "owner", id: ana })).toMatchObject({ status: "error" });
    expect(await db.query!("select 1 from session_attendance")).toHaveLength(0);
  });
});

describe("/admin/sessions", () => {
  it("lists the session's guests and members with their ticks", async () => {
    await tick({ kind: "guest", id: guest });
    const { prelude } = await prerender(createElement(Page, { searchParams: Promise.resolve({ date: DATE }), params: Promise.resolve({}) } as never));
    const html = (await new Response(prelude).text()).replaceAll("<!-- -->", "");
    expect(html).toContain("Bo Guest");
    expect(html).toContain("guest of Ana");
    expect(html).toContain("ticked by peter@meetroger.ai");
    expect(html).toContain("ana@example.com");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toMatch(/Attended<span class="sr-only"> for Bo Guest<\/span>/);
    expect(html).toMatch(/Mark attended<span class="sr-only"> for Ana<\/span>/);
    expect(html).toContain('aria-label="Session dates"');
    expect(html).toContain("min-h-11");
  });

  it("shows nothing to a non-admin", async () => {
    db.admin = null;
    const { prelude } = await prerender(createElement(Page, { searchParams: Promise.resolve({ date: DATE }), params: Promise.resolve({}) } as never));
    const html = await new Response(prelude).text();
    expect(html).toBe("");
    expect(html).not.toContain("@");
  });
});
