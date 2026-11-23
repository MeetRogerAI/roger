import type { Query } from "@/lib/db-query";

/** The Runs page (spec B.12): every run with its status; open any to read it. */
export type RunListItem = { id: string; who: string; userId: string | null; weekOf: string; route: string; agent: string; sharing: string; status: string; reason: string; isTest: boolean; receivedAt: string; plays: number };

export async function listRuns(q: Query, o: { status?: string; userId?: string; limit?: number } = {}): Promise<RunListItem[]> {
  return q<RunListItem>(
    `select r.id, coalesce(u.email, 'seed: ' || sc.label) as who, r.user_id as "userId", to_char(r.week_of, 'YYYY-MM-DD') as "weekOf", r.route, r.agent, r.sharing,
            r.status, r.reason, r.is_test as "isTest", r.received_at::text as "receivedAt", (select count(*)::int from plays p where p.run_id = r.id) as plays
     from runs r left join users u on u.id = r.user_id left join seed_contributors sc on sc.id = r.contributor_id
     where ($1::text is null or r.status = $1) and ($2::uuid is null or r.user_id = $2)
     order by r.received_at desc limit $3`,
    [o.status ?? null, o.userId ?? null, o.limit ?? 200],
  );
}

export type RunDetail = RunListItem & { rawText: string; parsedBy: string | null; zackVersion: string; plays: number; playRows: { id: string; set: string; position: number; title: string; category: string; shareable: boolean; flag: unknown; inPool: boolean }[] };

export async function runDetail(q: Query, id: string): Promise<RunDetail | null> {
  const [r] = await q<RunListItem & { rawText: string; parsedBy: string | null; zackVersion: string }>(
    `select r.id, coalesce(u.email, 'seed: ' || sc.label) as who, r.user_id as "userId", to_char(r.week_of, 'YYYY-MM-DD') as "weekOf", r.route, r.agent, r.sharing,
            r.status, r.reason, r.is_test as "isTest", r.received_at::text as "receivedAt", 0 as plays, r.raw_text as "rawText", r.parsed_by as "parsedBy", r.zack_version as "zackVersion"
     from runs r left join users u on u.id = r.user_id left join seed_contributors sc on sc.id = r.contributor_id where r.id = $1`,
    [id],
  );
  if (!r) return null;
  const playRows = await q<RunDetail["playRows"][number]>(
    `select id, set_ as set, position, title, category, shareable, flag, (pool_play_id is not null) as "inPool" from plays where run_id = $1 order by set_, position`,
    [id],
  );
  return { ...r, plays: playRows.length, playRows };
}
