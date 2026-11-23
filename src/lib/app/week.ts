import { isRealDate } from "@/lib/clock";
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
    `select k.position, k.personal_score, k.reason, k.setup_marked_at::text, k.setup_confirmed_at::text,
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
      { personalScore: r.personal_score, reason: r.reason },
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

/** Bricks: ideas the user marked as set up, and how many Zack confirmed (spec B.8 item 5). */
export async function bricks(q: Query, userId: string): Promise<{ marked: number; confirmed: number }> {
  const [r] = await q<{ marked: number | string; confirmed: number | string }>(
    `select count(*) filter (where setup_marked_at is not null) as marked, count(*) filter (where setup_confirmed_at is not null) as confirmed
     from picks where user_id = $1 and not dry_run and delivered_at is not null`,
    [userId],
  );
  return { marked: Number(r?.marked ?? 0), confirmed: Number(r?.confirmed ?? 0) };
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
