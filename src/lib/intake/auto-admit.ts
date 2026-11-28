import { isModelUnavailable } from "@/lib/ai/errors";
import { playSection, reviewListNames, type DraftInput, type IntakeModel } from "./model";
import { harmFlags, holdsAnyName, phrasePattern, replaceNeverWords, replacePatterns } from "./privacy-patterns";
import type { Play } from "./validate";

/**
 * Auto-admit (2026-11-27, Peter): no play waits for a person. Intake, and the
 * one-off backfill (scripts/auto-admit-held.ts), sort every hold reason into
 * one of three kinds and act on it:
 *
 * - quality (the playbook was not found): Roger drafts the steps from the
 *   play's own section of the report, marks the play `playbook_drafted`, and
 *   admits it; if drafting fails, it is admitted as an outline (what it does,
 *   not its steps);
 * - privacy (a name, or Zack marked it sensitive): unclear names are replaced
 *   with their kind's placeholder everywhere in the play; a name that cannot
 *   be placed, or a sensitive play, is admitted as a privacy outline: its
 *   title and category only. The title is checked again, and a title that
 *   still holds a name found anywhere in the run drops the play (2026-11-28
 *   review F1);
 * - harm (a link, hidden text, a step that sends data out, anything the model
 *   review calls harmful, or a hold with no reason): the play is dropped. It
 *   keeps its flag, marked rejected and auto, never enters the pool, and
 *   nobody is asked about it.
 *
 * What was done is stored on the play (`plays.auto_fixed`, or the dropped
 * flag) by reason only, never the private text, for the /admin/flags log.
 */

export const NAME_PLACEHOLDER: Record<"person" | "company" | "place", string> = { person: "[a person]", company: "[a company]", place: "[a place]" };
/** What a name from the report's review list becomes in a drafted playbook. */
export const LISTED_PLACEHOLDER = "[a name]";
const placeholderFor = (kind: string) => NAME_PLACEHOLDER[kind as keyof typeof NAME_PLACEHOLDER] ?? LISTED_PLACEHOLDER;

export const QUALITY_REASON = "its playbook could not be found in the report";
export const SENSITIVE_REASON = "Zack marked it sensitive";
export const DRAFT_FAILED_REASON = "Roger could not draft its setup steps";
/** A held play with no reason stored is not known to be safe: dropped (2026-11-28 review F9). */
export const NO_REASON = "it was held with no reason recorded";
/** A privacy outline whose title still holds a name: dropped (2026-11-28 review F1). */
export const TITLE_NAME_REASON = "its title may hold a private name, and a privacy outline keeps only the title";
export const nameReason = (kind: string) => `may contain a private ${kind} name`;
export const modelHarmReason = (why: string) => `could harm whoever runs it: ${why.slice(0, 120) || "see the playbook"}`;

/** The visible first line of a playbook Roger drafted. */
export const DRAFT_NOTE = "Setup steps drafted by Roger from the member's report; check them before you run it.";

/** What an outline-only play shows in place of its steps. */
export const OUTLINE_NOTE = "Outline only: the member shared what this play does, not its steps. Build the steps for your own setup from the description and job above, and start it in draft or review mode.";

/** What a privacy outline shows in place of its steps: only the title was shared. */
export const PRIVACY_OUTLINE_NOTE =
  "Outline only: to keep it private, the member shared only this play's title, not what it does or its steps. Build it for your own setup from the title, and start it in draft or review mode.";

export type FixAction = "drafted" | "redacted" | "outline_only";
export type AutoFixed = { actions: FixAction[]; reasons: string[] };
export type DroppedFlag = { reasons: string[]; fields: string[]; rejected: true; auto: true };

/** A drafted playbook is never shorter than this, or it is treated as empty. */
const MIN_DRAFT = 50;

export type ReasonKinds = { harm: string[]; quality: boolean; names: string[]; sensitive: boolean };

/** Sorts stored hold reasons (from before auto-admit) into their kinds. Anything not known, or no reason at all, is treated as harm: fail closed. */
export function sortReasons(reasons: string[]): ReasonKinds {
  const out: ReasonKinds = { harm: [], quality: false, names: [], sensitive: false };
  if (!reasons.length) out.harm.push(NO_REASON);
  for (const r of reasons) {
    if (r === QUALITY_REASON) out.quality = true;
    else if (r === SENSITIVE_REASON) out.sensitive = true;
    else if (/^may contain a private (?:person|company|place) name$/.test(r)) out.names.push(r);
    else out.harm.push(r.trim() ? r : NO_REASON);
  }
  return out;
}

/**
 * A play whose steps could not be drafted, kept as an outline: what it does,
 * not how. The steps, the install notes and the best trick go. Only for a
 * play with no privacy reason: a privacy reason makes a privacy outline.
 */
export function toOutline<T extends Pick<Play, "outline_only" | "playbook_md" | "install_notes" | "best_trick">>(play: T): T {
  return { ...play, outline_only: true, playbook_md: OUTLINE_NOTE, install_notes: "", best_trick: "" };
}

/** What a privacy outline keeps besides numbers and switches: the title (checked by the caller) and fixed values that hold no name. */
const OUTLINE_KEEPS = new Set(["set", "title", "category", "basis", "confidence"]);
const ORIGINS = new Set(["roger_idea", "own_upgraded", "own"]);

/** Every string emptied, and every list of strings; numbers and switches kept. */
function clearText(v: unknown): unknown {
  if (typeof v === "string") return "";
  if (Array.isArray(v)) return v.filter((x) => typeof x !== "string").map(clearText);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clearText(x)]));
  return v;
}

/**
 * The privacy outline (2026-11-28 review F1), for a play Zack marked
 * sensitive or with a name that could not be placed: the title and category
 * only, every other text field emptied, and a neutral note for its steps.
 * The title is cleaned again (the patterns and every name found, longest
 * first); `titleHoldsName` is true when it still holds any name found, in any
 * case or accents, and then the caller drops the play.
 */
export function privacyOutline<T extends Record<string, unknown> & { title: string }>(play: T, names: { text: string; kind: string }[]): { play: T; titleHoldsName: boolean } {
  const found = names.filter((n) => n.kind !== "harm" && n.text.trim()).sort((a, b) => b.text.length - a.text.length);
  let title = replacePatterns(play.title).text;
  for (const n of found) title = replaceName(title, n.text, placeholderFor(n.kind)).value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(play)) out[k] = OUTLINE_KEEPS.has(k) || (k === "origin" && typeof v === "string" && ORIGINS.has(v)) ? v : clearText(v);
  return {
    play: { ...out, title, outline_only: true, playbook_md: PRIVACY_OUTLINE_NOTE } as unknown as T,
    titleHoldsName: holdsAnyName(title, found.map((n) => n.text)),
  };
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
 * A draft: the steps; none (nothing usable, so the play keeps no steps); or a
 * model error, which may pass, so the caller tries again before it gives up
 * (2026-11-28 review F6).
 */
export type DraftResult = { kind: "drafted"; text: string } | { kind: "none" } | { kind: "error" };

/**
 * Drafts a play's steps from its own section of the report (model.ts
 * playSection: never another play's text or the review list), then checks
 * the draft as strictly as any member's text. The section is checked for harm
 * first (a hit: no draft), and cleaned of the patterns, the member's
 * never-include list and every name the run's review found before the model
 * reads it. The draft is cleaned the same way, and of every name on the
 * report's review list that the play's own reviewed fields do not use; then
 * the harm patterns and its own model review. Any harm, any name the review
 * reports that cannot be found, or an empty or short answer, and there is no
 * draft. A model that refuses for credits or its key is re-thrown, so a run
 * waits instead of losing its steps.
 */
export async function draftPlaybook(
  model: IntakeModel,
  play: DraftInput,
  report: string,
  neverWords: string[],
  names: { text: string; kind: string }[] = [],
): Promise<DraftResult> {
  const section = playSection(report, play.title);
  if (!section || harmFlags(section).length) return { kind: "none" };
  const found = names.filter((n) => n.kind !== "harm" && n.text.trim()).sort((a, b) => b.text.length - a.text.length);
  const clean = (s: string) => {
    let t = replaceNeverWords(replacePatterns(s).text, neverWords).text;
    for (const n of found) t = replaceName(t, n.text, placeholderFor(n.kind)).value;
    return t;
  };
  const fields = allStrings(play).join("\n");
  const listed = reviewListNames(report)
    .filter((n) => !phrasePattern(n).test(fields))
    .sort((a, b) => b.length - a.length);
  const failed = (e: unknown): DraftResult => {
    if (isModelUnavailable(e)) throw e;
    console.error("[intake] drafting failed", e instanceof Error ? e.message : e);
    return { kind: "error" };
  };

  let raw: string;
  try {
    raw = (await model.draftPlaybook(play, clean(section))).trim();
  } catch (e) {
    return failed(e);
  }
  if (raw.length < MIN_DRAFT || harmFlags(raw).length) return { kind: "none" };
  let text = clean(raw);
  for (const n of listed) text = replaceName(text, n, LISTED_PLACEHOLDER).value;
  let findings;
  try {
    findings = await model.review([{ id: "draft", text }]);
  } catch (e) {
    return failed(e);
  }
  if (findings.some((f) => f.kind === "harm")) return { kind: "none" };
  for (const f of [...findings].sort((a, b) => b.text.length - a.text.length)) {
    if (!f.text.trim()) return { kind: "none" };
    const r = replaceName(text, f.text, placeholderFor(f.kind));
    // "Dana" after "Dana Whitfield" has nothing left, and that is fine; anything else that cannot be found is not.
    if (r.count === 0 && !findings.some((g) => g !== f && g.text.length > f.text.length && phrasePattern(f.text).test(g.text))) return { kind: "none" };
    text = r.value;
  }
  return { kind: "drafted", text: `${DRAFT_NOTE}\n\n${text}` };
}
