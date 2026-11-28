import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

let current: Query;
let broken = false;
let session: { userId: string } | null = null;
let published: { version: number; bodyMd: string; updatedAt: string } | null = null;
let readFailures = 0;
let connections = 0;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => (broken ? Promise.reject(new Error("db down")) : current(t, p)) }));
vi.mock("@/lib/auth/access", () => ({ getSession: async () => session }));
vi.mock("@/lib/setup-file", () => ({
  getPublishedSetupFile: async () => {
    if (readFailures > 0) {
      readFailures--;
      throw new Error("db blip");
    }
    return published;
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => void connections++ }));

const { OnboardingChecklist } = await import("./onboarding-checklist");
const { NextStep, PublishedSetupStep } = await import("./getstarted-parts");
const html = async (el: Promise<React.ReactElement | null>) => {
  const e = await el;
  return e ? renderToStaticMarkup(e) : "";
};

let id: string;
beforeEach(async () => {
  ({ query: current } = await testDb());
  broken = false;
  published = null;
  readFailures = 0;
  connections = 0;
  [{ id }] = await current<{ id: string }>("insert into users (email, path, status) values ('ana@example.com', 'new', 'trial') returning id");
  session = { userId: id };
});

describe("the checklist on /app", () => {
  it("shows while steps remain, and renders nothing once complete", async () => {
    expect(await html(OnboardingChecklist({ userId: id }))).toContain("Getting started");
    const [{ id: play }] = await current<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('P', 'Sales', 'd', 'p', 'i', '2026-11-30', '2026-11-30') returning id",
    );
    await current(`insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, delivered_at) values ($1, '2026-11-30', 1, $2, 80, 3, 'r', now())`, [id, play]);
    expect(await html(OnboardingChecklist({ userId: id }))).toBe("");
  });

  // S18 point d (Peter, 2026-11-27): with Zack off a list comes every Monday without a report.
  it("under Wait for Monday: no report is waited for with Zack off; with Zack on, the first report is", async () => {
    expect(await html(OnboardingChecklist({ userId: id }))).toContain("Your first list arrives on a Monday morning, once Zack has sent a report.");
    await current("update users set sharing = 'match_only' where id = $1", [id]);
    expect(await html(OnboardingChecklist({ userId: id }))).toContain("once Zack has sent a report.");
    await current("update users set sharing = 'off' where id = $1", [id]);
    const off = await html(OnboardingChecklist({ userId: id }));
    expect(off).toContain("Your first list arrives on Monday morning.");
    expect(off).not.toContain("Zack has sent a report");
  });

  it("renders nothing, rather than failing /app, when the database is unreachable", async () => {
    broken = true;
    expect(await html(OnboardingChecklist({ userId: id }))).toBe("");
  });
});

describe("/getstarted", () => {
  it("a signed-in view records getstarted_at and the published setup version, and offers Connect Zack", async () => {
    published = { version: 2, bodyMd: "# Team", updatedAt: "2026-11-23T15:00:00Z" };
    expect(await html(NextStep())).toContain("Connect Zack");
    const [u] = await current<{ at: string | null; v: string | null }>(`select onboarding->>'getstarted_at' as at, onboarding->>'setup_version' as v from users where id = $1`, [id]);
    expect(u.at).not.toBeNull();
    expect(u.v).toBe("2");
  });

  it("a signed-out visitor gets the start button and nothing is recorded", async () => {
    session = null;
    expect(await html(NextStep())).toContain("Start free");
    const [u] = await current<{ o: object }>(`select onboarding as o from users where id = $1`, [id]);
    expect(u.o).toEqual({});
  });

  it("a failed setup-file read is retried at request time, not shown as 'nothing published'", async () => {
    published = { version: 5, bodyMd: "# Team", updatedAt: "2026-11-23T15:00:00Z" };
    readFailures = 1;
    expect(await html(PublishedSetupStep())).toContain("Version 5");
    expect(connections).toBe(1);
    readFailures = 2;
    expect(await html(PublishedSetupStep())).toBe("");
  });
});
