import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("@/lib/db", () => ({ hasDb: () => true }));
vi.mock("@/lib/db-query", () => ({ query: async () => [] }));
let result: () => Promise<string> = async () => "sent";
const calls: unknown[][] = [];
vi.mock("@/lib/auth/request-link", () => ({
  requestSignInLink: (...a: unknown[]) => {
    calls.push(a);
    return result();
  },
}));

const { requestLinkAction } = await import("./actions");
const idle = { status: "idle" as const };
const form = (email: string, next = "") => {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("next", next);
  return fd;
};

beforeEach(() => {
  resetNextFakes({}, { "x-vercel-forwarded-for": "1.2.3.4" });
  calls.length = 0;
});

describe("requestLinkAction", () => {
  it("shows the same 'check your email' whether the address has an account, has none, or asked too often", async () => {
    const shown = [];
    for (const r of ["sent", "no_account", "limited"]) {
      result = async () => r;
      shown.push(await requestLinkAction(idle, form("ana@example.com")));
    }
    expect(new Set(shown.map((s) => JSON.stringify(s))).size).toBe(1);
    expect(shown[0]).toEqual({ status: "sent", email: "ana@example.com" });
  });

  it("says plainly when nothing could be sent", async () => {
    result = async () => "send_failed";
    expect(await requestLinkAction(idle, form("ana@example.com"))).toMatchObject({ status: "error" });
    result = async () => Promise.reject(new Error("db down"));
    expect(await requestLinkAction(idle, form("ana@example.com"))).toMatchObject({ status: "error" });
  });

  it("refuses a bad address without asking for a link, and never follows an outside address", async () => {
    expect(await requestLinkAction(idle, form("nope"))).toMatchObject({ status: "error" });
    expect(calls).toHaveLength(0);
    result = async () => "sent";
    await requestLinkAction(idle, form("ana@example.com", "//evil.test"));
    expect(calls[0][3]).toBe("/app");
  });
});
