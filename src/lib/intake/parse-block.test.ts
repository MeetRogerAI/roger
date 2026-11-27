import { describe, expect, it } from "vitest";
import { parseProfileBlock, parseRunBlock, withoutPrivateBlocks } from "./parse-block";

const fence = (name: string, body: string) => "```" + name + "\n" + body + "\n```";
const level = fence("roger-level", "roger-level:\n  zack_version: 2.1\n  scripts: 37");

describe("unknown roger-* blocks (Zack 2.1 and later)", () => {
  it("leaves the run and profile blocks parseable when a roger-level block sits beside them", () => {
    const run = fence("roger-run", JSON.stringify({ zack_version: "2.1", plays: [] }));
    const profile = fence("roger-profile", JSON.stringify({ setup: "x" }));
    const text = `# Report\n\n${level}\n\n${run}\n\n${profile}\n`;
    expect(parseRunBlock(text)).toEqual({ zack_version: "2.1", plays: [] });
    expect(parseProfileBlock(text)).toEqual({ setup: "x" });
  });

  it("removes an unknown roger-* block and keeps everything else", () => {
    const run = fence("roger-run", "{}");
    const out = withoutPrivateBlocks(`before\n${level}\nafter\n${run}`);
    expect(out).not.toContain("roger-level");
    expect(out).not.toContain("37");
    expect(out).toContain("before");
    expect(out).toContain("after");
    expect(out).toContain(run);
  });

  it("keeps ordinary code fences and roger-run / roger-profile", () => {
    const text = `${fence("js", "const a = 37;")}\n${fence("roger-profile", "{}")}`;
    expect(withoutPrivateBlocks(text)).toBe(text);
  });

  it("drops an unclosed unknown block to the end of the text, so nothing private leaks", () => {
    const out = withoutPrivateBlocks("prose here\n```roger-level\nsecret-ish: 37\nmore");
    expect(out).toContain("prose here");
    expect(out).not.toContain("secret-ish");
  });

  it("removes an empty private block and keeps what follows", () => {
    expect(withoutPrivateBlocks("a\n```roger-level\n```\nafter")).toBe("a\nafter");
  });

  it("removes ~~~ fences, longer fences and any capitalisation or underscore of the name", () => {
    expect(withoutPrivateBlocks("a\n~~~roger-level\nS1\n~~~\nb")).toBe("a\nb");
    expect(withoutPrivateBlocks("a\n```Roger-Level\nS2\n```\nb")).toBe("a\nb");
    expect(withoutPrivateBlocks("a\n```roger_level\nS3\n```\nb")).toBe("a\nb");
  });

  it("does not end a private block at an inner fence line shorter than its opener", () => {
    const out = withoutPrivateBlocks("a\n````roger-level\nS\n```\ninner secret\n````\nafter");
    expect(out).toBe("a\nafter");
  });

  it("does not end a private block at a fence line that carries a name", () => {
    expect(withoutPrivateBlocks("a\n```roger-level\nS\n```json\nmore secret\n```\nb")).toBe("a\nb");
  });

  it("handles CRLF line endings", () => {
    expect(withoutPrivateBlocks("a\r\n```roger-level\r\nS\r\n```\r\nb\r\n")).toBe("a\r\nb\r\n");
  });

  it("drops a private block that a roger-run block left unclosed by mistake, and keeps the run text", () => {
    const out = withoutPrivateBlocks('```roger-run\n{"plays":[]}\n```roger-level\nsecret\n```\nafter');
    expect(out).toBe('```roger-run\n{"plays":[]}\nafter');
  });

  it("only treats a fence at the start of a line as a block, and keeps one inside another code block", () => {
    const prose = "Use ```roger-foo in a prompt, then 25 minutes saved.";
    expect(withoutPrivateBlocks(prose)).toBe(prose);
    const nested = "```md\n```roger-level\nshown as an example\n```";
    expect(withoutPrivateBlocks(nested)).toBe("```md\n```roger-level\nshown as an example\n```");
  });

  it("returns text without any roger-* block unchanged", () => {
    expect(withoutPrivateBlocks("just a report, 25 minutes")).toBe("just a report, 25 minutes");
  });
});
