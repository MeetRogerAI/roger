import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

/** B3 Unit 4: /admin/pipeline, behind the admin check, with an accessible table and the stage filter. */

const db: { query: Query | null; admin: boolean } = { query: null, admin: true };
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/admin-auth", () => ({ isAdmin: async () => db.admin }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));

const { default: Page } = await import("./page");
type Props = Parameters<typeof Page>[0];
const props = (sp: Record<string, string>) => ({ params: Promise.resolve({}), searchParams: Promise.resolve(sp) }) as unknown as Props;

async function render(sp: Record<string, string> = {}): Promise<string> {
  const { prelude } = await prerender((await Page(props(sp)))!);
  return (await new Response(prelude).text()).replaceAll("<!-- -->", "");
}

beforeEach(async () => {
  ({ query: db.query } = await testDb());
  db.admin = true;
  const [{ id }] = await db.query!<{ id: string }>(`insert into users (email, display_name, status, signup_finished_at, created_at) values ('bo@example.com', 'Bo', 'active', '2026-10-01T15:00:00Z', '2026-10-01T15:00:00Z') returning id`);
  const [{ id: ana }] = await db.query!<{ id: string }>(
    `insert into users (email, status, signup_finished_at, created_at, first_teaser_at) values ('ana@example.com', 'trial', '2026-11-02T15:00:00Z', '2026-11-02T15:00:00Z', '2026-11-09T12:05:00Z') returning id`,
  );
  await db.query!(`insert into referrals (referrer_id, referred_user_id, source, stage, created_at) values ($1, $2, 'link', 'trial', '2026-11-02T15:00:00Z')`, [id, ana]);
  await db.query!(`insert into leads (email, kind, persona, created_at, first_seen_at) values ('w@example.com', 'not_open', 'v3', '2026-11-20T15:00:00Z', '2026-11-20T15:00:00Z')`);
});

describe("/admin/pipeline", () => {
  it("lists everyone with stage counts, dates and where they came from", async () => {
    const html = await render();
    expect(html).toContain("Everyone · 3");
    expect(html).toContain("Trial · 1");
    expect(html).toMatch(/<th scope="row"[^>]*><a [^>]*href="\/admin\/users\/[^"]+"[^>]*>ana@example.com<\/a><\/th>/);
    expect(html).toMatch(/Referral by <a [^>]*href="\/admin\/users\/[^"]+"[^>]*>Bo<\/a>/);
    expect(html).toContain("Waitlist");
    expect(html).toContain("Nov 2, 2026");
    expect(html).toContain('scope="col"');
    expect(html).toContain("<caption");
  });

  it("filters by stage, and ignores a stage it doesn't know", async () => {
    const trial = await render({ stage: "trial" });
    expect(trial).toContain("ana@example.com");
    expect(trial).not.toContain("w@example.com");
    const all = await render({ stage: "<script>" });
    expect(all).toContain("w@example.com");
  });

  it("shows nothing to someone who is not an admin", async () => {
    db.admin = false;
    expect(await Page(props({}))).toBeNull();
  });
});
