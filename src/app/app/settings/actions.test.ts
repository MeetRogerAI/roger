import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
let refreshed = 0;
let tagged: string[] = [];
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => void refreshed++, updateTag: (t: string) => void tagged.push(t) }));

let current: Query;
let signedIn: string | null = null;
let admin = false;
const mailed: string[] = [];
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  requireUserForAction: async () => {
    if (!signedIn) throw new Error("Not signed in");
    return { userId: signedIn };
  },
  getSession: async () => (signedIn ? { userId: signedIn, email: "peter@example.com" } : null),
  isEmailAdmin: async () => admin,
}));
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => {
    if (!admin) throw new Error("Not signed in");
  },
}));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), hit: async () => true }));
vi.mock("@/lib/mail/send", async (orig) => ({
  ...(await orig<typeof import("@/lib/mail/send")>()),
  sendToUser: async (u: { email: string }, kind: string) => {
    mailed.push(`${kind}:${u.email}`);
    return "sent";
  },
}));

const { saveProfileAction, changeEmailAction } = await import("./actions");
const { agreeGoal } = await import("@/app/getstarted/actions");
const { saveSetupFile, publishSetupFile, restoreSetupFile } = await import("@/app/admin/setup-file/actions");
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};

let other: string;
beforeEach(async () => {
  ({ query: current } = await testDb());
  resetNextFakes();
  mailed.length = 0;
  refreshed = 0;
  tagged = [];
  admin = false;
  [{ id: signedIn }] = await current<{ id: string }>("insert into users (email, name, status) values ('ana@example.com', 'Ana', 'trial') returning id");
  [{ id: other }] = await current<{ id: string }>("insert into users (email, name, status) values ('bo@example.com', 'Bo', 'active') returning id");
});

describe("settings actions", () => {
  it("save only the signed-in user's own row", async () => {
    const r = await outcome(() => saveProfileAction({ status: "idle" }, form({ name: "Ana L", displayName: "Ana", timezone: "America/Vancouver", pref_friday_prompt: "on", pref_stats: "on", id: other })));
    expect(r).toMatchObject({ value: { status: "saved" } });
    const rows = await current<{ email: string; name: string; timezone: string; email_prefs: object }>("select email, name, timezone, email_prefs from users order by email");
    expect(rows).toEqual([
      { email: "ana@example.com", name: "Ana L", timezone: "America/Vancouver", email_prefs: { monday: false, friday_prompt: true, stats: true } },
      { email: "bo@example.com", name: "Bo", timezone: "America/Toronto", email_prefs: {} },
    ]);
    expect(refreshed).toBe(1);
  });

  it("a stale form never re-enables the stats email an email link turned off after it loaded (B2 Unit 8)", async () => {
    const save = (o: Record<string, string>) => saveProfileAction({ status: "idle" }, form({ name: "Ana", displayName: "", timezone: "America/Toronto", pref_monday: "on", ...o }));
    const stats = async () => (await current<{ email_prefs: Record<string, unknown> }>("select email_prefs from users where id = $1", [signedIn]))[0].email_prefs.stats;
    // The form loaded with stats on; then /u switched it off; then the form is saved unchanged.
    await current(`update users set email_prefs = '{"stats": false}' where id = $1`, [signedIn]);
    expect(await save({ pref_stats: "on", stats_was: "on" })).toMatchObject({ status: "saved", values: { prefs: { stats: false } } });
    expect(await stats()).toBe(false);
    // The member ticks it on themselves: it changes.
    expect(await save({ pref_stats: "on", stats_was: "" })).toMatchObject({ status: "saved", values: { prefs: { stats: true } } });
    expect(await stats()).toBe(true);
    // And unticks it.
    await save({ stats_was: "on" });
    expect(await stats()).toBe(false);
  });

  it("the hidden stats field (email switched off for everyone) keeps a stored stats:false", async () => {
    await current(`update users set email_prefs = '{"stats": false}' where id = $1`, [signedIn]);
    await saveProfileAction({ status: "idle" }, form({ name: "Ana", displayName: "", timezone: "America/Toronto", pref_stats: "", stats_was: "" }));
    expect((await current<{ email_prefs: Record<string, unknown> }>("select email_prefs from users where id = $1", [signedIn]))[0].email_prefs).toEqual({ stats: false, monday: false, friday_prompt: false });
  });

  it("applies the leaderboard's name rules to a member on the board, and answers a taken name with a message (B2 Unit 7)", async () => {
    const save = (displayName: string) => saveProfileAction({ status: "idle" }, form({ name: "Ana", displayName, timezone: "America/Toronto" }));
    await current("update users set display_name = 'Bo B.', leaderboard_name_key = 'bob', leaderboard_opt_in_at = now() where id = $1", [other]);
    await current("update users set display_name = 'Ana A.', leaderboard_name_key = 'anaa', leaderboard_opt_in_at = now() where id = $1", [signedIn]);
    expect(await save("bo b.")).toMatchObject({ status: "error", errors: { displayName: "That name is taken. Try another." } });
    expect(await save("B0 B")).toMatchObject({ status: "error", errors: { displayName: "That name is taken. Try another." } });
    expect(await save("Rоger")).toMatchObject({ status: "error", errors: { displayName: expect.stringContaining("Latin letters") } });
    expect(await save("Roger")).toMatchObject({ status: "error", errors: { displayName: "That name is reserved. Try another." } });
    expect(await save("")).toMatchObject({ status: "error", errors: { displayName: expect.stringContaining("Leave the board") } });
    expect(await current("select display_name from users where id = $1", [signedIn])).toEqual([{ display_name: "Ana A." }]);
    expect(await save("Ana Ｂ.")).toMatchObject({ status: "saved", values: { displayName: "Ana B." } });
    expect(await current("select display_name, leaderboard_name_key as key from users where id = $1", [signedIn])).toEqual([{ display_name: "Ana B.", key: "anab" }]);
    // Off the board, settings keep their own looser rules and a name another member uses is fine.
    await current("update users set leaderboard_opt_in_at = null where id = $1", [signedIn]);
    expect(await save("Bo B.")).toMatchObject({ status: "saved" });
  });

  it("refuses someone not signed in", async () => {
    signedIn = null;
    await expect(saveProfileAction({ status: "idle" }, form({ name: "X", timezone: "America/Toronto" }))).rejects.toThrow("Not signed in");
    await expect(changeEmailAction({ status: "idle" }, form({ email: "x@example.com" }))).rejects.toThrow("Not signed in");
    await expect(agreeGoal({ status: "idle" })).rejects.toThrow("Not signed in");
  });

  it("answers an address in use exactly as it answers a free one", async () => {
    const free = await outcome(() => changeEmailAction({ status: "idle" }, form({ email: "new@example.com" })));
    const taken = await outcome(() => changeEmailAction({ status: "idle" }, form({ email: "bo@example.com" })));
    const strip = (r: unknown) => JSON.stringify(r).replace(/new@example\.com|bo@example\.com/g, "X");
    expect(strip(taken)).toBe(strip(free));
    // Only the current address is ever emailed at this step, so the two can't differ.
    expect(mailed).toEqual(["email_change_approve:ana@example.com", "email_change_approve:ana@example.com"]);
    expect((await current<{ email: string }>("select email from users where id = $1", [signedIn]))[0].email).toBe("ana@example.com");
  });
});

describe("the daily goal", () => {
  it("ticks the signed-in user's checklist", async () => {
    expect(await agreeGoal({ status: "idle" })).toEqual({ status: "saved" });
    const rows = await current<{ email: string; goal: string | null }>("select email, onboarding->>'goal_at' as goal from users order by email");
    expect(rows[0].goal).not.toBeNull();
    expect(rows[1].goal).toBeNull();
  });
});

describe("setup file admin actions", () => {
  it("refuse a signed-in non-admin", async () => {
    await expect(saveSetupFile({ status: "idle" }, form({ body: "x", note: "n" }))).rejects.toThrow("Not signed in");
    await expect(publishSetupFile(form({ version: "1" }))).rejects.toThrow("Not signed in");
    await expect(restoreSetupFile(form({ version: "1" }))).rejects.toThrow("Not signed in");
    expect(await current("select 1 from setup_files")).toHaveLength(0);
  });

  it("save, publish (refreshing the public page's cache) and restore", async () => {
    admin = true;
    expect(await saveSetupFile({ status: "idle" }, form({ body: "one", note: "" }))).toMatchObject({ status: "error", body: "one" });
    expect(await saveSetupFile({ status: "idle" }, form({ body: "one", note: "first" }))).toMatchObject({ status: "ok" });
    await saveSetupFile({ status: "idle" }, form({ body: "two", note: "second" }));
    await publishSetupFile(form({ version: "2" }));
    expect(tagged).toEqual(["setup-file"]);
    await restoreSetupFile(form({ version: "1" }));
    const rows = await current<{ version: number; body_md: string; published: boolean; saved_by: string }>(
      "select f.version, f.body_md, (l.version is not null) as published, f.saved_by from setup_files f left join setup_file_live l on l.slug = f.slug and l.version = f.version order by f.version",
    );
    expect(rows).toEqual([
      { version: 1, body_md: "one", published: false, saved_by: "peter@example.com" },
      { version: 2, body_md: "two", published: true, saved_by: "peter@example.com" },
      { version: 3, body_md: "one", published: false, saved_by: "peter@example.com" },
    ]);
  });
});
