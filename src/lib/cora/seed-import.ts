import { setContributorEmail } from "@/lib/admin/contributors";
import { normaliseEmail } from "@/lib/auth/tokens";
import { weekOf } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { isEmail } from "@/lib/form";
import { processRun, type IntakeDeps } from "@/lib/intake/process";
import { zackVersion } from "@/lib/zack/receive";
import { mergePending, type MergeModel, type MergeTally } from "./merge";

/**
 * Seed runs (R23, R25, spec B.7 "Seed data"): a run file imported under a
 * hidden seed contributor, sent through intake like any run, then merged into
 * the pool at once. Seed plays are shareable and never attributed to a real
 * account. One contributor with runs from several agents is still one person.
 *
 * `email` (optional) is the person's address: it is set on the contributor
 * (logged as `by`), and an account with it is linked at once, or when it is
 * made (src/lib/admin/contributors.ts). Several contributors may share an
 * address (one person, several records). Refused before anything is written
 * if it is not an address.
 */
export type SeedInput = { label: string; agent: string; text: string; ranOn: string; replace?: boolean; email?: string; by?: string };

export type SeedResult = { runId: string; contributorId: string; weekOf: string; replaced: boolean; intake: string; merge: MergeTally; email?: string };

export class SeedRunExists extends Error {}
/** The email given with a seed import is not an address. */
export class SeedEmailRefused extends Error {}

/** Who a seed import's email change is logged as when no admin is named (the script). */
export const SEED_SCRIPT_ACTOR = "script (seed import)";

/** "Zack Run - Rob - 2026-11-12.md" → "2026-11-12". */
export function dateFromFileName(name: string): string | null {
  return name.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

export async function importSeedRun(q: Query, input: SeedInput, deps: IntakeDeps & { merge: MergeModel }): Promise<SeedResult> {
  const label = input.label.replace(/\s+/g, " ").trim();
  const agent = input.agent.trim().toLowerCase();
  if (!label || !agent) throw new Error("A seed run needs a contributor label and an agent.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.ranOn)) throw new Error("The run date must be YYYY-MM-DD.");
  // The week the run counts for, as if Zack had sent it that day.
  const week = weekOf(new Date(`${input.ranOn}T17:00:00Z`));
  const email = input.email?.trim() ? normaliseEmail(input.email) : null;
  if (email !== null && !isEmail(email)) throw new SeedEmailRefused(`${input.email} isn’t an email address.`);

  // One person is one contributor, however their name is capitalised.
  const [c] = await q<{ id: string }>(
    `with found as (select id from seed_contributors where lower(label) = lower($1) order by created_at limit 1),
     made as (insert into seed_contributors (label) select $1 where not exists (select 1 from found) on conflict (label) do nothing returning id)
     select id from found union all select id from made union all select id from seed_contributors where label = $1 limit 1`,
    [label],
  );

  const [existing] = await q<{ id: string }>(`select id from runs where contributor_id = $1 and agent = $2 and week_of = $3`, [c.id, agent, week]);
  if (existing && !input.replace) {
    throw new SeedRunExists(`${label} already has a ${agent} run for the week of ${week}. Pass replace to swap it for this file.`);
  }
  let emailNote: string | undefined;
  if (email !== null) {
    const set = await setContributorEmail(q, input.by ?? SEED_SCRIPT_ACTOR, c.id, email);
    if (!set.ok) throw new SeedEmailRefused(set.message);
    emailNote = set.message;
  }
  const [run] = await q<{ id: string }>(
    `insert into runs (contributor_id, week_of, route, agent, sharing, raw_text, zack_version)
     values ($1, $2, 'seed', $3, 'share', $4, $5)
     on conflict (contributor_id, agent, week_of) where contributor_id is not null
     do update set raw_text = excluded.raw_text, zack_version = excluded.zack_version, status = 'received', parsed = null, parsed_by = null,
       reason = '', attempts = 0, processed_at = null, revision = runs.revision + 1
     returning id`,
    [c.id, week, agent, input.text, zackVersion(input.text)],
  );
  // A replacement is new text: its old plays go, and any pool play left with no plays is retired by the merge.
  if (existing) await q(`delete from plays where run_id = $1`, [run.id]);
  const intake = await processRun(q, run.id, deps);
  const merge = await mergePending(q, deps.merge, { runIds: [run.id] });
  return { runId: run.id, contributorId: c.id, weekOf: week, replaced: Boolean(existing), intake, merge, ...(emailNote ? { email: emailNote } : {}) };
}
