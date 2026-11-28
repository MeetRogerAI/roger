import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { nextHeaders, nextNavigation, Redirected, resetNextFakes } from "@/test-helpers/next-fakes";
import { testDb } from "@/test-helpers/pglite-db";

/**
 * /app/settings, rendered for real (async server component through
 * `prerender`). Admins have every member action (Peter, 2026-11-27), so an
 * admin address is offered Google sign-in like any member.
 */

const db: { query: Query | null; userId: string | null } = { query: null, userId: null };
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("@/lib/auth/access", async () => {
  const { Redirected } = await import("@/test-helpers/next-fakes");
  return {
    requireUser: async (next: string) => {
      if (!db.userId) throw new Redirected(`/signin?next=${encodeURIComponent(next)}`);
      return { userId: db.userId };
    },
    requireUserForAction: async () => ({ userId: db.userId }),
    getSession: async () => (db.userId ? { userId: db.userId } : null),
  };
});
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));

const { default: Page } = await import("./page");

async function render(): Promise<string> {
  const errors: unknown[] = [];
  const { prelude } = await prerender(<Page params={Promise.resolve({})} searchParams={Promise.resolve({})} />, { onError: (e) => void errors.push(e) });
  const html = await new Response(prelude).text();
  const err = errors.find((e) => !(e instanceof Redirected)) ?? errors[0];
  if (err) throw err;
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

async function member(email: string) {
  const [u] = await db.query!<{ id: string }>("insert into users (email, name, status, signup_step) values ($1, 'Peter', 'active', 'done') returning id", [email]);
  db.userId = u.id;
}

beforeEach(async () => {
  ({ query: db.query } = await testDb());
  db.userId = null;
  resetNextFakes();
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-123.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "shh");
  vi.stubEnv("ADMIN_EMAILS", "peter@example.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("Google sign-in on /app/settings", () => {
  it("is offered to an admin address, as to any member", async () => {
    await member("peter@example.com");
    expect(await render()).toContain("Link Google");
  });

  it("is offered to a member", async () => {
    await member("ana@example.com");
    expect(await render()).toContain("Link Google");
  });

  it("is not offered while Google is switched off, unless the account is already linked", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    await member("peter@example.com");
    expect(await render()).not.toContain("Google sign-in");
    await db.query!("update users set google_sub = 'g-1', google_email = 'peter@example.com'");
    expect(await render()).toContain("Unlink Google");
  });
});
