import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { fakeGateway } from "@/test-helpers/fake-card-gateway";
import { testDb } from "@/test-helpers/pglite-db";
import { nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";

vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", () => nextNavigation);

let current: Query;
let signedIn: string | null = null;
let allowed = true;
let gw: ReturnType<typeof fakeGateway> | null = null;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
vi.mock("@/lib/auth/access", () => ({
  requireUserForAction: async () => {
    if (!signedIn) throw new Error("Not signed in");
    return { userId: signedIn };
  },
}));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<typeof import("@/lib/rate-limit")>()), hit: async () => allowed }));
vi.mock("@/lib/billing/gateway", () => ({ stripeGateway: () => gw }));
// The one-at-a-time switch (src/data/config.ts `plans.oneAtATimeOffered`): off, as at launch, unless a test turns it on.
const offer = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/billing/offered", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/offered")>()), oneAtATimeOffered: () => offer.on }));

const { savePlan, setCurrency, openCardPage } = await import("./billing-actions");
const idle = { status: "idle" as const };
const planForm = (plan: string, consent?: string) => {
  const fd = new FormData();
  fd.set("plan", plan);
  if (consent) fd.set("consent", consent);
  return fd;
};

beforeEach(async () => {
  ({ query: current } = await testDb());
  resetNextFakes({}, { "x-vercel-forwarded-for": "1.2.3.4" });
  allowed = true;
  offer.on = false;
  gw = fakeGateway();
  [{ id: signedIn }] = await current<{ id: string }>(
    "insert into users (email, name, currency, email_verified_at, signup_step) values ('ana@example.com', 'Ana', 'CAD', now(), 'plan') returning id",
  );
});

const row = async () => (await current<{ plan: string; consent_at: unknown; signup_step: string; currency: string }>("select plan, consent_at, signup_step, currency from users"))[0];

describe("savePlan", () => {
  it("will not move on without the consent box, even when posted directly (spec check 3)", async () => {
    const r = await outcome(() => savePlan(idle, planForm("monthly")));
    expect(r).toMatchObject({ value: { status: "error", errors: { consent: expect.any(String) } } });
    expect((await row()).consent_at).toBeNull();
    expect((await row()).signup_step).toBe("plan");
  });

  it("refuses a plan that is not offered", async () => {
    expect(await outcome(() => savePlan(idle, planForm("non_contributor", "yes")))).toMatchObject({ value: { status: "error", errors: { plan: "Choose one." } } });
  });

  it("records monthly and the consent, then opens the card step", async () => {
    expect(await outcome(() => savePlan(idle, planForm("monthly", "yes")))).toEqual({ redirect: "/start/card" });
    const r = await row();
    expect(r.plan).toBe("monthly");
    expect(r.consent_at).not.toBeNull();
    expect(r.signup_step).toBe("card");
  });

  it("stores monthly when the page sends no plan at all, which is what the monthly-only page does", async () => {
    const fd = new FormData();
    fd.set("consent", "yes");
    expect(await outcome(() => savePlan(idle, fd))).toEqual({ redirect: "/start/card" });
    expect(await row()).toMatchObject({ plan: "monthly", signup_step: "card" });
  });

  it("refuses one at a time while it is not offered, even when posted directly, and stores nothing", async () => {
    const r = await outcome(() => savePlan(idle, planForm("per_run", "yes")));
    expect(r).toEqual({ value: { status: "error", errors: { plan: "That plan isn’t offered. Roger is monthly." } } });
    expect(await row()).toMatchObject({ plan: "monthly", consent_at: null, signup_step: "plan" });
  });

  it("keeps the first consent time when the plan step is saved again", async () => {
    await outcome(() => savePlan(idle, planForm("monthly", "yes")));
    const first = (await row()).consent_at;
    await outcome(() => savePlan(idle, planForm("monthly", "yes")));
    expect((await row()).consent_at).toEqual(first);
  });

  it("changes nothing for someone past sign-up", async () => {
    offer.on = true;
    await current("update users set status = 'trial'");
    expect(await outcome(() => savePlan(idle, planForm("per_run", "yes")))).toEqual({ redirect: "/app" });
    expect((await row()).plan).toBe("monthly");
  });

  describe("with one at a time offered (the switch on)", () => {
    beforeEach(() => {
      offer.on = true;
    });

    it("records that plan and the consent, then opens the card step", async () => {
      expect(await outcome(() => savePlan(idle, planForm("per_run", "yes")))).toEqual({ redirect: "/start/card" });
      expect(await row()).toMatchObject({ plan: "per_run", signup_step: "card" });
    });

    it("asks for a choice when no plan is sent", async () => {
      const fd = new FormData();
      fd.set("consent", "yes");
      expect(await outcome(() => savePlan(idle, fd))).toMatchObject({ value: { status: "error", errors: { plan: "Choose one." } } });
    });

    it("keeps the first consent time when the plan is changed later", async () => {
      await outcome(() => savePlan(idle, planForm("monthly", "yes")));
      const first = (await row()).consent_at;
      await outcome(() => savePlan(idle, planForm("per_run", "yes")));
      expect((await row()).consent_at).toEqual(first);
    });
  });

  it("refuses someone who is not signed in", async () => {
    signedIn = null;
    await expect(savePlan(idle, planForm("monthly", "yes"))).rejects.toThrow("Not signed in");
  });
});

describe("setCurrency", () => {
  it("switches between USD and CAD before the card is saved, and ignores anything else", async () => {
    const fd = new FormData();
    fd.set("cur", "USD");
    await outcome(() => setCurrency(fd));
    expect((await row()).currency).toBe("USD");
    fd.set("cur", "EUR");
    await outcome(() => setCurrency(fd));
    expect((await row()).currency).toBe("USD");
    await current("update users set status = 'trial'");
    fd.set("cur", "CAD");
    await outcome(() => setCurrency(fd));
    expect((await row()).currency).toBe("USD");
  });
});

describe("openCardPage", () => {
  it("sends someone who has not agreed back to the plan step", async () => {
    expect(await outcome(() => openCardPage())).toEqual({ redirect: "/start/plan" });
  });

  it("opens Stripe's card page in the person's currency once they have agreed", async () => {
    await current("update users set consent_at = now()");
    const r = await outcome(() => openCardPage());
    expect(r).toMatchObject({ redirect: expect.stringMatching(/^https:\/\/checkout\.stripe\.test\//) });
    expect([...gw!.sessions.values()][0].currency).toBe("CAD");
  });

  it("sends a sign-up left on one at a time back to the plan step while that plan is not offered, and opens nothing", async () => {
    await current("update users set consent_at = now(), plan = 'per_run'");
    expect(await outcome(() => openCardPage())).toEqual({ redirect: "/start/plan" });
    expect(gw!.sessions.size).toBe(0);
    offer.on = true;
    expect(await outcome(() => openCardPage())).toMatchObject({ redirect: expect.stringMatching(/^https:\/\/checkout\.stripe\.test\//) });
  });

  it("refuses past the rate limit and opens nothing", async () => {
    await current("update users set consent_at = now()");
    allowed = false;
    expect(await outcome(() => openCardPage())).toMatchObject({ value: { status: "error" } });
    expect(gw!.sessions.size).toBe(0);
  });

  it("says billing is not on when there is no Stripe key", async () => {
    gw = null;
    expect(await outcome(() => openCardPage())).toMatchObject({ value: { status: "error", message: expect.stringMatching(/switched on/) } });
  });

  it("shows a plain error, not a crash, when Stripe fails", async () => {
    await current("update users set consent_at = now()");
    gw = { ...fakeGateway(), createSetupSession: async () => Promise.reject(new Error("stripe down")) } as ReturnType<typeof fakeGateway>;
    expect(await outcome(() => openCardPage())).toMatchObject({ value: { status: "error", message: expect.stringMatching(/our side/) } });
  });
});
