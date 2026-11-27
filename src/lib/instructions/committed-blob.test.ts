import { it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileVersion, INSTRUCTION_FILES } from "@/lib/instructions/version";
it("matches committed blobs", () => {
  for (const f of INSTRUCTION_FILES) {
    const committed = execSync(`git rev-parse HEAD:${f}`).toString().trim();
    expect([f, fileVersion(f)]).toEqual([f, committed]);
  }
});
