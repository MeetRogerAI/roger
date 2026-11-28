import { describe, expect, it, vi } from "vitest";
import { CONFIRM_FAILED, confirmCard, exclusive, returnPath, type CardCheckout } from "./confirm-card";

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

describe("confirmCard: an expired session", () => {
  it("is flagged from the session's status or Stripe's message, so the page opens a fresh one", async () => {
    const byStatus = { ...checkout({ confirm: "declined" }), status: { type: "expired" } };
    expect(await confirmCard(byStatus, f)).toMatchObject({ ok: false, expired: true });
    const c = checkout();
    c.confirm = vi.fn(async () => ({ type: "error" as const, error: { message: "This Checkout Session has expired." } }));
    expect(await confirmCard(c, f)).toMatchObject({ ok: false, expired: true, message: "This Checkout Session has expired." });
    expect(await confirmCard(checkout({ confirm: "declined" }), f)).not.toHaveProperty("expired");
  });
});

describe("exclusive (one change at a time)", () => {
  it("a second press while the first is with Stripe makes no second confirm", async () => {
    const c = checkout();
    const lock = exclusive();
    const submit = (x: typeof f) => lock.run("confirm", () => confirmCard(c, x), (r) => r.ok);
    const [a, b] = await Promise.all([submit(f), submit(f)]);
    expect(a).toEqual({ ok: true });
    expect(b).toBeNull();
    expect(c.confirm).toHaveBeenCalledTimes(1);
    // After success the page is leaving: nothing more is sent, not even another kind of change.
    expect(await submit(f)).toBeNull();
    expect(await lock.run("currency", async () => "x")).toBeNull();
  });

  it("after a decline the button works again (entries kept by the caller)", async () => {
    const c = checkout({ confirm: "declined" });
    const lock = exclusive();
    const submit = (x: typeof f) => lock.run("confirm", () => confirmCard(c, x), (r) => r.ok);
    expect(await submit(f)).toMatchObject({ ok: false });
    expect(await submit(f)).toMatchObject({ ok: false });
    expect(c.confirm).toHaveBeenCalledTimes(2);
  });

  it("releases after a throw", async () => {
    const lock = exclusive();
    await expect(lock.run("promo", async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(lock.held()).toBeNull();
  });
});
it("goes to the return page with the session id", () => {
  expect(returnPath("cs_test_1")).toBe("/start/payment/done?session_id=cs_test_1");
});
