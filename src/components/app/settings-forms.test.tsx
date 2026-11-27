import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/settings/actions", () => ({ saveProfileAction: async () => ({ status: "idle" }), changeEmailAction: async () => ({ status: "idle" }) }));

const { ProfileForm } = await import("./settings-forms");

const values = (friday: boolean) => ({ name: "Ana", displayName: "Ana", timezone: "America/Toronto", prefs: { monday: true, friday_prompt: friday } });
const render = (friday = true) => {
  const html = renderToStaticMarkup(<ProfileForm values={values(friday)} zones={["America/Toronto"]} />);
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
