import { HAS_CARD_OR_SPONSORED_SQL } from "@/lib/billing/has-card";
import { addDays } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { COVERS_WEEK } from "./deliver";
import type { UserContext } from "./eligible";
import type { Evidence } from "./score";
import type { ListFacts } from "./who-gets-a-list";

/**
 * What Cora reads from the database. Evidence comes only from shareable,
 * unflagged plays, so a "matching only" play counts toward "already runs" and
 * never toward Reach, Proof or the medians. One person is one contributor: a
 * seed contributor linked to a real account counts as that account.
 */
export type PoolRow = {
  id: string;
  title: string;
  category: string;
  job: string;
  heavy_use_for: string;
  description: string;
  who_can_use_it: string;
  requires: { connections: string[]; features: string[] };
  active: boolean;
};

type EvidenceRow = { pool_play_id: string; contributor: string; week_of: string; set_: string; body: Record<string, unknown> };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");

function toEvidence(r: EvidenceRow): Evidence {
  const b = r.body;
  const size = (b.size ?? {}) as Record<string, unknown>;
  const conf = str(b.confidence);
  const basis = str(b.basis);
  const origin = str(b.origin);
  return {
    contributor: r.contributor,
    weekOf: r.week_of,
    set: r.set_ === "B" ? "B" : r.set_ === "runner_up" ? "runner_up" : "A",
    origin: origin === "roger_idea" || origin === "own_upgraded" || origin === "own" ? origin : "",
    minutes: num(b.minutes_saved_each),
    currentHours: num(b.current_hours_week),
    rangeLow: num(b.range_low),
    rangeHigh: num(b.range_high),
    heavyHours: num(b.heavy_hours_week),
    basis: basis === "Actual" || basis === "Implied" ? basis : null,
    confidence: conf === "High" || conf === "Medium" || conf === "Low" ? conf : null,
    weeksRunning: num(b.weeks_running),
    steps: num(size.steps),
    connections: num(size.connections),
    setupQuestions: num(size.setup_questions),
  };
}

/** Every pool play with its shareable evidence up to `week`. */
export async function loadPool(q: Query, week: string): Promise<{ rows: PoolRow[]; evidence: Map<string, Evidence[]>; bodies: Map<string, Record<string, unknown>[]> }> {
  const rows = await q<PoolRow>(
    `select id, title, category, job, heavy_use_for, description, '' as who_can_use_it, '{"connections":[],"features":[]}'::jsonb as requires, active from pool_plays order by id`,
  );
  const ev = await q<EvidenceRow>(
    `select p.pool_play_id, coalesce(sc.user_id::text, p.user_id::text, 'seed:' || p.contributor_id::text) as contributor,
            to_char(p.week_of, 'YYYY-MM-DD') as week_of, p.set_, p.body
     from plays p join runs r on r.id = p.run_id left join seed_contributors sc on sc.id = p.contributor_id left join users su on su.id = r.user_id
     where p.pool_play_id is not null and p.shareable and p.flag is null and not r.is_test and r.status in ('accepted', 'flagged') and p.week_of <= $1
       -- Only people who still share: a user who stopped sharing stops counting, and their text is never used.
       and r.sharing = 'share' and (r.contributor_id is not null or su.sharing = 'share')
     order by p.week_of, p.id`,
    [week],
  );
  const evidence = new Map<string, Evidence[]>();
  const bodies = new Map<string, Record<string, unknown>[]>();
  for (const r of ev) {
    evidence.set(r.pool_play_id, [...(evidence.get(r.pool_play_id) ?? []), toEvidence(r)]);
    bodies.set(r.pool_play_id, [...(bodies.get(r.pool_play_id) ?? []), r.body]);
  }
  // Who can use it and what it requires: from the newest evidence that states them.
  for (const p of rows) {
    const bs = bodies.get(p.id) ?? [];
    const last = [...bs].reverse();
    p.who_can_use_it = str(last.find((b) => str(b.who_can_use_it))?.who_can_use_it);
    const req = last.find((b) => b.requires && typeof b.requires === "object")?.requires as { connections?: unknown; features?: unknown } | undefined;
    p.requires = {
      connections: Array.isArray(req?.connections) ? req.connections.filter((x): x is string => typeof x === "string") : [],
      features: Array.isArray(req?.features) ? req.features.filter((x): x is string => typeof x === "string") : [],
    };
  }
  return { rows, evidence, bodies };
}

const LEVEL: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

/**
 * v1.1 Step 1.3: a pool play's text comes from its best evidence: the highest
 * confidence with an Actual basis, then the most complete playbook. The title
 * is the plainest under eight words. Heavy use for: the most common.
 */
export function bestContent(bodies: Record<string, unknown>[]): { title: string; description: string; playbook_md: string; paste_to_install: string; heavy_use_for: string; job: string } | null {
  if (!bodies.length) return null;
  const rank = (b: Record<string, unknown>) => (LEVEL[str(b.confidence)] ?? 0) * 10 + (str(b.basis) === "Actual" ? 5 : 0);
  const best = [...bodies].sort((a, b) => rank(b) - rank(a) || str(b.playbook_md).length - str(a.playbook_md).length)[0];
  const titles = bodies.map((b) => str(b.title)).filter((t) => t && t.split(/\s+/).length < 8);
  const title = titles.sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? str(best.title);
  const counts = new Map<string, number>();
  for (const b of bodies) {
    const h = str(b.heavy_use_for).trim();
    if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const heavy = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? str(best.heavy_use_for);
  return { title, description: str(best.description), playbook_md: str(best.playbook_md), paste_to_install: str(best.install_notes), heavy_use_for: heavy, job: str(best.job) };
}

export type CoraUser = {
  id: string;
  email: string;
  facts: ListFacts;
  /** Categories the user's runs, profile or quiz show. */
  categories: Set<string>;
  /** The user's role and kinds of work, from the profile or the quiz. */
  role: string;
  friction: string[];
  setup: { connections: string[]; features: string[] } | null;
  ctx: UserContext;
  ownPlayTitles: string[];
};

type UserRow = {
  id: string;
  email: string;
  status: ListFacts["status"];
  plan: ListFacts["plan"];
  sponsored: boolean;
  sharing: ListFacts["sharing"];
  hold_reason: string | null;
  access_ended: boolean;
  run_arrived: boolean;
  ordered: boolean;
  has_card: boolean;
  quiz: Record<string, unknown>;
  profile: Record<string, unknown> | null;
};

/**
 * The users Cora considers this week, with what it needs to pick for each.
 * Access is read as the deliverable rule reads it (deliver.ts COVERS_WEEK):
 * ended for this week when it ends on or before the week's Monday (Toronto
 * date), or before the job's clock (`now`, so an "as of" run reads the same).
 * A member held for an unpaid renewal is picked for (the list waits, and
 * paying releases it, as the renewal emails promise); a held first charge is
 * not.
 */
export async function loadUsers(q: Query, week: string, o: { onlyIds?: string[]; now?: Date } = {}): Promise<CoraUser[]> {
  const rows = await q<UserRow>(
    `select u.id, u.email, u.status, u.plan, (u.sponsor_id is not null) as sponsored, u.sharing, u.hold_reason,
            (u.access_ends_at is not null and (not ${COVERS_WEEK("$1::date")} or u.access_ends_at < $3::timestamptz)) as access_ended,
            exists (select 1 from runs r where r.user_id = u.id and r.week_of = $1 and not r.is_test and r.status in ('received', 'accepted', 'flagged')) as run_arrived,
            exists (select 1 from orders o where o.user_id = u.id and o.week_of = $1 and o.status in ('ordered', 'charged')) as ordered,
            ${HAS_CARD_OR_SPONSORED_SQL("u")} as has_card,
            u.profile as quiz,
            (select zp.parsed from zack_profiles zp where zp.user_id = u.id and zp.status = 'accepted' and not zp.is_test order by zp.week_of desc limit 1) as profile
     from users u
     where (u.status in ('trial', 'active', 'cancelled') or (u.status = 'held' and u.hold_reason = 'renewal_unpaid'))
       and ($2::uuid[] is null or u.id = any($2::uuid[]))
     order by u.id`,
    [week, o.onlyIds ?? null, (o.now ?? new Date()).toISOString()],
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const since = addDays(week, -28);
  const own = await q<{ user_id: string; pool_play_id: string | null; title: string; category: string; recent: boolean }>(
    `select coalesce(p.user_id, sc.user_id) as user_id, p.pool_play_id, p.title, p.category, p.week_of > $2 as recent
     from plays p left join seed_contributors sc on sc.id = p.contributor_id
     where coalesce(p.user_id, sc.user_id) = any($1::uuid[])`,
    [ids, since],
  );
  // Sent means delivered: picks from a failed week, a held list or a declined charge were never seen.
  const sent = await q<{ user_id: string; pool_play_id: string }>(
    `select user_id, pool_play_id from picks where user_id = any($1::uuid[]) and week_of < $2 and not dry_run and delivered_at is not null`,
    [ids, week],
  );
  // A lasting record of what each person contributed, which survives their plays being replaced (spec check 13).
  const contributed = await q<{ user_id: string; pool_play_id: string }>(
    `select u.id as user_id, c.pool_play_id from unnest($1::uuid[]) as u(id)
     join pool_play_contributors c on c.contributor = u.id::text
       or c.contributor in (select 'seed:' || sc.id::text from seed_contributors sc where sc.user_id = u.id)`,
    [ids],
  );

  return rows.map((r) => {
    const mine = own.filter((x) => x.user_id === r.id);
    const p = (r.profile ?? {}) as Record<string, unknown>;
    const work = (p.work ?? {}) as Record<string, unknown>;
    const setup = p.setup as { connections?: unknown; features?: unknown } | undefined;
    const quizHelp = Array.isArray(r.quiz?.help) ? (r.quiz.help as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const profileCats = Array.isArray(work.categories) ? (work.categories as { category?: unknown }[]).map((c) => str(c.category)).filter(Boolean) : [];
    const pastIdeas = Array.isArray(p.past_ideas) ? (p.past_ideas as Record<string, unknown>[]) : [];
    const declined = new Set(pastIdeas.filter((x) => /removed|skipped/i.test(str(x.status))).map((x) => str(x.idea_id)).filter(Boolean));
    return {
      id: r.id,
      email: r.email,
      facts: {
        status: r.status,
        plan: r.plan,
        sponsored: r.sponsored,
        sharing: r.sharing,
        holdReason: r.hold_reason,
        runArrived: r.run_arrived,
        ordered: r.ordered,
        charged: false,
        accessEnded: r.access_ended,
        hasCard: r.has_card,
      },
      categories: new Set([...mine.filter((x) => x.recent).map((x) => x.category), ...profileCats, ...quizHelp]),
      role: [str(work.role), ...(Array.isArray(work.kinds_of_work) ? (work.kinds_of_work as unknown[]).map(str) : []), str(r.quiz?.role)].filter(Boolean).join("; "),
      friction: Array.isArray(p.friction) ? (p.friction as Record<string, unknown>[]).map((f) => str(f.job)).filter(Boolean) : [],
      setup: setup
        ? {
            connections: Array.isArray(setup.connections) ? (setup.connections as unknown[]).map(str).filter(Boolean) : [],
            features: Array.isArray(setup.features) ? (setup.features as unknown[]).map(str).filter(Boolean) : [],
          }
        : null,
      ctx: {
        alreadyRuns: new Set(mine.filter((x) => x.recent && x.pool_play_id).map((x) => x.pool_play_id!)),
        ownContributions: new Set([...mine.filter((x) => x.pool_play_id).map((x) => x.pool_play_id!), ...contributed.filter((x) => x.user_id === r.id).map((x) => x.pool_play_id)]),
        sent: new Set(sent.filter((s) => s.user_id === r.id).map((s) => s.pool_play_id)),
        declined,
      },
      ownPlayTitles: mine.map((x) => x.title),
    };
  });
}

/** A user "could use" a play when they work in its category, or its heavy-use role matches theirs (Cora 2.0 change 4, in code). */
export function couldUse(u: Pick<CoraUser, "categories" | "role">, p: Pick<PoolRow, "category" | "heavy_use_for">): boolean {
  if (u.categories.has(p.category)) return true;
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
  const role = words(u.role);
  return [...words(p.heavy_use_for)].some((w) => role.has(w));
}

/** Change 9: the user's setup has every connection and feature the play requires. Without a profile, assume yes. */
export function installable(u: Pick<CoraUser, "setup">, p: Pick<PoolRow, "requires">): boolean {
  if (!u.setup) return true;
  const has = (list: string[], need: string) => list.some((x) => x.toLowerCase() === need.toLowerCase());
  return p.requires.connections.every((c) => has(u.setup!.connections, c)) && p.requires.features.every((f) => has(u.setup!.features, f));
}
