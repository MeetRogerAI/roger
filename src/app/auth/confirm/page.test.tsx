/**
 * The confirm page's markup per link purpose (Peter, November 28, 2026): a sign-in link shows "Signing you in…"
 * with script running and its button only if the press has not landed after a few seconds; a change of email
 * address keeps its button as it was; with no script every button shows.
 */
import { describe, expect, it, vi } from "vitest";
import type { LinkPurpose } from "@/lib/auth/login-link";
import { pageMarkup } from "@/test-helpers/page-markup";

let purpose: LinkPurpose | null = "signin";
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/db", () => ({ hasDb: () => true }));
vi.mock("@/lib/db-query", () => ({ query: async () => ({ rows: [] }) }));
vi.mock("./actions", () => ({ confirmSignIn: async () => {} }));
vi.mock("@/lib/auth/login-link", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/login-link")>()), livePurpose: async () => purpose }));

const { default: ConfirmPage } = await import("./page");
const { CONFIRM_WAIT_CSS, CONFIRM_WAIT_SECONDS, WAIT } = await import("./wait");

const page = async (p: LinkPurpose) => {
  purpose = p;
  return pageMarkup(<ConfirmPage params={Promise.resolve({})} searchParams={Promise.resolve({ t: "token" })} />);
};
const classOf = (markup: string, text: string) => new RegExp(`<p class="([^"]*)"[^>]*>${text}</p>`).exec(markup)?.[1].split(" ");

describe("a sign-in or pilot link's confirm page", () => {
  for (const p of ["signin", "pilot"] as const) {
    it(`${p}: with script, shows only "Signing you in…"; the button and its sentence are behind it until the wait ends`, async () => {
      const markup = await page(p);
      expect(markup).toContain(`<style>${CONFIRM_WAIT_CSS}</style>`);
      // The wait line and the button share one stack; the button is in the part that starts invisible under js.
      const stack = markup.slice(markup.indexOf('<div class="confirm-stack"'));
      expect(stack.indexOf(WAIT.waiting)).toBeLessThan(stack.indexOf('<div class="confirm-late">'));
      const late = stack.slice(stack.indexOf('<div class="confirm-late">'));
      expect(late).toContain(WAIT.late);
      expect(late).toMatch(/<form [^>]*>[\s\S]*<button type="submit" class="btn btn-l">Sign in<\/button><\/form>/);
      expect(classOf(markup, WAIT.waiting)).toContain("confirm-wait");
      expect(classOf(markup, WAIT.late)).toContain("confirm-js");
      // The sentence that speaks of the button is for a browser with no script only.
      expect(classOf(markup, "Signing you in on this device. If nothing happens, press the button.")).toContain("confirm-nojs");
      // The token is only in the form, for its POST.
      expect(markup.match(/value="token"/g)).toHaveLength(1);
    });
  }

  it("hides under js, and only under js: the button until the wait ends, the no-script sentence always", () => {
    expect(CONFIRM_WAIT_CSS).toContain(".js .confirm-late{visibility:hidden;animation:confirm-show 0s linear 6s forwards}");
    expect(CONFIRM_WAIT_CSS).toContain(".js .confirm-nojs{display:none}");
    expect(CONFIRM_WAIT_CSS).toContain("@keyframes confirm-show{to{visibility:visible}}");
    // A press restarts the wait, with a new animation name so the browser starts it again.
    expect(CONFIRM_WAIT_CSS).toContain(".js [data-pressed] .confirm-late{animation-name:confirm-show-again}");
    expect(CONFIRM_WAIT_SECONDS).toBeGreaterThanOrEqual(3);
    // With no script nothing hides the button: every rule that hides it starts with .js.
    const rules = CONFIRM_WAIT_CSS.replace(/@keyframes[^{]*\{[^}]*\}\}/g, "").split("}").filter(Boolean);
    for (const rule of rules) if (/confirm-late|confirm-stack/.test(rule.split("{")[0])) expect(rule.startsWith(".js "), rule).toBe(true);
    // Only the wait line and the late sentence are hidden with no script.
    expect(rules.filter((r) => !r.startsWith(".js "))).toEqual([".confirm-wait,.confirm-js{display:none"]);
    expect(CONFIRM_WAIT_CSS).not.toContain("</");
  });
});

describe("the confirm page's referrer policy", () => {
  it("sends only the origin, never the address with its token, and an origin the server accepts for the form's POST", async () => {
    const { metadata } = await import("./page");
    expect(metadata.referrer).toBe("strict-origin");
  });
});

describe("a change of email address's confirm page", () => {
  it.each(["email_change", "email_approve"] as const)("%s: keeps its sentence and button exactly as before, at every moment", async (p) => {
    const markup = await page(p);
    expect(markup).not.toContain("<style>");
    expect(markup).not.toContain("confirm-");
    expect(markup).not.toContain(WAIT.waiting);
    expect(markup).toMatch(/<\/p><form [^>]*class="mt-8"[^>]*>[\s\S]*<button type="submit" class="btn btn-l">[^<]+<\/button><\/form>/);
  });
});
