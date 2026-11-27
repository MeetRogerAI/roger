import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";

/** B2 plan Unit 3: /r/{code} remembers a valid code in the signed cookie, set on the redirect itself. */

const db: { query: Query | null } = { query: null };
vi.mock("@/lib/db", () => ({ hasDb: () => true }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => db.query!(t, p) }));

const { GET } = await import("./route");
const { ensureReferralCode } = await import("@/lib/referrals/code");
const { readRefCookie, REF_COOKIE, signRefCookie } = await import("@/lib/referrals/cookie");

const KEY = "route-test-key";
const DAY = 86_400_000;

/** Visits /r/{code}, with this browser's referral cookie if any. */
function visit(code: string, cookie?: string) {
  const headers: Record<string, string> = cookie ? { cookie: `${REF_COOKIE}=${cookie}` } : {};
  return GET(new NextRequest(`https://roger.test/r/${encodeURIComponent(code)}`, { headers }), { params: Promise.resolve({ code }) });
}
/** The referral cookie the response sets, parsed from its Set-Cookie header, or null. */
function setCookie(res: Response): { value: string; attrs: string } | null {
  const line = res.headers.getSetCookie().find((l) => l.startsWith(`${REF_COOKIE}=`));
  if (!line) return null;
  const [pair, ...attrs] = line.split(";");
  return { value: decodeURIComponent(pair.slice(REF_COOKIE.length + 1)), attrs: attrs.join(";").toLowerCase() };
}
const codeIn = (res: Response) => readRefCookie(setCookie(res)?.value, KEY, new Date())?.code ?? null;

let codeA: string;
let codeB: string;

beforeEach(async () => {
  vi.stubEnv("REF_SECRET", KEY);
  const { query } = await testDb();
  db.query = query;
  const [a, b] = await query<{ id: string }>(`insert into users (email) values ('ana@example.com'), ('bo@example.com') returning id`);
  codeA = (await ensureReferralCode(query, a.id))!;
  codeB = (await ensureReferralCode(query, b.id))!;
});
afterEach(() => vi.unstubAllEnvs());

describe("/r/{code}", () => {
  it("sets the signed cookie on the redirect home: httpOnly, SameSite=Lax, path /, 60 days", async () => {
    const res = await visit(codeA);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const c = setCookie(res)!;
    expect(c.attrs).toContain("httponly");
    expect(c.attrs).toContain("samesite=lax");
    expect(c.attrs).toContain("path=/");
    expect(c.attrs).toContain(`max-age=${60 * 86_400}`);
    expect(readRefCookie(c.value, KEY, new Date())).toMatchObject({ code: codeA, purpose: "link" });
  });

  it("redirects home for an unknown or malformed code and sets no cookie", async () => {
    for (const code of ["zzzzzzzzzz", "not a code at all"]) {
      const res = await visit(code);
      expect(res.status).toBe(303);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/");
      expect(setCookie(res)).toBeNull();
    }
  });

  it("keeps the first referrer: a second visit with another code sets nothing", async () => {
    const first = setCookie(await visit(codeA))!.value;
    expect(setCookie(await visit(codeB, first))).toBeNull();
  });

  it("replaces a cookie that is no longer valid: expired, tampered with, or for a code nobody has now", async () => {
    expect(codeIn(await visit(codeB, signRefCookie({ code: codeA, issuedAt: Date.now() - 61 * DAY, purpose: "link" }, KEY)))).toBe(codeB);
    expect(codeIn(await visit(codeB, `${signRefCookie({ code: codeA, issuedAt: Date.now(), purpose: "link" }, KEY)}x`))).toBe(codeB);
    expect(codeIn(await visit(codeB, signRefCookie({ code: "abcdefghij", issuedAt: Date.now(), purpose: "link" }, KEY)))).toBe(codeB);
  });

  it("stores nothing without a signing key, and still sends the visitor home", async () => {
    vi.stubEnv("REF_SECRET", "");
    vi.stubEnv("ADMIN_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");
    const res = await visit(codeA);
    expect(res.status).toBe(303);
    expect(setCookie(res)).toBeNull();
  });
});
