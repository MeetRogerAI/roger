import { describe, expect, it } from "vitest";
import { sameOrigin } from "./origin";

const h = (o: Record<string, string>) => new Headers(o);

describe("sameOrigin", () => {
  it("accepts a request from a page on this site", () => {
    expect(sameOrigin(h({ origin: "https://meetroger.ai", host: "meetroger.ai" }))).toBe(true);
  });

  it("uses the forwarded host when there is one", () => {
    expect(sameOrigin(h({ origin: "https://meetroger.ai", host: "internal:3000", "x-forwarded-host": "meetroger.ai" }))).toBe(true);
  });

  it("refuses another site, a missing Origin, and a malformed Origin", () => {
    expect(sameOrigin(h({ origin: "https://evil.test", host: "meetroger.ai" }))).toBe(false);
    expect(sameOrigin(h({ host: "meetroger.ai" }))).toBe(false);
    expect(sameOrigin(h({ origin: "not a url", host: "meetroger.ai" }))).toBe(false);
  });
});
