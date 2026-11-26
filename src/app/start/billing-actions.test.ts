import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import type { Transport } from "@/lib/mail/send";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);

let current: Query;
let signedIn: string | null = null;
let sent: Parameters<Transport>[0][];
let failSends = false;
let settingsFail = false;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  requireUserForAction: async () => {
    if (!signedIn) throw new Error("Not signed in");
    return { userId: signedIn };
  },
}));
vi.mock("@/lib/v3-settings", async (orig) => {
  const real = await orig<typeof import("@/lib/v3-settings")>();
  return {
    ...real,
    readV3Settings: async () => {
      if (settingsFail) throw new real.SettingsUnavailable("down");
      return real.mergeV3([]);
    },
  };
});
// The real mail layer, with a recording transport (the action passes no transport of its own).
vi.mock("@/lib/mail/send", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/send")>();
  const transport: Transport = async (m) => {
    if (failSends) return { ok: false, error: "resend 500", retryable: true };
    sent.push(m);
    return { ok: true };
  };
  return {
    ...real,
    sendToUser: (u: Parameters<typeof real.sendToUser>[0], k: string, r: string, m: Parameters<typeof real.sendToUser>[3], d: Parameters<typeof real.sendToUser>[4] = {}) =>
      real.sendToUser(u, k, r, m, { ...d, query: current, transport, sleep: async () => {} }),
  };
});

const { savePlan } = await import("./billing-actions");
const { sendUnsentWelcomes } = await import("@/lib/signup/finish");
const idle = { status: "idle" as const };
const consentForm = (consent?: string, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  if (consent) fd.set("consent", consent);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
};

beforeEach(async () => {
  ({ query: current } = await testDb());
  resetNextFakes({}, { "x-vercel-forwarded-for": "1.2.3.4" });
  sent = [];
  failSends = false;
  settingsFail = false;
  [{ id: signedIn }] = await current<{ id: string }>(
    "insert into users (email, name, currency, path, plan, email_verified_at, signup_step) values ('ana@example.com', 'Ana Silva', 'CAD', 'running', 'per_run', now(), 'plan') returning id",
  );
});

type Row = { status: string; plan: string; consent_at: unknown; signup_step: string; trial_started_at: unknown };
const row = async () => (await current<Row>("select status, plan, consent_at, signup_step, trial_started_at from users"))[0];
const welcomes = () => sent.filter((m) => m.subject === "Welcome to Roger");

describe("savePlan (Step 3, Product and Pricing)", () => {
  it("with consent: a trial with no card on monthly, one welcome email, then /app", async () => {
    expect(await outcome(() => savePlan(idle, consentForm("yes")))).toEqual({ redirect: "/app" });
    const r = await row();
    expect(r).toMatchObject({ status: "trial", plan: "monthly", signup_step: "done", trial_started_at: null });
    expect(r.consent_at).not.toBeNull();
    expect(welcomes()).toHaveLength(1);
    expect(welcomes()[0].to).toEqual(["ana@example.com"]);
  });

  it("ignores a plan posted with the form: monthly is the only plan", async () => {
    await outcome(() => savePlan(idle, consentForm("yes", { plan: "per_run" })));
    expect((await row()).plan).toBe("monthly");
  });

  it("will not move on without the consent box, even when posted directly (spec check 3), and changes nothing", async () => {
    const r = await outcome(() => savePlan(idle, consentForm()));
    expect(r).toMatchObject({ value: { status: "error", errors: { consent: expect.any(String) } } });
    expect(await row()).toMatchObject({ status: "signup", plan: "per_run", signup_step: "plan", consent_at: null });
    expect(sent).toHaveLength(0);
  });

  it("submitted twice (two tabs, or at once): one state change and one welcome", async () => {
    const both = await Promise.all([outcome(() => savePlan(idle, consentForm("yes"))), outcome(() => savePlan(idle, consentForm("yes")))]);
    expect(both).toEqual([{ redirect: "/app" }, { redirect: "/app" }]);
    expect(await outcome(() => savePlan(idle, consentForm("yes")))).toEqual({ redirect: "/app" });
    expect((await row()).status).toBe("trial");
    expect(welcomes()).toHaveLength(1);
  });

  it("stamps the consent time from the action's clock, not the database's now()", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
    try {
      await outcome(() => savePlan(idle, consentForm("yes")));
    } finally {
      vi.useRealTimers();
    }
    expect(new Date((await row()).consent_at as string).toISOString()).toBe("2026-12-01T10:00:00.000Z");
  });

  it("keeps the first consent time", async () => {
    await current("update users set consent_at = '2026-11-20T10:00:00Z'");
    await outcome(() => savePlan(idle, consentForm("yes")));
    expect(new Date((await row()).consent_at as string).toISOString()).toBe("2026-11-20T10:00:00.000Z");
  });

  it("changes nothing for someone past sign-up, and sends nothing", async () => {
    await current("update users set status = 'trial', plan = 'per_run'");
    expect(await outcome(() => savePlan(idle, consentForm("yes")))).toEqual({ redirect: "/app" });
    expect((await row()).plan).toBe("per_run");
    expect(sent).toHaveLength(0);
  });

  it("refuses someone who is not signed in", async () => {
    signedIn = null;
    await expect(savePlan(idle, consentForm("yes"))).rejects.toThrow("Not signed in");
  });

  it("still lands in /app when the welcome fails; the hourly task sends it later, exactly once", async () => {
    failSends = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await outcome(() => savePlan(idle, consentForm("yes")))).toEqual({ redirect: "/app" });
    expect((await row()).status).toBe("trial");
    expect(welcomes()).toHaveLength(0);
    failSends = false;
    const deps = { settings: mergeV3([]), now: new Date(), query: current };
    expect(await sendUnsentWelcomes(current, deps)).toBe(1);
    expect(await sendUnsentWelcomes(current, deps)).toBe(0);
    errors.mockRestore();
    expect(welcomes()).toHaveLength(1);
  });

  it("still lands in /app when settings cannot be read", async () => {
    settingsFail = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await outcome(() => savePlan(idle, consentForm("yes")))).toEqual({ redirect: "/app" });
    errors.mockRestore();
    expect((await row()).status).toBe("trial");
  });

  it("turns a free-tool report brought to sign-up into this week's run", async () => {
    await current("insert into free_runs (token, email, agent, report, report_at) values ('tok1', 'ana@example.com', 'hark', '# free report', now())");
    await current("update users set pending_zack_token = 'tok1'");
    await outcome(() => savePlan(idle, consentForm("yes")));
    expect(await current("select route from runs")).toEqual([{ route: "free_tool" }]);
    const [f] = await current<{ claimed_by: string }>("select claimed_by from free_runs");
    expect(f.claimed_by).toBe(signedIn);
  });

  it("a pilot account (made by an admin, opened at /start/plan) finishes to /app without a card", async () => {
    await current("update users set created_by = 'peter@example.com', path = 'running'");
    expect(await outcome(() => savePlan(idle, consentForm("yes")))).toEqual({ redirect: "/app" });
    expect(await row()).toMatchObject({ status: "trial", trial_started_at: null });
    const [{ customer }] = await current<{ customer: string | null }>("select stripe_customer as customer from users");
    expect(customer).toBeNull();
  });
});
