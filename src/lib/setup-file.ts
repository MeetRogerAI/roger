import { cacheLife, cacheTag } from "next/cache";
import { hasDb } from "@/lib/db";
import { query, type Query } from "@/lib/db-query";

/**
 * The starter setup file on /getstarted (spec B.11), with version history.
 *
 * - Saving always adds a version; nothing is ever overwritten (spec check 33).
 * - Publishing marks one version live; the public page shows only that one.
 * - Restoring copies an old version's text into a new version (unpublished).
 *
 * The public read is cached and tagged SETUP_FILE_TAG; the admin's publish
 * action calls updateTag(SETUP_FILE_TAG), so the page shows the new version on
 * its next view.
 */
export const SETUP_FILE_SLUG = "real-estate-starter";
export const SETUP_FILE_TAG = "setup-file";
export const MAX_SETUP_CHARS = 100_000;
export const MAX_NOTE_CHARS = 300;

export type SetupVersion = { version: number; bodyMd: string; note: string; savedBy: string; published: boolean; createdAt: string };
export type PublishedSetup = { version: number; bodyMd: string; updatedAt: string };

type Row = { version: number; body_md: string; note: string; saved_by: string; published: boolean; created_at: string };
const toVersion = (r: Row): SetupVersion => ({ version: r.version, bodyMd: r.body_md, note: r.note, savedBy: r.saved_by, published: r.published, createdAt: r.created_at });

export type SaveError = "empty" | "too_long" | "no_note";

export function checkVersion(bodyMd: string, note: string): SaveError | null {
  if (!bodyMd.trim()) return "empty";
  if (bodyMd.length > MAX_SETUP_CHARS) return "too_long";
  if (!note.trim()) return "no_note";
  return null;
}

const isUniqueViolation = (e: unknown) => /unique|duplicate/i.test((e as Error)?.message ?? "");

/** Adds the next version. Two saves at once each get their own number: the loser of a race retries. */
export async function saveVersion(q: Query, o: { bodyMd: string; note: string; savedBy: string }, slug = SETUP_FILE_SLUG): Promise<number> {
  const bad = checkVersion(o.bodyMd, o.note);
  if (bad) throw new Error(`setup file not saved: ${bad}`);
  for (let attempt = 0; ; attempt++) {
    try {
      const [r] = await q<{ version: number }>(
        `insert into setup_files (slug, version, body_md, note, saved_by)
         select $1, coalesce(max(version), 0) + 1, $2, $3, $4 from setup_files where slug = $1
         returning version`,
        [slug, o.bodyMd, o.note.trim().slice(0, MAX_NOTE_CHARS), o.savedBy.slice(0, 200)],
      );
      return r.version;
    } catch (e) {
      if (attempt < 4 && isUniqueViolation(e)) continue;
      throw e;
    }
  }
}

/**
 * Makes one version the live one, in one statement: the file's single row in
 * setup_file_live points at it, so there is never a moment with two live
 * versions or none, and two publishes at once simply leave the later one live.
 * Returns false for a version that does not exist.
 */
export async function publishVersion(q: Query, version: number, slug = SETUP_FILE_SLUG): Promise<boolean> {
  const rows = await q(
    `insert into setup_file_live (slug, version, published_at)
     select slug, version, now() from setup_files where slug = $1 and version = $2
     on conflict (slug) do update set version = excluded.version, published_at = excluded.published_at
     returning version`,
    [slug, version],
  );
  return rows.length > 0;
}

/** Copies an old version into a new one, unpublished. Returns the new number, or null if there is no such version. */
export async function restoreVersion(q: Query, version: number, savedBy: string, slug = SETUP_FILE_SLUG): Promise<number | null> {
  const old = await readVersion(q, version, slug);
  if (!old) return null;
  return saveVersion(q, { bodyMd: old.bodyMd, note: `Restored from version ${version}`, savedBy }, slug);
}

const columns = `f.version, f.body_md, f.note, f.saved_by, (l.version is not null) as published,
  to_char(f.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at`;
const fromFiles = `from setup_files f left join setup_file_live l on l.slug = f.slug and l.version = f.version`;

export async function readVersion(q: Query, version: number, slug = SETUP_FILE_SLUG): Promise<SetupVersion | null> {
  const [r] = await q<Row>(`select ${columns} ${fromFiles} where f.slug = $1 and f.version = $2`, [slug, version]);
  return r ? toVersion(r) : null;
}

/** Every version, newest first. */
export async function listVersions(q: Query, slug = SETUP_FILE_SLUG): Promise<SetupVersion[]> {
  const rows = await q<Row>(`select ${columns} ${fromFiles} where f.slug = $1 order by f.version desc`, [slug]);
  return rows.map(toVersion);
}

/** The live version, or null when nothing is published. */
export async function readPublished(q: Query, slug = SETUP_FILE_SLUG): Promise<PublishedSetup | null> {
  const [r] = await q<Row>(`select ${columns} from setup_file_live l join setup_files f on f.slug = l.slug and f.version = l.version where l.slug = $1`, [slug]);
  return r ? { version: r.version, bodyMd: r.body_md, updatedAt: r.created_at } : null;
}

/**
 * The public read, cached and tagged. A database error is thrown, never
 * cached as "nothing published": callers catch it (see
 * src/components/app/getstarted-parts.tsx). With no database at all the
 * answer really is "nothing", and that is cached.
 */
export async function getPublishedSetupFile(): Promise<PublishedSetup | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(SETUP_FILE_TAG);
  if (!hasDb()) return null;
  return readPublished(query);
}
