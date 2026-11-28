import { admitHeld, dropHeld, OPEN_FLAG, settleRuns } from "@/lib/admin/flags";
import { isModelUnavailable } from "@/lib/ai/errors";
import type { Query } from "@/lib/db-query";
import {
  allStrings,
  DRAFT_FAILED_REASON,
  draftPlaybook,
  NAME_PLACEHOLDER,
  NO_REASON,
  privacyOutline,
  QUALITY_REASON,
  replaceName,
  SENSITIVE_REASON,
  sortReasons,
  TITLE_NAME_REASON,
  toOutline,
  type AutoFixed,
  type FixAction,
} from "./auto-admit";
import type { IntakeModel } from "./model";
import { phrasePattern } from "./privacy-patterns";
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
 * reviewed again: every name found is replaced; if one cannot be placed (or
 * none is found), it is admitted as a privacy outline: its category and a
 * neutral title ("A sales play"), never the member's own (re-review G1).
 * Harm the new review finds drops it. A model call that fails (the name review or the draft, for
 * any reason but credits or the key, which stop the backfill) leaves the play
 * held, counted as skipped, for the next run (2026-11-28 review F1, F6). It
 * ends by settling every run with no open flag left (F10).
 */
export type BackfillTally = {
  held: number;
  dropped: number;
  drafted: number;
  redacted: number;
  outlined: number;
  admitted: number;
  /** Left held: changed by someone else between the read and the write, or a model call failed. Run again. */
  skipped: number;
  /** Plays held after this pass (more than `limit`, or skipped). */
  left: number;
};

type HeldRow = {
  id: string;
  revision: number;
  title: string;
  category: string;
  body: Record<string, unknown>;
  reasons: string[] | null;
  raw_text: string;
  never_words: string[] | null;
  /** The titles of the run's other plays: a section one of them could own is never drafted from. */
  others: string[] | null;
};

export async function autoAdmitHeld(q: Query, model: IntakeModel, o: { apply: boolean; limit?: number }): Promise<BackfillTally> {
  const t: BackfillTally = { held: 0, dropped: 0, drafted: 0, redacted: 0, outlined: 0, admitted: 0, skipped: 0, left: 0 };
  const rows = await q<HeldRow>(
    `select p.id, p.revision, p.title, p.category, p.body, p.flag->'reasons' as reasons, coalesce(r.raw_text, '') as raw_text, zs.never_words,
            (select array_agg(o.title) from plays o where o.run_id = p.run_id and o.id <> p.id) as others
     from plays p join runs r on r.id = p.run_id left join zack_settings zs on zs.user_id = p.user_id
     where ${OPEN_FLAG}
     order by p.week_of, p.id
     limit $1`,
    [o.limit ?? 500],
  );
  t.held = rows.length;
  const drop = async (row: HeldRow, reasons: string[] = []) => {
    if (await dropHeld(q, row.id, row.revision, reasons)) t.dropped++;
    else t.skipped++;
  };
  for (const row of rows) {
    const kinds = sortReasons(Array.isArray(row.reasons) ? row.reasons.filter((x): x is string => typeof x === "string") : []);
    if (kinds.harm.length) {
      if (!o.apply) t.dropped++;
      else await drop(row, kinds.harm.includes(NO_REASON) ? [NO_REASON] : []);
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
    let play = { ...rest, title: str(rest.title) || row.title, category: str(rest.category) || row.category } as Play & Record<string, unknown>;
    const actions = new Set<FixAction>();
    const reasons = new Set<string>([...kinds.names, ...(kinds.sensitive ? [SENSITIVE_REASON] : []), ...(kinds.quality ? [QUALITY_REASON] : [])]);
    let outline = kinds.sensitive;
    let found: { text: string; kind: string }[] = [];
    let unplaced: string[] = [];
    // A name problem (one not placed, with no text, or none found again) never shows the member's title (re-review G1).
    let hideTitle = false;

    if (kinds.names.length) {
      const r = await reviewNames(model, play);
      if (r.kind === "error") {
        t.skipped++;
        continue;
      }
      if (r.kind === "harm") {
        await drop(row);
        continue;
      }
      play = r.play as typeof play;
      found = r.names;
      unplaced = r.unplaced;
      if (r.replaced) actions.add("redacted");
      if (!r.allPlaced) outline = hideTitle = true;
    }
    let drafted = false;
    if (outline) {
      const p = privacyOutline(play, { found, unplaced, hideTitle });
      if (p.titleHoldsName) {
        await drop(row, [TITLE_NAME_REASON]);
        continue;
      }
      play = p.play;
      actions.add("outline_only");
    } else if (kinds.quality) {
      const d = await draftPlaybook(
        model,
        { title: play.title, description: str(play.description), job: str(play.job), install_notes: str(play.install_notes) },
        row.raw_text,
        row.never_words ?? [],
        found,
        { others: row.others ?? [] },
      );
      if (d.kind === "error") {
        t.skipped++;
        continue;
      }
      if (d.kind === "drafted") {
        play = { ...play, playbook_md: d.text };
        drafted = true;
        actions.add("drafted");
      } else {
        play = toOutline(play);
        actions.add("outline_only");
        reasons.add(DRAFT_FAILED_REASON);
      }
    }
    const body = { ...play, privacy, ...(drafted ? { playbook_drafted: true } : {}) };
    const autoFixed: AutoFixed | null = actions.size ? { actions: [...actions], reasons: [...reasons] } : null;
    if (await admitHeld(q, row.id, row.revision, { title: play.title, body, autoFixed })) {
      t.admitted++;
      if (actions.has("drafted")) t.drafted++;
      if (actions.has("redacted")) t.redacted++;
      if (actions.has("outline_only")) t.outlined++;
    } else t.skipped++;
  }
  // A run whose last held play was written by an earlier pass that stopped before it settled the run (F10).
  if (o.apply) await settleRuns(q);
  const [left] = await q<{ n: number | string }>(`select count(*) as n from plays p where ${OPEN_FLAG}`);
  t.left = Number(left?.n ?? 0);
  return t;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

type NameReview = { kind: "error" } | { kind: "harm" } | { kind: "ok"; play: Record<string, unknown>; names: { text: string; kind: string }[]; unplaced: string[]; replaced: boolean; allPlaced: boolean };

/**
 * Reviews a held play again for names. Every name found is replaced, longest
 * first, and kept even when another cannot be placed. `allPlaced` is false
 * when the review finds no name, a name with no text, or one it cannot find
 * (then the play becomes a privacy outline). A failed review is an error, and
 * the play stays held; refusals for credits or the key are thrown, so the
 * backfill stops instead.
 */
async function reviewNames(model: IntakeModel, play: Record<string, unknown>): Promise<NameReview> {
  let findings;
  try {
    findings = await model.review([{ id: "p1", text: allStrings(play).join("\n\n") }]);
  } catch (e) {
    if (isModelUnavailable(e)) throw e;
    console.error("[backfill] review failed", e instanceof Error ? e.message : e);
    return { kind: "error" };
  }
  if (findings.some((f) => f.kind === "harm")) return { kind: "harm" };
  const names = findings.filter((f) => f.kind !== "harm").sort((a, b) => b.text.length - a.text.length);
  let out = play;
  let replaced = false;
  let allPlaced = names.length > 0;
  const unplaced: string[] = [];
  for (const f of names) {
    if (!f.text.trim()) {
      allPlaced = false;
      continue;
    }
    const r = replaceName(out, f.text, NAME_PLACEHOLDER[f.kind as keyof typeof NAME_PLACEHOLDER]);
    out = r.value;
    if (r.count > 0) replaced = true;
    // A shorter name inside a longer one already replaced is fine; any other name that cannot be found is not.
    else if (!names.some((g) => g !== f && g.text.length > f.text.length && phrasePattern(f.text).test(g.text))) {
      allPlaced = false;
      unplaced.push(f.text);
    }
  }
  return { kind: "ok", play: out, names: names.filter((n) => n.text.trim()), unplaced, replaced, allPlaced };
}
