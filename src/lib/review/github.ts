import "server-only";
import { createHash } from "node:crypto";
import type { V3Settings } from "@/lib/v3-settings";

/**
 * The review bot's GitHub calls (B3 plan Unit 9, origin R18 and R19): the
 * Git Data API (refs, trees, commits), Contents (a file's blob SHA and text)
 * and Pulls, over `fetch`, on MeetRogerAI/roger only. Branch protection on
 * `main` means nothing here ever writes to `main`: the bot only creates and
 * moves `review-bot/{public_id}` refs and opens, reopens and closes its own
 * pull requests.
 *
 * Tokens (server-only; this module imports "server-only"):
 * - `GITHUB_REVIEW_TOKEN`: the write token, from a machine account Peter
 *   owns (contents and pull requests: write, this repository only). Used
 *   only when live.
 * - `GITHUB_READ_TOKEN`: optional, read-only (contents read and metadata),
 *   for dry-run reads of `main`. Without it, dry-run reads are
 *   unauthenticated (60 an hour per IP).
 * A token is held in a closure, sent only in the Authorization header, and
 * never appears in an error message, a log line or a stored row.
 *
 * All GitHub I/O goes through the `GitHubGateway` interface, so tests run
 * against `src/test-helpers/fake-github.ts` and never reach the network.
 */

export const REPO_OWNER = "MeetRogerAI";
export const REPO_NAME = "roger";
export const REPO = `${REPO_OWNER}/${REPO_NAME}`;
export const BASE_BRANCH = "main";
const API = `https://api.github.com/repos/${REPO}`;

export const branchFor = (publicId: string) => `review-bot/${publicId}`;
/** The only branches the bot may create, move or delete: `review-bot/` and a public id. */
export const BOT_BRANCH = /^review-bot\/[a-z2-7]{10}$/;

export type TreeEntry = { path: string; mode: string; type: "blob" | "tree" | "commit"; sha: string };
export type CommitInfo = { sha: string; tree: string; parents: string[]; message: string };
export type FileInfo = { sha: string; text: string };
export type PullInfo = {
  number: number;
  url: string;
  state: "open" | "closed";
  merged_at: string | null;
  closed_at: string | null;
  head_ref: string;
  head_sha: string;
  title: string;
  body: string;
};

/** What a GitHub error means for the caller. Never holds a token or a request body. */
export type GitHubErrorKind = "auth" | "not_found" | "conflict" | "unprocessable" | "rate_limited" | "unavailable" | "other";

export class GitHubError extends Error {
  name = "GitHubError";
  constructor(
    public kind: GitHubErrorKind,
    public status: number,
    /** The operation, e.g. "POST git/refs", without ids or bodies. */
    public op: string,
    /** GitHub's own short message (e.g. "Reference already exists"), secrets removed, at most 120 characters. */
    public detail = "",
  ) {
    super(`GitHub ${op} failed (${status || "no response"}, ${kind})`);
  }
}

export const isGitHubError = (e: unknown): e is GitHubError => e instanceof GitHubError;

/** A readable, fixed message for an admin and for proposals.error: never GitHub's raw text, never a token. */
export function gitHubErrorText(e: unknown): string {
  if (!isGitHubError(e)) return "GitHub could not be reached.";
  switch (e.kind) {
    case "auth":
      return `GitHub refused the request (${e.status}): the token is missing a permission, or is not set.`;
    case "rate_limited":
      return `GitHub's rate limit was reached (${e.status}). Try again later.`;
    case "not_found":
      return `GitHub has no such object (${e.op}, 404).`;
    case "unavailable":
      return `GitHub could not be reached (${e.op}${e.status ? `, ${e.status}` : ""}).`;
    default:
      return `GitHub refused ${e.op} (${e.status}).`;
  }
}

// ---------------------------------------------------------------- writes, described

/**
 * Every write the bot can make, as data: the live gateway sends exactly
 * `writeRequest(op)`, and a dry run records it instead (dry_run_payload),
 * so what a dry run shows is what live would send.
 */
export type WriteOp =
  | { op: "createTree"; baseTree: string; files: { path: string; mode: string; content: string }[] }
  | { op: "createCommit"; message: string; tree: string; parents: string[] }
  | { op: "createRef"; branch: string; sha: string }
  | { op: "updateRef"; branch: string; sha: string; force: boolean }
  | { op: "deleteRef"; branch: string }
  | { op: "createPull"; title: string; body: string; head: string; base: string }
  | { op: "updatePull"; number: number; state: "open" | "closed" }
  | { op: "editPull"; number: number; title: string; body: string };

export type WriteRequest = { method: "POST" | "PATCH" | "DELETE"; path: string; body?: Record<string, unknown> };

/** Thrown before anything is sent when a write would touch something other than the bot's own branches and pull requests. */
export class UnsafeWrite extends Error {
  name = "UnsafeWrite";
}

/**
 * The gateway's own guard, whatever the caller: refs only under
 * `review-bot/{public_id}` (never `main`, never another branch), pull
 * requests only from such a branch into `main`, and PR numbers positive
 * integers. Branch protection on `main` is the second line, not the first.
 */
export function guardWrite(w: WriteOp): void {
  switch (w.op) {
    case "createRef":
    case "updateRef":
    case "deleteRef":
      if (typeof w.branch !== "string" || !BOT_BRANCH.test(w.branch)) throw new UnsafeWrite(`${w.op}: not a review-bot branch`);
      return;
    case "createPull":
      if (typeof w.head !== "string" || !BOT_BRANCH.test(w.head)) throw new UnsafeWrite("createPull: head is not a review-bot branch");
      if (w.base !== BASE_BRANCH) throw new UnsafeWrite("createPull: base is not main");
      return;
    case "updatePull":
    case "editPull":
      if (!Number.isInteger(w.number) || w.number < 1) throw new UnsafeWrite(`${w.op}: not a pull request number`);
      return;
    default:
      return;
  }
}

/** Each path segment percent-encoded, as the reads do. */
const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

/** The request for a write, after guardWrite (so a dry run records only what live could send). */
export function writeRequest(w: WriteOp): WriteRequest {
  guardWrite(w);
  switch (w.op) {
    case "createTree":
      return { method: "POST", path: "git/trees", body: { base_tree: w.baseTree, tree: w.files.map((f) => ({ path: f.path, mode: f.mode, type: "blob", content: f.content })) } };
    case "createCommit":
      return { method: "POST", path: "git/commits", body: { message: w.message, tree: w.tree, parents: w.parents } };
    case "createRef":
      return { method: "POST", path: "git/refs", body: { ref: `refs/heads/${w.branch}`, sha: w.sha } };
    case "updateRef":
      return { method: "PATCH", path: `git/refs/heads/${enc(w.branch)}`, body: { sha: w.sha, force: w.force } };
    case "deleteRef":
      return { method: "DELETE", path: `git/refs/heads/${enc(w.branch)}` };
    case "createPull":
      return { method: "POST", path: "pulls", body: { title: w.title, body: w.body, head: w.head, base: w.base, maintainer_can_modify: false } };
    case "updatePull":
      return { method: "PATCH", path: `pulls/${w.number}`, body: { state: w.state } };
    case "editPull":
      return { method: "PATCH", path: `pulls/${w.number}`, body: { title: w.title, body: w.body } };
  }
}

export interface GitHubGateway {
  /** Whether this gateway may write (the live one). A read-only gateway throws on every write before sending it. */
  readonly canWrite: boolean;
  /** The commit a branch points at, or null when the branch does not exist. */
  getRef(branch: string): Promise<string | null>;
  getCommit(sha: string): Promise<CommitInfo>;
  /** One tree's entries (not recursive), in git's order. */
  getTree(sha: string): Promise<TreeEntry[]>;
  /** A file's blob SHA and UTF-8 text at a ref (Contents API), or null when there is no such file. */
  getFile(path: string, ref: string): Promise<FileInfo | null>;
  /** Pull requests whose head is this branch of the repository, any state. */
  findPulls(branch: string): Promise<PullInfo[]>;
  getPull(number: number): Promise<PullInfo>;

  createTree(w: Omit<Extract<WriteOp, { op: "createTree" }>, "op">): Promise<string>;
  createCommit(w: Omit<Extract<WriteOp, { op: "createCommit" }>, "op">): Promise<string>;
  createRef(branch: string, sha: string): Promise<void>;
  updateRef(branch: string, sha: string, force: boolean): Promise<void>;
  /** "gone" when the ref did not exist (GitHub's 404 or 422), which counts as deleted. */
  deleteRef(branch: string): Promise<"deleted" | "gone">;
  createPull(w: Omit<Extract<WriteOp, { op: "createPull" }>, "op">): Promise<PullInfo>;
  updatePull(number: number, state: "open" | "closed"): Promise<PullInfo>;
  /** Sets an adopted PR's title and body to the freshly built (checked) ones. */
  editPull(number: number, title: string, body: string): Promise<PullInfo>;
}

// ---------------------------------------------------------------- git objects

/** sha1 of a git object ("{type} {length}\0{body}"). */
function objectSha(type: string, body: Buffer): string {
  return createHash("sha1").update(`${type} ${body.length}\0`).update(body).digest("hex");
}

/**
 * The SHA of a tree with these entries, in the order given (git's order,
 * as GitHub returns it: the bot only replaces existing files, so the order
 * never changes). Modes as GitHub writes them ("040000") are written as git
 * stores them ("40000").
 */
export function treeSha(entries: TreeEntry[]): string {
  const parts: Buffer[] = [];
  for (const e of entries) {
    parts.push(Buffer.from(`${e.mode.replace(/^0+/, "")} ${e.path}\0`, "utf8"), Buffer.from(e.sha, "hex"));
  }
  return objectSha("tree", Buffer.concat(parts));
}

/**
 * The root tree SHA after replacing some files' blobs, computed from the
 * existing trees with no write (so a dry run and the adopt-or-force check
 * can compare trees). Every path must already be a blob in the tree. Also
 * returns each path's mode, for the tree that is then created.
 */
export async function treeWithBlobs(gw: Pick<GitHubGateway, "getTree">, rootTree: string, blobs: Record<string, string>): Promise<{ tree: string; modes: Record<string, string> }> {
  const modes: Record<string, string> = {};
  const rebuild = async (treeSha_: string, prefix: string, changes: [string, string][]): Promise<string> => {
    const entries = (await gw.getTree(treeSha_)).map((e) => ({ ...e }));
    const groups = new Map<string, [string, string][]>();
    for (const [rel, sha] of changes) {
      const slash = rel.indexOf("/");
      if (slash === -1) {
        const e = entries.find((x) => x.path === rel && x.type === "blob");
        if (!e) throw new GitHubError("not_found", 404, "git/trees (path)");
        e.sha = sha;
        modes[prefix + rel] = e.mode;
      } else {
        const dir = rel.slice(0, slash);
        groups.set(dir, [...(groups.get(dir) ?? []), [rel.slice(slash + 1), sha]]);
      }
    }
    for (const [dir, sub] of groups) {
      const e = entries.find((x) => x.path === dir && x.type === "tree");
      if (!e) throw new GitHubError("not_found", 404, "git/trees (path)");
      e.sha = await rebuild(e.sha, `${prefix}${dir}/`, sub);
    }
    return treeSha(entries);
  };
  const tree = await rebuild(rootTree, "", Object.entries(blobs));
  return { tree, modes };
}

// ---------------------------------------------------------------- the fetch gateway

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

const TOKEN_LIKE = /\b(?:gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,})\b/g;

function classify(status: number, headers: { get(n: string): string | null }): GitHubErrorKind {
  if (status === 429) return "rate_limited";
  if (status === 403 && (headers.get("x-ratelimit-remaining") === "0" || headers.get("retry-after"))) return "rate_limited";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "unprocessable";
  if (status >= 500) return "unavailable";
  return "other";
}

type RawPull = { number: number; html_url: string; state: string; merged_at: string | null; closed_at: string | null; head: { ref: string; sha: string }; title?: string | null; body?: string | null };
const toPull = (p: RawPull): PullInfo => ({
  number: p.number,
  url: p.html_url,
  state: p.state === "open" ? "open" : "closed",
  merged_at: p.merged_at ?? null,
  closed_at: p.closed_at ?? null,
  head_ref: p.head?.ref ?? "",
  head_sha: p.head?.sha ?? "",
  title: p.title ?? "",
  body: p.body ?? "",
});

/**
 * The real gateway. `token` is optional (unauthenticated reads); `canWrite`
 * false makes every write throw before anything is sent.
 */
export function fetchGitHub(o: { token?: string | null; canWrite: boolean; fetch?: FetchLike; timeoutMs?: number }): GitHubGateway {
  const doFetch: FetchLike = o.fetch ?? ((url, init) => fetch(url, init));
  const token = o.token || null;
  const scrub = (s: string) => {
    let out = s.replace(TOKEN_LIKE, "[removed]");
    if (token) out = out.split(token).join("[removed]");
    return out.slice(0, 120);
  };

  async function call<T>(method: string, path: string, opName: string, body?: unknown): Promise<{ status: number; data: T | null }> {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "roger-review-bot",
    };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(`${API}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(o.timeoutMs ?? 15_000) });
    } catch {
      // A network error or timeout: its message can hold the URL, never the token, but keep it out anyway.
      throw new GitHubError("unavailable", 0, opName);
    }
    if (res.status === 204) return { status: 204, data: null };
    if (res.status >= 200 && res.status < 300) return { status: res.status, data: (await res.json()) as T };
    let detail = "";
    try {
      const j = (await res.json()) as { message?: unknown };
      if (typeof j?.message === "string") detail = scrub(j.message);
    } catch {
      /* no body */
    }
    throw new GitHubError(classify(res.status, res.headers), res.status, opName, detail);
  }

  async function write<T>(w: WriteOp, opName: string): Promise<T | null> {
    if (!o.canWrite) throw new GitHubError("auth", 0, `${opName} (read-only gateway)`);
    // writeRequest runs guardWrite: an unsafe write throws here, before any fetch.
    const r = writeRequest(w);
    return (await call<T>(r.method, r.path, opName, r.body)).data;
  }

  return {
    canWrite: o.canWrite,
    async getRef(branch) {
      try {
        const r = await call<{ object: { sha: string } }>("GET", `git/ref/heads/${enc(branch)}`, "GET git/ref");
        return r.data?.object?.sha ?? null;
      } catch (e) {
        if (isGitHubError(e) && e.kind === "not_found") return null;
        throw e;
      }
    },
    async getCommit(sha) {
      const r = await call<{ sha: string; tree: { sha: string }; parents: { sha: string }[]; message?: string }>("GET", `git/commits/${enc(sha)}`, "GET git/commits");
      const d = r.data as NonNullable<typeof r.data>;
      return { sha: d.sha, tree: d.tree.sha, parents: (d.parents ?? []).map((p) => p.sha), message: d.message ?? "" };
    },
    async getTree(sha) {
      const r = await call<{ tree: TreeEntry[] }>("GET", `git/trees/${enc(sha)}`, "GET git/trees");
      return (r.data?.tree ?? []).map((e) => ({ path: e.path, mode: e.mode, type: e.type, sha: e.sha }));
    },
    async getFile(path, ref) {
      try {
        const r = await call<{ type: string; sha: string; content?: string; encoding?: string }>("GET", `contents/${enc(path)}?ref=${encodeURIComponent(ref)}`, "GET contents");
        const d = r.data;
        if (!d || d.type !== "file" || typeof d.content !== "string") return null;
        const text = d.encoding === "base64" ? Buffer.from(d.content.replace(/\s/g, ""), "base64").toString("utf8") : d.content;
        return { sha: d.sha, text };
      } catch (e) {
        if (isGitHubError(e) && e.kind === "not_found") return null;
        throw e;
      }
    },
    async findPulls(branch) {
      const r = await call<RawPull[]>("GET", `pulls?head=${encodeURIComponent(`${REPO_OWNER}:${branch}`)}&state=all&per_page=100`, "GET pulls");
      return (r.data ?? []).map(toPull);
    },
    async getPull(number) {
      const r = await call<RawPull>("GET", `pulls/${number}`, "GET pulls/{n}");
      return toPull(r.data as RawPull);
    },
    async createTree(w) {
      return ((await write<{ sha: string }>({ op: "createTree", ...w }, "POST git/trees")) as { sha: string }).sha;
    },
    async createCommit(w) {
      return ((await write<{ sha: string }>({ op: "createCommit", ...w }, "POST git/commits")) as { sha: string }).sha;
    },
    async createRef(branch, sha) {
      await write({ op: "createRef", branch, sha }, "POST git/refs");
    },
    async updateRef(branch, sha, force) {
      await write({ op: "updateRef", branch, sha, force }, "PATCH git/refs");
    },
    async deleteRef(branch) {
      try {
        await write({ op: "deleteRef", branch }, "DELETE git/refs");
        return "deleted";
      } catch (e) {
        if (isGitHubError(e) && e.status !== 0 && (e.kind === "not_found" || e.kind === "unprocessable")) return "gone";
        throw e;
      }
    },
    async createPull(w) {
      return toPull((await write<RawPull>({ op: "createPull", ...w }, "POST pulls")) as RawPull);
    },
    async updatePull(number, state) {
      return toPull((await write<RawPull>({ op: "updatePull", number, state }, "PATCH pulls/{n}")) as RawPull);
    },
    async editPull(number, title, body) {
      return toPull((await write<RawPull>({ op: "editPull", number, title, body }, "PATCH pulls/{n}")) as RawPull);
    },
  };
}

// ---------------------------------------------------------------- mode

export type ReviewGitHub = { live: true; gw: GitHubGateway } | { live: false; gw: GitHubGateway; why: string };

type Env = { VERCEL_ENV?: string; GITHUB_REVIEW_TOKEN?: string; GITHUB_READ_TOKEN?: string; [k: string]: string | undefined };

/**
 * Live only when VERCEL_ENV is "production", GITHUB_REVIEW_TOKEN is set and
 * v3.reviewBotOn is on. Otherwise dry-run: a read-only gateway with
 * GITHUB_READ_TOKEN when set, unauthenticated otherwise.
 */
export function reviewGitHub(settings: Pick<V3Settings, "reviewBotOn">, env: Env = process.env, f?: FetchLike): ReviewGitHub {
  const write = env.GITHUB_REVIEW_TOKEN?.trim();
  if (env.VERCEL_ENV === "production" && write && settings.reviewBotOn) return { live: true, gw: fetchGitHub({ token: write, canWrite: true, fetch: f }) };
  const why =
    env.VERCEL_ENV !== "production" ? "this is not the production deployment" : !write ? "GITHUB_REVIEW_TOKEN is not set" : "the review bot is switched off (v3.reviewBotOn)";
  return { live: false, why, gw: fetchGitHub({ token: env.GITHUB_READ_TOKEN?.trim() || null, canWrite: false, fetch: f }) };
}

/**
 * The PR status sync's mode (the review crons' every tick and the hourly
 * `review_pr_sync` task): live when VERCEL_ENV is "production" and
 * GITHUB_REVIEW_TOKEN is set, whatever v3.reviewBotOn says. The sync only
 * reads the bot's own PRs and records merges and closes, retries its own
 * pending supersede closes and deletes its own merged or closed
 * `review-bot/` branches (guardWrite), so switching the bot off must not
 * leave a merge unrecorded. Otherwise not live, and the sync does nothing.
 */
export function reviewSyncGitHub(env: Env = process.env, f?: FetchLike): ReviewGitHub {
  const write = env.GITHUB_REVIEW_TOKEN?.trim();
  if (env.VERCEL_ENV === "production" && write) return { live: true, gw: fetchGitHub({ token: write, canWrite: true, fetch: f }) };
  const why = env.VERCEL_ENV !== "production" ? "this is not the production deployment" : "GITHUB_REVIEW_TOKEN is not set";
  return { live: false, why, gw: fetchGitHub({ token: env.GITHUB_READ_TOKEN?.trim() || null, canWrite: false, fetch: f }) };
}
