import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { slicePlaybook, gatewayModel } from "./model";
import { validateRun } from "./validate";

/**
 * Plan Unit 9: each seed run in artifacts/Zack Runs parses to at least one
 * valid play with no invented figure. Calls the real model through the AI
 * Gateway, so it runs only with INTAKE_LIVE=1 (and gateway credentials).
 */
const dir = path.join(process.cwd(), "artifacts/Zack Runs");
const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

describe.skipIf(!process.env.INTAKE_LIVE)("seed runs through the model path", () => {
  it.each(files)("%s", { timeout: 180_000 }, async (file) => {
    const text = readFileSync(path.join(dir, file), "utf8");
    const r = await gatewayModel.readRun(text, { maxPlays: 4 });
    const v = validateRun({
      plays: r.plays.map(({ playbook_first_words, playbook_last_words, ...p }) => ({ ...p, playbook_md: slicePlaybook(text, playbook_first_words, playbook_last_words) })),
      also_runs: r.also_runs,
    });
    expect(v.ok, v.ok ? "" : v.reason).toBe(true);
    if (!v.ok) return;
    expect(v.run.plays.length).toBeGreaterThan(0);
    for (const p of v.run.plays) {
      expect(p.playbook_md.length, `${p.title}: playbook not found in the report`).toBeGreaterThan(50);
      // No invented figure: every stated minutes figure appears in the report.
      if (p.minutes_saved_each != null) expect(text, `${p.title}: ${p.minutes_saved_each} minutes`).toContain(String(p.minutes_saved_each));
    }
  });
});
