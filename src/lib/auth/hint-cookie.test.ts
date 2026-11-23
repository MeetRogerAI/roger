import { describe, expect, it } from "vitest";
import { hasSignedInHint } from "./hint-cookie";

describe("hasSignedInHint", () => {
  it("is false with no cookies", () => {
    expect(hasSignedInHint("")).toBe(false);
  });

  it("is true with the marker cookie among others", () => {
    expect(hasSignedInHint("a=1; roger-in=1; b=2")).toBe(true);
  });

  it("ignores a cookie with a similar name or another value", () => {
    expect(hasSignedInHint("roger-in-x=1")).toBe(false);
    expect(hasSignedInHint("roger-in=0")).toBe(false);
  });
});
