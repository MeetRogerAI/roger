import { describe, expect, it, vi } from "vitest";
import { CONFIRM_FAILED, confirmCard, oneAtATime, returnPath, type CardCheckout } from "./confirm-card";

/** Plan 2026-11-26-001, Unit 6 (origin R23): "Start free trial" with Stripe mocked. */

function checkout(o: { address?: "ok" | "error"; confirm?: "ok" | "declined" | "throws" } = {}) {
  const calls: string[] = [];
  const c: CardCheckout & { calls: string[] } = {
    calls,
    updateBillingAddress: vi.fn(async (a) => {
      calls.push(`address:${JSON.stringify(a)}`);
      return o.address === "error" ? { type: "error" as const, error: { message: "Enter a valid postal code." } } : { type: "success" as const };
    }),
    confirm: vi.fn(async (args) => {
      calls.push(`confirm:${JSON.stringify(args)}`);
      if (o.confirm === "throws") throw new Error("network");
      return o.confirm === "declined" ? { type: "error" as const, error: { message: "Your card was declined." } } : { type: "success" as const };
    }),
  };
  return c;
}

const f = { name: " Ana Lee ", country: "CA", postal: "m5v2t6" };

describe("confirmCard", () => {
  it("pushes Roger's name, country and postal code to the session, then confirms in place", async () => {
    const c = checkout();
    expect(await confirmCard(c, f)).toEqual({ ok: true });
    expect(c.calls).toEqual([`address:${JSON.stringify({ name: "Ana Lee", address: { country: "CA", postal_code: "M5V 2T6" } })}`, `confirm:${JSON.stringify({ redirect: "if_required" })}`]);
  });

  it("a decline comes back as Stripe's own message, for the line above the button", async () => {
    expect(await confirmCard(checkout({ confirm: "declined" }), f)).toEqual({ ok: false, message: "Your card was declined." });
  });

  it("an address Stripe refuses stops before confirming", async () => {
    const c = checkout({ address: "error" });
    expect(await confirmCard(c, f)).toEqual({ ok: false, message: "Enter a valid postal code." });
    expect(c.confirm).not.toHaveBeenCalled();
  });

  it("a failure on the way reads as a generic message; an invalid location never reaches Stripe", async () => {
    expect(await confirmCard(checkout({ confirm: "throws" }), f)).toEqual({ ok: false, message: CONFIRM_FAILED });
    const c = checkout();
    expect(await confirmCard(c, { ...f, postal: "12345" })).toEqual({ ok: false, message: CONFIRM_FAILED });
    expect(c.calls).toEqual([]);
  });
});

describe("oneAtATime (double press)", () => {
  it("a second press while the first is with Stripe makes no second confirm", async () => {
    const c = checkout();
    const submit = oneAtATime((x: typeof f) => confirmCard(c, x));
    const [a, b] = await Promise.all([submit(f), submit(f)]);
    expect(a).toEqual({ ok: true });
    expect(b).toBeNull();
    expect(c.confirm).toHaveBeenCalledTimes(1);
    // After success the page is leaving: nothing more is sent.
    expect(await submit(f)).toBeNull();
  });

  it("after a decline the button works again (entries kept by the caller)", async () => {
    const c = checkout({ confirm: "declined" });
    const submit = oneAtATime((x: typeof f) => confirmCard(c, x));
    expect(await submit(f)).toMatchObject({ ok: false });
    expect(await submit(f)).toMatchObject({ ok: false });
    expect(c.confirm).toHaveBeenCalledTimes(2);
  });
});

it("goes to the return page with the session id", () => {
  expect(returnPath("cs_test_1")).toBe("/start/payment/done?session_id=cs_test_1");
});
