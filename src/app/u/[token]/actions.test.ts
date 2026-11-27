import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { nextNavigation, outcome } from "@/test-helpers/next-fakes";

vi.mock("next/navigation", () => nextNavigation);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/db", () => ({ hasDb: () => true }));
let current: Query;
let failOn: RegExp | null = null;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => (failOn && failOn.test(t) ? Promise.reject(new Error("blip")) : current(t, p)) }));

const { unsubscribeAction } = await import("./actions");
const { UnsubscribeView } = await import("./unsubscribe-view");
const { unsubscribed, unsubToken } = await import("@/lib/mail/unsubscribe");

let id: string;
const press = (token: string) => {
  const fd = new FormData();
  fd.set("token", token);
  return outcome(() => unsubscribeAction(fd));
};
const tamper = (t: string) => `${t.slice(0, 20)}${t[20] === "A" ? "B" : "A"}${t.slice(21)}`;
const page = async (token: string, error = false) => {
  const html = renderToStaticMarkup(await UnsubscribeView({ token, error }));
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
};

beforeEach(async () => {
  vi.stubEnv("UNSUB_SECRET", "page-secret");
  failOn = null;
  ({ query: current } = await testDb());
  [{ id }] = await current<{ id: string }>(`insert into users (email, status) values ('a@example.com', 'active') returning id`);
});

describe("the /u/{token} button", () => {
  it("switches the stats email off and shows the page again, now done", async () => {
    const t = unsubToken(id)!;
    expect(await unsubscribed(current, t)).toBe(false);
    expect(await press(t)).toEqual({ redirect: `/u/${t}` });
    expect(await unsubscribed(current, t)).toBe(true);
  });

  it("a tampered token changes nothing, and the page shows its generic error", async () => {
    const bad = tamper(unsubToken(id)!);
    expect(await press(bad)).toEqual({ redirect: `/u/${bad}` });
    expect(await unsubscribed(current, bad)).toBeNull();
    expect((await current<{ email_prefs: object }>("select email_prefs from users"))[0].email_prefs).toEqual({});
  });

  it("goes back to the page with ?error=1 when the write fails", async () => {
    const t = unsubToken(id)!;
    failOn = /update users set email_prefs/;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await press(t)).toEqual({ redirect: `/u/${t}?error=1` });
    } finally {
      err.mockRestore();
    }
  });
});

describe("the /u/{token} page", () => {
  it("asks first, with one button and nothing changed by opening it", async () => {
    const t = unsubToken(id)!;
    const text = await page(t);
    expect(text).toContain("Stop the Wednesday stats email?");
    expect(text).toContain("Stop the Wednesday email");
    expect(text).not.toContain("That didn’t work");
    expect(await unsubscribed(current, t)).toBe(false);
    expect(await page(t, true)).toContain("That didn’t work. Try again.");
  });

  it("says it is done once the email is off", async () => {
    const t = unsubToken(id)!;
    await press(t);
    const text = await page(t);
    expect(text).toContain("You won’t get the Wednesday stats email any more.");
    expect(text).not.toContain("Stop the Wednesday email");
  });

  it("shows the same generic message for a tampered token, a member who no longer exists, or a failed read", async () => {
    const invalid = "That link isn’t valid.";
    expect(await page(tamper(unsubToken(id)!))).toContain(invalid);
    expect(await page(unsubToken("0b7c2a9e-1111-4222-8333-944455556666")!)).toContain(invalid);
    expect(await page("nonsense")).toContain(invalid);
    failOn = /email_prefs ->>/;
    expect(await page(unsubToken(id)!)).toContain(invalid);
  });
});
