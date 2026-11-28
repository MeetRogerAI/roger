import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ZackAgent } from "@/lib/zack/agents";

/**
 * Instruction-file versions (B3 plan Unit 2, R20). A version is the git blob
 * SHA of the file's LF-normalised text: the value GitHub's API returns as the
 * file's `sha`, so a stamped run or list can be matched to a commit and to a
 * review-bot proposal's base. It is the same on a Windows checkout (CRLF in
 * the working tree) and on Vercel.
 *
 * Every entry point whose imports reach this file must bundle the files it
 * hashes: next.config.ts outputFileTracingIncludes, enforced by tracing.test.ts.
 */

/**
 * The instruction files the review bot may propose wording for (B3 plan, Key
 * Technical Decisions). Code, not configuration. The connector templates
 * (they carry key placeholders) and the pilot's hand-run prompt (no code
 * reads it) are left out.
 */
export const INSTRUCTION_FILES = [
  "content/zack/claude.md",
  "content/zack/duet.md",
  "content/zack/grok-bot.md",
  "content/zack/hark.md",
  "content/cora/cora.md",
] as const;
export type InstructionFile = (typeof INSTRUCTION_FILES)[number];

/** Cora's method document. No code reads it, so a Cora list also records the deploy's commit (deployCommit). */
export const CORA_METHOD_FILE: InstructionFile = "content/cora/cora.md";

/** The core Zack file an agent is served (before the member's rules are added). */
export function zackInstructionFile(agent: ZackAgent): InstructionFile {
  return `content/zack/${agent}.md`;
}

/** sha1("blob " + byteLength + "\0" + bytes) over the UTF-8 bytes, with CRLF read as LF. */
export function blobSha(text: string): string {
  const body = Buffer.from(text.replace(/\r\n/g, "\n"), "utf8");
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}

const memo = new Map<string, string | null>();

/**
 * The version of a file under the project root, hashed once per process.
 * Returns null when the file is missing or unreadable (logged once), and never
 * throws: a run or a list is never lost to a bundling mistake.
 */
export function fileVersion(file: string): string | null {
  if (memo.has(file)) return memo.get(file) ?? null;
  let v: string | null = null;
  try {
    v = blobSha(readFileSync(path.join(process.cwd(), file), "utf8"));
  } catch (e) {
    console.error("[instructions] cannot read", file, e instanceof Error ? e.message : e);
  }
  memo.set(file, v);
  return v;
}

/** Forgets every memoised version (tests only). */
export function forgetFileVersions(): void {
  memo.clear();
}

/** The commit this deploy was built from (a Vercel system variable), or null locally and in tests. */
export function deployCommit(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA || null;
}
