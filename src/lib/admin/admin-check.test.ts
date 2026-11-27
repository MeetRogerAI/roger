import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { createHash, createHmac } from "node:crypto";
import { jar, nextHeaders, nextNavigation, resetNextFakes } from "@/test-helpers/next-fakes";

/*
 * The real admin check (spec check 29), with no stand-in for it: a member
 * signed in by email link is refused by every admin action and page, an
 * address in ADMIN_EMAILS gets through and is the name in the log, and the
 * shared-password cookie works only while ADMIN_PASSWORD is set. The
 * existing tabs keep working under the check (spec check 35).
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
const { requireAdmin, isAdmin, signIn } = await import("@/lib/admin-auth");
const v3 = await import("@/app/admin/v3-actions");
const old = await import("@/app/admin/actions");
const setup = await import("@/app/admin/setup-file/actions");
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
  vi.stubEnv("ADMIN_PASSWORD", "");
  [{ id: member }] = await current<{ id: string }>("insert into users (email, email_verified_at, status, free_lists_used) values ('ana@example.com', now(), 'trial', 2) returning id");
  [{ id: adminUser }] = await current<{ id: string }>("insert into users (email, email_verified_at) values ('peter@example.com', now()) returning id");
});

describe("a signed-in member who is not an admin", () => {
  it("is refused by the admin check, by v3 and existing admin actions called directly, and sees no admin page", async () => {
    await signInAs(member);
    expect(await isAdmin()).toBe(false);
    await expect(requireAdmin()).rejects.toThrow("Not signed in");
    await expect(v3.extraFreeListAction({ status: "idle" }, form({ userId: member }))).rejects.toThrow("Not signed in");
    await expect(v3.pilotLinkAction({ status: "idle" }, form({ email: "x@example.com", name: "X" }))).rejects.toThrow("Not signed in");
    await expect(old.toggleFeatured(form({ id: "x" }))).rejects.toThrow("Not signed in");
    await expect(setup.publishSetupFile(form({ version: "1" }))).rejects.toThrow("Not signed in");
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

describe("the shared password", () => {
  it("works only while ADMIN_PASSWORD is set, and stops at once when it is removed", async () => {
    resetNextFakes();
    expect(await signIn("hunter2")).toBe(false);
    vi.stubEnv("ADMIN_PASSWORD", "hunter2");
    expect(await signIn("hunter2")).toBe(true);
    expect(await requireAdmin()).toBe("admin (password)");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(await isAdmin()).toBe(false);
  });

  it("is bound to the password: changing ADMIN_PASSWORD ends every cookie made under the old one", async () => {
    resetNextFakes();
    vi.stubEnv("ADMIN_PASSWORD", "hunter2");
    expect(await signIn("hunter2")).toBe(true);
    expect(await isAdmin()).toBe(true);
    vi.stubEnv("ADMIN_PASSWORD", "correct horse");
    expect(await isAdmin()).toBe(false);
  });

  it("without ADMIN_SECRET, is signed with a key derived from CRON_SECRET, never CRON_SECRET itself", async () => {
    resetNextFakes();
    vi.stubEnv("ADMIN_SECRET", "");
    vi.stubEnv("CRON_SECRET", "cron-bearer");
    vi.stubEnv("ADMIN_PASSWORD", "hunter2");
    // A cookie forged by someone who knows only the cron bearer token.
    const expires = Date.now() + 86_400_000;
    const bound = createHash("sha256").update("hunter2").digest("base64url");
    for (const msg of [`admin:${expires}`, `admin:${expires}:${bound}`]) {
      resetNextFakes({ "roger-admin": `${expires}.${createHmac("sha256", "cron-bearer").update(msg).digest("base64url")}` });
      expect(await isAdmin()).toBe(false);
    }
    resetNextFakes();
    expect(await signIn("hunter2")).toBe(true);
    expect(await isAdmin()).toBe(true);
  });

  it("allows five tries per address in five minutes", async () => {
    resetNextFakes({}, { "x-vercel-forwarded-for": "203.0.113.9" });
    vi.stubEnv("ADMIN_PASSWORD", "hunter2");
    for (let i = 0; i < 5; i++) expect(await old.signInAction({ status: "idle" }, form({ password: "wrong" }))).toMatchObject({ message: "That password isn’t right." });
    expect(await old.signInAction({ status: "idle" }, form({ password: "hunter2" }))).toMatchObject({ status: "error", message: expect.stringMatching(/Too many/) });
    expect(jarHasAdminCookie()).toBe(false);
  });
});

const jarHasAdminCookie = () => jar.has("roger-admin");
