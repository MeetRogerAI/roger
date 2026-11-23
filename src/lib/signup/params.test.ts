import { describe, expect, it } from "vitest";
import { parseStartParams, startQuery } from "./params";

describe("parseStartParams", () => {
  it("keeps valid values", () => {
    const p = parseStartParams({ path: "agents", cur: "CAD", utm: "x", ref: "abc123", zack: "a".repeat(24) });
    expect(p).toEqual({ path: "agents", cur: "CAD", ref: "abc123", zack: "a".repeat(24), utm: "x" });
  });

  it("drops an unknown currency and a malformed zack token without failing", () => {
    const p = parseStartParams({ cur: "EUR", zack: "not a token!" });
    expect(p.cur).toBeNull();
    expect(p.zack).toBeNull();
  });

  it("accepts a lower-case currency", () => {
    expect(parseStartParams({ cur: "usd" }).cur).toBe("USD");
  });

  it("drops an unknown path and a bad referral code", () => {
    const p = parseStartParams({ path: "admin", ref: "a b" });
    expect(p.path).toBeNull();
    expect(p.ref).toBeNull();
  });

  it("takes the first of repeated values", () => {
    expect(parseStartParams({ path: ["re", "agents"] }).path).toBe("re");
  });

  it("strips control characters from utm and caps its length", () => {
    const p = parseStartParams({ utm: "a\u0000b\nc" + "x".repeat(300) });
    expect(p.utm.startsWith("abc")).toBe(true);
    expect(p.utm.length).toBe(200);
  });

  it("returns empty values for no parameters", () => {
    expect(parseStartParams({})).toEqual({ path: null, cur: null, ref: null, zack: null, utm: "" });
  });
});

describe("startQuery", () => {
  it("round-trips the kept values", () => {
    const p = parseStartParams({ path: "re", cur: "USD", utm: "nov" });
    expect(startQuery(p)).toBe("?path=re&cur=USD&utm=nov");
    expect(startQuery(parseStartParams({}))).toBe("");
  });
});
