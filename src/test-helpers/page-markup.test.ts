import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectFixture } from "./page-markup";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "roger-fixture-"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("expectFixture", () => {
  it("passes on a match, and fails on a difference or a missing file", () => {
    vi.stubEnv("UPDATE_FIXTURES", "");
    const file = join(dir, "page.html");
    writeFileSync(file, "<p>\n<b>one</b>\n</p>\n");
    expect(() => expectFixture(file, "<p><b>one</b></p>")).not.toThrow();
    expect(() => expectFixture(file, "<p><b>two</b></p>")).toThrowError(/markup differs/);
    expect(() => expectFixture(join(dir, "none.html"), "<p></p>")).toThrowError(/missing/);
  });

  it("never passes an update run: it writes the fixture, then fails asking for a run without the flag", () => {
    vi.stubEnv("UPDATE_FIXTURES", "1");
    vi.stubEnv("CI", "");
    const file = join(dir, "new", "page.html");
    expect(() => expectFixture(file, "<p><b>one</b></p>")).toThrowError(/rewrote .*run the tests again without the flag/);
    expect(readFileSync(file, "utf8")).toBe("<p>\n<b>one</b>\n</p>\n");
  });

  it("refuses to write a fixture in CI", () => {
    vi.stubEnv("UPDATE_FIXTURES", "1");
    vi.stubEnv("CI", "true");
    const file = join(dir, "page.html");
    writeFileSync(file, "kept\n");
    expect(() => expectFixture(file, "<p>changed</p>")).toThrowError(/refused in CI/);
    expect(readFileSync(file, "utf8")).toBe("kept\n");
    expect(() => expectFixture(join(dir, "none.html"), "<p></p>")).toThrowError(/refused in CI/);
    expect(existsSync(join(dir, "none.html"))).toBe(false);
  });
});
