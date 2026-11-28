import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blobSha, CORA_METHOD_FILE, deployCommit, fileVersion, forgetFileVersions, INSTRUCTION_FILES, zackInstructionFile } from "./version";

// Curly quotes and an em dash, built from char codes so no tool can mangle them.
const q = (n: number) => String.fromCharCode(n);
const FIXTURE = `Zack says ${q(0x201c)}hello${q(0x201d)} ${q(0x2014)} twice.\nSecond line.\n`;
// `git hash-object --no-filters` of exactly those UTF-8 bytes (LF endings).
const FIXTURE_SHA = "3391bb3bec16c9fcf8721c578ad192e76a52092b";

afterEach(() => {
  forgetFileVersions();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("blobSha", () => {
  it("equals the SHA git prints for the same file, curly quotes and em dash included", () => {
    expect(blobSha(FIXTURE)).toBe(FIXTURE_SHA);
  });

  it("gives the CRLF and LF forms the same SHA", () => {
    expect(blobSha(FIXTURE.replace(/\n/g, "\r\n"))).toBe(FIXTURE_SHA);
  });

  it("is git's empty blob for an empty file", () => {
    expect(blobSha("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });
});

describe("fileVersion", () => {
  const inDir = (files: Record<string, string>) => {
    const dir = mkdtempSync(path.join(tmpdir(), "roger-version-"));
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), text);
    }
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    return dir;
  };

  it("hashes a file under the project root, read once per process", () => {
    const dir = inDir({ "content/zack/claude.md": FIXTURE.replace(/\n/g, "\r\n") });
    expect(fileVersion("content/zack/claude.md")).toBe(FIXTURE_SHA);
    // Memoised: a change on disk is not seen until the process restarts (a deploy).
    writeFileSync(path.join(dir, "content/zack/claude.md"), "changed");
    expect(fileVersion("content/zack/claude.md")).toBe(FIXTURE_SHA);
  });

  it("returns null for a missing file without throwing, and logs it once", () => {
    inDir({});
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(fileVersion("content/cora/cora.md")).toBeNull();
    expect(fileVersion("content/cora/cora.md")).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("hashes every allowlisted file in this checkout", () => {
    for (const f of INSTRUCTION_FILES) expect(fileVersion(f), f).toMatch(/^[0-9a-f]{40}$/);
    expect(INSTRUCTION_FILES).toContain(CORA_METHOD_FILE);
    expect(zackInstructionFile("grok-bot")).toBe("content/zack/grok-bot.md");
  });
});

describe("deployCommit", () => {
  it("is VERCEL_GIT_COMMIT_SHA when set, and null otherwise", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    expect(deployCommit()).toBe("abc123");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    expect(deployCommit()).toBeNull();
  });
});
