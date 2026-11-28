import type { Query } from "@/lib/db-query";

/**
 * Cora change 15 (design spec B.16, B3 plan Unit 11): an idea counts as
 * adopted when the member's next profile shows it "used this week", with
 * "installed" and "used" reported separately.
 *
 * Each delivered idea's copied text carries its pick's "Roger idea ID"
 * (`picks.idea_code`, random per pick, set by the database: see
 * db/schema.sql). The member's agent notes it in its "Roger Upgrade Notes",
 * and Zack's profile reports it back in `past_ideas[].idea_id`. Each entry is
 * matched to the member's own delivered picks from the last 8 weeks: by that
 * ID first, then by the exact normalised title. An upgrade (`picks.kind =
 * 'upgrade'`) shares its title with something the member already runs, so it
 * is matched only by its exact ID, never by title.
 */

/** "R-" and 8 characters of the RFC 4648 base32 alphabet (db/schema.sql roger_idea_code()). */
export const IDEA_CODE = /^R-[A-Z2-7]{8}$/;

/** How far back a profile's past ideas reach (Zack's "Past ideas": the past 8 weeks). */
export const ADOPTION_WEEKS = 8;

/** Size limits on what a profile may hand us: entries read, and the length of each field. */
export const MAX_PAST_IDEAS = 50;
const MAX_FIELD = 300;

/** 0: nothing to stamp; 1: installed; 2: used (and so installed). */
export type Level = 0 | 1 | 2;

/**
 * Zack's statuses: "used this week ([N] times)"; "installed, not used this
 * week"; "changed by the member"; "removed"; "waiting on the member"; "could
 * not install ([what was missing])"; "skipped at the member's request".
 * Anything else stamps nothing. The negatives are tested first, since
 * "installed, not used this week" contains "used this week".
 */
export function statusLevel(status: unknown): Level {
  if (typeof status !== "string") return 0;
  const s = status.toLowerCase().slice(0, MAX_FIELD);
  if (/could\s*n[o']t\s+install|couldn['\u2019]t\s+install|not\s+install|removed|skipped|waiting/.test(s)) return 0;
  if (/not\s+used|unused/.test(s)) return 1;
  if (/\bused\b/.test(s)) return 2;
  if (/\binstalled\b|\bchanged\b/.test(s)) return 1;
  return 0;
}

/** Case, curly quotes, dashes and spacing folded, so a title retyped by an agent still matches. */
export function normaliseTitle(t: string): string {
  return t
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

type Entry = { code: string | null; title: string | null; level: Level };

/** The entries of `past_ideas` worth matching: an array of objects, at most MAX_PAST_IDEAS read, garbled ones dropped. */
export function readPastIdeas(parsed: unknown): Entry[] {
  const list = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).past_ideas : undefined;
  if (!Array.isArray(list)) return [];
  const out: Entry[] = [];
  for (const x of list.slice(0, MAX_PAST_IDEAS)) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const e = x as Record<string, unknown>;
    const level = statusLevel(e.status);
    if (level === 0) continue;
    const rawCode = typeof e.idea_id === "string" ? e.idea_id.trim().toUpperCase() : "";
    const code = rawCode.length <= 20 && IDEA_CODE.test(rawCode) ? rawCode : null;
    const title = typeof e.title === "string" && e.title.trim() && e.title.length <= MAX_FIELD ? normaliseTitle(e.title) : null;
    if (code || title) out.push({ code, title, level });
  }
  return out;
}

type Candidate = { week_of: string; position: number; idea_code: string; title: string; kind?: string };

/**
 * Which of the member's picks each entry names, and the highest level it
 * reached. An ID that names none of them falls back to the title, which never
 * matches an upgrade.
 */
export function matchPicks(entries: Entry[], picks: Candidate[]): Map<string, { week_of: string; position: number; level: Level }> {
  const out = new Map<string, { week_of: string; position: number; level: Level }>();
  const put = (p: Candidate, level: Level) => {
    const key = `${p.week_of}:${p.position}`;
    const was = out.get(key);
    if (!was || was.level < level) out.set(key, { week_of: p.week_of, position: p.position, level });
  };
  // Newest first, so a title delivered twice stamps the latest delivery.
  const newest = [...picks].sort((a, b) => (a.week_of < b.week_of ? 1 : a.week_of > b.week_of ? -1 : a.position - b.position));
  for (const e of entries) {
    const byCode = e.code ? newest.find((p) => p.idea_code === e.code) : undefined;
    const hit = byCode ?? (e.title ? newest.find((p) => p.kind !== "upgrade" && normaliseTitle(p.title) === e.title) : undefined);
    if (hit) put(hit, e.level);
  }
  return out;
}

/**
 * Stamps the member's picks from one accepted profile. Only the profile's own
 * member's delivered, non-dry-run picks, from the 8 weeks up to the profile's
 * week and delivered before the profile arrived, are ever touched. First
 * stamp wins: `installed_at` and `used_at` are set once, at the job clock
 * `now`, and a later profile never clears or moves them, so a resubmitted
 * profile changes nothing. `adoption_seen_at` is the time of the profile that
 * set a stamp. Test profiles stamp nothing. Returns how many picks changed.
 */
export async function recordAdoption(q: Query, profileId: string, now: Date = new Date()): Promise<number> {
  const [p] = await q<{ user_id: string; week_of: string; received_at: string; parsed: unknown }>(
    `select user_id, to_char(week_of, 'YYYY-MM-DD') as week_of, received_at::text, parsed
     from zack_profiles where id = $1 and status = 'accepted' and not is_test`,
    [profileId],
  );
  if (!p) return 0;
  const entries = readPastIdeas(p.parsed);
  if (!entries.length) return 0;
  const picks = await q<Candidate>(
    `select to_char(k.week_of, 'YYYY-MM-DD') as week_of, k.position, k.idea_code, pp.title, k.kind
     from picks k join pool_plays pp on pp.id = k.pool_play_id
     where k.user_id = $1 and not k.dry_run and k.delivered_at is not null and k.delivered_at <= $3::timestamptz
       and k.week_of <= $2::date and k.week_of >= $2::date - ${ADOPTION_WEEKS * 7}`,
    [p.user_id, p.week_of, p.received_at],
  );
  const matched = [...matchPicks(entries, picks).values()];
  if (!matched.length) return 0;
  // One statement; the guards are repeated here, so a pick can only gain a stamp it lacks.
  const rows = await q(
    `update picks k set
       installed_at = coalesce(k.installed_at, $3::timestamptz),
       used_at = case when m.level = 2 then coalesce(k.used_at, $3::timestamptz) else k.used_at end,
       adoption_seen_at = $4::timestamptz
     from jsonb_to_recordset($2::jsonb) as m(week_of date, position int, level int)
     where k.user_id = $1 and k.week_of = m.week_of and k.position = m.position and not k.dry_run and k.delivered_at is not null
       and (k.installed_at is null or (m.level = 2 and k.used_at is null))
     returning k.position`,
    [p.user_id, JSON.stringify(matched), now.toISOString(), p.received_at],
  );
  return rows.length;
}
