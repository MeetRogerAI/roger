import { beforeEach, describe, expect, it, vi } from "vitest";
import { jar, nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";
import { testDb } from "@/test-helpers/pglite-db";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);

let settings: () => Promise<{ signupOpen: boolean }> = async () => ({ signupOpen: true });
vi.mock("@/lib/v3-settings", () => ({ readV3Settings: () => settings() }));

const writes: unknown[][] = [];
const statements: { text: string; params: unknown[] }[] = [];
let allowed = true;
vi.mock("@/lib/db", () => ({ hasDb: () => true }));
vi.mock("@/lib/db-query", () => ({
  query: async (_text: string, params?: unknown[]) => {
    writes.push(params ?? []);
    statements.push({ text: _text, params: params ?? [] });
    return [];
  },
}));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), hit: async () => allowed }));
const startAccount = vi.fn(async () => "new" as const);
vi.mock("@/lib/signup/account", async (orig) => ({ ...(await orig<typeof import("@/lib/signup/account")>()), startAccount: (...a: unknown[]) => startAccount(...(a as [])) }));
// The referral cookie is resolved when the sign-up link is asked for (B2 Unit 3): stand-in keyed on the raw cookie.
vi.mock("@/lib/referrals/attribution", () => ({
  resolveReferrer: async (_q: unknown, raw: string | undefined) => (raw === "good-cookie" ? { id: "referrer-1", via: "link" } : null),
}));

type BeginArgs = [q: unknown, cfg: unknown, o: { newAccount?: { referrer?: unknown } }];
const beginGoogle = vi.fn(async (...args: BeginArgs) => (void args, { url: "https://accounts.google.test/auth", state: "st" }));
vi.mock("@/lib/auth/google", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/google")>()), beginGoogle: (...a: Parameters<typeof beginGoogle>) => beginGoogle(...a) }));

const { submitQuiz, submitAccount, startAnyway, saveNotOpenLead, startGoogleSignup } = await import("./actions");
const { DRAFT_COOKIE, decodeDraft, encodeDraft } = await import("@/lib/signup/draft");
const { SPONSOR_COOKIE } = await import("@/lib/sponsors/code");
const { sponsorHashFor } = await import("@/lib/sponsors/sponsors");
const { KNOWN_EMAIL_COOKIE } = await import("@/lib/signup/known-email");

const idle = { status: "idle" as const };
function quiz(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base = { work: "real_estate", role: "Broker", uses: "most_weeks", agent: "grok-bot", count: "1-2", level: "3", software: "if_shown", cur: "CAD", ...over };
  for (const [k, v] of Object.entries(base)) fd.append(k, v);
  return fd;
}
const draft = encodeDraft({
  answers: { work: "real_estate", role: "Broker", uses: "most_weeks", agents: ["grok-bot"], agentOther: "", primary: "", level: 3, count: "1-2", help: [], software: "if_shown" },
  path: "new",
  continuedAnyway: false,
  source: null,
  cur: "CAD",
  ref: null,
  zack: null,
  utm: "",
});

beforeEach(() => {
  resetNextFakes({}, { "x-vercel-forwarded-for": "1.2.3.4" });
  settings = async () => ({ signupOpen: true });
  writes.length = 0;
  statements.length = 0;
  allowed = true;
  startAccount.mockClear();
});

describe("with sign-up off, or the setting unreadable", () => {
  for (const [label, s] of [
    ["off", async () => ({ signupOpen: false })],
    ["unreadable", async () => Promise.reject(new Error("db down"))],
  ] as const) {
    it(`(${label}) sends every step back to /start and saves nothing`, async () => {
      settings = s;
      expect(await outcome(() => submitQuiz(idle, quiz()))).toEqual({ redirect: "/start" });
      resetNextFakes({ [DRAFT_COOKIE]: draft });
      const fd = new FormData();
      fd.set("firstName", "Ana");
      fd.set("lastName", "Lima");
      fd.set("email", "ana@example.com");
      expect(await outcome(() => submitAccount(idle, fd))).toEqual({ redirect: "/start" });
      expect(await outcome(() => startAnyway())).toEqual({ redirect: "/start" });
      expect(startAccount).not.toHaveBeenCalled();
      expect(jar.get(DRAFT_COOKIE)).toBe(draft);
    });
  }
});

describe("the quiz", () => {
  it("saves the answers and routes each path", async () => {
    expect(await outcome(() => submitQuiz(idle, quiz()))).toEqual({ redirect: "/start/account" });
    expect(jar.has(DRAFT_COOKIE)).toBe(true);
    expect(await outcome(() => submitQuiz(idle, quiz({ uses: "not_yet", software: "avoid" })))).toEqual({ redirect: "/start/not-ready" });
  });

  it("moves a sponsor code from the proxy's cookie into the draft, and clears the cookie (B2 Unit 10)", async () => {
    resetNextFakes({ [SPONSOR_COOKIE]: "ABCDEFGH2345" }, { "x-vercel-forwarded-for": "1.2.3.4" });
    expect(await outcome(() => submitQuiz(idle, quiz()))).toEqual({ redirect: "/start/account" });
    expect(decodeDraft(jar.get(DRAFT_COOKIE))?.sponsor).toBe("ABCDEFGH2345");
    expect(jar.has(SPONSOR_COOKIE)).toBe(false);
    // Back at the quiz later, with no cookie: the draft keeps the code.
    expect(await outcome(() => submitQuiz(idle, quiz()))).toEqual({ redirect: "/start/account" });
    expect(decodeDraft(jar.get(DRAFT_COOKIE))?.sponsor).toBe("ABCDEFGH2345");
  });

  it("a draft from before sponsors still reads, with no sponsor", () => {
    expect(decodeDraft(draft)?.sponsor ?? null).toBeNull();
  });

  it("shows inline errors and saves nothing for a missing answer", async () => {
    const r = await outcome(() => submitQuiz(idle, quiz({ uses: "" })));
    expect(r).toMatchObject({ value: { status: "error", errors: { uses: "Choose one." } } });
    expect(jar.has(DRAFT_COOKIE)).toBe(false);
  });
});

describe("the account step", () => {
  it("needs the quiz first", async () => {
    const fd = new FormData();
    fd.set("firstName", "Ana");
    fd.set("lastName", "Lima");
    fd.set("email", "ana@example.com");
    expect(await outcome(() => submitAccount(idle, fd))).toEqual({ redirect: "/start" });
  });

  it("says plainly when the email could not be sent", async () => {
    resetNextFakes({ [DRAFT_COOKIE]: draft });
    startAccount.mockResolvedValueOnce("send_failed" as never);
    const fd = new FormData();
    fd.set("firstName", "Ana");
    fd.set("lastName", "Lima");
    fd.set("email", "ana@example.com");
    expect(await submitAccount(idle, fd)).toMatchObject({ status: "error" });
  });
});

describe("the account step's names and email", () => {
  it("needs a first and a last name", async () => {
    resetNextFakes({ [DRAFT_COOKIE]: draft });
    const fd = new FormData();
    fd.set("firstName", "Ana");
    fd.set("email", "ana@example.com");
    expect(await submitAccount(idle, fd)).toEqual({ status: "error", errors: { lastName: "Enter your last name." } });
    expect(startAccount).not.toHaveBeenCalled();
  });

  it("joins the names and remembers the address", async () => {
    resetNextFakes({ [DRAFT_COOKIE]: draft });
    const fd = new FormData();
    fd.set("firstName", " Ana ");
    fd.set("lastName", "Lima");
    fd.set("email", "Ana@Example.com");
    expect(await submitAccount(idle, fd)).toEqual({ status: "ok", email: "Ana@Example.com" });
    expect(startAccount).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "Ana Lima" }));
    expect(jar.get(KNOWN_EMAIL_COOKIE)).toBe("ana@example.com");
  });

  it("carries the referrer this browser's referral cookie names, and none without one (B2 Unit 3)", async () => {
    const fd = new FormData();
    fd.set("firstName", "Ana");
    fd.set("lastName", "Lima");
    fd.set("email", "ana@example.com");
    resetNextFakes({ [DRAFT_COOKIE]: draft, "roger-ref": "good-cookie" });
    await submitAccount(idle, fd);
    expect(startAccount).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ referrer: { id: "referrer-1", via: "link" } }));
    resetNextFakes({ [DRAFT_COOKIE]: draft });
    await submitAccount(idle, fd);
    expect(startAccount).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ referrer: null }));
  });
});

describe("the account step with Google", () => {
  it("puts the referrer this browser's cookie names into the sign-up it carries, and none without one (B2 Unit 3)", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    try {
      const fd = new FormData();
      fd.set("firstName", "Ana");
      fd.set("lastName", "Lima");
      resetNextFakes({ [DRAFT_COOKIE]: draft, "roger-ref": "good-cookie" }, { "x-vercel-forwarded-for": "1.2.3.4" });
      expect(await outcome(() => startGoogleSignup(fd))).toEqual({ redirect: "https://accounts.google.test/auth" });
      expect(beginGoogle.mock.lastCall?.[2].newAccount?.referrer).toEqual({ id: "referrer-1", via: "link" });
      resetNextFakes({ [DRAFT_COOKIE]: draft }, { "x-vercel-forwarded-for": "1.2.3.4" });
      await outcome(() => startGoogleSignup(fd));
      expect(beginGoogle.mock.lastCall?.[2].newAccount?.referrer).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("carries a sponsor code from the draft as its hash only, never as a referrer (B2 Unit 10)", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    try {
      const fd = new FormData();
      fd.set("firstName", "Ana");
      fd.set("lastName", "Lima");
      const withSponsor = encodeDraft({ ...decodeDraft(draft)!, sponsor: "ABCDEFGH2345" });
      resetNextFakes({ [DRAFT_COOKIE]: withSponsor }, { "x-vercel-forwarded-for": "1.2.3.4" });
      await outcome(() => startGoogleSignup(fd));
      const carried = beginGoogle.mock.lastCall?.[2].newAccount as Record<string, unknown>;
      expect(carried.sponsorHash).toBe(sponsorHashFor("ABCDEFGH2345"));
      expect(carried.referrer).toBeNull();
      expect(JSON.stringify(carried)).not.toContain("ABCDEFGH2345");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("the not-open form", () => {
  it("remembers the address for sign-up", async () => {
    const fd = new FormData();
    fd.set("email", "ana@example.com");
    await saveNotOpenLead(idle, fd);
    expect(jar.get(KNOWN_EMAIL_COOKIE)).toBe("ana@example.com");
  });

  it("answers the same for a new address and one already saved", async () => {
    const fd = new FormData();
    fd.set("email", "ana@example.com");
    const a = await saveNotOpenLead(idle, fd);
    const b = await saveNotOpenLead(idle, fd);
    expect(a).toEqual(b);
    expect(a).toEqual({ status: "ok" });
  });

  it("writes nothing for a bot", async () => {
    const fd = new FormData();
    fd.set("email", "ana@example.com");
    fd.set("_gotcha", "x");
    expect(await saveNotOpenLead(idle, fd)).toEqual({ status: "ok" });
    expect(writes).toHaveLength(0);
  });

  it("a re-save keeps first_seen_at (the first touch) and moves created_at (B3 Unit 4)", async () => {
    const fd = new FormData();
    fd.set("email", "ana@example.com");
    await saveNotOpenLead(idle, fd);
    const upsert = statements.find((s) => s.text.includes("insert into leads"))!;
    // Replay the exact statement the action sent on a real Postgres: once, backdate, then again.
    const { query: pg } = await testDb();
    await pg(upsert.text, upsert.params);
    await pg("update leads set created_at = '2026-11-01T15:00:00Z', first_seen_at = '2026-11-01T15:00:00Z'");
    await pg(upsert.text, upsert.params);
    const [row] = await pg<{ first_seen_at: Date; created_at: Date }>("select first_seen_at, created_at from leads");
    expect(new Date(row.first_seen_at).toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(new Date(row.created_at).getTime()).toBeGreaterThan(Date.parse("2026-11-02T00:00:00Z"));
  }, 60_000); // The first in-process Postgres of this file applies the whole schema.

  it("refuses too many tries from one place", async () => {
    allowed = false;
    const fd = new FormData();
    fd.set("email", "ana@example.com");
    expect(await saveNotOpenLead(idle, fd)).toMatchObject({ status: "error" });
  });
});
