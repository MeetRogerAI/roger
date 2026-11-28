import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { heldHeading, heldTeaser, heldTitles } from "./held";

/** Plan 2026-11-26-001, Unit 3: a held list shows its titles only (origin R8). */

let query: Query;
const WEEK = "2026-12-14";

async function setUp(o: { card?: boolean; outcome?: string; weekStatus?: string; dry?: boolean } = {}) {
  const [u] = await query<{ id: string }>(
    "insert into users (email, status, plan, trial_started_at) values ('a@example.com', 'trial', 'monthly', $1) returning id",
    [o.card ? "2026-11-16T15:00:00Z" : null],
  );
  await query("insert into cora_weeks (week_of, status, phase, dry_run) values ($1, $2, 'ready', $3)", [WEEK, o.weekStatus ?? "ready", Boolean(o.dry)]);
  await query("insert into cora_user_weeks (user_id, week_of, outcome, picked_count, dry_run) values ($1, $2, $3, 2, $4)", [u.id, WEEK, o.outcome ?? "short", Boolean(o.dry)]);
  for (const [i, t] of ["Inbox triage", "Listing post"].entries()) {
    const [p] = await query<{ id: string }>(
      "insert into pool_plays (title, category, description, playbook_md, paste_to_install, first_seen, last_seen) values ($1, 'Sales', 'Secret.', '1. Secret step.', 'Secret install.', $2, $2) returning id",
      [t, WEEK],
    );
    await query("insert into picks (user_id, week_of, position, pool_play_id, personal_score, fit, reason, dry_run) values ($1, $2, $3, $4, 70, 3, 'Secret reason.', $5)", [
      u.id,
      WEEK,
      i + 1,
      p.id,
      Boolean(o.dry),
    ]);
  }
  return u.id;
}

beforeEach(async () => {
  ({ query } = await testDb());
});

describe("heldTeaser", () => {
  it("returns the newest held week's titles, and nothing else", async () => {
    const id = await setUp();
    const t = await heldTeaser(query, id);
    expect(t).toEqual({ week: WEEK, titles: ["Inbox triage", "Listing post"], count: 2 });
    expect(JSON.stringify(t)).not.toMatch(/Secret/);
  });

  it("is null for a member with a card, a delivered or superseded week, a dry run, or a week Cora has not finished", async () => {
    expect(await heldTeaser(query, await setUp({ card: true }))).toBeNull();
    ({ query } = await testDb());
    expect(await heldTeaser(query, await setUp({ dry: true }))).toBeNull();
    ({ query } = await testDb());
    expect(await heldTeaser(query, await setUp({ weekStatus: "running" }))).toBeNull();
    ({ query } = await testDb());
    const id = await setUp();
    await query("update cora_user_weeks set superseded_at = now()");
    expect(await heldTeaser(query, id)).toBeNull();
    await query("update cora_user_weeks set superseded_at = null, delivered_at = now()");
    expect(await heldTeaser(query, id)).toBeNull();
    expect(await heldTitles(query, id, "not-a-date")).toEqual([]);
  });

  it("headings: three ideas, or fewer on a short week", () => {
    expect(heldHeading(3)).toBe("Your first 3 ideas are ready");
    expect(heldHeading(2)).toBe("Your first ideas are ready");
    expect(heldHeading(1)).toBe("Your first ideas are ready");
  });
});

/**
 * Deny by default for idea details. A pick's details (the reason and score on
 * `picks`; the description, steps, install text, heavy use and figures on
 * `pool_plays`) may be read only from delivered picks. Every SQL string in
 * `src/` (pages, `src/app/api/**`, emails, jobs) that reads `picks` and a
 * detail column must say `delivered_at is not null`.
 *
 * Allowed without it, each never shown to a member:
 * - `src/lib/app/held.ts`: the held-list reader. It selects titles only, which the line below checks.
 * - `src/lib/admin/cora.ts`: the admin user page's picks list (behind the admin check), which shows undelivered and dry-run picks on purpose.
 * - `src/lib/cora/job.ts`: Cora writing the picks (an insert, not a read).
 */
const ALLOWED = new Set(["src/lib/app/held.ts", "src/lib/admin/cora.ts", "src/lib/cora/job.ts"]);
const DETAIL = /\b(reason|personal_score|description|playbook_md|paste_to_install|heavy_use_for|figures|best_trick|install_notes)\b/;
const READS_PICKS = /\b(from|join)\s+picks\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("idea details are read from delivered picks only", () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const files = sourceFiles(join(root, "src")).map((p) => ({ path: relative(root, p).split(sep).join("/"), text: readFileSync(p, "utf8") }));

  it("finds the source files (the scan is not empty)", () => {
    expect(files.some((f) => f.path === "src/lib/app/week.ts")).toBe(true);
    expect(files.some((f) => f.path.startsWith("src/app/api/"))).toBe(true);
  });

  it("the scan's rule catches a detail read with no delivery condition", () => {
    const bad = "`select k.reason, pp.playbook_md from picks k join pool_plays pp on pp.id = k.pool_play_id where k.user_id = $1`";
    expect(READS_PICKS.test(bad) && DETAIL.test(bad) && !/delivered_at is not null/.test(bad)).toBe(true);
  });

  it("every other query that reads picks with a detail column requires delivered_at is not null", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (ALLOWED.has(f.path)) continue;
      for (const s of f.text.match(/`[^`]*`/g) ?? []) {
        if (READS_PICKS.test(s) && DETAIL.test(s) && !/delivered_at is not null/.test(s)) offenders.push(`${f.path}: ${s.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("weekIdeas, the one reader of details, requires delivery", () => {
    const week = files.find((f) => f.path === "src/lib/app/week.ts")!.text;
    const sql = week.match(/`select k\.position[^`]*`/)?.[0] ?? "";
    expect(sql).toMatch(/k\.delivered_at is not null/);
  });

  it("the held reader selects titles only", () => {
    const held = files.find((f) => f.path === "src/lib/app/held.ts")!.text;
    for (const s of held.match(/`[^`]*`/g) ?? []) expect(s).not.toMatch(DETAIL);
  });
});
