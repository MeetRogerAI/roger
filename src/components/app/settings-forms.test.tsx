import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/settings/actions", () => ({ saveProfileAction: async () => ({ status: "idle" }), changeEmailAction: async () => ({ status: "idle" }) }));

const { ProfileForm } = await import("./settings-forms");

const values = (friday: boolean, stats = true) => ({ name: "Ana", displayName: "Ana", timezone: "America/Toronto", prefs: { monday: true, friday_prompt: friday, stats } });
const render = (friday = true, o: { stats?: boolean; statsShown?: boolean } = {}) => {
  const html = renderToStaticMarkup(<ProfileForm values={values(friday, o.stats ?? true)} zones={["America/Toronto"]} statsShown={o.statsShown} />);
  return { html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
};
const ONE_AT_A_TIME = /one (list )?at a time|order (your )?next (list|Monday)|order a list/i;

describe("Settings emails (monthly only; whole-branch review W2: the Friday reminder is no longer sent)", () => {
  it("nobody sees a Friday reminder checkbox, and the stored choice is kept as it was", () => {
    const { html, text } = render(true);
    expect(text).not.toMatch(/Friday/);
    expect(html).toMatch(/<input type="hidden"[^>]*name="pref_friday_prompt"[^>]*value="on"/);
    expect(html).not.toMatch(/<input type="checkbox"[^>]*name="pref_friday_prompt"/);
    expect(text).not.toMatch(ONE_AT_A_TIME);
    expect(text).toContain("The Monday list email");
  });

  it("a choice already switched off stays off", () => {
    const { html } = render(false);
    expect(html).toMatch(/<input type="hidden"[^>]*name="pref_friday_prompt"[^>]*value=""/);
  });
});

describe("the Wednesday stats toggle (B2 Unit 8)", () => {
  it("is a checkbox while the stats email is switched on", () => {
    const { html, text } = render(true, { statsShown: true, stats: false });
    expect(text).toContain("Wednesday stats");
    const box = (h: string) => h.match(/<input type="checkbox"[^>]*name="pref_stats"[^>]*>/)?.[0];
    expect(box(html)).toBeDefined();
    expect(box(html)).not.toContain("checked");
    expect(box(render(true, { statsShown: true, stats: true }).html)).toContain("checked");
  });

  it("carries the choice as loaded, so a stale form never re-enables it", () => {
    expect(render(true, { statsShown: true, stats: false }).html).toMatch(/<input type="hidden"[^>]*name="stats_was"[^>]*value=""/);
    expect(render(true, { statsShown: false, stats: true }).html).toMatch(/<input type="hidden"[^>]*name="stats_was"[^>]*value="on"/);
  });

  it("is a hidden field keeping the stored choice while the email is off, so a save never changes it", () => {
    const off = render(true, { statsShown: false, stats: false });
    expect(off.text).not.toContain("Wednesday stats");
    expect(off.html).toMatch(/<input type="hidden"[^>]*name="pref_stats"[^>]*value=""/);
    expect(render(true, { statsShown: false, stats: true }).html).toMatch(/<input type="hidden"[^>]*name="pref_stats"[^>]*value="on"/);
  });
});
