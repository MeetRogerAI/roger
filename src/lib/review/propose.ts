import { readFileSync } from "node:fs";
import path from "node:path";
import { isModelUnavailable, ModelUnavailable } from "@/lib/ai/errors";
import { adminEmails } from "@/lib/auth/admin-emails";
import type { Query } from "@/lib/db-query";
import { blobSha, INSTRUCTION_FILES, type InstructionFile } from "@/lib/instructions/version";
import { replacePatterns } from "@/lib/intake/privacy-patterns";
import { type EvidenceItem, loadEvidence, reviewWeek } from "./evidence";
import { brokenHeading, changeSize, type Hunk, type ModelHunk, resolveHunks, spliceHunks, toLf, unifiedDiff } from "./hunks";
import type { ModelProposal, ReviewModel } from "./model";
import {
  type DiscardReason,
  documentOnly,
  type EvidenceNames,
  evidenceNames,
  guardrailReasons,
  harmCheck,
  hiddenOrForeign,
  isAllowlisted,
  LIMITS,
  type NameSource,
  nameSpans,
  type NameTerm,
  nameTerms,
  overSize,
  quoteSpans,
  removeSecrets,
  replaceObfuscatedEmails,
  replaceSpans,
  stripHidden,
  thirdPartySpans,
  wordCorpus,
} from "./safety";

/**
 * One review run (B3 plan Unit 7): evidence in, the model's proposals out,
 * validated in code, stored as `pending` or `blocked` with references to
 * their evidence (never copies of it), and the run recorded in review_runs
 * with what validation discarded, by reason.
 *
 * Unit 8 schedules this (lease, retries, alerts). Each write here is one
 * statement (Neon over HTTP has no transactions): the proposals and the run's
 * "done" go in together, gated on the run still being this holder's.
 */

export type StoredProposal = {
  public_id: string;
  paths: InstructionFile[];
  base_versions: Record<string, string>;
  hunks: Hunk[];
  diff_text: string;
  rationale: string;
  evidence: { kind: string; ref: string; why: string }[];
  guardrail: boolean;
  guardrail_reasons: string[];
  blocked_reason: string | null;
  status: "pending" | "blocked";
  document_only: boolean;
};

export type Discarded = Partial<Record<DiscardReason, number>>;

export type ValidationContext = {
  evidence: EvidenceItem[];
  /** The deployed allowlisted files' LF text. A file missing here cannot be edited. */
  files: Partial<Record<InstructionFile, string>>;
  names: NameTerm[];
};

const clip = (s: string, n: number) => [...s].slice(0, n).join("");

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
/** 10 characters of random base32 (50 bits): the proposal's public id and branch name. */
export function publicId(): string {
  return [...crypto.getRandomValues(new Uint8Array(10))].map((b) => ALPHABET[b & 31]).join("");
}

/**
 * Model text kept on a proposal (rationale, the per-evidence reasons): quotes
 * of member text become "[quote removed]", names "[a name]", secrets
 * "[removed]", and contact details and links the scrub's placeholders. It is
 * admin-only, but it must hold no member text either (R21).
 */
function cleanModelText(text: string, ctx: CheckContext, max: number): string {
  let out = removeSecrets(stripHidden(text));
  out = replaceSpans(out, quoteSpans(out, ctx.memberCorpus, ctx.allFilesCorpus), "[quote removed]");
  out = replaceSpans(out, nameSpans(out, ctx.names, ctx.allFilesText), "[a name]");
  out = replaceSpans(out, thirdPartySpans(out, ctx.evidenceNames, ctx.allFilesText), "[a name]");
  return clip(replacePatterns(replaceObfuscatedEmails(out)).text.trim(), max);
}

export type CheckContext = ValidationContext & {
  ids: Map<string, EvidenceItem>;
  memberCorpus: string;
  evidenceNames: EvidenceNames;
  allFilesText: string;
  allFilesCorpus: string;
  fileCorpus: Map<string, string>;
};

/** What the checks need, built once from the evidence, the files and the names. Also used at approval, on `main`'s files (Unit 9). */
export function checkContext(v: ValidationContext): CheckContext {
  const fileTexts = Object.values(v.files).filter((t): t is string => typeof t === "string");
  const memberTexts = v.evidence.filter((e) => e.member).map((e) => e.text);
  return {
    ...v,
    ids: new Map(v.evidence.map((e) => [e.id, e])),
    memberCorpus: wordCorpus(memberTexts),
    evidenceNames: evidenceNames(memberTexts),
    allFilesText: fileTexts.join(String.fromCharCode(10)),
    allFilesCorpus: wordCorpus(fileTexts),
    fileCorpus: new Map(Object.entries(v.files).map(([p, t]) => [p, wordCorpus([t ?? ""])])),
  };
}

/**
 * Validates the model's proposals in the plan's order. Steps 1 to 5 discard
 * (allowlist, evidence, range / not_unique, size, heading) and count the
 * reason, as does hidden or look-alike text (step 6, `harm`); 6 to 8 (harm
 * and scrub, names, quotes) store it `blocked`, with the offending words
 * redacted from the stored text; 9 marks guardrails. A proposal past the
 * run's limit of 5 is counted under the first step it fails, or `size`.
 */
export function validateProposals(raw: ModelProposal[], v: ValidationContext): { proposals: StoredProposal[]; discarded: Discarded } {
  const discarded: Discarded = {};
  const discard = (r: DiscardReason) => {
    discarded[r] = (discarded[r] ?? 0) + 1;
  };
  const ctx = checkContext(v);
  const proposals: StoredProposal[] = [];
  for (const [i, p] of raw.entries()) {
    const r = validateOne(p, ctx);
    if (typeof r === "string") discard(r);
    else if (i >= LIMITS.proposals) discard("size");
    else proposals.push(r);
  }
  return { proposals, discarded };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

/** What a hunk's added text holds that came from members: their names, names from their text, and their words. */
export function memberFindings(added: string, ctx: CheckContext, base: string, baseCorpus: string | undefined): string[] {
  const found: string[] = [];
  if (nameSpans(added, ctx.names, base).length) found.push("contains a member's name or email");
  if (thirdPartySpans(added, ctx.evidenceNames, base).length) found.push("contains a name from a member's text");
  if (quoteSpans(added, ctx.memberCorpus, baseCorpus).length) found.push("repeats a member's words");
  return found;
}

function validateOne(p: ModelProposal, ctx: CheckContext): StoredProposal | DiscardReason {
  if (!isObject(p)) return "allowlist";
  const hunksIn = (Array.isArray(p.hunks) ? p.hunks : []) as ModelHunk[];
  const declared = Array.isArray(p.paths) ? p.paths : [];
  // 1. Allowlist: every path named anywhere in the proposal, and a deployed file to edit.
  const named = [...declared, ...hunksIn.map((h) => (isObject(h) ? h.path : null))];
  if (!named.every((x) => isAllowlisted(x) && typeof ctx.files[x] === "string")) return "allowlist";

  // 2. Evidence: at least one item, every id real.
  const cited = (Array.isArray(p.evidence) ? p.evidence : []).filter(isObject) as { id: string; why: string }[];
  if (!cited.length || !cited.every((e) => ctx.ids.has(e.id))) return "evidence";

  // 3. Ranges: some hunk, in the file, not overlapping, and the replaced text found exactly once.
  const paths = (INSTRUCTION_FILES as readonly InstructionFile[]).filter((f) => hunksIn.some((h) => h.path === f));
  if (!paths.length) return "range";
  let hunks: Hunk[] = [];
  for (const f of paths) {
    const r = resolveHunks(ctx.files[f] as string, hunksIn.filter((h) => h.path === f));
    if (!r.ok) return r.reason;
    hunks.push(...r.hunks);
  }
  hunks = hunks.filter((h) => h.new_text !== h.old_text);
  if (!hunks.length) return "range";
  const base = (f: string) => ctx.files[f as InstructionFile] as string;
  const checked = checkHunks(hunks, ctx);
  if (typeof checked === "string") return checked;
  const { touched, blocked, guard } = checked;

  // A blocked proposal can never be approved; its stored text keeps no names, quotes, secrets or contact details.
  const isBlocked = blocked.size > 0;
  let finalHunks = hunks;
  if (isBlocked) {
    finalHunks = hunks.map((h) => ({ ...h, new_text: redact(h.new_text, ctx, base(h.path)) }));
    // What redaction per hunk cannot see (a quote across hunks) goes with the file's new text.
    for (const f of touched) {
      const fh = finalHunks.filter((h) => h.path === f);
      const added = changeSize(base(f), spliceHunks(base(f), fh)).addedText;
      if (memberFindings(added, ctx, base(f), ctx.fileCorpus.get(f)).length) finalHunks = finalHunks.map((h) => (h.path === f ? { ...h, new_text: "[removed]" } : h));
    }
  }
  const diff = touched
    .map((f) => unifiedDiff(f, base(f), spliceHunks(base(f), finalHunks.filter((h) => h.path === f))))
    .filter(Boolean)
    .join("\n");
  const seen = new Set<string>();
  const evidence = cited
    .filter((e) => !seen.has(e.id) && seen.add(e.id))
    .map((e) => {
      const item = ctx.ids.get(e.id) as EvidenceItem;
      return { kind: item.ref.kind, ref: item.ref.id, why: cleanModelText(String(e.why ?? ""), ctx, LIMITS.why) };
    });
  return {
    public_id: publicId(),
    paths: touched,
    base_versions: Object.fromEntries(touched.map((f) => [f, blobSha(base(f))])),
    hunks: finalHunks,
    diff_text: diff,
    rationale: cleanModelText(String(p.rationale ?? ""), ctx, LIMITS.rationale),
    evidence,
    guardrail: guard.size > 0,
    guardrail_reasons: [...guard],
    blocked_reason: isBlocked ? `The added text ${[...blocked].join("; ")}.` : null,
    status: isBlocked ? "blocked" : "pending",
    document_only: documentOnly(touched),
  };
}

/**
 * Steps 4 to 9 on resolved hunks against `ctx.files` (the deployed files at
 * generation, `main`'s at approval): size, headings and hidden text discard
 * (the reason is returned); harm and scrub, names and quotes block;
 * guardrail sections and words mark a second read.
 */
export function checkHunks(hunks: Hunk[], ctx: CheckContext): DiscardReason | { touched: InstructionFile[]; blocked: Set<string>; guard: Set<string> } {
  const touched = (INSTRUCTION_FILES as readonly InstructionFile[]).filter((f) => hunks.some((h) => h.path === f));
  const base = (f: string) => ctx.files[f as InstructionFile] as string;
  const after = new Map(touched.map((f) => [f, spliceHunks(base(f), hunks.filter((h) => h.path === f))]));
  // Each file's added text, all its hunks together: a quote split across two hunks is still a quote.
  const fileAdded = new Map(touched.map((f) => [f, changeSize(base(f), after.get(f) as string).addedText]));

  // 4. Size.
  if (overSize(hunks)) return "size";

  // 5. Load-bearing headings.
  for (const f of touched) if (brokenHeading(base(f), after.get(f) as string)) return "heading";

  // 6, first: hidden characters and look-alike letters are discarded, not stripped.
  for (const h of hunks) if (hiddenOrForeign(changeSize(h.old_text, h.new_text).addedText, base(h.path))) return "harm";
  for (const f of touched) if (hiddenOrForeign(fileAdded.get(f) as string, base(f))) return "harm";

  // 6 to 9, per hunk against its own file, and 7 and 8 again on each file's added text as a whole.
  const blocked = new Set<string>();
  const guard = new Set<string>();
  for (const h of hunks) {
    const harm = harmCheck(h, base(h.path));
    for (const b of harm.blocked) blocked.add(b);
    for (const k of harm.kept) guard.add(`${h.path}: keeps wording the harm check flags (${k})`);
    for (const m of memberFindings(changeSize(h.old_text, h.new_text).addedText, ctx, base(h.path), ctx.fileCorpus.get(h.path))) blocked.add(m);
    for (const g of guardrailReasons(h.path as InstructionFile, base(h.path), h)) guard.add(g);
  }
  for (const f of touched) for (const m of memberFindings(fileAdded.get(f) as string, ctx, base(f), ctx.fileCorpus.get(f))) blocked.add(m);
  return { touched, blocked, guard };
}

function redact(text: string, ctx: CheckContext, base: string): string {
  const spans = [...quoteSpans(text, ctx.memberCorpus, wordCorpus([base])), ...nameSpans(text, ctx.names, base), ...thirdPartySpans(text, ctx.evidenceNames, base)].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return replacePatterns(replaceObfuscatedEmails(removeSecrets(replaceSpans(text, merged, "[removed]")))).text;
}

// ---------------------------------------------------------------- inputs

/** The deployed allowlisted files, LF. A file that cannot be read is left out (and so cannot be edited). */
export function readInstructionFiles(root = process.cwd()): Partial<Record<InstructionFile, string>> {
  const out: Partial<Record<InstructionFile, string>> = {};
  for (const f of INSTRUCTION_FILES) {
    try {
      out[f] = toLf(readFileSync(path.join(root, f), "utf8"));
    } catch (e) {
      console.error("[review] cannot read", f, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/** Every member's name, display name and email, seed contributor labels and sponsor names (the names check). */
export async function loadNameSources(q: Query): Promise<NameSource[]> {
  return q<NameSource>(
    `select name, display_name as "displayName", email, null as label from users
     union all select null, null, null, label from seed_contributors
     union all select null, null, null, name from sponsors`,
  );
}

// ---------------------------------------------------------------- the run

export type ReviewResult =
  | { status: "done"; week: string; evidence: number; stored: number; discarded: Discarded; proposals: { public_id: string; status: string; guardrail: boolean; document_only: boolean }[] }
  | { status: "skipped"; week: string }
  | { status: "failed"; week: string; error: string }
  | { status: "not_claimed"; week: string };

export type ReviewOptions = {
  now: Date;
  model: ReviewModel;
  /** The lease holder (Unit 8). Every write checks it, with the claim's token. One is generated when absent. */
  holder?: string | null;
  admins?: string[];
  files?: Partial<Record<InstructionFile, string>>;
  /** Claim a failed or abandoned week only while fewer model calls than this were made for it (Unit 8's schedule). Absent: no limit ("Run now"). */
  maxModelAttempts?: number | null;
};

/** A running claim older than this is abandoned (the route's 300 seconds, plus slack) and can be taken over. */
export const REVIEW_LEASE_SECONDS = 330;

/**
 * Marks the week's run as running for this holder, unless it is done, or
 * running under a lease that has not expired, or (with `maxModelAttempts`)
 * has already reached the model that many times. One statement. Returns the
 * claim's token (the attempt number), which every later write checks with
 * the holder, or null when the run was not claimed.
 */
export async function claimReviewRun(q: Query, week: string, holder: string, model: string, at: string, maxModelAttempts: number | null = null): Promise<number | null> {
  if (!holder) throw new Error("claimReviewRun needs a holder");
  const rows = await q<{ attempts: number }>(
    `insert into review_runs (week_of, status, holder, attempts, model, started_at)
     values ($1::date, 'running', $2, 1, $3, $4::timestamptz)
     on conflict (week_of) do update set status = 'running', holder = excluded.holder, attempts = review_runs.attempts + 1,
       model = excluded.model, started_at = excluded.started_at, error = null, finished_at = null, discarded = '{}'::jsonb
     where (review_runs.status in ('failed', 'skipped')
            or (review_runs.status = 'running' and review_runs.started_at <= excluded.started_at - interval '${REVIEW_LEASE_SECONDS} seconds'))
       and ($5::int is null or review_runs.model_attempts < $5::int)
     returning attempts`,
    [week, holder, model, at, maxModelAttempts],
  );
  return rows[0]?.attempts ?? null;
}

/** The run is still this claim's: $1 week, $2 holder, $3 token. */
const OURS = `week_of = $1::date and status = 'running' and holder = $2 and attempts = $3`;

/** What review_runs.error keeps: the error's class name and a fixed message, never the error's own text (it can hold model output). */
export function errorLabel(e: unknown, what: string): string {
  const name = e instanceof Error && /^[A-Za-z_$][\w$]{0,63}$/.test(e.name) ? e.name : "Error";
  return `${name}: ${what}`;
}

const NUL = String.fromCharCode(0);
/** Every string in the model's answer without NUL characters, which Postgres text and jsonb cannot hold. */
function stripNul<T>(v: T): T {
  if (typeof v === "string") return v.split(NUL).join("") as T;
  if (Array.isArray(v)) return v.map(stripNul) as T;
  if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [stripNul(k), stripNul(x)])) as T;
  return v;
}

export async function runReview(q: Query, o: ReviewOptions): Promise<ReviewResult> {
  // The job clock never runs ahead of the real one.
  const now = new Date(Math.min(o.now.getTime(), Date.now()));
  const at = now.toISOString();
  const week = reviewWeek(now);
  const holder = o.holder || `review-${crypto.randomUUID()}`;
  const token = await claimReviewRun(q, week, holder, o.model.name, at, o.maxModelAttempts ?? null);
  if (token === null) return { status: "not_claimed", week };
  const gate = [week, holder, token] as const;
  try {
    return await runClaimed(q, o, { now, at, week, gate });
  } catch (e) {
    try {
      await q(`update review_runs set status = 'failed', error = $4, finished_at = $5::timestamptz where ${OURS}`, [...gate, errorLabel(e, "the review run failed"), at]);
    } catch (e2) {
      console.error("[review] cannot record the failed run", errorLabel(e2, "update failed"));
    }
    throw e;
  }
}

async function runClaimed(q: Query, o: ReviewOptions, r: { now: Date; at: string; week: string; gate: readonly [string, string, number] }): Promise<ReviewResult> {
  const { now, at, week, gate } = r;
  const { items, empty } = await loadEvidence(q, { week, now, admins: o.admins ?? adminEmails() });
  if (empty) {
    await q(`update review_runs set status = 'skipped', evidence_count = 0, proposal_count = 0, finished_at = $4::timestamptz where ${OURS}`, [...gate, at]);
    return { status: "skipped", week };
  }

  const files = o.files ?? readInstructionFiles();
  const names = nameTerms(await loadNameSources(q));
  // Counted before the call, so a call the platform cuts off still counts (Unit 8's attempt limit). A skipped week never gets here.
  const counted = await q(`update review_runs set model_attempts = model_attempts + 1 where ${OURS} returning week_of`, [...gate]);
  if (!counted.length) return { status: "not_claimed", week };
  let raw: ModelProposal[];
  try {
    raw = stripNul(
      await o.model.propose({
        evidence: items.map((e) => ({ id: e.id, kind: e.kind, text: e.text })),
        files: INSTRUCTION_FILES.filter((f) => typeof files[f] === "string").map((f) => ({ path: f, text: files[f] as string })),
      }),
    );
  } catch (e) {
    // A cut-off or timed-out answer is a failed attempt, retried on the next tick. No model text is kept.
    const error = errorLabel(e, "the review model call failed");
    await q(`update review_runs set status = 'failed', evidence_count = $5, error = $4, finished_at = $6::timestamptz where ${OURS}`, [...gate, error, items.length, at]);
    if (isModelUnavailable(e)) throw e instanceof ModelUnavailable ? e : new ModelUnavailable(error);
    return { status: "failed", week, error };
  }

  const { proposals, discarded } = validateProposals(Array.isArray(raw) ? raw : [], { evidence: items, files, names });
  const [row] = await q<{ stored: number; done: number }>(
    `with run as (select 1 from review_runs where ${OURS}),
     ins as (
       insert into review_proposals (public_id, review_week, paths, base_versions, hunks, diff_text, rationale, evidence, guardrail, guardrail_reasons, blocked_reason, status, document_only, created_at)
       select x.public_id, $1::date, array(select jsonb_array_elements_text(x.paths)), x.base_versions, x.hunks, x.diff_text, x.rationale, x.evidence,
              x.guardrail, x.guardrail_reasons, x.blocked_reason, x.status, x.document_only, $4::timestamptz
       from jsonb_to_recordset($5::jsonb) as x(public_id text, paths jsonb, base_versions jsonb, hunks jsonb, diff_text text, rationale text, evidence jsonb,
              guardrail boolean, guardrail_reasons jsonb, blocked_reason text, status text, document_only boolean)
       where exists (select 1 from run)
       returning id
     ),
     upd as (
       update review_runs set status = 'done', evidence_count = $6, proposal_count = (select count(*) from ins), discarded = $7::jsonb, finished_at = $4::timestamptz, error = null
       where ${OURS}
       returning week_of
     )
     select (select count(*)::int from ins) as stored, (select count(*)::int from upd) as done`,
    [...gate, at, JSON.stringify(proposals), items.length, JSON.stringify(discarded)],
  );
  if (!row?.done) return { status: "not_claimed", week };
  return {
    status: "done",
    week,
    evidence: items.length,
    stored: row.stored,
    discarded,
    proposals: proposals.map((p) => ({ public_id: p.public_id, status: p.status, guardrail: p.guardrail, document_only: p.document_only })),
  };
}
