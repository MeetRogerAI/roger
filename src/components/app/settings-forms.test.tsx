import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/settings/actions", () => ({ saveProfileAction: async () => ({ status: "idle" }), changeEmailAction: async () => ({ status: "idle" }) }));

const { ProfileForm } = await import("./settings-forms");

const values = { name: "Ana", displayName: "Ana", timezone: "America/Toronto", prefs: { monday: true, friday_prompt: true } };
const render = (perRun: boolean) => {
  const html = renderToStaticMarkup(<ProfileForm values={values} zones={["America/Toronto"]} perRun={perRun} />);
  return { html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
};
const ONE_AT_A_TIME = /one (list )?at a time|order (your )?next (list|Monday)|order a list/i;

describe("Settings emails (review fixes Unit 9, F3: monthly only)", () => {
  it("a monthly member sees no Friday reminder, and the stored choice is kept", () => {
    const { html, text } = render(false);
    expect(text).not.toMatch(/Friday/);
    expect(html).toMatch(/<input type="hidden"[^>]*name="pref_friday_prompt"[^>]*value="on"/);
    expect(html).not.toMatch(/<input type="checkbox"[^>]*name="pref_friday_prompt"/);
    expect(text).not.toMatch(ONE_AT_A_TIME);
  });

  it("a leftover per-run account can switch the Friday reminder off, with no ordering words", () => {
    const { html, text } = render(true);
    expect(text).toContain("The Friday reminder email");
    expect(html).toMatch(/<input type="checkbox"[^>]*name="pref_friday_prompt"/);
    expect(text).not.toMatch(ONE_AT_A_TIME);
  });
});
