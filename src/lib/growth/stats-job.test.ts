import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { sendToUser, type Transport } from "@/lib/mail/send";
import { unsubscribe, unsubToken } from "@/lib/mail/unsubscribe";
import { mondayListEmail } from "@/lib/mail/templates/monday";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb, testSponsor } from "@/test-helpers/pglite-db";
import { runStatsJob, type StatsDeps } from "./stats-job";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));
let noCode = false;
vi.mock("@/lib/referrals/code", async (orig) => {
  const actual = await orig<typeof import("@/lib/referrals/code")>();
  return { ...actual, ensureReferralCode: async (q: Query, id: string) => (noCode ? null : actual.ensureReferralCode(q, id)) };
});
let failOn: RegExp | null = null;
/** Runs after each member's send: lets a test act mid-loop. */
let afterSend: (() => Promise<void>) | null = null;

const SECRET = "unsub-test-secret";
let query: Query;
let queries: string[];
let sent: Parameters<Transport>[0][];
let failing = false;
const transport: Transport = async (m) => {
  if (failing && !m.subject.startsWith("[Roger]")) return { ok: false, error: "resend down", retryable: false };
  sent.push(m);
  if (afterSend && !m.subject.startsWith("[Roger]")) await afterSend();
  return { ok: true };
};

// Wednesday 2026-12-16. 09:00 Toronto (EST) = 14:00 UTC.
const NINE_AM = new Date("2026-12-16T14:00:00Z");
const DATE = "2026-12-16";
const live = [
  { key: "v3.cycleLive", value: true },
  { key: "v3.signupOpen", value: true },
  { key: "v3.statsOn", value: true },
];
const settings = mergeV3(live);
const deps = (now = NINE_AM, o: Partial<StatsDeps> = {}): StatsDeps => ({ settings, now, query, transport, sleep: async () => {}, env: { UNSUB_SECRET: SECRET }, ...o });
const to = (email: string) => sent.filter((m) => m.to[0] === email);
const members = () => sent.filter((m) => !m.subject.startsWith("[Roger]"));
const alerts = () => sent.filter((m) => m.subject.startsWith("[Roger]"));
const closing = () => alerts().filter((m) => m.subject === "[Roger] Wednesday stats emails were not all sent");
/** Moves every stats claim `minutes` into the past, as if the runs had been that far apart in real time. */
const ageClaims = (minutes: number) => query(`update notifications set claimed_at = claimed_at - make_interval(mins => $1) where kind = 'stats'`, [minutes]);
const attempts = async (id: string) => (await query<{ attempts: number; status: string }>("select attempts, status from notifications where kind = 'stats' and recipient = $1", [id]))[0];

async function member(email: string, o: Record<string, unknown> = {}): Promise<string> {
  const v = { status: "trial", trial_started_at: "2026-11-16T15:00:00Z", sponsor_id: null, email_prefs: {}, referral_code: null, ...o };
  const [u] = await query<{ id: string }>(
    "insert into users (email, status, plan, currency, trial_started_at, sponsor_id, email_prefs, referral_code) values ($1, $2, 'monthly', 'CAD', $3, $4, $5, $6) returning id",
    [email, v.status, v.trial_started_at, v.sponsor_id, JSON.stringify(v.email_prefs), v.referral_code],
  );
  return u.id;
}

beforeEach(async () => {
  const db = await testDb();
  queries = [];
  query = (async (text: string, params?: unknown[]) => {
    queries.push(text);
    if (failOn && failOn.test(text)) throw new Error("database blip");
    return db.query(text, params);
  }) as Query;
  sent = [];
  failing = false;
  noCode = false;
  failOn = null;
  afterSend = null;
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("UNSUB_SECRET", SECRET);
});

describe("the Wednesday stats job", () => {
  it("sends one email to each active member on Wednesday after statsAt, and nothing on a second run", async () => {
    await member("trial@example.com");
    await member("paying@example.com", { status: "active" });
    expect(await runStatsJob(query, deps())).toMatchObject({ status: "done", sent: 2, failed: 0 });
    expect(to("trial@example.com").map((m) => m.subject)).toEqual(["Your week in numbers"]);
    expect(to("paying@example.com")).toHaveLength(1);
    expect(await runStatsJob(query, deps(new Date("2026-12-16T14:10:00Z")))).toMatchObject({ status: "done", due: 0, sent: 0 });
    expect(members()).toHaveLength(2);
    const rows = await query<{ ref: string }>("select ref from notifications where kind = 'stats' and status = 'sent'");
    expect(rows.map((r) => r.ref)).toEqual([DATE, DATE]);
  });

  it("sends nothing before statsAt, at 13:59 UTC on the boundary, or on another day", async () => {
    await member("a@example.com");
    expect(await runStatsJob(query, deps(new Date("2026-12-16T13:59:00Z")))).toMatchObject({ status: "skipped", note: "Before 09:00 Toronto." });
    expect(await runStatsJob(query, deps(new Date("2026-12-17T14:05:00Z")))).toMatchObject({ status: "skipped" });
    expect(await runStatsJob(query, deps(new Date("2026-12-15T17:00:00Z")))).toMatchObject({ status: "skipped" });
    expect(sent).toEqual([]);
    // Exactly statsAt sends; a later statsAt moves the boundary.
    const ten = mergeV3([...live, { key: "v3.statsAt", value: "10:00" }]);
    expect(await runStatsJob(query, deps(new Date("2026-12-16T14:30:00Z"), { settings: ten }))).toMatchObject({ status: "skipped" });
    expect(await runStatsJob(query, deps(NINE_AM))).toMatchObject({ status: "done", sent: 1 });
  });

  it("follows Toronto time across the clock change: 09:00 EDT is 13:00 UTC", async () => {
    await member("a@example.com");
    expect(await runStatsJob(query, deps(new Date("2026-06-17T12:59:00Z")))).toMatchObject({ status: "skipped" });
    expect(await runStatsJob(query, deps(new Date("2026-06-17T13:00:00Z")))).toMatchObject({ status: "done", sent: 1 });
  });

  it("skips trials without a card and closed, held or cancelled accounts, and includes sponsored members", async () => {
    const sponsor = await testSponsor(query);
    await member("nocard@example.com", { trial_started_at: null });
    await member("closed@example.com", { status: "closed" });
    await member("held@example.com", { status: "held" });
    await member("cancelled@example.com", { status: "cancelled" });
    await member("signup@example.com", { status: "signup", trial_started_at: null });
    await member("sponsored@example.com", { trial_started_at: null, sponsor_id: sponsor });
    await member("sponsored-active@example.com", { status: "active", trial_started_at: null, sponsor_id: sponsor });
    await runStatsJob(query, deps());
    expect(members().map((m) => m.to[0]).sort()).toEqual(["sponsored-active@example.com", "sponsored@example.com"]);
  });

  it("skips a member who switched it off in settings", async () => {
    await member("off@example.com", { email_prefs: { stats: false, monday: true } });
    await member("on@example.com", { email_prefs: { monday: false } });
    await runStatsJob(query, deps());
    expect(members().map((m) => m.to[0])).toEqual(["on@example.com"]);
  });

  it("does nothing while v3.statsOn is off, or while the app is not live", async () => {
    await member("a@example.com");
    expect(await runStatsJob(query, deps(NINE_AM, { settings: mergeV3(live.filter((r) => r.key !== "v3.statsOn")) }))).toMatchObject({ status: "skipped" });
    expect(await runStatsJob(query, deps(NINE_AM, { settings: mergeV3(live.filter((r) => r.key !== "v3.cycleLive")) }))).toMatchObject({ status: "skipped" });
    expect(sent).toEqual([]);
    expect(await query("select 1 from notifications")).toEqual([]);
  });

  it("with UNSUB_SECRET unset sends nothing and alerts the admins once", async () => {
    await member("a@example.com");
    const none = { env: {} };
    expect(await runStatsJob(query, deps(NINE_AM, none))).toMatchObject({ status: "skipped", note: "UNSUB_SECRET is not set." });
    await runStatsJob(query, deps(new Date("2026-12-16T14:10:00Z"), none));
    await runStatsJob(query, deps(new Date("2026-12-16T14:20:00Z"), none));
    expect(members()).toEqual([]);
    expect(alerts().map((m) => m.subject)).toEqual(["[Roger] The Wednesday stats email was not sent"]);
    // ADMIN_SECRET is no fallback.
    expect(await runStatsJob(query, deps(NINE_AM, { env: { ADMIN_SECRET: "admin" } }))).toMatchObject({ status: "skipped" });
    expect(members()).toEqual([]);
  });

  it("alerts the admins once when the window closes with members unsent", async () => {
    await member("a@example.com");
    await member("b@example.com");
    failing = true;
    await runStatsJob(query, deps());
    expect(closing()).toEqual([]);
    // The last run of the window (17:50 UTC): still failing.
    expect(await runStatsJob(query, deps(new Date("2026-12-16T17:50:00Z")))).toMatchObject({ status: "done", unsent: 2 });
    await runStatsJob(query, deps(new Date("2026-12-16T17:55:00Z")));
    expect(closing()).toHaveLength(1);
    expect(closing()[0].text).toContain("2 members");
  });

  it("does not alert at the window's close when everyone was sent", async () => {
    await member("a@example.com");
    expect(await runStatsJob(query, deps(new Date("2026-12-16T17:50:00Z")))).toMatchObject({ status: "done", sent: 1, unsent: 0 });
    expect(alerts()).toEqual([]);
  });

  it("makes a referral code for a member who never had one, and the email carries their /r link and no Level", async () => {
    const a = await member("a@example.com");
    await runStatsJob(query, deps());
    const [{ referral_code: code }] = await query<{ referral_code: string | null }>("select referral_code from users where id = $1", [a]);
    expect(code).toMatch(/^[a-z2-9]{10}$/);
    const [m] = to("a@example.com");
    expect(m.text).toContain(`/r/${code}`);
    expect(m.html).toContain(`/r/${code}`);
    expect(m.text).not.toMatch(/level/i);
    expect(m.html).not.toMatch(/level/i);
  });

  it("keeps an existing code", async () => {
    await member("a@example.com", { referral_code: "abcdefghij" });
    await runStatsJob(query, deps());
    expect(to("a@example.com")[0].text).toContain("/r/abcdefghij");
  });

  it("carries the List-Unsubscribe header and one-click, with a token for this member", async () => {
    const a = await member("a@example.com");
    await runStatsJob(query, deps());
    const [m] = to("a@example.com");
    const token = unsubToken(a, "stats", { UNSUB_SECRET: SECRET })!;
    expect(m.headers).toEqual({ "List-Unsubscribe": `<http://localhost:3000/api/unsubscribe/${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(m.text).toContain(`/u/${token}`);
  });

  it("shows Season and bricks, points and rank, and the credit balance as of its date", async () => {
    const a = await member("a@example.com");
    const b = await member("b@example.com", { status: "active" });
    const c = await member("c@example.com", { status: "active" });
    await query("insert into points (user_id, week_of, adopted, confirmed, total) values ($1, '2026-12-07', 2, 1, 3), ($2, '2026-12-07', 5, 0, 5)", [a, b]);
    await query("update users set credit_balance_cents = 4000, credit_balance_at = '2026-12-14T15:00:00Z' where id = $1", [a]);
    await runStatsJob(query, deps());
    const ta = to("a@example.com")[0].text;
    expect(ta).toContain("Your first Season starts with your first list.");
    expect(ta).toContain("3 contribution points. You rank 2nd among Roger members.");
    expect(ta).toContain("Referral credit on your balance: CA$40.00, as of Monday, December 14.");
    const tb = to("b@example.com")[0].text;
    expect(tb).toContain("You rank 1st");
    expect(tb).not.toContain("Referral credit");
    expect(to("c@example.com")[0].text).toContain("No contribution points yet.");
    void c;
  });

  it("reads the standings once for every recipient, not once per member", async () => {
    for (const e of ["a", "b", "c", "d"]) await member(`${e}@example.com`);
    queries = [];
    await runStatsJob(query, deps());
    expect(members()).toHaveLength(4);
    expect(queries.filter((t) => /from points p/.test(t))).toHaveLength(1);
  });

  it("counts who is due in a dry run, and writes or sends nothing", async () => {
    await member("a@example.com");
    expect(await runStatsJob(query, deps(NINE_AM, { dryRun: true }))).toMatchObject({ status: "dry_run", due: 1 });
    expect(sent).toEqual([]);
    expect(await query("select 1 from notifications")).toEqual([]);
    expect(await query("select 1 from users where referral_code is not null")).toEqual([]);
  });

  it("waits while another run holds the lease", async () => {
    await member("a@example.com");
    await query("insert into leases (name, holder, until) values ('stats-send', 'other', now() + interval '5 minutes')");
    expect(await runStatsJob(query, deps())).toMatchObject({ status: "busy" });
    expect(sent).toEqual([]);
  });

  it("tries a failed send again once 45 minutes have passed, not on the next 10-minute run", async () => {
    const a = await member("a@example.com");
    failing = true;
    await runStatsJob(query, deps());
    // Ten minutes later: still failing, but no attempt is spent.
    expect(await runStatsJob(query, deps(new Date("2026-12-16T14:10:00Z")))).toMatchObject({ due: 0 });
    expect(await attempts(a)).toEqual({ attempts: 1, status: "failed" });
    // A 40-minute outage ends; the retry waits for the spacing, then sends.
    failing = false;
    await ageClaims(40);
    expect(await runStatsJob(query, deps(new Date("2026-12-16T14:40:00Z")))).toMatchObject({ due: 0 });
    await ageClaims(6);
    expect(await runStatsJob(query, deps(new Date("2026-12-16T14:50:00Z")))).toMatchObject({ sent: 1 });
    expect(to("a@example.com")).toHaveLength(1);
    expect(await attempts(a)).toEqual({ attempts: 2, status: "sent" });
  });

  it("gives a member up to six attempts, then reports them at the window's close", async () => {
    const a = await member("a@example.com");
    failing = true;
    for (let i = 0; i < 8; i++) {
      await runStatsJob(query, deps());
      await ageClaims(46);
    }
    expect(await attempts(a)).toEqual({ attempts: 6, status: "failed" });
    expect(await runStatsJob(query, deps(new Date("2026-12-16T17:50:00Z")))).toMatchObject({ due: 0, unsent: 1 });
    expect(closing()).toHaveLength(1);
  });

  it("records a member whose email could not be built as a failed attempt, and logs why", async () => {
    const a = await member("a@example.com");
    noCode = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await runStatsJob(query, deps())).toMatchObject({ sent: 0, failed: 1 });
      expect(err).toHaveBeenCalledWith("[stats] email not built", { userId: a, reason: "no referral code could be made" });
    } finally {
      err.mockRestore();
    }
    const [row] = await query<{ status: string; attempts: number; error: string }>("select status, attempts, error from notifications where kind = 'stats' and recipient = $1", [a]);
    expect(row).toEqual({ status: "failed", attempts: 1, error: "no referral code could be made" });
    expect(sent).toEqual([]);
  });

  it("stops when it loses the lease part-way, and logs it", async () => {
    await member("a@example.com");
    await member("b@example.com");
    afterSend = async () => void (await query("update leases set holder = 'other', until = now() + interval '5 minutes' where name = 'stats-send'"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await runStatsJob(query, deps())).toMatchObject({ status: "done", due: 2, sent: 1 });
      expect(warn).toHaveBeenCalledWith("[stats] lease lost; stopping", expect.anything());
    } finally {
      warn.mockRestore();
    }
    expect(members()).toHaveLength(1);
  });

  it("stops starting sends once its time budget is spent", async () => {
    await member("a@example.com");
    await member("b@example.com");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await runStatsJob(query, deps(NINE_AM, { budgetMs: -1 }))).toMatchObject({ status: "done", due: 2, sent: 0 });
    } finally {
      warn.mockRestore();
    }
    expect(members()).toEqual([]);
  });

  it("still reports the unsent at the window's close when the last run fails, with the error", async () => {
    await member("a@example.com");
    failOn = /from points p/;
    await expect(runStatsJob(query, deps(new Date("2026-12-16T17:50:00Z")))).rejects.toThrow("database blip");
    expect(closing()).toHaveLength(1);
    expect(closing()[0].text).toContain("The last run failed: database blip");
    // Earlier in the window a failure only throws.
    sent = [];
    await expect(runStatsJob(query, deps(new Date("2026-12-23T14:00:00Z")))).rejects.toThrow();
    expect(closing()).toEqual([]);
  });

  it("still reports the unsent at the window's close when another run holds the lease", async () => {
    await member("a@example.com");
    await query("insert into leases (name, holder, until) values ('stats-send', 'other', now() + interval '5 minutes')");
    expect(await runStatsJob(query, deps(new Date("2026-12-16T17:50:00Z")))).toMatchObject({ status: "busy", unsent: 1 });
    expect(closing()).toHaveLength(1);
    expect(members()).toEqual([]);
  });

  it("the 18:00 check run only counts and alerts, once per Wednesday, and sends nothing", async () => {
    await member("a@example.com");
    const check = (iso: string) => runStatsJob(query, deps(new Date(iso), { mode: "check" }));
    expect(await check("2026-12-16T15:00:00Z")).toMatchObject({ status: "skipped" });
    expect(await check("2026-12-16T18:00:00Z")).toMatchObject({ status: "checked", unsent: 1 });
    expect(await check("2026-12-16T18:00:00Z")).toMatchObject({ status: "checked", unsent: 1 });
    expect(members()).toEqual([]);
    expect(closing()).toHaveLength(1);
    expect(await query("select 1 from notifications where kind = 'stats'")).toEqual([]);
    // Everyone sent: nothing to report.
    sent = [];
    await runStatsJob(query, deps(new Date("2026-12-23T14:00:00Z")));
    expect(await check("2026-12-23T18:00:00Z")).toMatchObject({ status: "checked", unsent: 0 });
    expect(closing()).toEqual([]);
    // Switched off: the check does nothing.
    expect(await runStatsJob(query, deps(new Date("2026-12-30T18:00:00Z"), { mode: "check", settings: mergeV3(live.filter((r) => r.key !== "v3.statsOn")) }))).toMatchObject({ status: "skipped" });
  });

  it("does not show a credit balance read before the member's last charge", async () => {
    const a = await member("a@example.com", { status: "active" });
    await query("update users set credit_balance_cents = 4000, credit_balance_at = '2026-12-01T15:00:00Z', first_charge_at = '2026-12-10T15:00:00Z' where id = $1", [a]);
    await runStatsJob(query, deps());
    expect(to("a@example.com")[0].text).not.toContain("Referral credit");
  });
});

describe("unsubscribing from the stats email", () => {
  it("a valid token turns stats off, the next Wednesday skips the member, and Monday emails still go", async () => {
    const a = await member("a@example.com", { email_prefs: { monday: true } });
    expect(await unsubscribe(query, unsubToken(a))).toEqual({ userId: a });
    const [u] = await query<{ email_prefs: Record<string, unknown> }>("select email_prefs from users where id = $1", [a]);
    expect(u.email_prefs).toEqual({ monday: true, stats: false });
    await runStatsJob(query, deps(new Date("2026-12-23T14:00:00Z")));
    expect(members()).toEqual([]);
    const monday = mondayListEmail({ week: "2026-12-21", ideas: [{ id: "x", title: "Inbox triage", reason: "Fits.", timeLine: null }], status: "Free list 1 of 2." });
    expect(await sendToUser({ id: a, email: "a@example.com", emailPrefs: u.email_prefs }, "monday_list", "2026-12-21", monday, { query, transport, sleep: async () => {} })).toBe("sent");
  });

  it("a tampered token changes nothing", async () => {
    const a = await member("a@example.com");
    const token = unsubToken(a)!;
    const flipped = token.slice(0, -2) + (token.at(-2) === "A" ? "B" : "A") + token.at(-1);
    expect(await unsubscribe(query, flipped)).toBeNull();
    expect(await unsubscribe(query, "nonsense")).toBeNull();
    const [u] = await query<{ email_prefs: Record<string, unknown> }>("select email_prefs from users where id = $1", [a]);
    expect(u.email_prefs).toEqual({});
  });
});
