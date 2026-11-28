import { currentMonday, daysBetween, isRealDate } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { buildIdeaView, type FactorKey, type IdeaView } from "@/lib/cora/idea-view";

/**
 * A user's delivered ideas for one week, as the email, `/app` and the week
 * pages show them. Only the user's own delivered picks: another user's week,
 * or a week not yet delivered, gives nothing.
 */
export type WeekIdea = IdeaView & { position: number; setUp: boolean; confirmed: boolean };

type Row = {
  position: number;
  personal_score: number;
  reason: string;
  setup_marked_at: string | null;
  setup_confirmed_at: string | null;
  idea_code: string;
  id: string;
  title: string;
  category: string;
  description: string;
  heavy_use_for: string;
  playbook_md: string;
  paste_to_install: string;
  written_on: string;
  figures: Record<string, unknown>;
  f_hours: number | null;
  f_reach: number | null;
  f_ease: number | null;
  f_proof: number | null;
  f_surprise: number | null;
  score: number | null;
};

export async function weekIdeas(q: Query, userId: string, week: string, preface: string): Promise<WeekIdea[]> {
  if (!isRealDate(week)) return [];
  const rows = await q<Row>(
    `select k.position, k.personal_score, k.reason, k.setup_marked_at::text, k.setup_confirmed_at::text, k.idea_code,
            pp.id, pp.title, pp.category, pp.description, pp.heavy_use_for, pp.playbook_md, pp.paste_to_install, pp.written_on, pp.figures,
            pp.f_hours, pp.f_reach, pp.f_ease, pp.f_proof, pp.f_surprise, pp.score
     from picks k join pool_plays pp on pp.id = k.pool_play_id
     where k.user_id = $1 and k.week_of = $2 and not k.dry_run and k.delivered_at is not null
     order by k.position`,
    [userId, week],
  );
  return rows.map((r) => {
    const scores: Partial<Record<FactorKey, number | null>> = { hours: r.f_hours, reach: r.f_reach, ease: r.f_ease, proof: r.f_proof, surprise: r.f_surprise };
    const view = buildIdeaView(
      {
        id: r.id,
        title: r.title,
        category: r.category,
        description: r.description,
        heavyUseFor: r.heavy_use_for,
        playbookMd: r.playbook_md,
        pasteToInstall: r.paste_to_install,
        writtenOn: r.written_on,
        figures: r.figures,
        scores,
        score: r.score,
      },
      preface,
      { personalScore: r.personal_score, reason: r.reason, ideaCode: r.idea_code },
    );
    return { ...view, position: r.position, setUp: Boolean(r.setup_marked_at), confirmed: Boolean(r.setup_confirmed_at) };
  });
}

/** The newest week the user has delivered ideas for, or null. */
export async function latestWeek(q: Query, userId: string): Promise<string | null> {
  const [r] = await q<{ week: string }>(
    `select to_char(max(week_of), 'YYYY-MM-DD') as week from picks where user_id = $1 and not dry_run and delivered_at is not null`,
    [userId],
  );
  return r?.week ?? null;
}

/** "I set this up" (spec B.8 item 5): marks the pick at once; pressing again changes nothing. Only the user's own delivered pick. */
export async function markSetUp(q: Query, userId: string, week: string, position: number): Promise<boolean> {
  if (!isRealDate(week)) return false;
  const rows = await q(
    `update picks set setup_marked_at = now()
     where user_id = $1 and week_of = $2 and position = $3 and not dry_run and delivered_at is not null and setup_marked_at is null
     returning position`,
    [userId, week, position],
  );
  return rows.length > 0;
}

/**
 * The picks that count for bricks: the user's own (`$1`), delivered, never a
 * dry run. `bricks()` and `brickSeries()` both use it, so the count on `/app`
 * and the graph on `/app/history` always agree.
 */
const BRICK_PICKS = "from picks where user_id = $1 and not dry_run and delivered_at is not null";

/** Bricks: ideas the user marked as set up, and how many Zack confirmed (spec B.8 item 5). */
export async function bricks(q: Query, userId: string): Promise<{ marked: number; confirmed: number }> {
  const [r] = await q<{ marked: number | string; confirmed: number | string }>(
    `select count(*) filter (where setup_marked_at is not null) as marked, count(*) filter (where setup_confirmed_at is not null) as confirmed
     ${BRICK_PICKS}`,
    [userId],
  );
  return { marked: Number(r?.marked ?? 0), confirmed: Number(r?.confirmed ?? 0) };
}

/** Weeks in a Season (spec B.15), and the last Season with its own colour. */
export const SEASON_WEEKS = 26;
export const MAX_SEASON = 5;

/**
 * The brick graph on `/app/history` (spec B.15, plan B2 Unit 2).
 *
 * Week 1 is the Toronto week (Monday) of the member's first delivered list.
 * A brick is an idea marked set up, counted in the Toronto week its
 * `setup_marked_at` falls in. Every 26 weeks a new Season starts and the
 * count restarts at 0. `points` holds the running count for each week of the
 * current Season up to and including the current week.
 *
 * After Season 5: spec B.15 says the graph starts again "up to Season 5". We
 * read that as the Season number and colour stopping at 5 while the graph
 * still restarts every 26 weeks (week 131 is Season 5, week 1 of 26 again),
 * so the chart never grows past 26 weeks.
 */
export type BrickSeries = {
  /** 1-based week since the first delivered list. */
  weekIndex: number;
  season: number;
  /** 1–26: the current week within its Season. */
  weekOfSeason: number;
  points: number[];
  /** Bricks set up in the current week. */
  thisWeek: number;
  seasonBricks: number;
  /** Every brick ever: the same number as `bricks().marked`. */
  lifetime: number;
  /** Bricks Zack confirmed: the same number as `bricks().confirmed`. */
  confirmed: number;
};

/** The pure part of `brickSeries`: the first delivered week, each brick's set-up moment, now, and the confirmed count. */
export function buildBrickSeries(firstWeek: string, setUpAt: Date[], now: Date, confirmed = 0): BrickSeries {
  const weekIndexOf = (moment: Date) => Math.floor(daysBetween(firstWeek, currentMonday(moment)) / 7) + 1;
  const weekIndex = Math.max(1, weekIndexOf(now));
  const block = Math.floor((weekIndex - 1) / SEASON_WEEKS);
  const season = Math.min(block + 1, MAX_SEASON);
  const weekOfSeason = weekIndex - block * SEASON_WEEKS;
  const perWeek = new Array<number>(weekOfSeason).fill(0);
  let lifetime = 0;
  for (const at of setUpAt) {
    // A set-up can't come before week 1 or after now; clamp rather than drop.
    const w = Math.min(Math.max(1, weekIndexOf(at)), weekIndex);
    lifetime += 1;
    const inSeason = w - block * SEASON_WEEKS;
    if (inSeason >= 1) perWeek[inSeason - 1] += 1;
  }
  let running = 0;
  const points = perWeek.map((n) => (running += n));
  return { weekIndex, season, weekOfSeason, points, thisWeek: perWeek[weekOfSeason - 1], seasonBricks: running, lifetime, confirmed };
}

/** The member's brick graph as of `now`, or null before their first delivered list. */
export async function brickSeries(q: Query, userId: string, now: Date): Promise<BrickSeries | null> {
  const rows = await q<{ first_week: string | null; set_up_ms: number | string | null; confirmed: boolean }>(
    `select to_char(min(week_of) over (), 'YYYY-MM-DD') as first_week,
            case when setup_marked_at is null then null else extract(epoch from setup_marked_at) * 1000 end as set_up_ms,
            setup_confirmed_at is not null as confirmed
     ${BRICK_PICKS}`,
    [userId],
  );
  const firstWeek = rows[0]?.first_week;
  if (!firstWeek) return null;
  const setUpAt = rows.filter((r) => r.set_up_ms !== null).map((r) => new Date(Number(r.set_up_ms)));
  return buildBrickSeries(firstWeek, setUpAt, now, rows.filter((r) => r.confirmed).length);
}

/**
 * The graph's numbers in words, shown under it on `/app/history` and reused
 * by the Wednesday stats email: "Season 1 · week 7 of 26 · 5 bricks this
 * Season · 12 in all". Says "Season", never "Level" (spec B.15).
 */
export function brickSummary(s: BrickSeries): string {
  const bricks = `${s.seasonBricks} ${s.seasonBricks === 1 ? "brick" : "bricks"} this Season`;
  return `Season ${s.season} · week ${s.weekOfSeason} of ${SEASON_WEEKS} · ${bricks} · ${s.lifetime} in all`;
}

/** Every delivered idea, newest first (`/app/history`). */
export async function history(q: Query, userId: string): Promise<{ week: string; position: number; title: string; category: string; setUp: boolean; confirmed: boolean }[]> {
  const rows = await q<{ week: string; position: number; title: string; category: string; set_up: boolean; confirmed: boolean }>(
    `select to_char(k.week_of, 'YYYY-MM-DD') as week, k.position, pp.title, pp.category, k.setup_marked_at is not null as set_up, k.setup_confirmed_at is not null as confirmed
     from picks k join pool_plays pp on pp.id = k.pool_play_id
     where k.user_id = $1 and not k.dry_run and k.delivered_at is not null
     order by k.week_of desc, k.position`,
    [userId],
  );
  return rows.map((r) => ({ week: r.week, position: r.position, title: r.title, category: r.category, setUp: r.set_up, confirmed: r.confirmed }));
}
