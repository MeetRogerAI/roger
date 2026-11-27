import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { guestOptOutToken, optOutHeaders, optOutOneClickUrl, unsubConfigured, unsubHeaders, unsubToken, verifyGuestOptOut, verifyUnsubToken } from "./unsubscribe";

const ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const env = { UNSUB_SECRET: "secret-one" };

describe("unsubscribe tokens", () => {
  it("round-trips the member's id, with a leading key-version byte", () => {
    const t = unsubToken(ID, "stats", env)!;
    expect(t).toMatch(/^[A-Za-z0-9_-]{44}$/);
    expect(Buffer.from(t, "base64url")[0]).toBe(1);
    expect(verifyUnsubToken(t, "stats", env)).toBe(ID);
  });

  it("never expires: the same member always gets the same token", () => {
    expect(unsubToken(ID, "stats", env)).toBe(unsubToken(ID, "stats", env));
  });

  it("rejects a tampered, truncated, re-versioned or foreign token", () => {
    const raw = Buffer.from(unsubToken(ID, "stats", env)!, "base64url");
    const flip = (i: number) => {
      const b = Buffer.from(raw);
      b[i] ^= 1;
      return b.toString("base64url");
    };
    expect(verifyUnsubToken(flip(5), "stats", env)).toBeNull(); // another user id
    expect(verifyUnsubToken(flip(30), "stats", env)).toBeNull(); // the signature
    expect(verifyUnsubToken(flip(0), "stats", env)).toBeNull(); // an unknown key version
    expect(verifyUnsubToken(raw.subarray(0, 32).toString("base64url"), "stats", env)).toBeNull();
    expect(verifyUnsubToken(unsubToken(ID, "stats", { UNSUB_SECRET: "other" }), "stats", env)).toBeNull();
    expect(verifyUnsubToken("", "stats", env)).toBeNull();
    expect(verifyUnsubToken("a/../b", "stats", env)).toBeNull();
    expect(verifyUnsubToken("x".repeat(500), "stats", env)).toBeNull();
  });

  it("uses a key derived for unsubscribing, never UNSUB_SECRET itself, and never ADMIN_SECRET", () => {
    const raw = Buffer.from(unsubToken(ID, "stats", env)!, "base64url");
    const direct = createHmac("sha256", env.UNSUB_SECRET).update("stats|").update(raw.subarray(0, 17)).digest().subarray(0, 16);
    expect(raw.subarray(17).equals(direct)).toBe(false);
    expect(unsubConfigured({ ADMIN_SECRET: "a", CRON_SECRET: "c" })).toBe(false);
    expect(unsubToken(ID, "stats", { ADMIN_SECRET: "a" })).toBeNull();
    expect(verifyUnsubToken(unsubToken(ID, "stats", env), "stats", { ADMIN_SECRET: "a" })).toBeNull();
  });

  it("makes no token for an id that is not a uuid", () => {
    expect(unsubToken("not-a-uuid", "stats", env)).toBeNull();
  });

  it("gives the one-click headers (RFC 8058)", () => {
    expect(unsubHeaders("tok")).toEqual({ "List-Unsubscribe": "<http://localhost:3000/api/unsubscribe/tok>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });
});

describe("guest opt-out tokens (B2 whole-branch review)", () => {
  it("round-trip the normalised address, and are refused when tampered, truncated, or signed for a member's stats email", () => {
    const t = guestOptOutToken("anasilva@gmail.com", env)!;
    expect(Buffer.from(t, "base64url")[0]).toBe(1);
    expect(verifyGuestOptOut(t, env)).toBe("anasilva@gmail.com");
    const raw = Buffer.from(t, "base64url");
    const flip = (i: number) => {
      const b = Buffer.from(raw);
      b[i] ^= 1;
      return b.toString("base64url");
    };
    expect(verifyGuestOptOut(flip(3), env)).toBeNull(); // another address
    expect(verifyGuestOptOut(flip(raw.length - 2), env)).toBeNull(); // the signature
    expect(verifyGuestOptOut(flip(0), env)).toBeNull(); // an unknown key version
    expect(verifyGuestOptOut(raw.subarray(0, raw.length - 1).toString("base64url"), env)).toBeNull();
    expect(verifyGuestOptOut(t, { UNSUB_SECRET: "another" })).toBeNull();
    // Each purpose has its own key: a stats token is never a guest's, nor the reverse.
    expect(verifyGuestOptOut(unsubToken(ID, "stats", env), env)).toBeNull();
    expect(verifyUnsubToken(t, "stats", env)).toBeNull();
  });

  it("are not made without UNSUB_SECRET, and give one-click headers", () => {
    expect(guestOptOutToken("a@example.com", {})).toBeNull();
    const t = guestOptOutToken("a@example.com", env)!;
    expect(optOutHeaders(t)).toEqual({ "List-Unsubscribe": `<${optOutOneClickUrl(t)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(optOutOneClickUrl(t)).toContain(`/api/opt-out/${t}`);
  });
});
