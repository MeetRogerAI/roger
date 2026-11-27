import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readRefCookie, refKey, signRefCookie } from "./cookie";

/** B2 plan Unit 3: the roger-ref cookie's signature and age checks. */

const KEY = "k1";
const NOW = new Date("2026-12-01T15:00:00Z");
const MIN = 60_000;
const DAY = 86_400_000;
const at = (ms: number) => signRefCookie({ code: "abcdefghij", issuedAt: NOW.getTime() + ms, purpose: "link" }, KEY);

afterEach(() => vi.unstubAllEnvs());

describe("readRefCookie", () => {
  it("reads its own cookie back", () => {
    expect(readRefCookie(at(0), KEY, NOW)).toEqual({ code: "abcdefghij", issuedAt: NOW.getTime(), purpose: "link" });
  });

  it("refuses another key, a changed payload or signature, and junk", () => {
    expect(readRefCookie(at(0), "k2", NOW)).toBeNull();
    expect(readRefCookie(at(0), null, NOW)).toBeNull();
    const [p, sig] = at(0).split(".");
    const other = Buffer.from(JSON.stringify({ c: "zzzzzzzzzz", t: NOW.getTime(), p: "link" })).toString("base64url");
    expect(readRefCookie(`${other}.${sig}`, KEY, NOW)).toBeNull();
    expect(readRefCookie(`${p}.${sig.slice(1)}`, KEY, NOW)).toBeNull();
    for (const junk of ["", ".", "abc", `.${sig}`, "x".repeat(500)]) expect(readRefCookie(junk, KEY, NOW)).toBeNull();
  });

  it("refuses a signed cookie whose contents are not a code, a time and a purpose", () => {
    // Signed exactly as the cookie is (HMAC over "roger-ref:v1:<payload>"), so only the contents are wrong.
    const bad = (v: unknown) => {
      const payload = Buffer.from(JSON.stringify(v)).toString("base64url");
      return `${payload}.${createHmac("sha256", KEY).update(`roger-ref:v1:${payload}`).digest("base64url")}`;
    };
    expect(readRefCookie(bad({ c: "abcdefghij", t: NOW.getTime(), p: "link" }), KEY, NOW)).not.toBeNull();
    expect(readRefCookie(bad({ c: "abcdefghij", t: "now", p: "link" }), KEY, NOW)).toBeNull();
    expect(readRefCookie(bad({ c: "abc", t: NOW.getTime(), p: "link" }), KEY, NOW)).toBeNull();
    expect(readRefCookie(bad({ c: "abcdefghij", t: NOW.getTime(), p: "admin" }), KEY, NOW)).toBeNull();
  });

  it("is valid up to 60 days old and not a moment after; one issued over 5 minutes in the future is refused", () => {
    expect(readRefCookie(at(-60 * DAY), KEY, NOW)).not.toBeNull();
    expect(readRefCookie(at(-60 * DAY - 1), KEY, NOW)).toBeNull();
    expect(readRefCookie(at(4 * MIN), KEY, NOW)).not.toBeNull();
    expect(readRefCookie(at(6 * MIN), KEY, NOW)).toBeNull();
  });
});

describe("refKey", () => {
  it("is REF_SECRET, else derived from ADMIN_SECRET or CRON_SECRET (never the secret itself), else none", () => {
    expect(refKey({ REF_SECRET: "r", ADMIN_SECRET: "a" })).toBe("r");
    const derived = refKey({ ADMIN_SECRET: "a" });
    expect(derived).toBeTruthy();
    expect(derived).not.toBe("a");
    expect(refKey({ CRON_SECRET: "c" })).not.toBe("c");
    expect(refKey({})).toBeNull();
  });
});
