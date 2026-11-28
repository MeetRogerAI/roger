import { addDays, isRealDate } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { normalise } from "@/lib/intake/privacy-patterns";
import { NOTE_MAX, REPLY_MAX } from "./limits";

/**
 * Stored feedback (B3 plan Unit 5, origin R21, spec B.16 "Feedback"): a
 * member's note on a list week, and the replies admins paste onto a member's
 * record. Both live in `member_feedback`, go with the account (cascade) and
 * are erased by retention with the runs (src/lib/housekeeping/retention.ts).
 *
 * THE TEXT IS UNTRUSTED DATA, whoever typed it:
 * - Never render it as HTML or markdown: plain text in React only (escaped),
 *   with `whitespace-pre-wrap` for line breaks. No dangerouslySetInnerHTML.
 * - The review bot (Unit 7) may read it only inside a dataTag() element, as
 *   evidence, never as instructions.
 * - It must NEVER reach a public place: no pull request title, body, commit
 *   message or branch name (Unit 9), no public page, no email to anyone but
 *   the member. Proposals keep a reference (the feedback id), never a copy.
 * - The admin log records that feedback was added, never its text.
 *
 * No agent surface, deliberately: notes are a human channel. A note written
 * by the member's agent would be indistinguishable from evidence the bot
 * should weigh, so there is no API route for them.
 */

export { NOTE_MAX, REPLY_MAX };

export type Done = { ok: true; message: string } | { ok: false; message: string };
const ok = (message: string): Done => ({ ok: true, message });
type Refused = { ok: false; message: string };
const no = (message: string): Refused => ({ ok: false, message });

const length = (s: string) => [...s].length;

/** NFKC, zero-width and direction controls removed (as intake does), CRLF folded, trimmed. */
export function cleanText(raw: string): string {
  return normalise(raw).replace(/\r\n?/g, "\n").trim();
}

/** The member's note for a list week, or null. Only ever the signed-in member's own. */
export async function memberNote(q: Query, userId: string, week: string): Promise<string | null> {
  if (!isRealDate(week)) return null;
  const [r] = await q<{ body: string }>(`select body from member_feedback where user_id = $1 and week_of = $2::date and source = 'member_note'`, [userId, week]);
  return r?.body ?? null;
}

/**
 * Saves (or replaces) the member's note for a week they got ideas in: a
 * delivered, non-dry-run pick of theirs that week. One row per member and
 * week (the partial unique index), edited in place. On success, `note` is
 * the text as stored (normalised), for the form to show.
 */
export async function saveMemberNote(q: Query, userId: string, week: string, raw: string): Promise<{ ok: true; message: string; note: string } | Refused> {
  const body = cleanText(raw);
  if (!body) return no("Write your note first.");
  if (length(body) > NOTE_MAX) return no("Keep your note to 2,000 characters or fewer.");
  if (!isRealDate(week)) return no("You can leave a note only on a week you got ideas.");
  const rows = await q(
    `insert into member_feedback (user_id, week_of, source, body)
     select $1, $2::date, 'member_note', $3
     where exists (select 1 from picks p where p.user_id = $1 and p.week_of = $2::date and not p.dry_run and p.delivered_at is not null)
     on conflict (user_id, week_of) where source = 'member_note' do update set body = excluded.body, updated_at = now()
     returning id`,
    [userId, week, body],
  );
  return rows.length ? { ok: true, message: "Note saved.", note: body } : no("You can leave a note only on a week you got ideas.");
}

/** Deletes the member's own note for a week. */
export async function deleteMemberNote(q: Query, userId: string, week: string): Promise<Done> {
  if (!isRealDate(week)) return no("There’s no note to delete.");
  const rows = await q(`delete from member_feedback where user_id = $1 and week_of = $2::date and source = 'member_note' returning id`, [userId, week]);
  return rows.length ? ok("Note deleted.") : no("There’s no note to delete.");
}

/** The Monday of the week a calendar date is in. */
function mondayOf(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

/**
 * An admin pastes a member's emailed reply onto their record. `receivedOn`
 * is the date it came in; the row is filed under that date's week (the list
 * the reply is most likely about). Logged as `add_feedback`, with no text,
 * in the same statement as the insert, so a reply never exists without its
 * log row (and no log row without a reply).
 */
export async function addReply(q: Query, by: string, userId: string, o: { receivedOn: string; body: string }): Promise<Done> {
  const body = cleanText(o.body);
  if (!body) return no("Paste the reply first.");
  if (length(body) > REPLY_MAX) return no("A reply can be at most 4,000 characters.");
  if (!isRealDate(o.receivedOn)) return no("Enter the date the reply came in.");
  const week = mondayOf(o.receivedOn);
  const [r] = await q<{ id: string }>(
    `with f as (
       insert into member_feedback (user_id, week_of, source, body, entered_by)
       select id, $2::date, 'admin_reply', $3, $4 from users where id = $1
       returning id, user_id, week_of
     ), a as (
       insert into admin_actions (admin_email, user_id, action, detail)
       select $4, f.user_id, 'add_feedback', jsonb_build_object('feedbackId', f.id, 'weekOf', to_char(f.week_of, 'YYYY-MM-DD'), 'length', $5::int) from f
     )
     select id from f`,
    [userId, week, body, by, length(body)],
  );
  if (!r) return no("No such user.");
  return ok("Reply added.");
}

export type Feedback = { id: string; source: "member_note" | "admin_reply"; weekOf: string | null; body: string; enteredBy: string | null; createdAt: string; updatedAt: string };

/** Every note and reply for one member, newest first (the admin user page). */
export async function feedbackFor(q: Query, userId: string, limit = 100): Promise<Feedback[]> {
  return q<Feedback>(
    `select id, source, to_char(week_of, 'YYYY-MM-DD') as "weekOf", body, entered_by as "enteredBy", created_at::text as "createdAt", updated_at::text as "updatedAt"
     from member_feedback where user_id = $1 order by created_at desc, id desc limit $2`,
    [userId, limit],
  );
}
