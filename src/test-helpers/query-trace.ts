import { expect } from "vitest";
import type { Query } from "@/lib/db-query";
import type { SwitchOffException } from "./switch-off-exceptions";

/**
 * The switch-off proof's shared harness (B4 plan, "Switch-off proof, the
 * shared harness"; Unit 3). `recordQueries(q)` wraps a `Query` (usually
 * PGlite's, from testDb) and records every statement and its parameters.
 * `normaliseTrace` turns a recording into something two runs of the same code
 * path agree on, so a unit that touches a B1 to B3 path can commit the trace
 * of that path with `v3.levelsLive` off before its change and prove the same
 * trace after it.
 *
 * Normalised:
 * - generated ids (uuids, so lease holders from randomUUID too) and Roger idea
 *   codes (`R-` and 8 base32 characters) become `<id:N>` and `<code:N>`,
 *   numbered in order of first appearance, so "the same id twice" survives;
 * - git blob and commit SHAs (40 hex characters, the method stamps) become
 *   `<sha:N>`, and any value passed in `stamps` (a stubbed deploy commit, a
 *   fixed holder) becomes `<stamp:N>`;
 * - timestamps (Date parameters, ISO date-times inside strings, epoch
 *   milliseconds) become `<time>`. Not numbered: wall-clock values taken in
 *   the same millisecond in one run and not in the next would otherwise number
 *   differently. Dates without a time (week starts) are kept: they are data.
 * - Statements issued concurrently (a `Promise.all` batch: issued while
 *   another statement is still in flight) are sorted within their batch.
 *
 * - An array of nothing but ids (`= any($1::uuid[])`) is a set and is sorted.
 *
 * SQL text is never normalised, whitespace included: the text must match.
 *
 * Some B1 code reads rows in id order (pending plays, pool candidates), so
 * two runs with random ids can take different, equally valid paths. A trace
 * test over such a path makes ids sequential (`sequentialDbIds` for the
 * database, `sequentialRandomUUID` for code) with a different start per run,
 * and gives receipt times explicitly. `idLabels` names the fixture's users,
 * runs and plays, which makes a committed baseline readable.
 */

export type RecordedStatement = { sql: string; params: unknown[]; batch: number };
export type TracedStatement = { sql: string; params: unknown[] };
export type NormaliseOptions = {
  stamps?: readonly unknown[];
  /**
   * Stable names for ids the fixture knows (a user id as "user:a@example.com", a pool play id as
   * "play:Inbox triage"), read from the database after the run; `idLabels` reads the usual ones.
   * A labelled id becomes `<name>` instead of a number. Needed when the path reads rows in id
   * order: random uuids then permute the order of first appearance, and numbers alone would
   * differ between two equal runs.
   */
  labels?: ReadonlyMap<string, string>;
};

/**
 * Makes the test database's generated ids sequential, from `start`: every
 * `gen_random_uuid()` column default in the public schema becomes
 * `00000000-0000-4000-8000-` and a 12-digit hex counter. B1 code reads some
 * rows in id order (pending plays, pool candidates), so with random ids two
 * runs of the same fixture can take different, equally valid paths. Two runs
 * with different `start` values still get different ids, in the same order.
 * Pair it with `sequentialRandomUUID` for ids made in code.
 */
export async function sequentialDbIds(q: Query, start: number): Promise<void> {
  const cols = await q<{ t: string; c: string }>(
    "select table_name as t, column_name as c from information_schema.columns where table_schema = 'public' and column_default like 'gen_random_uuid()%'",
  );
  await q(`create sequence if not exists trace_uuid_seq start with ${Math.trunc(start)}`);
  for (const { t, c } of cols) {
    await q(`alter table ${t} alter column ${c} set default (('00000000-0000-4000-8000-' || lpad(to_hex(nextval('trace_uuid_seq')), 12, '0'))::uuid)`);
  }
}

/** A `crypto.randomUUID` stand-in counting from `start` (spy it in with vi.spyOn), for ids and holders made in code. */
export function sequentialRandomUUID(start: number): () => `${string}-${string}-${string}-${string}-${string}` {
  let n = Math.trunc(start);
  return () => `ffffffff-0000-4000-8000-${(n++).toString(16).padStart(12, "0")}`;
}

/**
 * Labels for the ids a B1 fixture names: users by email, pool plays and run plays by title (and
 * week), runs by member and week. Read after the run, from the same database.
 */
export async function idLabels(q: Query): Promise<Map<string, string>> {
  const rows = await q<{ id: string; label: string }>(
    `select id::text, 'user:' || email as label from users
     union all select id::text, 'pool:' || title from pool_plays
     union all select r.id::text, 'run:' || coalesce(u.email, r.contributor_id::text) || ':' || r.week_of from runs r left join users u on u.id = r.user_id
     union all select p.id::text, 'play:' || p.title || ':' || coalesce(u.email, '') from plays p left join runs r on r.id = p.run_id left join users u on u.id = r.user_id`,
  );
  return new Map(rows.map((r) => [r.id, r.label]));
}

export type Recorder = {
  query: Query;
  /** Everything recorded so far, in the order issued. */
  recorded: () => RecordedStatement[];
  /** Forget what was recorded (after the test's own setup, say). */
  reset: () => void;
};

export function recordQueries(inner: Query): Recorder {
  let log: RecordedStatement[] = [];
  let inFlight = 0;
  let batch = 0;
  const query: Query = async <T,>(sql: string, params?: unknown[]) => {
    // A statement issued while none is in flight starts a new batch; one issued while another is
    // still running belongs to the same concurrent batch, whatever order the scheduler gave it.
    if (inFlight === 0) batch++;
    log.push({ sql, params: structuredClone(params ?? []), batch });
    inFlight++;
    try {
      return await inner<T>(sql, params);
    } finally {
      inFlight--;
    }
  };
  return {
    query,
    recorded: () => log.slice(),
    reset: () => {
      log = [];
    },
  };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID_ONLY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEA_CODE = /\bR-[A-Z2-7]{8}\b/g;
const SHA = /\b[0-9a-f]{40}\b/g;
const ISO_TIME = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?\b/g;
/** Epoch milliseconds from 2001 to 2128: wall-clock numbers, never a count or an amount in a fixture. */
const isEpochMs = (n: number) => Number.isInteger(n) && n >= 1e12 && n < 5e12;

type Numberer = (kind: string, value: string) => string;

function numberer(): Numberer {
  const seen = new Map<string, string>();
  const counts = new Map<string, number>();
  return (kind, value) => {
    const key = `${kind}:${value.toLowerCase()}`;
    let out = seen.get(key);
    if (!out) {
      const n = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, n);
      out = `<${kind}:${n}>`;
      seen.set(key, out);
    }
    return out;
  };
}

/** A numberer that drops the numbers: used for the sort key inside a batch, before numbering. */
const unnumbered: Numberer = (kind) => `<${kind}>`;

type Known = { stamps: Set<string>; labels: ReadonlyMap<string, string> };

/** How an id sorts inside an id-only array: by its label; unlabelled ids after every labelled one, by value. */
const sortName = (id: string, known: Known) => known.labels.get(id.toLowerCase()) ?? `~${id.toLowerCase()}`;

function normaliseValue(v: unknown, num: Numberer, known: Known): unknown {
  if (v instanceof Date) return "<time>";
  if (typeof v === "number") return isEpochMs(v) ? "<time>" : v;
  if (typeof v === "string") {
    if (known.stamps.has(v)) return num("stamp", v);
    return v
      .replace(ISO_TIME, "<time>")
      .replace(UUID, (m) => {
        const label = known.labels.get(m.toLowerCase());
        return label ? `<${label}>` : num("id", m);
      })
      .replace(IDEA_CODE, (m) => num("code", m))
      .replace(SHA, (m) => num("sha", m));
  }
  if (Array.isArray(v)) {
    // An array of nothing but ids is a set (`= any($1::uuid[])`) whose order is uuid order: sorted, by label when known.
    const ids = v.length > 1 && v.every((x) => typeof x === "string" && UUID_ONLY.test(x));
    const items = ids ? [...(v as string[])].sort((a, b) => (sortName(a, known) < sortName(b, known) ? -1 : 1)) : v;
    return items.map((x) => normaliseValue(x, num, known));
  }
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, normaliseValue(x, num, known)]));
  }
  return v;
}

/** The recording, normalised: see the file comment. */
export function normaliseTrace(recorded: readonly RecordedStatement[], o: NormaliseOptions = {}): TracedStatement[] {
  const known: Known = {
    stamps: new Set((o.stamps ?? []).filter((s) => s !== null && s !== undefined).map(String)),
    labels: new Map([...(o.labels ?? new Map<string, string>())].map(([k, v]) => [k.toLowerCase(), v])),
  };
  const sortKey = (s: RecordedStatement) => JSON.stringify([s.sql, normaliseValue(s.params, unnumbered, known)]);
  const ordered: RecordedStatement[] = [];
  for (let i = 0; i < recorded.length; ) {
    let j = i;
    while (j < recorded.length && recorded[j].batch === recorded[i].batch) j++;
    const group = recorded.slice(i, j);
    if (group.length > 1) group.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
    ordered.push(...group);
    i = j;
  }
  const num = numberer();
  return ordered.map((s) => ({ sql: s.sql, params: normaliseValue(s.params, num, known) as unknown[] }));
}

/** One statement a block, for a committed baseline file (vitest `toMatchFileSnapshot`) and readable diffs. */
export function formatTrace(trace: readonly TracedStatement[]): string {
  return trace.map((s, i) => `#${i + 1}\n${s.sql}\n${JSON.stringify(s.params)}\n`).join("\n");
}

/** The tables and the distinctive columns B4 adds. A switch-off trace mentions none of them. */
export const B4_TABLES = ["level_submissions", "level_items", "user_levels", "pool_play_level_tags", "cora_job_matches"] as const;
const B4_IDENTIFIERS = new RegExp(`\\b(${[...B4_TABLES, "has_level_block", "review_hold\\w*", "moves_item"].join("|")})\\b`, "i");

const allowedBy = (exceptions: readonly SwitchOffException[]) => (s: TracedStatement) =>
  exceptions.some((e) => e.addedStatements.some((re) => re.test(s.sql)));

/** The statements that mention a B4 table or column, leaving out those an exception on the list allows. */
export function levelStatements(trace: readonly TracedStatement[], exceptions: readonly SwitchOffException[] = []): TracedStatement[] {
  const allowed = allowedBy(exceptions);
  return trace.filter((s) => B4_IDENTIFIERS.test(s.sql) && !allowed(s));
}

export function expectNoLevelTables(trace: readonly TracedStatement[], exceptions: readonly SwitchOffException[] = []): void {
  expect(levelStatements(trace, exceptions).map((s) => s.sql)).toEqual([]);
}

/**
 * The switch-off assertion: the actual trace equals the baseline, statement
 * for statement, apart from statements an exception passed here allows the
 * path to gain (each exception says which, and why; the list is reviewed in
 * the PR). Anything else, even one column in one select, fails.
 */
export function expectSameTrace(
  baseline: readonly TracedStatement[] | string,
  actual: readonly TracedStatement[],
  exceptions: readonly SwitchOffException[] = [],
): void {
  const allowed = allowedBy(exceptions);
  const kept = renumber(actual.filter((s) => !allowed(s)));
  const want = typeof baseline === "string" ? baseline : formatTrace(renumber(baseline));
  expect(formatTrace(kept)).toBe(want);
}

const PLACEHOLDER = /<(id|code|sha|stamp):\d+>/g;

/**
 * Numbers the placeholders again in order of first appearance. Leaving out an
 * allowed statement can leave out the first appearance of an id, which would
 * shift every later number; renumbering keeps "the same value" relations and
 * nothing else.
 */
export function renumber(trace: readonly TracedStatement[]): TracedStatement[] {
  const num = numberer();
  return trace.map((s) => ({
    sql: s.sql,
    params: JSON.parse(JSON.stringify(s.params).replace(PLACEHOLDER, (m, kind: string) => num(kind, m))) as unknown[],
  }));
}
