import { randomUUID } from "node:crypto";
import { adminEmails } from "@/lib/auth/admin-emails";
import type { Query } from "@/lib/db-query";
import { releaseLease, takeLease } from "@/lib/leases";
import { blobSha, INSTRUCTION_FILES, type InstructionFile } from "@/lib/instructions/version";
import { loadEvidence } from "./evidence";
import {
  BASE_BRANCH,
  branchFor,
  gitHubErrorText,
  type GitHubGateway,
  isGitHubError,
  type PullInfo,
  type ReviewGitHub,
  treeWithBlobs,
  type WriteOp,
  writeRequest,
  type WriteRequest,
} from "./github";
import { changeSize, type Hunk, rebaseHunks, toLf, unifiedDiff } from "./hunks";
import { type CheckContext, checkContext, checkHunks, loadNameSources, memberFindings, readInstructionFiles } from "./propose";
import { documentOnly, harmCheck, hiddenOrForeign, isAllowlisted, nameTerms, removeSecrets, stripHidden } from "./safety";

/**
 * Approval and the GitHub pull request (B3 plan Unit 9, origin R18 and R19).
 *
 * - **Who may approve.** Every caller has passed requireAdmin. A blocked
 *   proposal can never be approved. A proposal that edits cora.md must carry
 *   its "Document only" label (the admin has seen it); one that doesn't is
 *   refused. A guardrail proposal needs two reads by two different
 *   email-signed-in admins: the first approval records the first read, the
 *   second (a different admin) opens the PR, and the shared-password admin
 *   can give neither.
 * - **The claim.** `pending | first_read | dry_run → approving`, with a
 *   random `claim_token` and `claimed_at`, in one statement (Neon over HTTP
 *   has no transactions): two clicks give one winner. The claim is renewed
 *   before every GitHub write and every later row write checks the token, so
 *   an approval that lost its claim stops. A claim not renewed for
 *   APPROVAL_CLAIM_SECONDS is abandoned and may be taken over.
 * - **Checked against `main`.** `main`'s commit and each file there (blob SHA
 *   and text) are read, the hunks re-applied (exact, then the normalised
 *   fallback, line-aligned): any miss makes the proposal `stale` and nothing
 *   is written. Unit 7's checks 4 to 9 run again on `main`'s text with the
 *   current member names: a block makes it `blocked`, and a newly touched
 *   guardrail sends it back for two reads.
 * - **The PR** holds only the opaque public id and the diff (prTitle,
 *   prBody, commitMessage): never the rationale, evidence or member text. The
 *   outgoing title, body and commit message are checked again just before
 *   anything is sent (outgoingCheck); anything that trips refuses the
 *   approval.
 * - **Branch `review-bot/{public_id}`** from `main`'s head. An existing branch
 *   is never trusted: its commit's tree is compared with the freshly
 *   computed tree, adopted when equal, and otherwise replaced by a new
 *   commit on the current `main` with a forced ref update. An existing PR
 *   for the branch is adopted (a closed, unmerged one reopened).
 * - **Recorded at once:** branch and main_commit when the ref exists; then
 *   pr_number, pr_url, result_versions (the committed blob SHAs) and
 *   `pr_open`.
 * - **An adopted PR** (open, reopened, or found after GitHub's "already
 *   exists") whose title or body differ from the freshly built ones (its
 *   branch was force-updated onto a newer `main`, say) is edited to them, so
 *   the body always matches the commit. Those are the checked title and body.
 * - **Already merged** (a merged PR found for the branch at approval): the
 *   proposal is released `merged`, with `result_versions` (the recorded ones,
 *   else the blobs of the bot's own commit, found by its message on the PR's
 *   head) and `edited_before_merge` computed as the sync does. Nothing is
 *   written to GitHub but the head branch's delete.
 * - **Superseding** an older open PR A only when A's paths are a subset of
 *   this proposal's and, in every file A touches, this proposal's hunks cover
 *   every line A changed (both rebased to `main`). A's PR state is synced
 *   first, and merged is final. Otherwise the overlap is reported (the paths
 *   only A changes, and the files where A changes lines this one doesn't) and
 *   both stay open. This PR is opened first, so a failure leaves two open
 *   PRs, never none; a failed close leaves `close_pending`, retried by every
 *   sync.
 * - **Branch deletes** only ever touch the proposal's own
 *   `review-bot/{public_id}`; github.ts's guardWrite refuses anything else
 *   before it is sent.
 * - **Dry run** unless live (github.ts `reviewGitHub`): the same reads, then
 *   every write recorded in `dry_run_payload` instead of sent. A read that
 *   fails or is rate-limited skips the stale check: the proposal goes back
 *   with "Stale check skipped", no payload, and is not `dry_run`.
 */

export const APPROVAL_CLAIM_SECONDS = 330;

export type ApprovingAdmin = { by: string; /** Signed in by email link (not the shared password). */ email: boolean };

/** Another open PR this one does not cover: the paths only it changes, and the shared files where it changes lines this one doesn't. */
export type Overlap = { public_id: string; pr_number: number | null; only_in_other: string[]; lines_only_in_other: string[] };

export type ApproveStatus = "first_read" | "pr_open" | "dry_run" | "stale" | "blocked" | "check_skipped" | "needs_second_read" | "merged" | "refused" | "busy" | "error";
export type ApproveResult = { status: ApproveStatus; message: string; pr_number?: number; pr_url?: string; overlap?: Overlap[]; superseded?: string[] };

export type ApproveDeps = {
  gh: ReviewGitHub;
  /** The clock for every timestamp and claim renewal. The real one by default. */
  clock?: () => Date;
  /** The deployed instruction files (for the quotes check's file corpus). Read from disk by default. */
  files?: Partial<Record<InstructionFile, string>>;
  admins?: string[];
};

type Row = {
  id: string;
  public_id: string;
  review_week: string;
  paths: string[];
  hunks: Hunk[];
  guardrail: boolean;
  status: string;
  first_read_by: string | null;
  blocked_reason: string | null;
  document_only: boolean;
  branch: string | null;
  pr_number: number | null;
  result_versions: Record<string, string> | null;
  close_pending: boolean;
  superseded_by: string | null;
  branch_deleted_at: string | null;
  created_at: string;
};

const COLUMNS = `id, public_id, review_week::text, paths, hunks, guardrail, status, first_read_by, blocked_reason, document_only, branch, pr_number,
  result_versions, close_pending, superseded_by, branch_deleted_at::text, created_at::text`;

async function load(q: Query, publicId: string): Promise<Row | null> {
  const [r] = await q<Row>(`select ${COLUMNS} from review_proposals where public_id = $1`, [publicId]);
  return r ?? null;
}

// ---------------------------------------------------------------- what is sent

export const commitMessage = (publicId: string) => `Review bot proposal ${publicId}`;
export const prTitle = (paths: readonly string[], publicId: string) => `Review bot: ${paths.join(", ")} (${publicId})`;

/** The PR body: the id line and the fenced diff, nothing else. The fence is longer than any backtick run in the diff. */
export function prBody(publicId: string, diff: string): string {
  const longest = Math.max(0, ...(diff.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `Review bot proposal ${publicId}\n\n${fence}diff\n${diff}\n${fence}\n`;
}

const ID = /^[a-z2-7]{10}$/;

/** The hidden-text, secret, harm (scrub included) and member checks on text added to a file of `main`. */
function addedTextFinding(added: string, harmHunk: { old_text: string; new_text: string }, base: string, ctx: CheckContext, corpus: string | undefined): string | null {
  if (hiddenOrForeign(added, base)) return "hidden or foreign characters";
  if (removeSecrets(added) !== added) return "a secret";
  const harm = harmCheck(harmHunk, base);
  if (harm.blocked.length) return harm.blocked[0];
  const member = memberFindings(added, ctx, base, corpus);
  return member.length ? member[0] : null;
}

/**
 * The defence-in-depth check on exactly what is about to be sent: the
 * commit message and title are the fixed templates; the body is the id line
 * and one fenced diff over the proposal's allowlisted paths, each path's
 * header at most once; each file's added lines, read back from that body,
 * and each file's whole new content (`next`, exactly what goes into the
 * tree: the text added against `main`) pass the hidden-text, harm, scrub,
 * secret, name and quote checks against `main`'s text; and the body's diff
 * is the diff of `main` to `next`, so the body matches the commit. Returns
 * why it failed, or null.
 */
export function outgoingCheck(
  o: { publicId: string; paths: string[]; title: string; body: string; message: string },
  main: Record<string, string>,
  next: Record<string, string>,
  ctx: CheckContext,
): string | null {
  if (!ID.test(o.publicId)) return "the proposal id";
  if (o.message !== commitMessage(o.publicId)) return "the commit message";
  if (o.title !== prTitle(o.paths, o.publicId) || removeSecrets(o.title) !== o.title) return "the title";
  const m = /^Review bot proposal ([a-z2-7]{10})\n\n(`{3,})diff\n([\s\S]*)\n\2\n$/.exec(o.body);
  if (!m || m[1] !== o.publicId || m[3].includes(m[2])) return "the body";
  const sections = new Map<string, { added: string[]; old: string[] }>();
  let cur: { added: string[]; old: string[] } | null = null;
  const lines = m[3].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("--- a/") && lines[i + 1]?.startsWith("+++ b/")) {
      const path = l.slice(6);
      if (lines[i + 1].slice(6) !== path || !isAllowlisted(path) || !o.paths.includes(path) || typeof main[path] !== "string" || sections.has(path)) return "a path in the diff";
      cur = { added: [], old: [] };
      sections.set(path, cur);
      i++;
    } else if (!cur) return "the diff";
    else if (l.startsWith("@@ ")) continue;
    else if (l.startsWith("+")) cur.added.push(l.slice(1));
    else if (l.startsWith("-") || l.startsWith(" ")) cur.old.push(l.slice(1));
    else return "the diff";
  }
  if (!sections.size) return "the diff";
  for (const [path, s] of sections) {
    const base = main[path];
    const bad = addedTextFinding(s.added.join("\n"), { old_text: s.old.join("\n"), new_text: [...s.old, ...s.added].join("\n") }, base, ctx, ctx.fileCorpus.get(path));
    if (bad) return `${path}: ${bad}`;
  }
  // The whole content going into the tree, against main: what the commit adds, whatever the body says.
  for (const path of o.paths) {
    const base = main[path];
    const after = next[path];
    if (typeof base !== "string" || typeof after !== "string") return `${path}: the new content`;
    const bad = addedTextFinding(changeSize(base, after).addedText, { old_text: base, new_text: after }, base, ctx, ctx.fileCorpus.get(path));
    if (bad) return `${path}: ${bad}`;
  }
  if (m[3] !== o.paths.map((p) => unifiedDiff(p, main[p], next[p])).filter(Boolean).join("\n")) return "the diff (it does not match the new content)";
  return null;
}

// ---------------------------------------------------------------- reject

export async function rejectProposal(q: Query, publicId: string, admin: ApprovingAdmin, note: string, clock: () => Date = () => new Date()): Promise<ApproveResult> {
  const clean = [...stripHidden(note ?? "").trim()].slice(0, 500).join("") || null;
  const rows = await q(
    `update review_proposals set status = 'rejected', rejected_by = $2, rejected_at = $3::timestamptz, reject_note = $4
     where public_id = $1 and status in ('pending', 'first_read', 'blocked', 'dry_run') returning id`,
    [publicId, admin.by, clock().toISOString(), clean],
  );
  if (rows.length) return { status: "refused", message: "Rejected. The proposal is kept, with who rejected it." };
  const r = await load(q, publicId);
  return { status: "refused", message: r ? `This proposal is ${r.status.replace("_", " ")} and can't be rejected now.` : "No such proposal." };
}

// ---------------------------------------------------------------- approve

class ClaimLost extends Error {
  name = "ClaimLost";
}
class ReadFailed extends Error {
  name = "ReadFailed";
  constructor(public reason: string) {
    super(reason);
  }
}

const readReason = (e: unknown) => (isGitHubError(e) ? (e.kind === "rate_limited" ? `rate-limited, ${e.status}` : `${e.op}, ${e.status || "no response"}`) : "no response");

export async function approveProposal(q: Query, publicId: string, admin: ApprovingAdmin, d: ApproveDeps): Promise<ApproveResult> {
  const clock = d.clock ?? (() => new Date());
  const row = await load(q, publicId);
  if (!row) return { status: "refused", message: "No such proposal." };
  if (row.status === "blocked" || row.blocked_reason) return { status: "refused", message: "A blocked proposal can't be approved." };
  if (documentOnly(row.paths) && !row.document_only) return { status: "refused", message: "This proposal edits cora.md but is not labelled Document only. It can't be approved." };
  if (row.status === "approving") {
    // Taken over below only once the claim is abandoned.
  } else if (!["pending", "first_read", "dry_run"].includes(row.status)) {
    return { status: "refused", message: `This proposal is ${row.status.replace("_", " ")} and can't be approved.` };
  }

  if (row.guardrail) {
    if (!admin.email) return { status: "refused", message: "A guardrail proposal needs two reads by admins signed in by email. The shared-password login can give neither." };
    if (!row.first_read_by) {
      const rows = await q(
        `update review_proposals set status = 'first_read', first_read_by = $2, first_read_at = $3::timestamptz
         where public_id = $1 and status = 'pending' and guardrail and first_read_by is null and blocked_reason is null returning id`,
        [publicId, admin.by, clock().toISOString()],
      );
      if (!rows.length) return { status: "busy", message: "Someone else is reading this proposal now. Reload the page." };
      return { status: "first_read", message: "First read recorded. A different admin, signed in by email, must approve it too before the pull request opens." };
    }
    if (row.first_read_by.toLowerCase() === admin.by.toLowerCase()) {
      return { status: "refused", message: "You gave the first read. The second must come from a different admin." };
    }
  }

  // The claim: one statement, and every condition again in SQL.
  const token = randomUUID();
  const at = clock().toISOString();
  const claimed = await q(
    `update review_proposals set status = 'approving', claim_token = $2, claimed_at = $3::timestamptz, approved_by = $4, approved_at = $3::timestamptz, error = null
     where public_id = $1 and blocked_reason is null
       and (status in ('pending', 'first_read', 'dry_run') or (status = 'approving' and claimed_at < $3::timestamptz - interval '${APPROVAL_CLAIM_SECONDS} seconds'))
       and (not guardrail or ($5 and first_read_by is not null and lower(first_read_by) <> lower($4)))
       and document_only = ($6 = any(paths))
     returning id`,
    [publicId, token, at, admin.by, admin.email, "content/cora/cora.md"],
  );
  if (!claimed.length) return { status: "busy", message: "This proposal is already being approved. Reload the page in a minute." };

  const back = row.guardrail && row.first_read_by ? "first_read" : "pending";
  const mine = async (sql: string, params: unknown[] = []) => {
    const r = await q(`${sql} where id = $1 and claim_token = $2 and status = 'approving' returning id`, [row.id, token, ...params]);
    if (!r.length) throw new ClaimLost();
  };
  const renew = () => mine(`update review_proposals set claimed_at = $3::timestamptz`, [clock().toISOString()]);
  const release = (status: string, fields: Record<string, unknown>) => {
    const keys = Object.keys(fields);
    return mine(
      `update review_proposals set status = $3, claim_token = null, claimed_at = null${keys.map((k, i) => `, ${k} = $${i + 4}`).join("")}`,
      [status, ...keys.map((k) => fields[k])],
    );
  };

  try {
    return await approveClaimed(q, row, admin, d, { clock, mine, renew, release, back });
  } catch (e) {
    if (e instanceof ClaimLost) return { status: "busy", message: "Another approval took this proposal over. Reload the page." };
    if (e instanceof ReadFailed) {
      const note = `Stale check skipped: GitHub couldn't be read (${e.reason}).`;
      await release(back, { check_note: note, dry_run_payload: null, approved_by: null, approved_at: null }).catch(() => {});
      return { status: "check_skipped", message: `${note} Nothing was recorded as a dry run. Try again later.` };
    }
    const error = isGitHubError(e) ? gitHubErrorText(e) : "The approval failed before the pull request was opened.";
    console.error("[review] approve", e instanceof Error ? e.name : "Error", isGitHubError(e) ? `${e.op} ${e.status}` : "");
    await release(back, { error, approved_by: null, approved_at: null }).catch(() => {});
    return { status: "error", message: `${error} The proposal is back in the list; approving again picks up where this stopped.` };
  }
}

type Claimed = {
  clock: () => Date;
  mine: (sql: string, params?: unknown[]) => Promise<void>;
  renew: () => Promise<void>;
  release: (status: string, fields: Record<string, unknown>) => Promise<void>;
  back: string;
};

async function approveClaimed(q: Query, row: Row, admin: ApprovingAdmin, d: ApproveDeps, c: Claimed): Promise<ApproveResult> {
  const { gw } = d.gh;
  const live = d.gh.live;
  const paths = (INSTRUCTION_FILES as readonly string[]).filter((p) => row.paths.includes(p)) as InstructionFile[];
  if (paths.length !== row.paths.length) {
    await c.release("stale", { check_note: "A path is no longer allowlisted." });
    return { status: "stale", message: "A path is no longer allowlisted. Nothing was opened." };
  }
  // In a dry run every failed read skips the stale check; live, it is an error.
  const read = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (!live && isGitHubError(e)) throw new ReadFailed(readReason(e));
      throw e;
    }
  };

  // 1. main's commit and each file there.
  const mainSha = await read(() => gw.getRef(BASE_BRANCH));
  if (!mainSha) throw live ? new Error("main is missing") : new ReadFailed("main not found");
  const mainCommit = await read(() => gw.getCommit(mainSha));
  const main: Record<string, string> = {};
  for (const p of paths) {
    const f = await read(() => gw.getFile(p, mainSha));
    if (!f) {
      await c.release("stale", { check_note: `${p} is not on main any more.`, approved_by: null, approved_at: null });
      return { status: "stale", message: `${p} is not on main any more. Nothing was opened.` };
    }
    main[p] = toLf(f.text);
  }

  // 2. Re-apply the hunks to main.
  const rebased: Hunk[] = [];
  const next: Record<string, string> = {};
  for (const p of paths) {
    const r = rebaseHunks(main[p], row.hunks.filter((h) => h.path === p));
    if (!r.ok) {
      const note = `Stale: the text this proposal replaces in ${p} changed on main (${r.reason === "missing" ? "not found" : r.reason === "not_unique" ? "found more than once" : "the changes now overlap"}).`;
      await c.release("stale", { check_note: note, approved_by: null, approved_at: null });
      return { status: "stale", message: `${note} Nothing was opened.` };
    }
    rebased.push(...r.hunks);
    next[p] = r.text;
  }

  // 3. Unit 7's checks again, on main's text, with today's names.
  const ctx = checkContext({
    evidence: (await loadEvidence(q, { week: row.review_week, now: new Date(row.created_at), admins: d.admins ?? adminEmails() })).items,
    files: { ...(d.files ?? readInstructionFiles()), ...main },
    names: nameTerms(await loadNameSources(q)),
  });
  const checked = checkHunks(rebased, ctx);
  if (typeof checked === "string") {
    const note = `Stale: on main, the change no longer passes the ${checked} check.`;
    await c.release("stale", { check_note: note, approved_by: null, approved_at: null });
    return { status: "stale", message: `${note} Nothing was opened.` };
  }
  if (checked.blocked.size) {
    const reason = `On main, the added text ${[...checked.blocked].join("; ")}.`;
    await c.release("blocked", { blocked_reason: reason, approved_by: null, approved_at: null });
    return { status: "blocked", message: `${reason} The proposal is blocked, and nothing was opened.` };
  }
  if (checked.guard.size && !row.guardrail) {
    await c.release("pending", {
      guardrail: true,
      guardrail_reasons: JSON.stringify([...checked.guard]),
      check_note: "On main, this change now touches a guardrail, so it needs two reads.",
      approved_by: null,
      approved_at: null,
    });
    return { status: "needs_second_read", message: "On main, this change now touches a guardrail. It needs two reads by different email-signed-in admins." };
  }

  // 4. What will be sent, checked once more.
  const id = row.public_id;
  const branch = branchFor(id);
  const diff = paths.map((p) => unifiedDiff(p, main[p], next[p])).filter(Boolean).join("\n");
  const title = prTitle(paths, id);
  const body = prBody(id, diff);
  const message = commitMessage(id);
  const bad = outgoingCheck({ publicId: id, paths, title, body, message }, main, next, ctx);
  if (bad) {
    await c.release(c.back, { error: `The outgoing pull request failed the privacy check (${bad}). Nothing was sent.`, approved_by: null, approved_at: null });
    return { status: "refused", message: `The outgoing pull request failed the privacy check (${bad}). Nothing was sent.` };
  }
  const resultVersions = Object.fromEntries(paths.map((p) => [p, blobSha(next[p])]));
  const { tree, modes } = await read(() => treeWithBlobs(gw, mainCommit.tree, resultVersions));

  // Writes: live, each renews the claim first; a dry run records the request.
  const writes: WriteRequest[] = [];
  const write = async <T>(w: WriteOp, run: () => Promise<T>, dry: T): Promise<T> => {
    if (!live) {
      writes.push(writeRequest(w));
      return dry;
    }
    await c.renew();
    return run();
  };
  const files = paths.map((p) => ({ path: p, mode: modes[p] ?? "100644", content: next[p] }));
  const newCommit = async (): Promise<string> => {
    const t = await write({ op: "createTree", baseTree: mainCommit.tree, files }, () => gw.createTree({ baseTree: mainCommit.tree, files }), tree);
    return write({ op: "createCommit", message, tree: t, parents: [mainSha] }, () => gw.createCommit({ message, tree: t, parents: [mainSha] }), "(new commit)");
  };
  const force = (sha: string) => write({ op: "updateRef", branch, sha, force: true }, () => gw.updateRef(branch, sha, true), undefined);

  // 5. A PR for the branch already merged (an approval whose pr_open write was lost): recorded merged, nothing sent.
  const pulls = await read(() => gw.findPulls(branch));
  const merged = pulls.find((p) => p.merged_at);
  if (merged && live) {
    const versions = row.result_versions ?? (await botCommitVersions(gw, id, paths, merged.head_sha));
    const edited = await editedBeforeMerge(gw, paths, versions, merged);
    await c.release("merged", {
      branch,
      pr_number: merged.number,
      pr_url: merged.url,
      merged_at: merged.merged_at,
      closed_at: merged.closed_at ?? merged.merged_at,
      result_versions: versions ? JSON.stringify(versions) : null,
      edited_before_merge: edited,
      close_pending: false,
      main_commit: mainSha,
      check_note: null,
      error: null,
    });
    await deleteBranch(q, gw, { ...row, branch, branch_deleted_at: null, status: "merged" }, c.clock);
    return { status: "merged", message: `This proposal's pull request #${merged.number} is already merged.`, pr_number: merged.number, pr_url: merged.url };
  }

  // 6. The branch: adopt only an identical tree; otherwise a fresh commit on main, forced.
  const existing = await read(() => gw.getRef(branch));
  let head: string;
  if (existing && (await read(() => gw.getCommit(existing))).tree === tree) {
    head = existing;
  } else if (existing) {
    head = await newCommit();
    await force(head);
  } else {
    head = await newCommit();
    try {
      await write({ op: "createRef", branch, sha: head }, () => gw.createRef(branch, head), undefined);
    } catch (e) {
      // Made meanwhile (a retry, a race): this commit is the fresh one, so move the branch to it.
      if (!(isGitHubError(e) && (e.kind === "unprocessable" || e.kind === "conflict"))) throw e;
      await force(head);
    }
  }
  if (live) await c.mine(`update review_proposals set branch = $3, main_commit = $4, branch_deleted_at = null`, [branch, mainSha]);

  // 7. The pull request: adopt the branch's open one, reopen a closed unmerged one, or open one.
  const createPull = () => write({ op: "createPull", title, body, head: branch, base: BASE_BRANCH }, () => gw.createPull({ title, body, head: branch, base: BASE_BRANCH }), null as PullInfo | null);
  let pr: PullInfo | null = pulls.find((p) => p.state === "open") ?? null;
  if (!pr) {
    const closed = pulls.find((p) => p.state === "closed" && !p.merged_at);
    if (closed) {
      try {
        pr = await write({ op: "updatePull", number: closed.number, state: "open" }, () => gw.updatePull(closed.number, "open"), null);
      } catch (e) {
        if (!(isGitHubError(e) && e.kind === "unprocessable")) throw e;
        pr = await createPull();
      }
    } else {
      try {
        pr = await createPull();
      } catch (e) {
        // "A pull request already exists" for this head: adopt it.
        if (!(isGitHubError(e) && e.kind === "unprocessable")) throw e;
        pr = (await gw.findPulls(branch)).find((p) => p.state === "open") ?? null;
        if (!pr) throw e;
      }
    }
  }
  // An adopted PR shows the freshly built (checked) title and body, so its body matches the commit.
  if (pr && (pr.title !== title || pr.body !== body)) {
    const n = pr.number;
    pr = await write({ op: "editPull", number: n, title, body }, () => gw.editPull(n, title, body), pr);
  }

  if (live) {
    const opened = pr as PullInfo;
    await c.release("pr_open", {
      pr_number: opened.number,
      pr_url: opened.url,
      result_versions: JSON.stringify(resultVersions),
      main_commit: mainSha,
      check_note: null,
      error: null,
      dry_run_payload: null,
    });
  }

  // 8. Superseding: only an older PR whose every changed line this one covers, synced first (live).
  const found = await q<Row>(
    `select ${COLUMNS} from review_proposals where id <> $1 and status = 'pr_open' and paths && $2::text[] order by created_at`,
    [row.id, paths],
  );
  const others: Row[] = [];
  const unsynced = new Set<string>();
  for (const a of found) {
    if (!live) {
      others.push(a);
      continue;
    }
    try {
      if ((await syncOne(q, gw, a, c.clock)) === "pr_open") others.push(a);
    } catch (e) {
      // Not known to be open or merged: shown as an overlap, never closed.
      console.error("[review] pre-supersede sync", isGitHubError(e) ? `${e.op} ${e.status}` : e instanceof Error ? e.name : "Error");
      unsynced.add(a.id);
      others.push(a);
    }
  }
  const overlapOf = (a: Row): Overlap => overlapWith(a, paths, rebased, main);
  const covered = (a: Row) => {
    if (unsynced.has(a.id)) return false;
    const o = overlapOf(a);
    return !o.only_in_other.length && !o.lines_only_in_other.length;
  };
  const overlap: Overlap[] = others.filter((a) => !covered(a)).map(overlapOf);

  if (!live) {
    for (const a of others.filter(covered)) {
      if (a.pr_number) writes.push(writeRequest({ op: "updatePull", number: a.pr_number, state: "closed" }));
      if (a.branch && a.branch === branchFor(a.public_id)) writes.push(writeRequest({ op: "deleteRef", branch: a.branch }));
    }
    const payload = {
      mode: "dry_run",
      why: d.gh.live ? null : d.gh.why,
      main_commit: mainSha,
      branch,
      tree,
      adopted_branch: existing && head === existing ? true : false,
      title,
      body,
      commit_message: message,
      writes,
      supersedes: others.filter(covered).map((a) => a.public_id),
      overlap,
    };
    await c.release("dry_run", { dry_run_payload: JSON.stringify(payload), main_commit: mainSha, check_note: null, error: null });
    return {
      status: "dry_run",
      message: `Dry run (${d.gh.why}): checked against main ${mainSha.slice(0, 7)}; ${writes.length} GitHub write${writes.length === 1 ? "" : "s"} recorded, none sent.`,
      overlap,
      superseded: payload.supersedes,
    };
  }

  const opened = pr as PullInfo;
  const superseded: string[] = [];
  for (const a of others.filter(covered)) {
    try {
      if ((await supersede(q, gw, a, row.id, c.clock)) === "superseded") superseded.push(a.public_id);
    } catch (e) {
      console.error("[review] supersede", isGitHubError(e) ? `${e.op} ${e.status}` : e instanceof Error ? e.name : "Error");
    }
  }
  return {
    status: "pr_open",
    message: `Pull request #${opened.number} is open.${superseded.length ? ` It supersedes ${superseded.join(", ")}.` : ""}${overlap.length ? ` ${overlapText(overlap)}` : ""}`,
    pr_number: opened.number,
    pr_url: opened.url,
    overlap,
    superseded,
  };
}

export const overlapText = (o: Overlap[]) =>
  o
    .map((x) => {
      const parts = [x.only_in_other.length ? x.only_in_other.join(", ") : "", x.lines_only_in_other.length ? `lines of ${x.lines_only_in_other.join(", ")} that this one doesn't` : ""].filter(Boolean);
      return `${x.public_id}${x.pr_number ? ` (#${x.pr_number})` : ""} also changes ${parts.join(", and ")}; both pull requests stay open, and the second to merge may conflict.`;
    })
    .join(" ");

/**
 * Whether the newer hunks cover every line the older ones change in one
 * file, both rebased to `text`. Older hunks that are missing, or no longer
 * apply to `text`, are not covered.
 */
export function hunksCover(text: string | undefined, older: Hunk[], newer: Hunk[]): boolean {
  if (typeof text !== "string" || !older.length) return false;
  const a = rebaseHunks(text, older);
  const b = rebaseHunks(text, newer);
  if (!a.ok || !b.ok) return false;
  return a.hunks.every((h) => {
    for (let l = h.start_line; l <= h.end_line; l++) if (!b.hunks.some((x) => x.start_line <= l && l <= x.end_line)) return false;
    return true;
  });
}

/** What older proposal A changes that B (its paths and hunks) does not, against these files' text. */
function overlapWith(a: Pick<Row, "public_id" | "pr_number" | "paths" | "hunks">, bPaths: readonly string[], bHunks: Hunk[], text: Record<string, string | undefined>): Overlap {
  const aHunks = Array.isArray(a.hunks) ? a.hunks : [];
  return {
    public_id: a.public_id,
    pr_number: a.pr_number,
    only_in_other: a.paths.filter((p) => !bPaths.includes(p)),
    lines_only_in_other: a.paths.filter((p) => bPaths.includes(p) && !hunksCover(text[p], aHunks.filter((h) => h.path === p), bHunks.filter((h) => h.path === p))),
  };
}

/**
 * Open pull requests sharing a file with this proposal that it does not
 * cover (paths only they change, or lines of a shared file this one leaves
 * alone), against the deployed files: shown before approving (Unit 10).
 * Approval decides again against `main`.
 */
export async function overlapWarning(q: Query, publicId: string, files: Partial<Record<InstructionFile, string>> = readInstructionFiles()): Promise<Overlap[]> {
  const [b] = await q<{ id: string; paths: string[]; hunks: Hunk[] | null }>(`select id, paths, hunks from review_proposals where public_id = $1`, [publicId]);
  if (!b) return [];
  const rows = await q<{ public_id: string; pr_number: number | null; paths: string[]; hunks: Hunk[] | null }>(
    `select public_id, pr_number, paths, hunks from review_proposals where id <> $1 and status = 'pr_open' and paths && $2::text[] order by created_at`,
    [b.id, b.paths],
  );
  const text = Object.fromEntries(Object.entries(files).map(([p, t]) => [p, typeof t === "string" ? toLf(t) : undefined]));
  return rows
    .map((a) => overlapWith({ ...a, hunks: a.hunks ?? [] }, b.paths, Array.isArray(b.hunks) ? b.hunks : [], text))
    .filter((a) => a.only_in_other.length > 0 || a.lines_only_in_other.length > 0);
}

// ---------------------------------------------------------------- superseding and sync

/**
 * Supersedes A by B, once the caller has synced A and found it still open
 * (merged or closed is final for A): `close_pending` and `superseded_by`,
 * the close, the branch delete, and `superseded`. Returns what A is now.
 */
async function supersede(q: Query, gw: GitHubGateway, a: Row, by: string, clock: () => Date): Promise<string> {
  const marked = await q(`update review_proposals set close_pending = true, superseded_by = $2 where id = $1 and status = 'pr_open' and not close_pending returning id`, [a.id, by]);
  // Another approval is superseding A already: its close (or the sync's retry) finishes it.
  if (!marked.length) return "changed";
  return closeSuperseded(q, gw, { ...a, close_pending: true, superseded_by: by }, clock);
}

async function closeSuperseded(q: Query, gw: GitHubGateway, a: Row, clock: () => Date): Promise<string> {
  const pr = await gw.updatePull(a.pr_number as number, "closed");
  if (pr.merged_at) return markMerged(q, gw, a, pr, clock);
  const at = clock().toISOString();
  const r = await q(`update review_proposals set status = 'superseded', close_pending = false, closed_at = coalesce(closed_at, $2::timestamptz) where id = $1 and status = 'pr_open' returning id`, [a.id, pr.closed_at ?? at]);
  if (!r.length) return "changed";
  await deleteBranch(q, gw, { ...a, status: "superseded" }, clock);
  return "superseded";
}

/** Whether the merged head's blobs differ from what the bot committed (unknown counts as edited). */
async function editedBeforeMerge(gw: GitHubGateway, paths: readonly string[], versions: Record<string, string> | null, pr: PullInfo): Promise<boolean> {
  let edited = false;
  for (const p of paths) {
    const f = pr.head_sha ? await gw.getFile(p, pr.head_sha) : null;
    if (!f || f.sha !== versions?.[p]) edited = true;
  }
  return edited;
}

/**
 * The blob SHAs of the bot's own commit for this proposal (its fixed
 * message), walking first parents back from a PR's head (a person may have
 * pushed on top). Null when it isn't found within a few commits.
 */
async function botCommitVersions(gw: GitHubGateway, publicId: string, paths: readonly string[], headSha: string): Promise<Record<string, string> | null> {
  let sha: string | undefined = headSha;
  for (let i = 0; sha && i < 20; i++) {
    const c = await gw.getCommit(sha);
    if (c.message === commitMessage(publicId)) {
      const out: Record<string, string> = {};
      for (const p of paths) {
        const f = await gw.getFile(p, c.sha);
        if (!f) return null;
        out[p] = f.sha;
      }
      return out;
    }
    sha = c.parents[0];
  }
  return null;
}

/** Merged is final: recorded once, with edited_before_merge when the merged head's blobs differ from what the bot committed. */
async function markMerged(q: Query, gw: GitHubGateway, a: Row, pr: PullInfo, clock: () => Date): Promise<string> {
  const edited = await editedBeforeMerge(gw, a.paths, a.result_versions, pr);
  await q(
    `update review_proposals set status = 'merged', merged_at = $2::timestamptz, closed_at = coalesce($3::timestamptz, $2::timestamptz), edited_before_merge = $4, close_pending = false
     where id = $1 and status = 'pr_open'`,
    [a.id, pr.merged_at, pr.closed_at, edited],
  );
  await deleteBranch(q, gw, { ...a, status: "merged" }, clock);
  return "merged";
}

async function deleteBranch(q: Query, gw: GitHubGateway, a: Row, clock: () => Date): Promise<void> {
  if (!a.branch || a.branch_deleted_at) return;
  if (a.branch !== branchFor(a.public_id)) {
    // Only ever the proposal's own branch (guardWrite also refuses anything but review-bot/{public_id}).
    console.error("[review] delete branch: not this proposal's review-bot branch; left alone");
    return;
  }
  try {
    await gw.deleteRef(a.branch);
    await q(`update review_proposals set branch_deleted_at = $2::timestamptz where id = $1 and branch_deleted_at is null`, [a.id, clock().toISOString()]);
  } catch (e) {
    // Retried on the next sync.
    console.error("[review] delete branch", isGitHubError(e) ? `${e.op} ${e.status}` : e instanceof Error ? e.name : "Error");
  }
}

/** One proposal's PR state, read from GitHub and recorded. A pending supersede close is retried. Returns the status now. */
async function syncOne(q: Query, gw: GitHubGateway, a: Row, clock: () => Date): Promise<string> {
  if (a.status !== "pr_open" || !a.pr_number) {
    if (["merged", "closed", "superseded"].includes(a.status)) await deleteBranch(q, gw, a, clock);
    return a.status;
  }
  const pr = await gw.getPull(a.pr_number);
  if (pr.merged_at) return markMerged(q, gw, a, pr, clock);
  if (pr.state === "closed") {
    // A close of ours whose answer was lost is a supersede; otherwise a person closed it.
    const status = a.close_pending && a.superseded_by ? "superseded" : "closed";
    await q(`update review_proposals set status = $2, closed_at = $3::timestamptz, close_pending = false where id = $1 and status = 'pr_open'`, [a.id, status, pr.closed_at ?? clock().toISOString()]);
    await deleteBranch(q, gw, { ...a, status }, clock);
    return status;
  }
  if (a.close_pending) return closeSuperseded(q, gw, a, clock);
  return "pr_open";
}

export type SyncResult = { status: "synced" | "skipped"; note?: string; checked: number; merged: number; closed: number; superseded: number; errors: number };

/**
 * PR status sync (every review cron tick and the hourly `review_pr_sync`
 * task, each through syncPullRequestsLeased; "Refresh from GitHub"; before
 * every supersede): each open PR's state, merged-is-final with
 * edited_before_merge, pending supersede closes retried, and the head
 * branches of merged and closed PRs deleted (a 404 or 422 counts as
 * deleted; a failure is retried next time). Live only: a dry run has no
 * PRs to sync.
 */
export async function syncPullRequests(q: Query, gh: ReviewGitHub, o: { clock?: () => Date; closePendingOnly?: boolean } = {}): Promise<SyncResult> {
  const out: SyncResult = { status: "synced", checked: 0, merged: 0, closed: 0, superseded: 0, errors: 0 };
  if (!gh.live) return { ...out, status: "skipped", note: `Dry run (${gh.why}): there are no pull requests to sync.` };
  const clock = o.clock ?? (() => new Date());
  const rows = await q<Row>(
    `select ${COLUMNS} from review_proposals
     where pr_number is not null
       and ${o.closePendingOnly ? `close_pending and status = 'pr_open'` : `(status = 'pr_open' or (status in ('merged', 'closed', 'superseded') and branch is not null and branch_deleted_at is null))`}
     order by created_at`,
  );
  for (const a of rows) {
    out.checked++;
    try {
      const s = await syncOne(q, gh.gw, a, clock);
      if (a.status === "pr_open") {
        if (s === "merged") out.merged++;
        else if (s === "closed") out.closed++;
        else if (s === "superseded") out.superseded++;
      }
    } catch (e) {
      out.errors++;
      console.error("[review] sync", isGitHubError(e) ? `${e.op} ${e.status}` : e instanceof Error ? e.name : "Error");
    }
  }
  return out;
}

/** The PR sync's own short lease, so the review crons, the hourly task and "Refresh from GitHub" never sync at once. */
export const PR_SYNC_LEASE = "review-pr-sync";
export const PR_SYNC_LEASE_SECONDS = 120;

/**
 * syncPullRequests under PR_SYNC_LEASE (not the review run's lease, so a
 * long model call never holds it up). Live only: otherwise skipped with no
 * lease taken. Busy: skipped, the next tick tries again.
 */
export async function syncPullRequestsLeased(q: Query, gh: ReviewGitHub, o: { clock?: () => Date; holder?: string } = {}): Promise<SyncResult> {
  if (!gh.live) return syncPullRequests(q, gh, o);
  const holder = o.holder ?? `pr-sync-${randomUUID()}`;
  if (!(await takeLease(q, PR_SYNC_LEASE, holder, PR_SYNC_LEASE_SECONDS))) {
    return { status: "skipped", note: "Another pull request sync is running.", checked: 0, merged: 0, closed: 0, superseded: 0, errors: 0 };
  }
  try {
    return await syncPullRequests(q, gh, o);
  } finally {
    await releaseLease(q, PR_SYNC_LEASE, holder).catch(() => {});
  }
}

/** Retries the closes of superseded PRs that failed (each re-synced first). Also part of every syncPullRequests. */
export function retrySupersedeCloses(q: Query, gh: ReviewGitHub, o: { clock?: () => Date } = {}): Promise<SyncResult> {
  return syncPullRequests(q, gh, { ...o, closePendingOnly: true });
}
