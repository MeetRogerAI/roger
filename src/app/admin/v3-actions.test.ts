import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { nextHeaders, nextNavigation, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => {}, updateTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

let current: Query;
let admin: string | null = null;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => {
    if (!admin) throw new Error("Not signed in");
    return admin;
  },
  isAdmin: async () => Boolean(admin),
}));
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: async () => mergeV3([]) }));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), hit: async () => true }));
vi.mock("@/lib/mail/send", async (orig) => ({ ...(await orig<typeof import("@/lib/mail/send")>()), sendToUser: async () => "sent" }));

const actions = await import("./v3-actions");
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};

let uid: string;
let playId: string;
beforeEach(async () => {
  ({ query: current } = await testDb());
  resetNextFakes();
  admin = null;
  [{ id: uid }] = await current<{ id: string }>("insert into users (email, name, status, free_lists_used, trial_started_at) values ('ana@example.com', 'Ana', 'trial', 2, now()) returning id");
  [{ id: playId }] = await current<{ id: string }>(
    "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('One', 'Sales', 'd', 'p', 'i', '2026-12-07', '2026-12-07') returning id",
  );
});

describe("every v3 admin action refuses a signed-in non-admin", () => {
  const idle = { status: "idle" as const };
  const calls: [string, () => Promise<unknown>][] = [
    ["saveNote", () => actions.saveNoteAction(idle, form({ userId: "x", note: "n" }))],
    ["extraFreeList", () => actions.extraFreeListAction(idle, form({ userId: "x" }))],
    ["nudge", () => actions.nudgeAction(idle, form({ userId: "x", template: "no_run" }))],
    ["addRun", () => actions.addRunAction(idle, form({ userId: "x", report: "r" }))],
    ["excuseWeek", () => actions.excuseWeekAction(idle, form({ everyone: "yes", week: "2026-12-14" }))],
    ["undoExcuse", () => actions.undoExcuseAction(idle, form({ week: "2026-12-14" }))],
    ["pilotLink", () => actions.pilotLinkAction(idle, form({ email: "p@example.com", name: "P" }))],
    ["linkContributor", () => actions.linkContributorAction(idle, form({ contributorId: "x" }))],
    ["closeAccount", () => actions.closeAccountAction(idle, form({ userId: "x", confirm: "yes" }))],
    ["deleteAccount", () => actions.deleteAccountAction(idle, form({ userId: "x" }))],
    ["changeEmail", () => actions.changeEmailAction(idle, form({ userId: "x", email: "z@example.com" }))],
    ["flag", () => actions.flagAction(idle, form({ playId: "x", decision: "approve" }))],
    ["saveTestimonial", () => actions.saveTestimonialAction(idle, form({ person: "X", quote: "Q" }))],
    ["testimonialSwitch", () => actions.testimonialSwitchAction(form({ id: "x", cleared: "off" }))],
    ["chooseSample", () => actions.chooseSampleAction(idle, form({ playId: "x", readIt: "on" }))],
    ["runJob", () => actions.runJobAction(idle, form({ job: "dry" }))],
    ["chargeAndSend", () => actions.chargeAndSendAction(idle, form({}))],
    ["closeFailedOrders", () => actions.closeFailedOrdersAction()],
    ["seedImport", () => actions.seedImportAction(idle, form({ label: "Rob", agent: "hark", ranOn: "2026-11-12", text: "x" }))],
  ];

  it("covers every exported action", () => {
    expect(calls.map(([n]) => n)).toHaveLength(Object.keys(actions).length);
  });

  for (const [name, call] of calls) {
    it(name, async () => {
      // Signed in as a member, not an admin: requireAdmin throws before anything is read or written.
      await expect(call()).rejects.toThrow("Not signed in");
    });
  }

  it("leaves the data untouched after all of them", async () => {
    for (const [, call] of calls) await call().catch(() => {});
    expect(await current("select 1 from admin_actions")).toEqual([]);
    expect(await current<{ free_lists_used: number }>("select free_lists_used from users")).toEqual([{ free_lists_used: 2 }]);
    expect(await current("select 1 from users where email = 'p@example.com'")).toEqual([]);
  });
});

describe("for an admin", () => {
  it("acts and logs who did it", async () => {
    admin = "admin@example.com";
    expect(await actions.extraFreeListAction({ status: "idle" }, form({ userId: uid }))).toMatchObject({ status: "ok" });
    expect(await current("select admin_email, action from admin_actions")).toEqual([{ admin_email: "admin@example.com", action: "extra_free_list" }]);
  });

  it("refuses an extra free list for a no-card trial posted anyway (the button is hidden), changing nothing (review fixes Unit 9, F7)", async () => {
    admin = "admin@example.com";
    const [nc] = await current<{ id: string }>("insert into users (email, name, status, free_lists_used) values ('nc@example.com', 'Nc', 'trial', 1) returning id");
    expect(await actions.extraFreeListAction({ status: "idle" }, form({ userId: nc.id }))).toMatchObject({ status: "error", message: "Waiting for the member’s card." });
    expect(await current<{ free_lists_used: number }>("select free_lists_used from users where id = $1", [nc.id])).toEqual([{ free_lists_used: 1 }]);
    expect(await current("select 1 from admin_actions")).toEqual([]);
  });

  it("refuses a sample play without the tick, and a malformed id", async () => {
    admin = "admin@example.com";
    expect(await actions.chooseSampleAction({ status: "idle" }, form({ playId }))).toMatchObject({ status: "error", message: expect.stringMatching(/I have read this play/) });
    expect(await actions.chooseSampleAction({ status: "idle" }, form({ playId: "not-a-uuid", readIt: "on" }))).toMatchObject({ status: "error" });
    expect(await actions.chooseSampleAction({ status: "idle" }, form({ playId, readIt: "on" }))).toMatchObject({ status: "ok" });
  });

  it("excuses everyone for a week not recorded yet only with the confirmation tick", async () => {
    admin = "admin@example.com";
    const idle = { status: "idle" as const };
    expect(await actions.excuseWeekAction(idle, form({ everyone: "yes", week: "2026-12-14" }))).toMatchObject({ status: "error", message: expect.stringMatching(/in advance/) });
    expect(await current("select 1 from week_excuses")).toEqual([]);
    expect(await actions.excuseWeekAction(idle, form({ everyone: "yes", week: "2026-12-14", confirmAhead: "yes" }))).toMatchObject({ status: "ok" });
    expect(await current("select user_id from week_excuses")).toEqual([{ user_id: null }]);
    expect(await actions.undoExcuseAction(idle, form({ week: "2026-12-14" }))).toMatchObject({ status: "ok" });
    expect(await current("select 1 from week_excuses")).toEqual([]);
  });

  it("refuses an as-of time on production-like settings", async () => {
    admin = "admin@example.com";
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await actions.runJobAction({ status: "idle" }, form({ job: "charge", asOf: "2026-12-14T11:05:00Z" }))).toMatchObject({ status: "error" });
    vi.unstubAllEnvs();
  });
});
