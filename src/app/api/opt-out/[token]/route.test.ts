import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

vi.mock("@/lib/db", () => ({ hasDb: () => true }));
let current: Query;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));

const { GET, POST } = await import("./route");
const { guestOptOutToken } = await import("@/lib/mail/unsubscribe");
const { isAddressSuppressed } = await import("@/lib/mail/suppression");

const oneClick = (token: string) =>
  POST(
    new NextRequest(`http://localhost:3000/api/opt-out/${token}`, {
      method: "POST",
      body: "List-Unsubscribe=One-Click",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }),
    { params: Promise.resolve({ token }) },
  );
const tamper = (t: string, i: number) => `${t.slice(0, i)}${t[i] === "A" ? "B" : "A"}${t.slice(i + 1)}`;

beforeEach(async () => {
  vi.stubEnv("UNSUB_SECRET", "route-secret");
  ({ query: current } = await testDb());
});

describe("/api/opt-out/{token} (a guest's one-click opt-out)", () => {
  it("a one-click POST suppresses the address for every member's invitations; again is still fine", async () => {
    const t = guestOptOutToken("ana@example.com")!;
    const res = await oneClick(t);
    expect(res.status).toBe(200);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await res.text()).toBe("You won’t get any more invitations from Roger.");
    expect(await isAddressSuppressed(current, "Ana+x@Example.com")).toBe(true);
    expect((await oneClick(t)).status).toBe(200);
    expect(await current("select email_key, source from email_suppressions")).toEqual([{ email_key: "ana@example.com", source: "guest_invite" }]);
  });

  it("a tampered token changes nothing", async () => {
    const res = await oneClick(tamper(guestOptOutToken("ana@example.com")!, 8));
    expect(res.status).toBe(400);
    expect(await current("select 1 from email_suppressions")).toHaveLength(0);
  });

  it("a GET changes nothing and goes to the page", async () => {
    const t = guestOptOutToken("ana@example.com")!;
    const res = await GET(new NextRequest(`http://localhost:3000/api/opt-out/${t}`), { params: Promise.resolve({ token: t }) });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`http://localhost:3000/o/${t}`);
    expect(await current("select 1 from email_suppressions")).toHaveLength(0);
  });
});
