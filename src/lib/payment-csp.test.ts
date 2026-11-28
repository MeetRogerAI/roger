import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { paymentCsp, PAYMENT_CSP_HEADER } from "./payment-csp";

/** Plan 2026-11-26-001, Unit 6: the Payment page's CSP, on its routes only. */

describe("Payment CSP", () => {
  it("is sent on /start/payment and /start/payment/done only (enforced)", async () => {
    const rules = await nextConfig.headers!();
    const withCsp = rules.filter((r) => r.headers.some((h) => /content-security-policy/i.test(h.key)));
    expect(withCsp.map((r) => r.source)).toEqual(["/start/payment", "/start/payment/done"]);
    for (const r of withCsp) expect(r.headers).toEqual([{ key: PAYMENT_CSP_HEADER, value: paymentCsp() }]);
    expect(PAYMENT_CSP_HEADER).toBe("Content-Security-Policy");
  });

  it("allows Stripe's origins and nothing else outside Roger", () => {
    const d = Object.fromEntries(
      paymentCsp(false)
        .split("; ")
        .map((p) => [p.split(" ")[0], p.split(" ").slice(1)]),
    );
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["script-src"]).toEqual(["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://*.js.stripe.com"]);
    expect(d["frame-src"]).toEqual(["https://js.stripe.com", "https://*.js.stripe.com", "https://hooks.stripe.com", "https://m.stripe.network"]);
    expect(d["connect-src"]).toEqual(["'self'", "https://api.stripe.com", "https://m.stripe.network"]);
    // *.stripe.com covers q.stripe.com (Stripe's tracking pixel).
    expect(d["img-src"]).toEqual(["'self'", "data:", "https://*.stripe.com"]);
    expect(paymentCsp(false)).not.toMatch(/report-(to|uri)/);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
  });

  it("allows eval and the dev socket only in development", () => {
    expect(paymentCsp(false)).not.toContain("unsafe-eval");
    expect(paymentCsp(true)).toContain("'unsafe-eval'");
    expect(paymentCsp(true)).toContain("ws:");
  });
});
