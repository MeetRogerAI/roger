import { describe, expect, it } from "vitest";
import { navFor } from "./site-header";

describe("navFor", () => {
  it("shows no header button or Circles links on sign-up, sign-in and the app (spec A.3)", () => {
    for (const p of ["/start", "/start/plan", "/signin", "/auth/confirm", "/app", "/app/zack"]) {
      expect(navFor(p), p).toEqual({ links: [], cta: null });
    }
  });

  it("leaves other pages alone, including /apply", () => {
    expect(navFor("/").cta).not.toBeNull();
    expect(navFor("/apply").links.length).toBeGreaterThan(0);
  });
});
