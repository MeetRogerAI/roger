import type { Query } from "@/lib/db-query";
import { ZACK_CATEGORIES } from "@/lib/intake/validate";
import { sendToUser, type MailDeps } from "@/lib/mail/send";
import { rulesChangedEmail, runDeletedEmail, sharingChangedEmail } from "@/lib/mail/templates/zack-page";
import type { ZackSettings } from "./rules";

/**
 * The /app/zack controls (spec B.5, "The controls page"). Every change is
 * saved with its time in zack_settings_history and applies from the next
 * fetch. The rules reach an AI agent with wide access, so the free text is
 * held to restrictions only: no links, addresses or sending verbs.
 */
export const SENSITIVE_SUBJECTS = ["health", "legal matters", "money", "family", "children"] as const;
export const MAX_NEVER_WORDS = 100;
export const MAX_EXTRA_RULES = 2000;

export type Sharing = "share" | "match_only" | "off";
export type SettingsErrors = Partial<Record<keyof ZackSettings, string>>;

/**
 * Words that move data or reach further. A clause that forbids ("never send",
 * "don't read my email", "skip posts about...") is a restriction and allowed;
 * anything else with these words is refused. Best effort only: the member is
 * also emailed whenever what Zack is told changes.
 */
const SENDING =
  /\b(?:send|sends|sent|sending|deliver\w*|post|posts|posted|posting|upload\w*|forward\w*|e-?mail(?:s|ed|ing)?|mail(?:s|ed|ing)?|share|shares|shared|sharing|cop(?:y|ies|ied|ying)|export\w*|publish\w*|transfer\w*|transmit\w*|submit\w*|attach\w*|paste\w*|message\w*|notify\w*|push\w*|webhooks?|fetch\w*|curl|sync\w*|include\w*|add|adds|added|read|reads|reading|collect\w*|access\w*|look\w*|open\w*|search\w*|scan\w*|extend\w*|widen\w*|expand\w*)\b/i;
const NEGATED_CLAUSE = /^(?:never|don't|do not|no|not|skip|exclude|leave out|avoid|drop|omit|stop)\b/i;
const LINK = /(?:[a-z]+:\/\/|\/\/|www\.|\b[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b|\b\d{1,3}(?:\.\d{1,3}){3}\b|\[[0-9a-f:]+\])/i;
const EMAIL = /[^\s@]+@[^\s@]+/;

/** Zero-width and look-alike characters hide words from every check, so text is flattened first. */
function flatten(s: string): string {
  return s.normalize("NFKC").replace(/[​-‏‪-‮⁠-⁤﻿]/g, "");
}

/** Every clause that uses a sending or reaching word must be one that forbids. */
function widens(text: string): boolean {
  return flatten(text)
    .split(/[.;:!?\n]+|,\s*(?:and|but|then|also)\b|\b(?:and then|but|also|then)\b/i)
    .map((c) => c.trim())
    .some((c) => SENDING.test(c) && !NEGATED_CLAUSE.test(c));
}

export function validateSettings(input: {
  skipCategories: string[];
  skipSensitive: string[];
  outlineCategories: string[];
  neverWords: string;
  playsPerWeek: string;
  extraRules: string;
}): { ok: true; settings: ZackSettings } | { ok: false; errors: SettingsErrors } {
  const errors: SettingsErrors = {};
  const cats = new Set<string>(ZACK_CATEGORIES);
  const skipCategories = [...new Set(input.skipCategories)].filter((c) => cats.has(c));
  const outlineCategories = [...new Set(input.outlineCategories)].filter((c) => cats.has(c));
  const skipSensitive = [...new Set(input.skipSensitive)].filter((s) => (SENSITIVE_SUBJECTS as readonly string[]).includes(s));

  const neverWords = [
    ...new Set(
      input.neverWords
        .split(/\r?\n/)
        .map((w) => flatten(w).replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  ];
  // Entries are names, not sentences: they go into the agent's instructions too.
  const notAName = neverWords.find((w) => w.split(" ").length > 5 || /[;:!?]|[a-z]{3,}\.\s/.test(w) || LINK.test(w) || EMAIL.test(w) || SENDING.test(w));
  if (neverWords.length > MAX_NEVER_WORDS) errors.neverWords = `Up to ${MAX_NEVER_WORDS} words or names. This list has ${neverWords.length}.`;
  else if (neverWords.some((w) => w.length > 80)) errors.neverWords = "Each entry can be up to 80 characters.";
  else if (notAName) errors.neverWords = `“${notAName.slice(0, 40)}” isn’t a word or name. Put one word or name on each line, with no addresses or instructions.`;

  const plays = Number(input.playsPerWeek);
  if (!Number.isInteger(plays) || plays < 1 || plays > 4) errors.playsPerWeek = "Choose 1 to 4 plays a week.";

  const extraRules = flatten(input.extraRules).replace(/\r\n?/g, "\n").trim();
  if (extraRules.length > MAX_EXTRA_RULES) errors.extraRules = `Up to ${MAX_EXTRA_RULES.toLocaleString("en-US")} characters. This has ${extraRules.length.toLocaleString("en-US")}.`;
  else if (LINK.test(extraRules) || EMAIL.test(extraRules))
    errors.extraRules = "Extra rules can only narrow what Zack collects, so they can't contain web or email addresses.";
  else if (widens(extraRules))
    errors.extraRules =
      "Extra rules can only narrow what Zack collects. Write each one as something to leave out, starting with words like “Never”, “Don’t” or “Skip”.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, settings: { skipCategories, skipSensitive, outlineCategories, neverWords, playsPerWeek: plays, extraRules } };
}

/** Saves the settings and a history row in one statement. Emails the user when their extra rules or never-include list change. */
export async function saveZackSettings(q: Query, user: { id: string; email: string }, s: ZackSettings, deps: MailDeps = {}): Promise<void> {
  const [r] = await q<{ rules_changed: boolean; changed_at: string }>(
    `with before as (select extra_rules, never_words from zack_settings where user_id = $1),
     saved as (
       insert into zack_settings (user_id, skip_categories, skip_sensitive, never_words, outline_categories, plays_per_week, extra_rules, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (user_id) do update set skip_categories = excluded.skip_categories, skip_sensitive = excluded.skip_sensitive,
         never_words = excluded.never_words, outline_categories = excluded.outline_categories, plays_per_week = excluded.plays_per_week,
         extra_rules = excluded.extra_rules, updated_at = now()
       returning user_id
     ),
     hist as (
       insert into zack_settings_history (user_id, sharing, skip_categories, skip_sensitive, never_words, outline_categories, plays_per_week, extra_rules)
       select $1, u.sharing, $2, $3, $4, $5, $6, $7 from users u where u.id = $1
       returning changed_at
     )
     select (coalesce((select extra_rules from before), '') <> $7 or coalesce((select never_words from before), '{}') <> $4::text[]) as rules_changed,
            (select changed_at from hist)::text as changed_at from saved`,
    [user.id, s.skipCategories, s.skipSensitive, s.neverWords, s.outlineCategories, s.playsPerWeek, s.extraRules],
  );
  if (r?.rules_changed) {
    // Someone with the session could otherwise change what the user's agent does unnoticed.
    await sendToUser({ id: user.id, email: user.email }, "zack_rules_changed", r.changed_at, rulesChangedEmail({ rules: s.extraRules, neverWords: s.neverWords }), deps).catch((e) =>
      console.error("[zack] rules email failed", e instanceof Error ? e.message : e),
    );
  }
}

/** Sharing takes effect for sharing at once (spec B.5); the price effect follows the contributor rule (Unit 14). */
export async function setSharing(
  q: Query,
  user: { id: string; email: string },
  sharing: Sharing,
  note: { priceLine: string | null },
  deps: MailDeps = {},
): Promise<boolean> {
  const rows = await q<{ changed_at: string }>(
    `with u as (update users set sharing = $2 where id = $1 and sharing <> $2 returning id),
     hist as (
       insert into zack_settings_history (user_id, sharing, skip_categories, skip_sensitive, never_words, outline_categories, plays_per_week, extra_rules)
       select $1, $2, coalesce(z.skip_categories, '{}'), coalesce(z.skip_sensitive, '{}'), coalesce(z.never_words, '{}'),
              coalesce(z.outline_categories, '{}'), coalesce(z.plays_per_week, 4), coalesce(z.extra_rules, '')
       from u left join zack_settings z on z.user_id = u.id
       returning changed_at
     )
     select changed_at::text from hist`,
    [user.id, sharing],
  );
  if (!rows.length) return false;
  await sendToUser({ id: user.id, email: user.email }, "sharing_changed", rows[0].changed_at, sharingChangedEmail({ sharing, priceLine: note.priceLine }), deps).catch((e) =>
    console.error("[zack] sharing email failed", e instanceof Error ? e.message : e),
  );
  return true;
}

/**
 * Deletes one of the user's own runs (spec B.5 run history). The run's text is
 * erased and plays not yet in the pool are removed; plays already pooled stay
 * there in anonymous form. Another user's run id finds nothing (spec check 34).
 */
export async function deleteRun(q: Query, user: { id: string; email: string }, runId: string, deps: MailDeps = {}): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return false;
  const rows = await q<{ week_of: string }>(
    `with r as (
       update runs set status = 'deleted', raw_text = '', parsed = null, reason = '', revision = revision + 1
       where id = $1 and user_id = $2 and status <> 'deleted'
       returning id, to_char(week_of, 'YYYY-MM-DD') as week_of
     ),
     d as (delete from plays where run_id in (select id from r) and pool_play_id is null),
     -- The same week's private profile goes too: it was sent with the report.
     p as (
       update zack_profiles set status = 'deleted', raw_text = '', parsed = null, revision = revision + 1
       where user_id = $2 and status <> 'deleted' and (week_of, is_test) in (select week_of, is_test from runs where id = $1)
     )
     select week_of from r`,
    [runId, user.id],
  );
  if (!rows.length) return false;
  await sendToUser({ id: user.id, email: user.email }, "run_deleted", runId, runDeletedEmail({ weekOf: rows[0].week_of }), deps).catch((e) =>
    console.error("[zack] delete email failed", e instanceof Error ? e.message : e),
  );
  return true;
}

export type RunListRow = { id: string; week_of: string; route: string; status: string; reason: string; is_test: boolean; plays: number; received_at: string };

export async function listRuns(q: Query, userId: string): Promise<RunListRow[]> {
  const rows = await q<RunListRow & { plays: number | string }>(
    `select r.id, to_char(r.week_of, 'YYYY-MM-DD') as week_of, r.route, r.status, r.reason, r.is_test, to_char(r.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as received_at,
            (select count(*) from plays p where p.run_id = r.id) as plays
     from runs r where r.user_id = $1 and r.status <> 'deleted'
     order by r.week_of desc, r.is_test, r.received_at desc limit 60`,
    [userId],
  );
  return rows.map((r) => ({ ...r, plays: Number(r.plays) }));
}

/** One run as received, for its owner only. */
export async function readOwnRun(q: Query, userId: string, runId: string): Promise<{ week_of: string; raw_text: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const [r] = await q<{ week_of: string; raw_text: string }>(
    `select to_char(week_of, 'YYYY-MM-DD') as week_of, raw_text from runs where id = $1 and user_id = $2 and status <> 'deleted'`,
    [runId, userId],
  );
  return r ?? null;
}
