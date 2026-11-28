import { blobSha } from "@/lib/instructions/version";
import {
  BASE_BRANCH,
  type CommitInfo,
  type FileInfo,
  GitHubError,
  type GitHubGateway,
  guardWrite,
  type PullInfo,
  type TreeEntry,
  treeSha,
  type WriteOp,
  writeRequest,
  type WriteRequest,
} from "@/lib/review/github";

/**
 * A fake of MeetRogerAI/roger on GitHub, strict like GitHub (B3 plan Unit 9):
 *
 * - git objects are content-addressed with git's own hashing (blobs, trees,
 *   commits), so an identical tree has an identical SHA, as on GitHub;
 * - creating a branch that exists gives 422; moving a ref to a commit that
 *   does not descend from it, without `force`, gives 422; deleting a missing
 *   ref gives 422;
 * - a tree needs a valid base, a commit a valid tree and parents;
 * - a pull request for a head that already has an open one gives 422, as
 *   does one whose head or base branch is missing; reopening a merged one
 *   gives 422; closing a closed one is a no-op;
 * - unknown paths, refs, commits and pull requests give 404;
 * - unauthenticated calls share a rate limit (`unauthenticatedLimit`), and
 *   past it every call gets 403 with x-ratelimit-remaining 0; `failNext(op,
 *   status)` fails the next such call (429, 403, 409, 500 …) before it acts.
 *
 * - every write goes through the real gateway's `guardWrite` first, so a
 *   write to `main` or to a branch that isn't `review-bot/{public_id}` throws
 *   before it is logged or acts, as the real gateway throws before fetch.
 *
 * `gateway({ token, canWrite })` hands out a GitHubGateway; every call is
 * logged in `calls` with the token it carried, and every write in `writes`
 * as the request the real gateway would send (`writeRequest`).
 * `pushMain(files)`, `merge(n, edits?)` and `closePull(n)` are people acting
 * on GitHub.
 */

type Commit = { tree: string; parents: string[]; message: string };
type Pull = { number: number; head: string; base: string; title: string; body: string; state: "open" | "closed"; merged_at: string | null; closed_at: string | null; head_sha: string };
export type FakeOp =
  | "getRef"
  | "getCommit"
  | "getTree"
  | "getFile"
  | "findPulls"
  | "getPull"
  | "createTree"
  | "createCommit"
  | "createRef"
  | "updateRef"
  | "deleteRef"
  | "createPull"
  | "updatePull"
  | "editPull";

const WRITES: FakeOp[] = ["createTree", "createCommit", "createRef", "updateRef", "deleteRef", "createPull", "updatePull", "editPull"];

export function fakeGitHub(initial: Record<string, string>, o: { unauthenticatedLimit?: number; now?: () => Date } = {}) {
  const blobs = new Map<string, string>();
  const trees = new Map<string, TreeEntry[]>();
  const commits = new Map<string, Commit>();
  const refs = new Map<string, string>();
  const pulls: Pull[] = [];
  const calls: { op: FakeOp; token: string | null; arg?: string }[] = [];
  const writes: WriteRequest[] = [];
  const failing: { op: FakeOp; status: number; headers?: Record<string, string>; detail?: string }[] = [];
  let unauth = o.unauthenticatedLimit ?? Infinity;
  const clock = o.now ?? (() => new Date());
  let commitN = 0;

  const err = (status: number, op: string, detail = "") =>
    new GitHubError(status === 404 ? "not_found" : status === 409 ? "conflict" : status === 422 ? "unprocessable" : status === 401 ? "auth" : "other", status, op, detail);

  function putBlob(text: string): string {
    const sha = blobSha(text);
    blobs.set(sha, text);
    return sha;
  }

  /** Builds trees for a flat map of files and returns the root's SHA. Entries in git's order. */
  function buildTree(files: Record<string, string>): string {
    const here: Record<string, string> = {};
    const dirs: Record<string, Record<string, string>> = {};
    for (const [p, text] of Object.entries(files)) {
      const i = p.indexOf("/");
      if (i === -1) here[p] = text;
      else (dirs[p.slice(0, i)] ??= {})[p.slice(i + 1)] = text;
    }
    const entries: TreeEntry[] = [
      ...Object.entries(here).map(([name, text]) => ({ path: name, mode: "100644", type: "blob" as const, sha: putBlob(text) })),
      ...Object.entries(dirs).map(([name, sub]) => ({ path: name, mode: "040000", type: "tree" as const, sha: buildTree(sub) })),
    ].sort((a, b) => Buffer.compare(Buffer.from(a.type === "tree" ? `${a.path}/` : a.path), Buffer.from(b.type === "tree" ? `${b.path}/` : b.path)));
    const sha = treeSha(entries);
    trees.set(sha, entries);
    return sha;
  }

  /** Every file in a tree, flat. */
  function flatten(tree: string, prefix = ""): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of trees.get(tree) ?? []) {
      if (e.type === "blob") out[prefix + e.path] = blobs.get(e.sha) as string;
      else Object.assign(out, flatten(e.sha, `${prefix}${e.path}/`));
    }
    return out;
  }

  function putCommit(tree: string, parents: string[], message: string): string {
    // Unique per call (a real commit carries a timestamp and author).
    const sha = blobSha(`commit ${tree} ${parents.join(",")} ${message} ${++commitN}`);
    commits.set(sha, { tree, parents, message });
    return sha;
  }

  const descends = (sha: string, ancestor: string): boolean => {
    const seen = new Set<string>();
    const stack = [sha];
    while (stack.length) {
      const s = stack.pop() as string;
      if (s === ancestor) return true;
      if (seen.has(s)) continue;
      seen.add(s);
      stack.push(...(commits.get(s)?.parents ?? []));
    }
    return false;
  };

  refs.set(BASE_BRANCH, putCommit(buildTree(initial), [], "initial"));

  const resolve = (ref: string): string | null => refs.get(ref) ?? (commits.has(ref) ? ref : null);
  const fileAt = (ref: string, path: string): string | null => {
    const c = resolve(ref);
    if (!c) return null;
    return flatten((commits.get(c) as Commit).tree)[path] ?? null;
  };
  const toInfo = (p: Pull): PullInfo => ({
    number: p.number,
    url: `https://github.com/MeetRogerAI/roger/pull/${p.number}`,
    state: p.state,
    merged_at: p.merged_at,
    closed_at: p.closed_at,
    head_ref: p.head,
    head_sha: refs.get(p.head) ?? p.head_sha,
    title: p.title,
    body: p.body,
  });

  function enter(op: FakeOp, token: string | null, canWrite: boolean, arg?: string, write?: WriteOp) {
    calls.push({ op, token, arg });
    if (WRITES.includes(op) && !canWrite) throw new Error(`fake GitHub: a write (${op}) through a read-only gateway`);
    if (write) guardWrite(write);
    if (WRITES.includes(op) && !token) throw err(401, op);
    const i = failing.findIndex((f) => f.op === op);
    if (i !== -1) {
      const [f] = failing.splice(i, 1);
      const limited = f.status === 429 || f.headers?.["x-ratelimit-remaining"] === "0";
      throw new GitHubError(limited ? "rate_limited" : f.status === 403 || f.status === 401 ? "auth" : err(f.status, op).kind, f.status, op, f.detail ?? "");
    }
    if (!token) {
      if (unauth <= 0) throw new GitHubError("rate_limited", 403, op, "API rate limit exceeded");
      unauth--;
    }
  }

  const now = () => clock().toISOString();

  return {
    calls,
    writes,
    refs,
    pulls,
    /** The next call of this kind fails with this status before it acts. */
    failNext(op: FakeOp, status: number, headers?: Record<string, string>, detail?: string) {
      failing.push({ op, status, headers, detail });
    },
    setUnauthenticatedLimit(n: number) {
      unauth = n;
    },
    /** A person commits to main (files changed or added). */
    pushMain(files: Record<string, string>) {
      const head = refs.get(BASE_BRANCH) as string;
      const tree = buildTree({ ...flatten((commits.get(head) as Commit).tree), ...files });
      refs.set(BASE_BRANCH, putCommit(tree, [head], "a person's commit"));
    },
    /** A branch built by hand (for adoption tests): files on top of a commit. */
    makeBranch(branch: string, files: Record<string, string>, onto = refs.get(BASE_BRANCH) as string) {
      const tree = buildTree({ ...flatten((commits.get(onto) as Commit).tree), ...files });
      refs.set(branch, putCommit(tree, [onto], "a branch"));
    },
    /** A person merges a PR, optionally after pushing edits to its branch first. */
    merge(number: number, edits?: Record<string, string>) {
      const p = pulls.find((x) => x.number === number);
      if (!p || p.state !== "open") throw new Error("fake GitHub: merge needs an open PR");
      if (edits) {
        const head = refs.get(p.head) as string;
        refs.set(p.head, putCommit(buildTree({ ...flatten((commits.get(head) as Commit).tree), ...edits }), [head], "edit on GitHub"));
      }
      const head = refs.get(p.head) as string;
      const main = refs.get(BASE_BRANCH) as string;
      refs.set(BASE_BRANCH, putCommit((commits.get(head) as Commit).tree, [main, head], "merge"));
      p.head_sha = head;
      p.state = "closed";
      p.merged_at = now();
      p.closed_at = p.merged_at;
    },
    closePull(number: number) {
      const p = pulls.find((x) => x.number === number) as Pull;
      p.head_sha = refs.get(p.head) ?? p.head_sha;
      p.state = "closed";
      p.closed_at = now();
    },
    file: (ref: string, path: string) => fileAt(ref, path),
    /** The files a commit (or branch) changes against its first parent. */
    changedFiles(ref: string): Record<string, string> {
      const c = commits.get(resolve(ref) as string) as Commit;
      const before = c.parents[0] ? flatten((commits.get(c.parents[0]) as Commit).tree) : {};
      const after = flatten(c.tree);
      return Object.fromEntries(Object.entries(after).filter(([p, t]) => before[p] !== t));
    },
    commit: (ref: string) => commits.get(resolve(ref) as string),
    writeCount: () => writes.length,

    gateway(g: { token?: string | null; canWrite: boolean }): GitHubGateway {
      const token = g.token ?? null;
      const w = (op: WriteOp) => writes.push(writeRequest(op));
      return {
        canWrite: g.canWrite,
        async getRef(branch) {
          enter("getRef", token, g.canWrite, branch);
          return refs.get(branch) ?? null;
        },
        async getCommit(sha): Promise<CommitInfo> {
          enter("getCommit", token, g.canWrite, sha);
          const c = commits.get(sha);
          if (!c) throw err(404, "GET git/commits");
          return { sha, tree: c.tree, parents: [...c.parents], message: c.message };
        },
        async getTree(sha) {
          enter("getTree", token, g.canWrite, sha);
          const t = trees.get(sha);
          if (!t) throw err(404, "GET git/trees");
          return t.map((e) => ({ ...e }));
        },
        async getFile(path, ref): Promise<FileInfo | null> {
          enter("getFile", token, g.canWrite, `${path}@${ref}`);
          if (!resolve(ref)) throw err(404, "GET contents");
          const text = fileAt(ref, path);
          return text === null ? null : { sha: blobSha(text), text };
        },
        async findPulls(branch) {
          enter("findPulls", token, g.canWrite, branch);
          return pulls.filter((p) => p.head === branch).map(toInfo);
        },
        async getPull(number) {
          enter("getPull", token, g.canWrite, String(number));
          const p = pulls.find((x) => x.number === number);
          if (!p) throw err(404, "GET pulls/{n}");
          return toInfo(p);
        },
        async createTree(t) {
          enter("createTree", token, g.canWrite);
          if (!trees.has(t.baseTree)) throw err(422, "POST git/trees", "base_tree is not a valid tree");
          w({ op: "createTree", ...t });
          return buildTree({ ...flatten(t.baseTree), ...Object.fromEntries(t.files.map((f) => [f.path, f.content])) });
        },
        async createCommit(c) {
          enter("createCommit", token, g.canWrite);
          if (!trees.has(c.tree) || !c.parents.every((p) => commits.has(p))) throw err(422, "POST git/commits", "Tree SHA or parent does not exist");
          w({ op: "createCommit", ...c });
          return putCommit(c.tree, c.parents, c.message);
        },
        async createRef(branch, sha) {
          enter("createRef", token, g.canWrite, branch, { op: "createRef", branch, sha });
          if (refs.has(branch)) throw err(422, "POST git/refs", "Reference already exists");
          if (!commits.has(sha)) throw err(422, "POST git/refs", "Object does not exist");
          if (branch === BASE_BRANCH) throw err(422, "POST git/refs", "protected");
          w({ op: "createRef", branch, sha });
          refs.set(branch, sha);
        },
        async updateRef(branch, sha, force) {
          enter("updateRef", token, g.canWrite, branch, { op: "updateRef", branch, sha, force });
          if (branch === BASE_BRANCH) throw new GitHubError("auth", 403, "PATCH git/refs", "Protected branch");
          const cur = refs.get(branch);
          if (!cur) throw err(422, "PATCH git/refs", "Reference does not exist");
          if (!commits.has(sha)) throw err(422, "PATCH git/refs", "Object does not exist");
          if (!force && !descends(sha, cur)) throw err(422, "PATCH git/refs", "Update is not a fast forward");
          w({ op: "updateRef", branch, sha, force });
          refs.set(branch, sha);
        },
        async deleteRef(branch) {
          enter("deleteRef", token, g.canWrite, branch, { op: "deleteRef", branch });
          if (branch === BASE_BRANCH) throw new GitHubError("auth", 403, "DELETE git/refs", "Protected branch");
          w({ op: "deleteRef", branch });
          if (!refs.has(branch)) return "gone"; // GitHub's 422 "Reference does not exist", which the real gateway reports as gone.
          refs.delete(branch);
          return "deleted";
        },
        async createPull(p) {
          enter("createPull", token, g.canWrite, p.head, { op: "createPull", ...p });
          if (!refs.has(p.head) || !refs.has(p.base)) throw err(422, "POST pulls", "head or base is invalid");
          if (pulls.some((x) => x.head === p.head && x.state === "open")) throw err(422, "POST pulls", "A pull request already exists");
          w({ op: "createPull", ...p });
          const pull: Pull = { number: pulls.length + 101, head: p.head, base: p.base, title: p.title, body: p.body, state: "open", merged_at: null, closed_at: null, head_sha: refs.get(p.head) as string };
          pulls.push(pull);
          return toInfo(pull);
        },
        async updatePull(number, state) {
          enter("updatePull", token, g.canWrite, String(number), { op: "updatePull", number, state });
          const p = pulls.find((x) => x.number === number);
          if (!p) throw err(404, "PATCH pulls/{n}");
          if (state === "open" && p.merged_at) throw err(422, "PATCH pulls/{n}", "merged");
          if (state === "open" && !refs.has(p.head)) throw err(422, "PATCH pulls/{n}", "head is gone");
          w({ op: "updatePull", number, state });
          if (p.state !== state) {
            p.state = state;
            p.closed_at = state === "closed" ? now() : null;
            if (state === "closed") p.head_sha = refs.get(p.head) ?? p.head_sha;
          }
          return toInfo(p);
        },
        async editPull(number, title, body) {
          enter("editPull", token, g.canWrite, String(number), { op: "editPull", number, title, body });
          const p = pulls.find((x) => x.number === number);
          if (!p) throw err(404, "PATCH pulls/{n}");
          w({ op: "editPull", number, title, body });
          p.title = title;
          p.body = body;
          return toInfo(p);
        },
      };
    },
  };
}

export type FakeGitHub = ReturnType<typeof fakeGitHub>;
