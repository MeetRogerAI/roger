import { describe, expect, it } from "vitest";
import { fakeGitHub } from "@/test-helpers/fake-github";
import { type FetchLike, fetchGitHub, GitHubError, gitHubErrorText, reviewGitHub, reviewSyncGitHub, treeSha, treeWithBlobs, UnsafeWrite, writeRequest } from "./github";

/** A recorded fetch: answers from a list, keeps every request. Nothing reaches the network. */
function stubFetch(answers: { status: number; body?: unknown; headers?: Record<string, string> }[]) {
  const seen: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const f: FetchLike = async (url, init) => {
    seen.push({ url, method: init.method, headers: init.headers, body: init.body });
    const a = answers.shift() ?? { status: 500 };
    return {
      status: a.status,
      headers: { get: (n: string) => a.headers?.[n.toLowerCase()] ?? null },
      json: async () => a.body ?? {},
      text: async () => JSON.stringify(a.body ?? {}),
    };
  };
  return { f, seen };
}

const TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
const API = "https://api.github.com/repos/MeetRogerAI/roger";

describe("git object hashing", () => {
  // Ground truth from real git (git write-tree / git ls-tree on these exact files).
  const FILES = { "README.md": "Hello\n", "content/a-b.md": "x", "content/cora/cora.md": "# Cora\n", "content/zack/claude.md": "# Claude\n\nLine one.\n" };

  it("computes tree SHAs exactly as git does (modes as GitHub writes them, entries in git's order)", () => {
    expect(treeSha([{ path: "claude.md", mode: "100644", type: "blob", sha: "7853dcb445a3f4db8f13729cd13a2088842e122b" }])).toBe("161959c5b1679b3019aab217e1c0fab5a8b48133");
    expect(
      treeSha([
        { path: "README.md", mode: "100644", type: "blob", sha: "e965047ad7c57865823c7d992b1d046ea66edf78" },
        { path: "content", mode: "040000", type: "tree", sha: "0c634968f41841762ffb3c6daeb41bd1a36dec88" },
      ]),
    ).toBe("3b4fac5c717745d712a3d8b8eea82e5076307642");
  });

  it("the fake's trees match git's, and treeWithBlobs computes a changed tree with no write", async () => {
    const gh = fakeGitHub(FILES);
    const gw = gh.gateway({ token: TOKEN, canWrite: true });
    const head = (await gw.getRef("main")) as string;
    const { tree } = await gw.getCommit(head);
    expect(tree).toBe("3b4fac5c717745d712a3d8b8eea82e5076307642");

    const { blobSha } = await import("@/lib/instructions/version");
    const changed = "# Claude\n\nLine two.\n";
    const r = await treeWithBlobs(gw, tree, { "content/zack/claude.md": blobSha(changed) });
    expect(r.modes).toEqual({ "content/zack/claude.md": "100644" });
    expect(gh.writes).toEqual([]);
    // The same tree GitHub makes when the file is written.
    expect(await gw.createTree({ baseTree: tree, files: [{ path: "content/zack/claude.md", mode: "100644", content: changed }] })).toBe(r.tree);
    await expect(treeWithBlobs(gw, tree, { "content/zack/missing.md": blobSha("x") })).rejects.toThrow(GitHubError);
  });
});

describe("fetchGitHub", () => {
  it("sends the token only in the Authorization header, and reads a file's base64 content and blob SHA", async () => {
    const text = "# Claude\n\nCafé — line.\n";
    const { f, seen } = stubFetch([{ status: 200, body: { type: "file", sha: "abc", encoding: "base64", content: Buffer.from(text).toString("base64").replace(/(.{20})/g, "$1\n") } }]);
    const gw = fetchGitHub({ token: TOKEN, canWrite: false, fetch: f });
    expect(await gw.getFile("content/zack/claude.md", "deadbeef")).toEqual({ sha: "abc", text });
    expect(seen[0].url).toBe(`${API}/contents/content/zack/claude.md?ref=deadbeef`);
    expect(seen[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(seen[0].url).not.toContain(TOKEN);
  });

  it("is unauthenticated without a token", async () => {
    const { f, seen } = stubFetch([{ status: 200, body: { object: { sha: "c1" } } }]);
    expect(await fetchGitHub({ canWrite: false, fetch: f }).getRef("main")).toBe("c1");
    expect(seen[0].headers.authorization).toBeUndefined();
    expect(seen[0].url).toBe(`${API}/git/ref/heads/main`);
  });

  it("gives null for a missing ref or file (404)", async () => {
    const { f } = stubFetch([{ status: 404 }, { status: 404 }]);
    const gw = fetchGitHub({ canWrite: false, fetch: f });
    expect(await gw.getRef("review-bot/abcdefghij")).toBeNull();
    expect(await gw.getFile("content/zack/nope.md", "main")).toBeNull();
  });

  it("classifies errors: rate limits (403 with remaining 0, and 429), auth, conflict, unprocessable", async () => {
    const { f } = stubFetch([
      { status: 403, headers: { "x-ratelimit-remaining": "0" } },
      { status: 429 },
      { status: 403, body: { message: `Resource not accessible by integration ${TOKEN}` } },
      { status: 409 },
      { status: 422, body: { message: "Reference already exists" } },
      { status: 502 },
    ]);
    const gw = fetchGitHub({ token: TOKEN, canWrite: true, fetch: f });
    const kind = async (p: Promise<unknown>) => p.then(() => "ok", (e: GitHubError) => e);
    const e1 = (await kind(gw.getCommit("c"))) as GitHubError;
    expect(e1.kind).toBe("rate_limited");
    expect(((await kind(gw.getCommit("c"))) as GitHubError).kind).toBe("rate_limited");
    const e3 = (await kind(gw.getCommit("c"))) as GitHubError;
    expect(e3.kind).toBe("auth");
    expect(`${e3.message} ${e3.detail} ${gitHubErrorText(e3)} ${JSON.stringify(e3)}`).not.toContain(TOKEN);
    expect(gitHubErrorText(e3)).toContain("missing a permission");
    expect(((await kind(gw.createRef("review-bot/abcdefghij", "c"))) as GitHubError).kind).toBe("conflict");
    const e5 = (await kind(gw.createRef("review-bot/abcdefghij", "c"))) as GitHubError;
    expect(e5).toMatchObject({ kind: "unprocessable", detail: "Reference already exists" });
    expect(((await kind(gw.getPull(1))) as GitHubError).kind).toBe("unavailable");
  });

  it("a network failure is an error without the URL's or token's text", async () => {
    const f: FetchLike = async () => {
      throw new TypeError(`fetch failed for ${TOKEN}`);
    };
    const e = await fetchGitHub({ token: TOKEN, canWrite: false, fetch: f })
      .getRef("main")
      .catch((x: GitHubError) => x);
    expect(e).toBeInstanceOf(GitHubError);
    expect((e as GitHubError).message).not.toContain(TOKEN);
  });

  it("sends exactly writeRequest(op) for writes, and a 404 or 422 on deleting a ref is 'gone'", async () => {
    const { f, seen } = stubFetch([{ status: 201, body: { sha: "t1" } }, { status: 200, body: {} }, { status: 422, body: { message: "Reference does not exist" } }, { status: 404 }, { status: 204 }]);
    const gw = fetchGitHub({ token: TOKEN, canWrite: true, fetch: f });
    expect(await gw.createTree({ baseTree: "b", files: [{ path: "content/zack/claude.md", mode: "100644", content: "x" }] })).toBe("t1");
    expect(seen[0]).toMatchObject({ method: "POST", url: `${API}/git/trees` });
    expect(JSON.parse(seen[0].body as string)).toEqual(writeRequest({ op: "createTree", baseTree: "b", files: [{ path: "content/zack/claude.md", mode: "100644", content: "x" }] }).body);
    await gw.updateRef("review-bot/abcdefghij", "c2", true);
    expect(seen[1]).toMatchObject({ method: "PATCH", url: `${API}/git/refs/heads/review-bot/abcdefghij` });
    expect(JSON.parse(seen[1].body as string)).toEqual({ sha: "c2", force: true });
    expect(await gw.deleteRef("review-bot/abcdefghij")).toBe("gone");
    expect(await gw.deleteRef("review-bot/abcdefghij")).toBe("gone");
    expect(await gw.deleteRef("review-bot/abcdefghij")).toBe("deleted");
    expect(seen[2]).toMatchObject({ method: "DELETE", url: `${API}/git/refs/heads/review-bot/abcdefghij` });
  });

  it("looks pull requests up by head in any state", async () => {
    const pull = { number: 7, html_url: "https://github.com/MeetRogerAI/roger/pull/7", state: "closed", merged_at: "2026-11-27T10:00:00Z", closed_at: "2026-11-27T10:00:00Z", head: { ref: "review-bot/abcdefghij", sha: "h1" } };
    const { f, seen } = stubFetch([{ status: 200, body: [pull] }]);
    expect(await fetchGitHub({ canWrite: false, fetch: f }).findPulls("review-bot/abcdefghij")).toEqual([
      { number: 7, url: pull.html_url, state: "closed", merged_at: pull.merged_at, closed_at: pull.closed_at, head_ref: "review-bot/abcdefghij", head_sha: "h1", title: "", body: "" },
    ]);
    expect(seen[0].url).toBe(`${API}/pulls?head=MeetRogerAI%3Areview-bot%2Fabcdefghij&state=all&per_page=100`);
  });

  it("a read-only gateway refuses every write before sending it", async () => {
    const { f, seen } = stubFetch([]);
    const gw = fetchGitHub({ token: TOKEN, canWrite: false, fetch: f });
    await expect(gw.createRef("review-bot/x", "c")).rejects.toThrow(GitHubError);
    await expect(gw.deleteRef("review-bot/x")).rejects.toThrow(GitHubError);
    await expect(gw.updatePull(1, "closed")).rejects.toThrow(GitHubError);
    expect(seen).toEqual([]);
  });

  it("a write gateway refuses any ref but review-bot/{public_id}, and any PR but such a head into main, before fetch", async () => {
    const { f, seen } = stubFetch([]);
    const gw = fetchGitHub({ token: TOKEN, canWrite: true, fetch: f });
    await expect(gw.deleteRef("main")).rejects.toThrow(UnsafeWrite);
    await expect(gw.updateRef("main", "c1", true)).rejects.toThrow(UnsafeWrite);
    await expect(gw.createRef("main", "c1")).rejects.toThrow(UnsafeWrite);
    for (const b of ["feature/x", "review-bot/abcdefghi", "review-bot/ABCDEFGHIJ", "review-bot/abcdefghij/x", "review-bot/../main", "review-bot/abcdefghi1", "xreview-bot/abcdefghij"]) {
      await expect(gw.updateRef(b, "c1", true)).rejects.toThrow(UnsafeWrite);
      await expect(gw.deleteRef(b)).rejects.toThrow(UnsafeWrite);
    }
    await expect(gw.createPull({ title: "t", body: "b", head: "main", base: "main" })).rejects.toThrow(UnsafeWrite);
    await expect(gw.createPull({ title: "t", body: "b", head: "review-bot/abcdefghij", base: "release" })).rejects.toThrow(UnsafeWrite);
    await expect(gw.updatePull(0, "closed")).rejects.toThrow(UnsafeWrite);
    await expect(gw.editPull(-1, "t", "b")).rejects.toThrow(UnsafeWrite);
    expect(seen).toEqual([]);
    // A dry run's recorded request goes through the same guard.
    expect(() => writeRequest({ op: "deleteRef", branch: "main" })).toThrow(UnsafeWrite);
  });

  it("edits a PR's title and body with one PATCH", async () => {
    const pull = { number: 7, html_url: "u", state: "open", merged_at: null, closed_at: null, head: { ref: "review-bot/abcdefghij", sha: "h1" }, title: "T", body: "B" };
    const { f, seen } = stubFetch([{ status: 200, body: pull }]);
    expect(await fetchGitHub({ token: TOKEN, canWrite: true, fetch: f }).editPull(7, "T", "B")).toMatchObject({ number: 7, title: "T", body: "B" });
    expect(seen[0]).toMatchObject({ method: "PATCH", url: `${API}/pulls/7` });
    expect(JSON.parse(seen[0].body as string)).toEqual({ title: "T", body: "B" });
  });
});

describe("reviewGitHub (the mode)", () => {
  const on = { reviewBotOn: true };
  it("is live only on production with the write token and the switch on", () => {
    expect(reviewGitHub(on, { VERCEL_ENV: "production", GITHUB_REVIEW_TOKEN: TOKEN }).live).toBe(true);
    expect(reviewGitHub(on, { VERCEL_ENV: "preview", GITHUB_REVIEW_TOKEN: TOKEN })).toMatchObject({ live: false, why: "this is not the production deployment" });
    expect(reviewGitHub(on, { VERCEL_ENV: "production" })).toMatchObject({ live: false, why: "GITHUB_REVIEW_TOKEN is not set" });
    expect(reviewGitHub({ reviewBotOn: false }, { VERCEL_ENV: "production", GITHUB_REVIEW_TOKEN: TOKEN })).toMatchObject({ live: false, why: "the review bot is switched off (v3.reviewBotOn)" });
    expect(reviewGitHub(on, {}).gw.canWrite).toBe(false);
  });

  it("dry-run reads carry GITHUB_READ_TOKEN when set (never the write token), and none otherwise", async () => {
    const { f, seen } = stubFetch([{ status: 200, body: { object: { sha: "c" } } }, { status: 200, body: { object: { sha: "c" } } }]);
    await reviewGitHub(on, { VERCEL_ENV: "preview", GITHUB_REVIEW_TOKEN: TOKEN, GITHUB_READ_TOKEN: "github_pat_readonly_0123456789abcdef" }, f).gw.getRef("main");
    await reviewGitHub(on, { VERCEL_ENV: "preview", GITHUB_REVIEW_TOKEN: TOKEN }, f).gw.getRef("main");
    expect(seen[0].headers.authorization).toBe("Bearer github_pat_readonly_0123456789abcdef");
    expect(seen[1].headers.authorization).toBeUndefined();
    expect(JSON.stringify(seen)).not.toContain(TOKEN);
  });

  it("the sync's mode is live on production with the write token, whatever the switch says", () => {
    expect(reviewSyncGitHub({ VERCEL_ENV: "production", GITHUB_REVIEW_TOKEN: TOKEN })).toMatchObject({ live: true });
    expect(reviewSyncGitHub({ VERCEL_ENV: "preview", GITHUB_REVIEW_TOKEN: TOKEN })).toMatchObject({ live: false, why: "this is not the production deployment" });
    expect(reviewSyncGitHub({ VERCEL_ENV: "production", GITHUB_REVIEW_TOKEN: " " })).toMatchObject({ live: false, why: "GITHUB_REVIEW_TOKEN is not set" });
    expect(reviewSyncGitHub({ VERCEL_ENV: "preview" }).gw.canWrite).toBe(false);
  });

  it("the gateway object does not expose its token", () => {
    const { gw } = reviewGitHub(on, { VERCEL_ENV: "production", GITHUB_REVIEW_TOKEN: TOKEN });
    expect(JSON.stringify(gw)).not.toContain(TOKEN);
    expect(Object.values(gw).some((v) => typeof v === "string" && v.includes(TOKEN))).toBe(false);
  });
});
