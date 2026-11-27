import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";

/** B2 plan Unit 3: the Referrals link shows only while referrals are on (the one switch rule). */

const s = { on: false, board: false, link: "" };
vi.mock("@/lib/v3-settings-display", () => ({
  getV3SettingsForDisplay: async () => ({ ...mergeV3([]), signupOpen: true, cycleLive: true, referralsOn: s.on, leaderboardOn: s.board, sessionDay: "Tuesday", sessionTime: "12:00", sessionLink: s.link }),
}));

const { AppNav } = await import("./app-nav");
const render = async () => new Response((await prerender(<AppNav />)).prelude).text();

describe("AppNav", () => {
  it("hides Referrals while the switch is off", async () => {
    s.on = false;
    const html = await render();
    expect(html).not.toContain("/app/referrals");
    expect(html).toContain("Sign out");
  });

  it("shows Referrals while it is on, and still wraps so Sign out stays on screen", async () => {
    s.on = true;
    const html = await render();
    expect(html).toContain('href="/app/referrals"');
    expect(html).toContain("flex-wrap");
    expect(html).toContain("Sign out");
  });

  it("shows Leaderboard only while the leaderboard switch is on", async () => {
    s.on = false;
    s.board = false;
    expect(await render()).not.toContain("/app/leaderboard");
    s.board = true;
    expect(await render()).toContain('href="/app/leaderboard"');
  });

  it("shows Sessions only while the session's day, time and link are all set (B2 Unit 9)", async () => {
    s.link = "";
    expect(await render()).not.toContain("/app/sessions");
    s.link = "https://meet.google.com/abc-defg-hij";
    expect(await render()).toContain('href="/app/sessions"');
    s.link = "";
  });
});
