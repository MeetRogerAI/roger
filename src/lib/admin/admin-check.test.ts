import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { createHash, createHmac } from "node:crypto";
import { nextHeaders, nextNavigation, resetNextFakes } from "@/test-helpers/next-fakes";

/*
 * The real admin check (spec check 29), with no stand-in for it: a member
 * signed in by email link is refused by every admin action and page, an
 * address in ADMIN_EMAILS gets through and is the name in the log, and a
 * cookie left over from the removed shared-password login (launch list
 * g-password) is worth nothing. The existing tabs keep working under the
 * check (spec check 35).
 */

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(f: T) => f }));
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => {}, updateTag: () => {}, revalidatePath: () => {}, cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {}, connection: async () => {} }));
vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key", secretStatus: async () => ({}) }));

let current: Query;
const ROW = { total: 0, week: 0, found: 0, packs: 0, interest: 0, active: 0 };
vi.mock("@/lib/db", () => ({ hasDb: () => true, sql: async () => [ROW] }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/v3-settings", async (orig) => {
  const m = await orig<typeof import("@/lib/v3-settings")>();
  return { ...m, readV3Settings: async () => m.mergeV3([]) };
});

const { createSession, SESSION_COOKIE } = await import("@/lib/auth/session");
const { requireAdmin, isAdmin, adminIdentity } = await import("@/lib/admin-auth");
const v3 = await import("@/app/admin/v3-actions");
const old = await import("@/app/admin/actions");
const setup = await import("@/app/admin/setup-file/actions");
const leadsExport = await import("@/app/admin/export/leads/route");
const pages = {
  overview: (await import("@/app/admin/page")).default,
  leads: (await import("@/app/admin/leads/page")).default,
  watches: (await import("@/app/admin/watches/page")).default,
  settings: (await import("@/app/admin/settings/page")).default,
  connections: (await import("@/app/admin/connections/page")).default,
  flags: (await import("@/app/admin/flags/page")).default,
  testimonials: (await import("@/app/admin/testimonials/page")).default,
  interest: (await import("@/app/admin/interest/page")).default,
  pagesList: (await import("@/app/admin/pages/page")).default,
  pagesReview: (await import("@/app/admin/pages/review/page")).default,
};
const pagesActions = await import("@/app/admin/pages/actions");
const withParams = {
  useCases: (await import("@/app/admin/use-cases/page")).default,
  ops: (await import("@/app/admin/ops/page")).default,
  users: (await import("@/app/admin/users/page")).default,
  runs: (await import("@/app/admin/runs/page")).default,
  cora: (await import("@/app/admin/cora/page")).default,
  pagesEditor: (await import("@/app/admin/pages/[page]/page")).default,
};

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
let member: string;
let adminUser: string;
const signInAs = async (id: string) => resetNextFakes({ [SESSION_COOKIE]: (await createSession(current, id, "email")).token });

beforeEach(async () => {
  ({ query: current } = await testDb());
  vi.stubEnv("ADMIN_EMAILS", "peter@example.com");
  vi.stubEnv("ADMIN_SECRET", "s".repeat(32));
  [{ id: member }] = await current<{ id: string }>("insert into users (email, email_verified_at, status, free_lists_used, trial_started_at) values ('ana@example.com', now(), 'trial', 2, now()) returning id");
  [{ id: adminUser }] = await current<{ id: string }>("insert into users (email, email_verified_at) values ('peter@example.com', now()) returning id");
});

/** Every admin action in actions.ts and setup-file/actions.ts (the v3 ones are listed in v3-actions.test.ts). */
const idle = { status: "idle" } as const;
const oldCalls: [string, () => Promise<unknown>][] = [
  ["runIngestAction", () => old.runIngestAction(idle)],
  ["toggleFeatured", () => old.toggleFeatured(form({ id: "x" }))],
  ["deleteUseCase", () => old.deleteUseCase(form({ id: "x" }))],
  ["updateUseCase", () => old.updateUseCase(idle, form({ id: "x", title: "T", summary: "S" }))],
  ["addUseCase", () => old.addUseCase(idle, form({ title: "T", summary: "S", url: "https://x.com/a/1", handle: "a" }))],
  ["saveSettingsAction", () => old.saveSettingsAction(idle, form({ founderFullName: "X" }))],
  ["saveSecretAction", () => old.saveSecretAction(idle, form({ name: "RESEND_API_KEY", value: "re_12345678" }))],
  ["removeSecretAction", () => old.removeSecretAction(form({ name: "RESEND_API_KEY" }))],
  ["rotatePushToken", () => old.rotatePushToken()],
  ["saveSetupFile", () => setup.saveSetupFile(idle, form({ body: "x", note: "n" }))],
  ["publishSetupFile", () => setup.publishSetupFile(form({ version: "1" }))],
  ["restoreSetupFile", () => setup.restoreSetupFile(form({ version: "1" }))],
];

describe("a signed-in member who is not an admin", () => {
  it("is refused by the admin check, by v3 and existing admin actions called directly, and sees no admin page", async () => {
    await signInAs(member);
    expect(await isAdmin()).toBe(false);
    await expect(requireAdmin()).rejects.toThrow("Not signed in");
    await expect(v3.extraFreeListAction({ status: "idle" }, form({ userId: member }))).rejects.toThrow("Not signed in");
    await expect(v3.pilotLinkAction({ status: "idle" }, form({ email: "x@example.com", name: "X" }))).rejects.toThrow("Not signed in");
    for (const [name, call] of oldCalls) await expect(call(), name).rejects.toThrow("Not signed in");
    expect((await leadsExport.GET()).status).toBe(401);
    await expect(pagesActions.savePageAction(form({ page: "home", "text:home.hero.headline": "A new headline" }))).rejects.toThrow("Not signed in");
    await expect(pagesActions.publishAction(form({ review: "x" }))).rejects.toThrow("Not signed in");
    await expect(pagesActions.undoPublishAction()).rejects.toThrow("Not signed in");
    expect(await current("select 1 from settings where key = 'site.content'")).toEqual([]);
    for (const page of Object.values(pages)) expect(await page()).toBeNull();
    const props = { searchParams: Promise.resolve({}), params: Promise.resolve({ id: member, page: "faq" }) } as never;
    for (const page of Object.values(withParams)) expect(await page(props)).toBeNull();
    expect(await (await import("@/app/admin/users/[id]/page")).default(props)).toBeNull();
    expect((await current<{ free_lists_used: number }>("select free_lists_used from users where id = $1", [member]))[0].free_lists_used).toBe(2);
    expect(await current("select 1 from admin_actions")).toEqual([]);
  });

  it("the list above covers every admin action in actions.ts and setup-file/actions.ts", () => {
    // signOutAction is the one action anyone may call: it only ends their own session.
    const exported = [...Object.keys(old).filter((k) => k !== "signOutAction"), ...Object.keys(setup)].sort();
    expect(oldCalls.map(([n]) => n).sort()).toEqual(exported);
  });
});

describe("an admin", () => {
  it("signed in by email link gets through, and the log names them", async () => {
    await signInAs(adminUser);
    expect(await requireAdmin()).toBe("peter@example.com");
    expect(await v3.extraFreeListAction({ status: "idle" }, form({ userId: member }))).toMatchObject({ status: "ok" });
    expect(await current("select admin_email, user_id, action from admin_actions")).toEqual([{ admin_email: "peter@example.com", user_id: member, action: "extra_free_list" }]);
  });

  it("sees every new page, read from the database", async () => {
    await signInAs(adminUser);
    await current("insert into runs (user_id, week_of, route, agent, sharing, raw_text, status) values ($1, '2026-12-14', 'connector', 'hark', 'share', 'x', 'flagged')", [member]);
    const props = { searchParams: Promise.resolve({ q: "ana", user: member }), params: Promise.resolve({ id: member, page: "faq" }) } as never;
    for (const page of [pages.flags, pages.testimonials, pages.interest, pages.settings, pages.pagesList, pages.pagesReview]) expect(await page()).not.toBeNull();
    for (const page of Object.values(withParams)) expect(await page(props)).not.toBeNull();
    expect(await (await import("@/app/admin/users/[id]/page")).default(props)).not.toBeNull();
  });

  it("sees the existing tabs as before (spec check 35)", async () => {
    await signInAs(adminUser);
    for (const page of [pages.overview, pages.leads, pages.watches]) expect(await page()).not.toBeNull();
    await old.toggleFeatured(form({ id: "x" }));
    expect(await current("select action from admin_actions")).toEqual([{ action: "use_case_featured" }]);
  });
});

describe("the removed shared-password login", () => {
  it("a cookie left over from it, even one correctly signed, is not admin", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "hunter2");
    vi.stubEnv("CRON_SECRET", "cron-bearer");
    // A cookie made exactly as the old login made it, with ADMIN_SECRET and with the CRON_SECRET-derived key.
    const expires = Date.now() + 86_400_000;
    const bound = createHash("sha256").update("hunter2").digest("base64url");
    const derived = createHmac("sha256", "cron-bearer").update("admin-cookie-v1").digest("base64url");
    for (const key of ["s".repeat(32), derived, "cron-bearer"]) {
      for (const msg of [`admin:${expires}`, `admin:${expires}:${bound}`]) {
        resetNextFakes({ "roger-admin": `${expires}.${createHmac("sha256", key).update(msg).digest("base64url")}` });
        expect(await isAdmin()).toBe(false);
        expect(await adminIdentity()).toBeNull();
        await expect(requireAdmin()).rejects.toThrow("Not signed in");
        await expect(old.toggleFeatured(form({ id: "x" }))).rejects.toThrow("Not signed in");
      }
    }
    expect(await current("select 1 from admin_actions")).toEqual([]);
  });

  it("is gone: no sign-in action or password check is exported", async () => {
    expect(Object.keys(old)).not.toContain("signInAction");
    expect(Object.keys(await import("@/lib/admin-auth")).sort()).toEqual(["adminIdentity", "isAdmin", "requireAdmin"]);
  });
});
