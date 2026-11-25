import { beforeEach, describe, expect, it, vi } from "vitest";
import { jar, nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);

let settings: () => Promise<{ signupOpen: boolean }> = async () => ({ signupOpen: true });
vi.mock("@/lib/v3-settings", () => ({ readV3Settings: () => settings() }));

const writes: unknown[][] = [];
let allowed = true;
vi.mock("@/lib/db", () => ({ hasDb: () => true }));
vi.mock("@/lib/db-query", () => ({
  query: async (_text: string, params?: unknown[]) => {
    writes.push(params ?? []);
    return [];
  },
}));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), hit: async () => allowed }));
const startAccount = vi.fn(async () => "new" as const);
vi.mock("@/lib/signup/account", () => ({ startAccount: (...a: unknown[]) => startAccount(...(a as [])) }));

const { submitQuiz, submitAccount, startAnyway, saveNotOpenLead } = await import("./actions");
const { DRAFT_COOKIE, encodeDraft } = await import("@/lib/signup/draft");

const idle = { status: "idle" as const };
function quiz(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base = { work: "real_estate", role: "Broker", uses: "most_weeks", agent: "grok-bot", count: "1-2", software: "if_shown", cur: "CAD", ...over };
  for (const [k, v] of Object.entries(base)) fd.append(k, v);
  return fd;
}
const draft = encodeDraft({
  answers: { work: "real_estate", role: "Broker", uses: "most_weeks", agents: ["grok-bot"], agentOther: "", count: "1-2", help: [], software: "if_shown" },
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
      fd.set("name", "Ana");
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

  it("shows inline errors and saves nothing for a missing answer", async () => {
    const r = await outcome(() => submitQuiz(idle, quiz({ uses: "" })));
    expect(r).toMatchObject({ value: { status: "error", errors: { uses: "Choose one." } } });
    expect(jar.has(DRAFT_COOKIE)).toBe(false);
  });
});

describe("the account step", () => {
  it("needs the quiz first", async () => {
    const fd = new FormData();
    fd.set("name", "Ana");
    fd.set("email", "ana@example.com");
    expect(await outcome(() => submitAccount(idle, fd))).toEqual({ redirect: "/start" });
  });

  it("says plainly when the email could not be sent", async () => {
    resetNextFakes({ [DRAFT_COOKIE]: draft });
    startAccount.mockResolvedValueOnce("send_failed" as never);
    const fd = new FormData();
    fd.set("name", "Ana");
    fd.set("email", "ana@example.com");
    expect(await submitAccount(idle, fd)).toMatchObject({ status: "error" });
  });
});

describe("the not-open form", () => {
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

  it("refuses too many tries from one place", async () => {
    allowed = false;
    const fd = new FormData();
    fd.set("email", "ana@example.com");
    expect(await saveNotOpenLead(idle, fd)).toMatchObject({ status: "error" });
  });
});
