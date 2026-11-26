/**
 * The Payment page's content security policy (plan 2026-11-26-001, Unit 6),
 * scoped to `/start/payment` and its return page only (no CSP exists
 * elsewhere, and this release does not introduce a site-wide one). Stripe.js
 * and its frames come from js.stripe.com; its API calls go to api.stripe.com;
 * 3D Secure frames come from hooks.stripe.com; Stripe's fraud signals frame
 * and beacon from m.stripe.network; images (including q.stripe.com) from
 * *.stripe.com. No report-to or report-uri yet: Roger has no endpoint to
 * receive reports, so violations show in the browser console only (plan,
 * Unit 6 review fixes).
 *
 * Shipped as `Content-Security-Policy-Report-Only` for now: Next.js inlines
 * its own bootstrap scripts, and with Cache Components the page's static
 * shell is prerendered, where a per-request nonce cannot reach (Next's CSP
 * guide: nonces need fully dynamic rendering and are incompatible with
 * partial prerendering). So `script-src` carries `'unsafe-inline'` until
 * enforcement is decided (plan, Unit 6 as-built note); `'unsafe-eval'` only
 * in development, where React needs it.
 */
export function paymentCsp(dev = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://*.js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://m.stripe.network",
    `connect-src 'self' https://api.stripe.com https://m.stripe.network${dev ? " ws: wss:" : ""}`,
    "img-src 'self' data: https://*.stripe.com",
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** The routes it applies to. */
export const PAYMENT_CSP_ROUTES = ["/start/payment", "/start/payment/done"] as const;

/** The header name: report-only until enforcement (see above). */
export const PAYMENT_CSP_HEADER = "Content-Security-Policy-Report-Only";

/** `next.config.ts` `headers()` entries for the Payment routes. */
export function paymentCspHeaders(dev?: boolean) {
  const value = paymentCsp(dev);
  return PAYMENT_CSP_ROUTES.map((source) => ({ source, headers: [{ key: PAYMENT_CSP_HEADER, value }] }));
}
