/**
 * The hourly route's door. The pass now runs with no Stripe (for the tasks
 * that need neither Stripe nor the paid cycle), so the early return that used
 * to follow the check is gone and the order matters: a caller without the
 * secret is answered 401 before the settings are read, before any Stripe
 * gateway is built and before any task runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({
  readV3Settings: vi.fn(async () => ({ cycleLive: false })),
  runHourly: vi.fn(async () => ({ tasks: { free_run_purge: "ok" } })),
  query: vi.fn(async () => {
    throw new Error("the database must not be read");
  }),
  stripeBilling: vi.fn((): object | null => null),
  stripeOrders: vi.fn(() => null),
  stripeAdjustments: vi.fn(() => null),
  stripePlans: vi.fn(() => null),
}));

vi.mock("@/lib/v3-settings", () => ({ readV3Settings: spies.readV3Settings }));
vi.mock("@/lib/housekeeping/job", () => ({ runHourly: spies.runHourly, STRIPE_NOT_SET_UP: "Stripe is not configured." }));
vi.mock("@/lib/db-query", () => ({ query: spies.query }));
vi.mock("@/lib/billing/subscriptions", () => ({
  stripeBilling: spies.stripeBilling,
  stripeOrders: spies.stripeOrders,
  stripeAdjustments: spies.stripeAdjustments,
  stripePlans: spies.stripePlans,
}));

const { GET } = await import("./route");

const SECRET = "the-cron-secret";
const call = (headers: Record<string, string> = {}) => GET(new Request("https://meetroger.ai/api/cron/housekeeping", { headers }));
const nothingRan = () => {
  for (const [name, spy] of Object.entries(spies)) expect(spy, name).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  spies.stripeBilling.mockReturnValue(null);
});

describe("the housekeeping cron route without the secret", () => {
  const strangers: [string, Record<string, string>][] = [
    ["no authorization header", {}],
    ["the wrong secret", { authorization: "Bearer not-the-secret" }],
    ["the secret without the scheme", { authorization: SECRET }],
    ["an empty bearer", { authorization: "Bearer " }],
  ];

  for (const [name, headers] of strangers) {
    it(`answers 401 for ${name}, before reading settings or running any task, with Stripe unset`, async () => {
      const res = await call(headers);
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("Unauthorized");
      nothingRan();
    });

    it(`answers 401 for ${name} with Stripe set up too`, async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
      spies.stripeBilling.mockReturnValue({});
      const res = await call(headers);
      expect(res.status).toBe(401);
      nothingRan();
    });
  }

  it("answers 401 for everyone while no secret is set, whatever the header says", async () => {
    vi.stubEnv("CRON_SECRET", "");
    for (const authorization of ["Bearer ", "Bearer undefined", `Bearer ${SECRET}`]) {
      const res = await call({ authorization });
      expect(res.status, authorization).toBe(401);
    }
    nothingRan();
  });
});

describe("the housekeeping cron route with the secret", () => {
  it("reads the settings and runs the pass once, and with no Stripe says so beside what did run", async () => {
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "skipped", note: "Stripe is not configured.", tasks: { free_run_purge: "ok" } });
    expect(spies.readV3Settings).toHaveBeenCalledTimes(1);
    expect(spies.runHourly).toHaveBeenCalledTimes(1);
    expect(spies.runHourly.mock.calls[0]).toEqual([spies.query, expect.objectContaining({ gw: null, settings: { cycleLive: false }, now: expect.any(Date) })]);
  });
});
