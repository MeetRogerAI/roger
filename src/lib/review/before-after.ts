import { adminEmails } from "@/lib/auth/admin-emails";
import { addDays, currentMonday } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { ZACK_AGENTS, type ZackAgent } from "@/lib/zack/agents";

/**
 * Before and after a merged review-bot proposal (B3 plan Unit 10, R20), per
 * Zack file, from the instruction version each run was stamped with (Unit 2).
 *
 * - "Before": runs stamped with the proposal's `base_versions[path]`.
 * - "After": runs stamped with its `result_versions[path]` (the blob the bot
 *   committed). Only when `edited_before_merge` is set (a person changed the
 *   PR on GitHub) does "after" fall back to the first version, different from
 *   the base, that a run received after `merged_at` was stamped with; the
 *   view labels it. A run on any other version (a later, unrelated merge) is
 *   on neither side.
 * - At most 4 list weeks each side: the list week of the merge and the 3
 *   before it, and the list week of the merge and the 3 after it. The stamp,
 *   not the date, decides the side.
 * - Counted: members' runs (admins, test runs and deleted runs left out) on
 *   the agent whose file it is (an agent with no file of its own uses the
 *   Grok Bot file, as `zackFileFor` does), stamped from a fetch. Runs stamped
 *   with the deployed version (no fetch behind them) are counted apart.
 * - Cora's `cora.md` has no before or after: no code reads it, so a split by
 *   version would credit a change that did not run (Key Technical
 *   Decisions). A proposal that changes only Cora's file is "document only".
 *
 * Counts only, never member data, so showing them is not a logged read.
 */

/** Fewer runs than this on either side: "Too few to compare". */
export const TOO_FEW = 3;
/** List weeks each side, the merge week included. */
export const WEEKS_EACH_SIDE = 4;

export type MergedProposal = {
  paths: string[];
  base_versions: Record<string, string> | null;
  result_versions: Record<string, string> | null;
  edited_before_merge: boolean;
  merged_at: string | null;
  document_only: boolean;
};

export type ZackSide = {
  version: string | null;
  /** Runs stamped from a fetch: the ones measured. */
  n: number;
  accepted: number;
  flagged: number;
  rejected: number;
  /** Not processed yet. */
  waiting: number;
  /** Read, from the block or by the model. */
  parsed: number;
  fromBlock: number;
  /** Plays on the accepted runs. */
  plays: number;
  /** Runs stamped with the deployed version, not measured. */
  deployed: number;
};

export type FileBeforeAfter = {
  path: string;
  agent: ZackAgent;
  before: ZackSide;
  after: ZackSide;
  /** Where "after" came from: result_versions, the edited-on-GitHub fallback, or nothing to compare. */
  afterFrom: "result" | "edited_fallback" | "none";
  tooFew: boolean;
};

export type BeforeAfter = { kind: "document_only" } | { kind: "no_merge_date" } | { kind: "zack"; mergedWeek: string; files: FileBeforeAfter[] };

const ZACK_FILE = /^content\/zack\/([a-z-]+)\.md$/;
const agentOf = (path: string): ZackAgent | null => {
  const m = ZACK_FILE.exec(path);
  return m && (ZACK_AGENTS as readonly string[]).includes(m[1]) ? (m[1] as ZackAgent) : null;
};

/** SQL: the runs `r` (joined to users `u`) a Zack file's measures count. $1 agents, $2 the file's agent, $3 admins. */
const COUNTED = `r.user_id is not null and not r.is_test and r.status <> 'deleted' and lower(u.email) <> all($3::text[])
  and (case when r.agent = any($1::text[]) then r.agent else 'grok-bot' end) = $2`;

const empty = (version: string | null): ZackSide => ({ version, n: 0, accepted: 0, flagged: 0, rejected: 0, waiting: 0, parsed: 0, fromBlock: 0, plays: 0, deployed: 0 });

async function side(q: Query, agent: ZackAgent, version: string | null, from: string, to: string, admins: string[]): Promise<ZackSide> {
  if (!version) return empty(null);
  const [r] = await q<Omit<ZackSide, "version">>(
    `select count(*) filter (where f)::int as n,
            count(*) filter (where f and r.status = 'accepted')::int as accepted,
            count(*) filter (where f and r.status = 'flagged')::int as flagged,
            count(*) filter (where f and r.status = 'rejected')::int as rejected,
            count(*) filter (where f and r.status = 'received')::int as waiting,
            count(*) filter (where f and r.parsed_by is not null)::int as parsed,
            count(*) filter (where f and r.parsed_by = 'block')::int as "fromBlock",
            coalesce(sum((select count(*) from plays p where p.run_id = r.id)) filter (where f and r.status = 'accepted'), 0)::int as plays,
            count(*) filter (where r.instructions_version_source = 'deployed')::int as deployed
     from runs r join users u on u.id = r.user_id,
          lateral (select r.instructions_version_source = 'fetch' as f) s
     where ${COUNTED} and r.instructions_version = $4 and r.week_of between $5::date and $6::date`,
    [ZACK_AGENTS, agent, admins, version, from, to],
  );
  return { version, ...r };
}

/** The first version other than the base that a counted run received from `mergedAt` was stamped with. */
async function firstVersionAfter(q: Query, agent: ZackAgent, base: string | null, mergedAt: string, admins: string[]): Promise<string | null> {
  const [r] = await q<{ v: string }>(
    `select r.instructions_version as v from runs r join users u on u.id = r.user_id
     where ${COUNTED} and r.instructions_version is not null and r.instructions_version is distinct from $4 and r.received_at >= $5::timestamptz and r.received_at < $5::timestamptz + interval '28 days'
     order by r.received_at, r.id limit 1`,
    [ZACK_AGENTS, agent, admins, base, mergedAt],
  );
  return r?.v ?? null;
}

export async function beforeAfter(q: Query, p: MergedProposal, o: { admins?: string[] } = {}): Promise<BeforeAfter> {
  const files = p.paths.map((path) => ({ path, agent: agentOf(path) })).filter((f): f is { path: string; agent: ZackAgent } => f.agent !== null);
  if (!files.length) return { kind: "document_only" };
  if (!p.merged_at) return { kind: "no_merge_date" };
  const admins = (o.admins ?? adminEmails()).map((e) => e.toLowerCase());
  const week = currentMonday(new Date(p.merged_at));
  const span = 7 * (WEEKS_EACH_SIDE - 1);
  const out: FileBeforeAfter[] = [];
  for (const { path, agent } of files) {
    const base = p.base_versions?.[path] ?? null;
    let afterVersion: string | null;
    let afterFrom: FileBeforeAfter["afterFrom"];
    if (p.edited_before_merge) {
      afterVersion = await firstVersionAfter(q, agent, base, p.merged_at, admins);
      afterFrom = afterVersion ? "edited_fallback" : "none";
    } else {
      afterVersion = p.result_versions?.[path] ?? null;
      afterFrom = afterVersion ? "result" : "none";
    }
    const before = await side(q, agent, base, addDays(week, -span), week, admins);
    const after = await side(q, agent, afterVersion, week, addDays(week, span), admins);
    out.push({ path, agent, before, after, afterFrom, tooFew: before.n < TOO_FEW || after.n < TOO_FEW });
  }
  return { kind: "zack", mergedWeek: week, files: out };
}
