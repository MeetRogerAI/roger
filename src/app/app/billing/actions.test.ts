import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { mergeV3 } from "@/lib/v3-settings";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { fakePlans } from "@/test-helpers/fake-plans";
import { testDb } from "@/test-helpers/pglite-db";
import { nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);
let refreshed = 0;
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), refresh: () => void refreshed++ }));

let current: Query;
let signedIn: string | null = null;
let plans: ReturnType<typeof fakePlans>;
let card: ReturnType<typeof fakeGateway>;
const mailed: string[] = [];
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  requireUserForAction: async () => {
    if (!signedIn) throw new Error("Not signed in");
    return { userId: signedIn };
  },
}));
const hits: string[] = [];
let limitAfter = Infinity;
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  hit: async (key: string) => {
    hits.push(key);
    return hits.filter((k) => k === key).length <= limitAfter;
  },
}));
vi.mock("@/lib/v3-settings", async (orig) => ({ ...(await orig<typeof import("@/lib/v3-settings")>()), readV3Settings: async () => mergeV3([]) }));
vi.mock("@/lib/mail/send", async (orig) => ({
  ...(await orig<typeof import("@/lib/mail/send")>()),
  sendToUser: async (_u: unknown, kind: string) => {
    mailed.push(kind);
    return "sent";
  },
  alertAdmins: async () => "sent",
}));
vi.mock("@/lib/billing/subscriptions", async (orig) => ({
  ...(await orig<typeof import("@/lib/billing/subscriptions")>()),
  stripePlans: () => plans,
  stripeBilling: () => null,
  stripeAdjustments: () => null,
}));
vi.mock("@/lib/billing/gateway", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/gateway")>()), stripeGateway: () => card }));

const { cancelAction, switchAction, undoCancelAction, updateCardAction } = await import("./actions");
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
const status = async (id: string) =>
  (await current<{ status: string; plan: string; cancelling: boolean }>("select status, plan, cancel_requested_at is not null as cancelling from users where id = $1", [id]))[0];
let mine: string;
let theirs: string;

beforeEach(async () => {
  ({ query: current } = await testDb());
  resetNextFakes({}, { "x-vercel-forwarded-for": "1.2.3.4" });
  mailed.length = 0;
  hits.length = 0;
  limitAfter = Infinity;
  refreshed = 0;
  plans = fakePlans();
  card = fakeGateway();
  const end = new Date(Date.now() + 20 * 86_400_000);
  [{ id: mine }] = await current<{ id: string }>(
    "insert into users (email, status, plan, currency, stripe_customer, stripe_subscription, first_charge_at, billing_anchor) values ('ana@example.com', 'active', 'monthly', 'USD', 'cus_a', 'sub_a', now() - interval '10 days', now() - interval '10 days') returning id",
  );
  [{ id: theirs }] = await current<{ id: string }>(
    "insert into users (email, status, plan, currency, stripe_customer, stripe_subscription, first_charge_at, billing_anchor) values ('bo@example.com', 'active', 'monthly', 'USD', 'cus_b', 'sub_b', now() - interval '10 days', now() - interval '10 days') returning id",
  );
  plans.add("sub_a", "cus_a", end);
  plans.add("sub_b", "cus_b", end);
  signedIn = mine;
});

describe("the billing actions act only on the signed-in account", () => {
  it("a cancel posted naming another user's subscription cancels only the caller's own plan", async () => {
    const r = await outcome(() => cancelAction({ status: "idle" }, form({ subscription: "sub_b", user: theirs, userId: theirs, reason: "x" })));
    expect(r).toMatchObject({ value: { status: "done" } });
    expect(plans.calls).toEqual(["cancel_at_end:sub_a"]);
    expect(await status(mine)).toMatchObject({ status: "active", cancelling: true });
    expect(await status(theirs)).toMatchObject({ status: "active", cancelling: false });
    expect(plans.subs.get("sub_b")?.cancelAt).toBeNull();
    expect(refreshed).toBe(1);
  });

  it("a signed-in user with no subscription can't reach anyone else's through the form", async () => {
    const [x] = await current<{ id: string }>("insert into users (email, status, plan, stripe_customer) values ('cy@example.com', 'trial', 'monthly', 'cus_c') returning id");
    signedIn = x.id;
    await outcome(() => cancelAction({ status: "idle" }, form({ subscription: "sub_b" })));
    await outcome(() => undoCancelAction());
    expect(plans.calls.filter((c) => c.includes("sub_b"))).toEqual([]);
    expect(await status(theirs)).toMatchObject({ status: "active" });
    expect(await status(x.id)).toMatchObject({ status: "cancelled" });
  });

  it("refuses everything to someone who is not signed in", async () => {
    signedIn = null;
    await expect(cancelAction({ status: "idle" }, form({}))).rejects.toThrow("Not signed in");
    await expect(switchAction({ status: "idle" }, form({ to: "per_run" }))).rejects.toThrow("Not signed in");
    await expect(undoCancelAction()).rejects.toThrow("Not signed in");
    await expect(updateCardAction()).rejects.toThrow("Not signed in");
    expect(plans.calls).toEqual([]);
  });

  it("refuses a switch to one list at a time: monthly is the only plan (plan 2026-11-26-001, Unit 9)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-12T15:00:00Z"));
    try {
      expect(await outcome(() => switchAction({ status: "idle" }, form({ to: "gold" })))).toMatchObject({ value: { status: "error" } });
      expect(await outcome(() => switchAction({ status: "idle" }, form({ to: "per_run", user: theirs })))).toMatchObject({
        value: { status: "error", message: "Monthly is the only plan." },
      });
    } finally {
      vi.useRealTimers();
    }
    expect(plans.calls).toEqual([]);
    expect(hits).toEqual([]);
    expect(await status(mine)).toMatchObject({ status: "active", plan: "monthly", cancelling: false });
    expect(await status(theirs)).toMatchObject({ status: "active", plan: "monthly", cancelling: false });
    expect(mailed).toEqual([]);
  });

  it("a leftover one-at-a-time account can still be switched to monthly, only the caller's own", async () => {
    await current("update users set plan = 'per_run', stripe_subscription = null, first_charge_at = null, billing_anchor = null where id = $1", [mine]);
    await current("update users set plan = 'per_run', stripe_subscription = null where id = $1", [theirs]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-12T15:00:00Z"));
    try {
      expect(await outcome(() => switchAction({ status: "idle" }, form({ to: "monthly", user: theirs })))).toMatchObject({ value: { status: "done" } });
    } finally {
      vi.useRealTimers();
    }
    expect(await status(mine)).toMatchObject({ plan: "monthly" });
    expect(await status(theirs)).toMatchObject({ plan: "per_run" });
  });

  it("cancel settles a no-card trial's open Payment session with the card gateway (review fixes Unit 9, F5)", async () => {
    const [x] = await current<{ id: string }>("insert into users (email, status, plan, currency, stripe_customer) values ('nc@example.com', 'trial', 'monthly', 'USD', 'cus_nc') returning id");
    const s = await card.createEmbeddedSetupSession({ userId: x.id, customer: "cus_nc", currency: "USD", returnUrl: "https://roger.test/r" });
    await current("update users set setup_session = $2 where id = $1", [x.id, s.id]);
    signedIn = x.id;
    expect(await outcome(() => cancelAction({ status: "idle" }, form({})))).toMatchObject({ value: { status: "done" } });
    expect(await status(x.id)).toMatchObject({ status: "cancelled" });
    expect(card.expired).toEqual([s.id]);
    expect((await current<{ setup_session: string | null }>("select setup_session from users where id = $1", [x.id]))[0].setup_session).toBeNull();
  });

  it("opens Stripe's card page for the caller's own customer, marked as a card update", async () => {
    const r = await outcome(() => updateCardAction());
    expect(r).toMatchObject({ redirect: expect.stringContaining("https://checkout.stripe.test/") });
    expect([...card.sessions.values()]).toMatchObject([{ customer: "cus_a", purpose: "card_update", userId: mine }]);
  });
});

describe("rate limits", () => {
  it("cancel, undo and switch share one limit, so an undo can't be repeated without end", async () => {
    limitAfter = 1;
    expect(await outcome(() => cancelAction({ status: "idle" }, form({})))).toMatchObject({ value: { status: "done" } });
    expect(await outcome(() => undoCancelAction())).toMatchObject({ value: { status: "error", message: expect.stringContaining("Too many") } });
    expect(await outcome(() => switchAction({ status: "idle" }, form({ to: "monthly" })))).toMatchObject({ value: { status: "error", message: expect.stringContaining("Too many") } });
    expect(new Set(hits)).toEqual(new Set([`billing:mutate:${mine}`]));
    expect(plans.calls).toEqual(["cancel_at_end:sub_a"]);
  });
});
