import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";
import { mergeV3 } from "@/lib/v3-settings";

/** B2 plan Unit 3: the Referrals link shows only while referrals are on (the one switch rule). */

const s = { on: false };
vi.mock("@/lib/v3-settings-display", () => ({
  getV3SettingsForDisplay: async () => ({ ...mergeV3([]), signupOpen: true, cycleLive: true, referralsOn: s.on }),
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
});
