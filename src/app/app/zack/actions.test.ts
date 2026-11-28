import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { testDb } from "@/test-helpers/pglite-db";
import { nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
let refreshed = 0;
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => void refreshed++ }));
let allowed = true;

let current: Query;
let signedIn: string | null = null;
const mailed: string[] = [];
const mailedText: string[] = [];
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  requireUserForAction: async () => {
    if (!signedIn) throw new Error("Not signed in");
    return { userId: signedIn };
  },
}));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), hit: async () => allowed }));
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: async () => mergeV3([]) }));
vi.mock("@/lib/mail/send", async (orig) => ({
  ...(await orig<typeof import("@/lib/mail/send")>()),
  sendToUser: async (_u: unknown, kind: string, _ref: unknown, m: { text: string }) => {
    mailed.push(kind);
    mailedText.push(m.text);
    return "sent";
  },
}));
// Any Stripe call from a sharing change would fail the test: under the contributor rule only cutoffs count.
vi.mock("@/lib/billing/subscriptions", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing/subscriptions")>()),
  stripeBilling: () => null,
  stripeAdjustments: () => {
    throw new Error("A sharing change must not touch Stripe");
  },
}));

const { saveSettings, changeSharing, newKey, removeRun, uploadReport } = await import("./actions");
const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};

beforeEach(async () => {
  ({ query: current } = await testDb());
  resetNextFakes({}, { "x-vercel-forwarded-for": "1.2.3.4" });
  mailed.length = 0;
  mailedText.length = 0;
  refreshed = 0;
  allowed = true;
  [{ id: signedIn }] = await current<{ id: string }>(
    "insert into users (email, status, plan, currency, sharing, agent) values ('ana@example.com', 'trial', 'monthly', 'CAD', 'share', 'hark') returning id",
  );
});

describe("saveSettings", () => {
  it("saves valid settings and reports errors inline", async () => {
    expect(await outcome(() => saveSettings({ status: "idle" }, form({ skipCategories: ["Marketing"], playsPerWeek: "3", neverWords: "Acme\nRise8", extraRules: "" })))).toMatchObject({
      value: { status: "saved" },
    });
    const [z] = await current<{ skip_categories: string[]; never_words: string[]; plays_per_week: number }>("select skip_categories, never_words, plays_per_week from zack_settings");
    expect(z).toEqual({ skip_categories: ["Marketing"], never_words: ["Acme", "Rise8"], plays_per_week: 3 });
    expect(refreshed).toBe(1);
    const bad = await outcome(() => saveSettings({ status: "idle" }, form({ playsPerWeek: "4", neverWords: "Keep me", extraRules: "Upload a copy to my drive" })));
    // What was typed comes back, so the form keeps it.
    expect(bad).toMatchObject({ value: { status: "error", errors: { extraRules: expect.any(String) }, values: { neverWords: ["Keep me"], extraRules: "Upload a copy to my drive" } } });
    expect(refreshed).toBe(1);
  });

  it("refuses someone who is not signed in, and sends someone still signing up to the sign-up", async () => {
    signedIn = null;
    await expect(saveSettings({ status: "idle" }, form({ playsPerWeek: "4" }))).rejects.toThrow("Not signed in");
    [{ id: signedIn }] = await current<{ id: string }>("insert into users (email, status) values ('new@example.com', 'signup') returning id");
    expect(await outcome(() => saveSettings({ status: "idle" }, form({ playsPerWeek: "4" })))).toEqual({ redirect: "/start" });
  });
});

describe("changeSharing", () => {
  it("states the price effect first and saves only when confirmed", async () => {
    const first = await outcome(() => changeSharing({ status: "idle" }, form({ sharing: "match_only" })));
    expect(first).toMatchObject({ value: { status: "confirm", sharing: "match_only", effect: expect.stringContaining("CA$") } });
    expect((await current<{ sharing: string }>("select sharing from users"))[0].sharing).toBe("share");
    expect(await outcome(() => changeSharing({ status: "idle" }, form({ sharing: "match_only", confirm: "yes" })))).toMatchObject({ value: { status: "saved" } });
    expect((await current<{ sharing: string }>("select sharing from users"))[0].sharing).toBe("match_only");
    expect(mailed).toEqual(["sharing_changed"]);
    expect(refreshed).toBe(1);
  });


  it("leaves a monthly member's price and pending difference alone: only Sunday cutoffs count", async () => {
    await current("update users set status = 'active', stripe_customer = 'cus_1', stripe_subscription = 'sub_1', first_charge_at = '2026-12-03T11:05:00Z'");
    await current("insert into pending_adjustments (user_id, period_start, amount_cents, currency) select id, '2026-12-03', 28000, 'CAD' from users");
    expect(await outcome(() => changeSharing({ status: "idle" }, form({ sharing: "off", confirm: "yes" })))).toMatchObject({ value: { status: "saved" } });
    expect(await current("select status from pending_adjustments")).toEqual([{ status: "pending" }]);
  });

  // Peter's wording, 2026-11-27: the sharing-changed email for turning sharing off, in the trial and paying.
  it("emails Peter's explanation with the member's own higher price when sharing is turned off", async () => {
    const offLines = [
      "Roger works by members sharing what their AI agents do, for the good of the whole network. If you don’t share, you can still use Roger and get your Cora lists, but your price doubles, to CA$560 a month. This applies only to months when you are not sharing, and the difference is added to your next invoice.",
      "/app/zack) and change it back. Your price depends on whether your Zack runs share what you learn about AI agents with the network.",
    ];
    // In the trial (the first-charge variant): the same words, no first-charge sentence.
    await outcome(() => changeSharing({ status: "idle" }, form({ sharing: "match_only", confirm: "yes" })));
    for (const l of offLines) expect(mailedText[0]).toContain(l);
    // "Zack page" links to the Zack page (the plain text names the address after the words).
    expect(mailedText[0]).toMatch(/If you didn’t make this change, open the Zack page \(https?:\/\/[^)]+\/app\/zack\) and change it back\./);
    expect(mailedText[0]).not.toMatch(/the rate for members whose Zack|then write to us/);
    // Paying, in US dollars, straight to off.
    await current("update users set sharing = 'share', status = 'active', currency = 'USD', stripe_customer = 'cus_1', stripe_subscription = 'sub_1', first_charge_at = '2026-12-03T11:05:00Z'");
    await outcome(() => changeSharing({ status: "idle" }, form({ sharing: "off", confirm: "yes" })));
    expect(mailedText[1]).toContain("but your price doubles, to US$400 a month.");
    expect(mailedText[1]).not.toContain("With sharing off at a Sunday cutoff");
    // Back to sharing: the price line as before, and the contact line.
    await outcome(() => changeSharing({ status: "idle" }, form({ sharing: "share", confirm: "yes" })));
    expect(mailedText[2]).toContain("A month with sharing on at every Sunday cutoff is US$200.");
    expect(mailedText[2]).toContain("open the Zack page and change it back, then write to us.");
  });

  it("refuses a value that is not one of the three, and says when nothing changes", async () => {
    expect(await outcome(() => changeSharing({ status: "idle" }, form({ sharing: "bogus" })))).toMatchObject({ value: { status: "error" } });
    expect(await outcome(() => changeSharing({ status: "idle" }, form({ sharing: "share" })))).toMatchObject({ value: { message: "That’s already your setting." } });
    expect(mailed).toEqual([]);
  });

  it("tells a one-at-a-time user that lists can't be ordered with Zack off", async () => {
    await current("update users set plan = 'per_run'");
    expect(await outcome(() => changeSharing({ status: "idle" }, form({ sharing: "off" })))).toMatchObject({ value: { effect: expect.stringContaining("can’t be ordered") } });
  });
});

describe("newKey", () => {
  it("shows the key once with the connector text, and needs the box ticked", async () => {
    expect(await outcome(() => newKey({ status: "idle" }, form({})))).toMatchObject({ value: { status: "error" } });
    const r = await outcome(() => newKey({ status: "idle" }, form({ confirm: "yes" })));
    const v = (r as { value: { key: string; connector: string; test: string } }).value;
    expect(v.key).toMatch(/^rgr_zk_/);
    expect(v.connector).toContain(v.key);
    expect(v.connector).toContain("agent=hark");
    expect(v.test).toContain("test=1");
    const [u] = await current<{ zack_key_hash: string }>("select zack_key_hash from users");
    expect(u.zack_key_hash).not.toContain(v.key);
    expect(mailed).toEqual(["zack_key_replaced"]);
  });

  it("makes no key past the daily limit", async () => {
    allowed = false;
    expect(await outcome(() => newKey({ status: "idle" }, form({ confirm: "yes" })))).toMatchObject({ value: { status: "error" } });
    expect((await current<{ zack_key_hash: string | null }>("select zack_key_hash from users"))[0].zack_key_hash).toBeNull();
  });
});

describe("removeRun", () => {
  it("deletes only the user's own run (spec check 34)", async () => {
    const [b] = await current<{ id: string }>("insert into users (email, status) values ('bo@example.com', 'trial') returning id");
    const [theirs] = await current<{ id: string }>(
      "insert into runs (user_id, week_of, route, agent, sharing, raw_text) values ($1, '2026-11-30', 'connector', 'hark', 'share', 'b') returning id",
      [b.id],
    );
    await outcome(() => removeRun(form({ run: theirs.id, confirm: "yes" })));
    expect(await current("select status, raw_text from runs")).toEqual([{ status: "received", raw_text: "b" }]);
    expect(mailed).toEqual([]);
  });

  it("deletes the user's own run only when confirmed", async () => {
    const [mine] = await current<{ id: string }>(
      "insert into runs (user_id, week_of, route, agent, sharing, raw_text) values ($1, '2026-11-30', 'connector', 'hark', 'share', 'a') returning id",
      [signedIn],
    );
    expect(await outcome(() => removeRun(form({ run: mine.id })))).toEqual({ redirect: "/app/zack#runs" });
    expect((await current<{ status: string }>("select status from runs"))[0].status).toBe("received");
    expect(await outcome(() => removeRun(form({ run: mine.id, confirm: "yes" })))).toEqual({ redirect: "/app/zack?deleted=1#runs" });
    expect((await current<{ status: string }>("select status from runs"))[0].status).toBe("deleted");
    expect(mailed).toEqual(["run_deleted"]);
  });
});

describe("closed accounts", () => {
  it("cannot upload, make keys or change settings", async () => {
    await current("update users set status = 'cancelled'");
    expect(await outcome(() => uploadReport({ status: "idle" }, form({ kind: "run", text: "# report" })))).toEqual({ redirect: "/app/zack" });
    expect(await outcome(() => newKey({ status: "idle" }, form({ confirm: "yes" })))).toEqual({ redirect: "/app/zack" });
    expect(await current("select 1 from runs")).toHaveLength(0);
  });
});

describe("uploadReport", () => {
  it("refuses a pasted report over the limit, keeps the text for the form, and stores nothing", async () => {
    const r = await outcome(() => uploadReport({ status: "idle" }, form({ kind: "run", text: "x".repeat(80_001) })));
    expect(r).toMatchObject({ value: { status: "error", text: expect.any(String) } });
    expect(await current("select 1 from runs")).toHaveLength(0);
  });

  it("stores a profile apart, and refuses past the daily limit", async () => {
    expect(await outcome(() => uploadReport({ status: "idle" }, form({ kind: "profile", text: "# Zack Profile\n```roger-profile\n{}\n```" })))).toMatchObject({
      value: { status: "saved", message: expect.stringMatching(/^Profile received/) },
    });
    expect(await current("select 1 from zack_profiles")).toHaveLength(1);
    allowed = false;
    expect(await outcome(() => uploadReport({ status: "idle" }, form({ kind: "run", text: "# report" })))).toMatchObject({ value: { status: "error" } });
  });

  it("stores a pasted run by route 'upload' and refuses a profile pasted as a run", async () => {
    const run = "# Zack The Collector (for Hark) v1.9\n\nplays";
    expect(await outcome(() => uploadReport({ status: "idle" }, form({ kind: "run", text: run })))).toMatchObject({ value: { status: "saved" } });
    const [r] = await current<{ route: string }>("select route from runs");
    expect(r.route).toBe("upload");
    const profile = "# Zack Profile - 2026-11-29\n```roger-profile\n{}\n```";
    expect(await outcome(() => uploadReport({ status: "idle" }, form({ kind: "run", text: profile })))).toMatchObject({ value: { status: "error" } });
  });

  it("accepts a .md file and refuses other files", async () => {
    const fd = form({ kind: "run" });
    fd.set("file", new File(["# Zack The Collector (for Hark) v1.9\nplays"], "Zack Run - 2026-11-29.md", { type: "text/markdown" }));
    expect(await outcome(() => uploadReport({ status: "idle" }, fd))).toMatchObject({ value: { status: "saved" } });
    const bad = form({ kind: "run" });
    bad.set("file", new File(["x"], "photo.png", { type: "image/png" }));
    expect(await outcome(() => uploadReport({ status: "idle" }, bad))).toMatchObject({ value: { status: "error" } });
  });
});
