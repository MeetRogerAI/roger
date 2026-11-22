import { describe, expect, it } from "vitest";
import { clientIp, hit, windowStart, type Counter } from "./rate-limit";

function memoryCounter(): Counter {
  const rows = new Map<string, number>();
  return async (key, start) => {
    const k = `${key}@${start}`;
    const n = (rows.get(k) ?? 0) + 1;
    rows.set(k, n);
    return n;
  };
}

const sixPerDay = { limit: 6, windowSeconds: 86_400 };

describe("hit", () => {
  it("allows up to the limit inside a window and refuses the next", async () => {
    const c = memoryCounter();
    const now = new Date("2026-11-22T10:00:00Z");
    for (let i = 0; i < 6; i++) expect(await hit("zack:send:u1", sixPerDay, now, c)).toBe(true);
    expect(await hit("zack:send:u1", sixPerDay, now, c)).toBe(false);
  });

  it("allows again once the window has passed", async () => {
    const c = memoryCounter();
    const now = new Date("2026-11-22T10:00:00Z");
    for (let i = 0; i < 7; i++) await hit("k", sixPerDay, now, c);
    expect(await hit("k", sixPerDay, new Date("2026-11-23T00:00:01Z"), c)).toBe(true);
  });

  it("keeps separate counts per key", async () => {
    const c = memoryCounter();
    const now = new Date("2026-11-22T10:00:00Z");
    for (let i = 0; i < 7; i++) await hit("a", sixPerDay, now, c);
    expect(await hit("b", sixPerDay, now, c)).toBe(true);
  });
});

describe("windowStart", () => {
  it("aligns to the window", () => {
    expect(windowStart(new Date("2026-11-22T10:07:30Z"), 900)).toBe(Date.parse("2026-11-22T10:00:00Z") / 1000);
  });
});

describe("clientIp", () => {
  it("trusts the platform header and takes its first address", () => {
    const h = new Headers({ "x-vercel-forwarded-for": "203.0.113.5, 10.0.0.1", "x-forwarded-for": "1.1.1.1" });
    expect(clientIp(h)).toBe("203.0.113.5");
  });

  it("ignores a client-supplied x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1" }))).toBe("unknown");
  });
});
