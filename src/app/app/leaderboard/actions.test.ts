import { createElement } from "react";
import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { BOARD_LIMIT } from "@/lib/growth/leaderboard";
import { skeleton } from "@/lib/growth/leaderboard-name";
import { rebuildPoints } from "@/lib/growth/points";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";

/**
 * B2 plan Unit 7: the leaderboard's actions and page. Joining is opt-in and
 * only from this page; a taken name is a message, never a 500; leaving and an
 * admin clear take a member off; the page never names who adopted anything.
 */

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
let refreshed = 0;
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => void refreshed++ }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));

const db: { query: Query | null; userId: string | null; on: boolean; allow: boolean } = { query: null, userId: null, on: true, allow: true };
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  requireUserForAction: async () => {
    if (!db.userId) throw new Error("Not signed in");
    return { userId: db.userId };
  },
  requireUser: async () => {
    if (!db.userId) throw new Error("Not signed in");
    return { userId: db.userId };
  },
}));
const settings = () => ({ ...mergeV3([]), signupOpen: true, cycleLive: true, leaderboardOn: db.on });
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: async () => settings() }));
vi.mock("@/lib/v3-settings-display", () => ({ getV3SettingsForDisplay: async () => settings() }));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), hit: async () => db.allow }));

const { joinLeaderboardAction, leaveLeaderboardAction } = await import("./actions");
const { default: Page } = await import("./page");

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const join = (displayName: string) => joinLeaderboardAction({ status: "idle" }, form({ displayName }));
async function render(): Promise<string> {
  const { prelude } = await prerender(createElement(Page));
  return (await new Response(prelude).text()).replaceAll("<!-- -->", "");
}
async function user(email: string, o: { name?: string; displayName?: string; optedIn?: boolean; status?: string } = {}) {
  const [u] = await db.query!<{ id: string }>(
    "insert into users (email, name, status, display_name, leaderboard_name_key, leaderboard_opt_in_at, trial_started_at) values ($1, $2, $3, $4, $5, $6, now()) returning id",
    [email, o.name ?? "", o.status ?? "active", o.displayName ?? "", o.displayName ? skeleton(o.displayName) : null, o.optedIn ? new Date().toISOString() : null],
  );
  return u.id;
}
const onBoard = async () =>
  (await db.query!<{ display_name: string }>("select display_name from users where leaderboard_opt_in_at is not null order by display_name")).map((r) => r.display_name);

let ken: string;
beforeEach(async () => {
  ({ query: db.query } = await testDb());
  resetNextFakes();
  refreshed = 0;
  db.on = true;
  db.allow = true;
  ken = await user("ken@example.com", { name: "Kenneth Robertson", displayName: "Kenneth" });
  db.userId = ken;
});

describe("joinLeaderboardAction", () => {
  it("opts the member in under the chosen name, sets display_name and refreshes", async () => {
    expect(await join("  Ken R. ")).toMatchObject({ status: "saved", name: "Ken R." });
    expect(refreshed).toBe(1);
    expect(await onBoard()).toEqual(["Ken R."]);
  });

  it("answers a name taken by an opted-in member, in any case, with a message and keeps what was typed", async () => {
    await user("kim@example.com", { displayName: "Ken R.", optedIn: true });
    expect(await join("KEN r.")).toMatchObject({ status: "error", message: "That name is taken. Try another.", name: "KEN r." });
    expect(refreshed).toBe(0);
    expect(await onBoard()).toEqual(["Ken R."]);
  });

  it("rejects 1 and 31 characters, a reserved name and a bidi override, changing nothing", async () => {
    for (const n of ["K", "a".repeat(31), "Roger", `Ken\u202ER`]) {
      expect(await join(n), n).toMatchObject({ status: "error", name: n });
    }
    expect(await onBoard()).toEqual([]);
    const [u] = await db.query!<{ display_name: string }>("select display_name from users where id = $1", [ken]);
    expect(u.display_name).toBe("Kenneth");
  });

  it("is refused past the daily limit, changing nothing", async () => {
    db.allow = false;
    expect(await join("Ken R.")).toMatchObject({ status: "error", message: "Too many changes today. Try again tomorrow.", name: "Ken R." });
    expect(await onBoard()).toEqual([]);
  });

  it("is refused while the leaderboard is switched off", async () => {
    db.on = false;
    expect(await join("Ken R.")).toMatchObject({ status: "error", message: "The leaderboard isn’t open yet." });
    expect(await onBoard()).toEqual([]);
  });

  it("needs a signed-in member, and sends one still signing up to /start", async () => {
    db.userId = null;
    await expect(join("Ken R.")).rejects.toThrow("Not signed in");
    await expect(leaveLeaderboardAction()).rejects.toThrow("Not signed in");
    db.userId = await user("new@example.com", { status: "signup" });
    expect(await outcome(() => join("New One"))).toEqual({ redirect: "/start" });
    expect(await onBoard()).toEqual([]);
  });
});

describe("leaveLeaderboardAction", () => {
  it("sends a member still signing up to /start", async () => {
    db.userId = await user("new@example.com", { status: "signup" });
    expect(await outcome(() => leaveLeaderboardAction())).toEqual({ redirect: "/start" });
  });

  it("takes the member off the board, even with the switch off", async () => {
    await join("Ken R.");
    db.on = false;
    expect(await leaveLeaderboardAction()).toMatchObject({ status: "left" });
    expect(await onBoard()).toEqual([]);
  });
});

describe("/app/leaderboard", () => {
  /** Ken's play is adopted by Zelda, whose set-up is confirmed: 2 points for Ken. */
  async function adoptedByZelda() {
    const zelda = await user("zelda@example.com", { name: "Zelda Quixote", displayName: "ZeldaShown" });
    const [p] = await db.query!<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ('Listing follow-up', 'Sales', 'd', 'p', 'i', '2026-11-02', '2026-11-02') returning id",
    );
    await db.query!("insert into pool_play_contributors (pool_play_id, contributor, contributed_week) values ($1, $2, '2026-11-02')", [p.id, ken]);
    await db.query!(
      "insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run, delivered_at, setup_confirmed_at) values ($1, '2026-11-16', 1, $2, 80, 4, 'fits', false, '2026-11-16T12:00:00Z', '2026-11-20T12:00:00Z')",
      [zelda, p.id],
    );
    expect(await rebuildPoints(db.query!, { now: new Date("2026-11-27T12:00:00Z"), realNow: new Date("2026-11-27T12:00:00Z") })).not.toHaveProperty("busy");
    return zelda;
  }

  it("shows a member who is not on the board their own points and rank privately, with the join form", async () => {
    await adoptedByZelda();
    const html = await render();
    expect(html).toContain('data-points="2"');
    expect(html).toContain('data-rank="1"');
    expect(html).toContain('data-opted-in="false"');
    expect(html).toContain("No, only you can see this");
    expect(html).toContain("1 user adopted your idea · 1 set-up confirmed");
    expect(html).toContain("Join the board");
    expect(html).toContain("No one has joined the board yet.");
    // The settings display name is offered, not published.
    expect(html).toContain('value="Kenneth"');
  });

  it("after opting in, shows the member on the board at their rank, with Leave", async () => {
    await adoptedByZelda();
    await join("Ken R.");
    const html = await render();
    expect(html).toMatch(/1st<\/td><td[^>]*><span class="font-\[600\]"><bdi>Ken R\.<\/bdi> \(you\)/);
    expect(html).toContain('data-opted-in="true"');
    expect(html).toContain("Leave the board");
  });

  it("never names the members who adopted an idea, for the contributor or for the adopter", async () => {
    const zelda = await adoptedByZelda();
    await join("Ken R.");
    // The contributor sees a count, not who adopted.
    let html = await render();
    expect(html).toContain("1 user adopted your idea · 1 set-up confirmed");
    for (const s of ["Zelda", "Quixote", "@example.com", "Kenneth Robertson", "Listing follow-up"]) expect(html, s).not.toContain(s);
    // The adopter sees the contributor's board name and counts only (their own settings name is in their own form).
    db.userId = zelda;
    html = await render();
    expect(html).toContain("Ken R.");
    expect(html).toContain("1 user adopted their idea · 1 set-up confirmed");
    for (const s of ["Quixote", "@example.com", "Kenneth", "Listing follow-up"]) expect(html, s).not.toContain(s);
  });

  it("leaves out a member whose display name is set in settings only, and a closed member", async () => {
    await user("set@example.com", { displayName: "OnlyInSettings" });
    await user("gone@example.com", { displayName: "GoneAway", optedIn: true, status: "closed" });
    const html = await render();
    expect(html).not.toContain("OnlyInSettings");
    expect(html).not.toContain("GoneAway");
  });

  it("says coming soon while the switch is off, and shows no standing or board", async () => {
    await user("kim@example.com", { displayName: "Kim", optedIn: true });
    db.on = false;
    const html = await render();
    expect(html).toContain("The leaderboard is coming soon.");
    expect(html).not.toContain("Kim");
    expect(html).not.toContain("data-points");
    expect(html).not.toContain("Leave the board");
  });

  it("while switched off, a member on the board is told it is paused and can still leave", async () => {
    await join("Ken R.");
    db.on = false;
    const html = await render();
    expect(html).toContain("The leaderboard is paused.");
    expect(html).toContain('data-opted-in="true"');
    expect(html).toContain("Leave the board");
    expect(html).not.toContain("Join the board");
    expect(html).not.toContain("The board</h2>");
  });

  it("members tied on points show the same ordinal; members with no points show no rank number", async () => {
    await adoptedByZelda();
    await join("Ken R.");
    const kim = await user("kim@example.com", { displayName: "Kim", optedIn: true });
    await db.query!("insert into points (user_id, week_of, adopted, confirmed, total, computed_at) values ($1, '2026-11-16', 2, 0, 2, now())", [kim]);
    await user("zed@example.com", { displayName: "Zed Zero", optedIn: true });
    const html = await render();
    expect(html.match(/tabular-nums">1st</g)).toHaveLength(2);
    expect(html).toMatch(/<span aria-hidden="true">–<\/span><span class="sr-only">No points yet<\/span><\/td><td[^>]*><span class="font-\[600\]"><bdi>Zed Zero/);
    db.userId = await user("new@example.com");
    expect(await render()).toContain("Not ranked yet: no points so far");
  });

  it(`tells a member on the board but outside the top ${BOARD_LIMIT} where they stand`, async () => {
    await db.query!(
      `with u as (insert into users (email, status, display_name, leaderboard_name_key, leaderboard_opt_in_at)
         select 'm' || lpad(g::text, 3, '0') || '@example.com', 'active', 'Member ' || g, 'member' || g, now() from generate_series(1, ${BOARD_LIMIT}) g returning id)
       insert into points (user_id, week_of, adopted, confirmed, total, computed_at) select id, '2026-11-16', 5, 0, 5, now() from u`,
    );
    await join("Ken R.");
    const html = await render();
    expect(html).not.toContain("Ken R.</bdi>");
    expect(html).toContain(`data-rank="${BOARD_LIMIT + 1}"`);
    expect(html).toContain(`You’re not in the top ${BOARD_LIMIT}.`);
  });
});
