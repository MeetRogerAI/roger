import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handled: string[] = [];
let failHandler = false;
vi.mock("@/lib/billing/webhook", () => ({
  handleStripeEvent: async (_q: unknown, _gw: unknown, e: { id: string }) => {
    handled.push(e.id);
    if (failHandler) throw new Error("db down");
    return "handled";
  },
}));
vi.mock("@/lib/db", () => ({ hasDb: () => true }));
vi.mock("@/lib/db-query", () => ({ query: async () => [] }));
vi.mock("@/lib/v3-settings", () => ({ readV3Settings: async () => ({}) }));

process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
const { POST } = await import("./route");
const signer = new Stripe("sk_test_fake");

function signed(payload: string, secret = "whsec_test_secret") {
  const header = signer.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://meetroger.ai/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } });
}

beforeEach(() => {
  handled.length = 0;
  failHandler = false;
});

describe("POST /api/stripe/webhook", () => {
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_1", mode: "setup" } } });

  it("accepts an event signed with the endpoint's secret", async () => {
    const res = await POST(signed(payload));
    expect(res.status).toBe(200);
    expect(handled).toEqual(["evt_1"]);
  });

  it("refuses a wrong signature or a changed body, and handles nothing", async () => {
    expect((await POST(signed(payload, "whsec_other"))).status).toBe(400);
    const tampered = signed(payload);
    const res = await POST(new Request(tampered.url, { method: "POST", body: payload.replace("evt_1", "evt_9"), headers: tampered.headers }));
    expect(res.status).toBe(400);
    expect(handled).toEqual([]);
  });

  it("refuses a request with no signature", async () => {
    const res = await POST(new Request("https://meetroger.ai/api/stripe/webhook", { method: "POST", body: payload }));
    expect(res.status).toBe(400);
  });

  it("answers 500 when handling fails, so Stripe sends the event again", async () => {
    failHandler = true;
    const res = await POST(signed(payload));
    expect(res.status).toBe(500);
  });
});
