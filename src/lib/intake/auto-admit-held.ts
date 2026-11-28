import { admitHeld, dropHeld, OPEN_FLAG } from "@/lib/admin/flags";
import { isModelUnavailable } from "@/lib/ai/errors";
import type { Query } from "@/lib/db-query";
import {
  allStrings,
  DRAFT_FAILED_REASON,
  draftPlaybook,
  NAME_PLACEHOLDER,
  QUALITY_REASON,
  replaceName,
  SENSITIVE_REASON,
  sortReasons,
  toOutline,
  type AutoFixed,
  type FixAction,
} from "./auto-admit";
import type { IntakeModel } from "./model";
import type { Play } from "./validate";

/**
 * The one-off backfill for auto-admit (2026-11-27, Peter): every play still
 * held with flags is treated as intake now treats a new one (./auto-admit),
 * then admitted through the same clear an admin's approval used to make
 * (shareable from the run and the member), or dropped for harm. Cora's next
 * merge places the admitted ones in the pool.
 *
 * Safe to run again: each play is written only while it is still held at the
 * revision that was read, so a second run finds nothing to do. Bounded by
 * `limit`. A dry run (the default) calls no model and writes nothing; it
 * counts what would be done.
 *
 * A held name flag stores only its reason, never the name, so the play is
 * reviewed again: every name found is replaced; if none can be replaced, or
 * the review fails, it is admitted outline only. Harm the new review finds
 * drops it.
 */
export type BackfillTally = {
  held: number;
  dropped: number;
  drafted: number;
  redacted: number;
  outlined: number;
  admitted: number;
  /** Changed by someone else between the read and the write: left alone. */
  skipped: number;
  /** Plays held after this pass (more than `limit`, or skipped). */
  left: number;
};

type HeldRow = { id: string; revision: number; title: string; body: Record<string, unknown>; reasons: string[] | null; raw_text: string; never_words: string[] | null };

export async function autoAdmitHeld(q: Query, model: IntakeModel, o: { apply: boolean; limit?: number }): Promise<BackfillTally> {
  const t: BackfillTally = { held: 0, dropped: 0, drafted: 0, redacted: 0, outlined: 0, admitted: 0, skipped: 0, left: 0 };
  const rows = await q<HeldRow>(
    `select p.id, p.revision, p.title, p.body, p.flag->'reasons' as reasons, coalesce(r.raw_text, '') as raw_text, zs.never_words
     from plays p join runs r on r.id = p.run_id left join zack_settings zs on zs.user_id = p.user_id
     where ${OPEN_FLAG}
     order by p.week_of, p.id
     limit $1`,
    [o.limit ?? 500],
  );
  t.held = rows.length;
  for (const row of rows) {
    const kinds = sortReasons(Array.isArray(row.reasons) ? row.reasons.filter((x): x is string => typeof x === "string") : []);
    if (kinds.harm.length) {
      if (!o.apply) t.dropped++;
      else if (await dropHeld(q, row.id, row.revision)) t.dropped++;
      else t.skipped++;
      continue;
    }
    if (!o.apply) {
      // Counted by plan only: what each reason leads to without asking a model.
      if (kinds.sensitive) t.outlined++;
      else if (kinds.names.length) t.redacted++;
      else if (kinds.quality) t.drafted++;
      t.admitted++;
      continue;
    }

    const { privacy, ...rest } = row.body;
    let play = rest as Play & Record<string, unknown>;
    const actions = new Set<FixAction>();
    const reasons = new Set<string>([...kinds.names, ...(kinds.sensitive ? [SENSITIVE_REASON] : []), ...(kinds.quality ? [QUALITY_REASON] : [])]);
    let outline = kinds.sensitive;
    let harmed = false;

    if (kinds.names.length) {
      const r = await reviewNames(model, play);
      if (r.harm) harmed = true;
      else if (r.play) {
        play = r.play as typeof play;
        actions.add("redacted");
      } else outline = true;
    }
    if (harmed) {
      if (await dropHeld(q, row.id, row.revision)) t.dropped++;
      else t.skipped++;
      continue;
    }
    let drafted = false;
    if (outline) {
      play = toOutline(play, kinds.names.length === 0);
      actions.add("outline_only");
    } else if (kinds.quality) {
      const d = await draftPlaybook(
        model,
        { title: str(play.title) || row.title, description: str(play.description), job: str(play.job), install_notes: str(play.install_notes) },
        row.raw_text,
        row.never_words ?? [],
      );
      if (d) {
        play = { ...play, playbook_md: d };
        drafted = true;
        actions.add("drafted");
      } else {
        play = toOutline(play, false);
        actions.add("outline_only");
        reasons.add(DRAFT_FAILED_REASON);
      }
    }
    const body = { ...play, privacy, ...(drafted ? { playbook_drafted: true } : {}) };
    const autoFixed: AutoFixed | null = actions.size ? { actions: [...actions], reasons: [...reasons] } : null;
    if (await admitHeld(q, row.id, row.revision, { title: str(play.title) || row.title, body, autoFixed })) {
      t.admitted++;
      if (actions.has("drafted")) t.drafted++;
      if (actions.has("redacted")) t.redacted++;
      if (actions.has("outline_only")) t.outlined++;
    } else t.skipped++;
  }
  const [left] = await q<{ n: number | string }>(`select count(*) as n from plays p where ${OPEN_FLAG}`);
  t.left = Number(left?.n ?? 0);
  return t;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Reviews a held play again for names. Every name found is replaced, longest
 * first. `play` is null (keep it as an outline) when the review fails, finds
 * no name it can replace, or finds one it cannot. Model refusals for credits
 * or the key are thrown, so the backfill stops instead of outlining everything.
 */
async function reviewNames(model: IntakeModel, play: Record<string, unknown>): Promise<{ harm: boolean; play: Record<string, unknown> | null }> {
  let findings;
  try {
    findings = await model.review([{ id: "p1", text: allStrings(play).join("\n\n") }]);
  } catch (e) {
    if (isModelUnavailable(e)) throw e;
    console.error("[backfill] review failed", e instanceof Error ? e.message : e);
    return { harm: false, play: null };
  }
  if (findings.some((f) => f.kind === "harm")) return { harm: true, play: null };
  const names = findings.filter((f) => f.kind !== "harm").sort((a, b) => b.text.length - a.text.length);
  if (!names.length || names.some((f) => !f.text.trim())) return { harm: false, play: null };
  let out = play;
  let any = false;
  for (const f of names) {
    const r = replaceName(out, f.text, NAME_PLACEHOLDER[f.kind as keyof typeof NAME_PLACEHOLDER]);
    out = r.value;
    if (r.count > 0) any = true;
    // A shorter name inside a longer one already replaced is fine; any other name that cannot be found is not.
    else if (!names.some((g) => g !== f && g.text.length > f.text.length && g.text.toLowerCase().includes(f.text.toLowerCase()))) return { harm: false, play: null };
  }
  return { harm: false, play: any ? out : null };
}
