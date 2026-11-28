import { isModelUnavailable } from "@/lib/ai/errors";
import type { DraftInput, IntakeModel } from "./model";
import { harmFlags, phrasePattern, replaceNeverWords, replacePatterns } from "./privacy-patterns";
import type { Play } from "./validate";

/**
 * Auto-admit (2026-11-27, Peter): no play waits for a person. Intake, and the
 * one-off backfill (scripts/auto-admit-held.ts), sort every hold reason into
 * one of three kinds and act on it:
 *
 * - quality (the playbook was not found): Roger drafts the steps from the
 *   report, marks the play `playbook_drafted`, and admits it; if drafting
 *   fails, it is admitted outline only;
 * - privacy (a name, or Zack marked it sensitive): unclear names are replaced
 *   with their kind's placeholder everywhere in the play; a name that cannot
 *   be placed or replaced, or a sensitive play, is admitted outline only;
 * - harm (a link, hidden text, a step that sends data out, anything the model
 *   review calls harmful): the play is dropped. It keeps its flag, marked
 *   rejected and auto, never enters the pool, and nobody is asked about it.
 *
 * What was done is stored on the play (`plays.auto_fixed`, or the dropped
 * flag) by reason only, never the private text, for the /admin/flags log.
 */

export const NAME_PLACEHOLDER: Record<"person" | "company" | "place", string> = { person: "[a person]", company: "[a company]", place: "[a place]" };

export const QUALITY_REASON = "its playbook could not be found in the report";
export const SENSITIVE_REASON = "Zack marked it sensitive";
export const DRAFT_FAILED_REASON = "Roger could not draft its setup steps";
export const nameReason = (kind: string) => `may contain a private ${kind} name`;
export const modelHarmReason = (why: string) => `could harm whoever runs it: ${why.slice(0, 120) || "see the playbook"}`;

/** The visible first line of a playbook Roger drafted. */
export const DRAFT_NOTE = "Setup steps drafted by Roger from the member's report; check them before you run it.";

/** What an outline-only play shows in place of its steps. */
export const OUTLINE_NOTE = "Outline only: the member shared what this play does, not its steps. Build the steps for your own setup from the description and job above, and start it in draft or review mode.";

export type FixAction = "drafted" | "redacted" | "outline_only";
export type AutoFixed = { actions: FixAction[]; reasons: string[] };
export type DroppedFlag = { reasons: string[]; fields: string[]; rejected: true; auto: true };

/** A drafted playbook is never shorter than this, or it is treated as empty. */
const MIN_DRAFT = 50;

export type ReasonKinds = { harm: string[]; quality: boolean; names: string[]; sensitive: boolean };

/** Sorts stored hold reasons (from before auto-admit) into their kinds. Anything not known is treated as harm: fail closed. */
export function sortReasons(reasons: string[]): ReasonKinds {
  const out: ReasonKinds = { harm: [], quality: false, names: [], sensitive: false };
  for (const r of reasons) {
    if (r === QUALITY_REASON) out.quality = true;
    else if (r === SENSITIVE_REASON) out.sensitive = true;
    else if (/^may contain a private (?:person|company|place) name$/.test(r)) out.names.push(r);
    else out.harm.push(r);
  }
  return out;
}

/**
 * The play kept as an outline: what it does, not how. Zack's own outline (a
 * play he already shared as an outline, kept only because it was sensitive)
 * stays as he wrote it; otherwise the steps, the install notes and the best
 * trick go, since that is where a name that could not be placed would be.
 */
export function toOutline<T extends Pick<Play, "outline_only" | "playbook_md" | "install_notes" | "best_trick">>(play: T, keepZackOutline: boolean): T {
  if (keepZackOutline && play.outline_only && play.playbook_md.trim()) return play;
  return { ...play, outline_only: true, playbook_md: OUTLINE_NOTE, install_notes: "", best_trick: "" };
}

/** Every string in a value, depth first. */
export function allStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(allStrings);
  if (v && typeof v === "object") return Object.values(v).flatMap(allStrings);
  return [];
}

/** Applies `f` to every string in a value, keeping its shape. */
export function mapStrings<T>(v: T, f: (s: string, path: string) => string, path = ""): T {
  if (typeof v === "string") return f(v, path) as T;
  if (Array.isArray(v)) return v.map((x, i) => mapStrings(x, f, `${path}[${i}]`)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f, path ? `${path}.${k}` : k)])) as T;
  return v;
}

/** Replaces a name everywhere in a value; returns the new value and how many were replaced. */
export function replaceName<T>(v: T, text: string, placeholder: string): { value: T; count: number } {
  let count = 0;
  const value = mapStrings(v, (s) =>
    s.replace(phrasePattern(text), () => {
      count++;
      return placeholder;
    }),
  );
  return { value, count };
}

/**
 * Drafts a play's steps from the report, then checks the draft as strictly as
 * any member's text: the patterns and the member's never-include list, the
 * harm patterns, and its own model review. Any harm, any name the review
 * reports that cannot be found, an empty or short answer, or a model error,
 * and there is no draft (null). The report is cleaned of patterns and the
 * never-include list before the model reads it. A model that refuses for
 * credits or its key is re-thrown, so a run waits instead of losing its steps.
 */
export async function draftPlaybook(model: IntakeModel, play: DraftInput, report: string, neverWords: string[]): Promise<string | null> {
  try {
    const cleanReport = replaceNeverWords(replacePatterns(report).text, neverWords).text;
    const raw = (await model.draftPlaybook(play, cleanReport)).trim();
    if (raw.length < MIN_DRAFT) return null;
    if (harmFlags(raw).length) return null;
    let text = replaceNeverWords(replacePatterns(raw).text, neverWords).text;
    const findings = await model.review([{ id: "draft", text }]);
    if (findings.some((f) => f.kind === "harm")) return null;
    for (const f of [...findings].sort((a, b) => b.text.length - a.text.length)) {
      if (!f.text.trim()) return null;
      const r = replaceName(text, f.text, NAME_PLACEHOLDER[f.kind as keyof typeof NAME_PLACEHOLDER]);
      // "Dana" after "Dana Whitfield" has nothing left, and that is fine; anything else that cannot be found is not.
      if (r.count === 0 && !findings.some((g) => g !== f && g.text.length > f.text.length && phrasePattern(f.text).test(g.text))) return null;
      text = r.value;
    }
    return `${DRAFT_NOTE}\n\n${text}`;
  } catch (e) {
    if (isModelUnavailable(e)) throw e;
    console.error("[intake] drafting failed", e instanceof Error ? e.message : e);
    return null;
  }
}
