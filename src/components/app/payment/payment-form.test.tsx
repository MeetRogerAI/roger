import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { basePreview } from "@/lib/billing/payment-view";

/**
 * Plan 2026-11-26-001, Unit 6 (origin R18–R23): the card form, with Stripe's
 * React SDK mocked. (No DOM in this test setup: the click and network
 * behaviour lives in `confirm-card.ts` and is tested there.)
 */

const stripe = vi.hoisted(() => ({
  checkout: { type: "loading" } as { type: string; checkout?: unknown },
  elementProps: [] as Record<string, unknown>[],
  providerOptions: [] as Record<string, unknown>[],
}));
vi.mock("@/app/start/payment/actions", () => ({
  applyPromo: vi.fn(),
  removePromo: vi.fn(),
  quoteTax: vi.fn(),
  setPaymentCurrency: vi.fn(),
  openSession: vi.fn(),
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => new Promise(() => {}) }));
vi.mock("@stripe/react-stripe-js/checkout", () => ({
  CheckoutElementsProvider: ({ children, options }: { children: React.ReactNode; options: Record<string, unknown> }) => {
    stripe.providerOptions.push(options);
    return children;
  },
  useCheckoutElements: () => stripe.checkout,
  PaymentElement: (props: Record<string, unknown>) => {
    stripe.elementProps.push(props);
    return <div data-stripe="payment-element" />;
  },
}));

const { CardForm, PaymentForm } = await import("./payment-form");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const fields = { name: "Ana Lee", country: "CA", postal: "" };
const base = { fields, setFields: () => {}, onRetry: () => {}, onConfirm: async () => null, supportEmail: "hello@meetroger.ai" };
const success = { type: "success", checkout: { updateBillingAddress: vi.fn(), confirm: vi.fn() } } as never;
/** The submit button's attributes, minus its class (whose `disabled:` variants would match). */
const button = (html: string) => html.match(/<button type="submit"[^>]*>/)![0].replace(/class="[^"]*"/, "");

beforeEach(() => {
  stripe.checkout = { type: "loading" };
  stripe.elementProps.length = 0;
  stripe.providerOptions.length = 0;
});

describe("CardForm", () => {
  it("asks only for the name on card, country and postal code beside Stripe's card fields, with browser autocomplete", () => {
    const html = renderToStaticMarkup(<CardForm {...base} checkout={success} sessionId="cs_1" problem={null} paymentElement={<div data-stripe="payment-element" />} />);
    expect(html).toMatch(/autocomplete="cc-name"[^>]*value="Ana Lee"/i);
    expect(html).toMatch(/<select[^>]*autocomplete="country"/i);
    expect(html).toMatch(/autocomplete="postal-code"/i);
    expect(html).toMatch(/inputmode="text"/i);
    expect(html).toContain('data-stripe="payment-element"');
    const inputs = html.match(/<(input|select)\b/g) ?? [];
    expect(inputs).toHaveLength(3);
    expect(text(html)).toContain("Like A1A 1A1");
  });

  it("Canada and the US only, plus 'Another country' (which only explains)", () => {
    const html = renderToStaticMarkup(<CardForm {...base} checkout={success} sessionId="cs_1" problem={null} />);
    const options = [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    expect(options).toEqual(["CA", "US", "other"]);
    const other = renderToStaticMarkup(<CardForm {...base} fields={{ ...fields, country: "other" }} checkout={success} sessionId="cs_1" problem={null} />);
    expect(other).toMatch(/<input[^>]*autocomplete="postal-code"[^>]*disabled/i);
  });

  it("a US ZIP gets a numeric keypad", () => {
    const html = renderToStaticMarkup(<CardForm {...base} fields={{ ...fields, country: "US" }} checkout={success} sessionId="cs_1" problem={null} />);
    expect(html).toMatch(/inputmode="numeric"/i);
    expect(text(html)).toContain("ZIP code");
  });

  it("'Start free trial' is enabled once Stripe is ready; it is a plain form with no server action", () => {
    const html = renderToStaticMarkup(<CardForm {...base} checkout={success} sessionId="cs_1" problem={null} />);
    expect(button(html)).not.toContain("disabled");
    expect(text(html)).toContain("Start free trial");
    expect(html).toMatch(/<form[^>]*novalidate/i);
    expect(html).not.toMatch(/<form[^>]*action=/);
  });

  it("while Stripe loads, the button is disabled and the form says so", () => {
    const html = renderToStaticMarkup(<CardForm {...base} checkout={{ type: "loading" }} sessionId="cs_1" problem={null} />);
    expect(button(html)).toContain("disabled");
    expect(text(html)).toContain("Loading the secure card form…");
  });

  it("when Stripe fails to load: a message, a retry and the support address; the button stays disabled", () => {
    const html = renderToStaticMarkup(<CardForm {...base} checkout={{ type: "error", error: { message: "" } }} problem="The card form didn’t load." />);
    const t = text(html);
    expect(t).toContain("The card form didn’t load.");
    expect(t).toContain("Try again");
    expect(t).toContain("hello@meetroger.ai");
    expect(button(html)).toContain("disabled");
    expect(html).not.toContain("payment-element");
  });
});

describe("PaymentForm", () => {
  const props = {
    session: { sessionId: "cs_1", clientSecret: "cs_1_secret" },
    currency: "CAD" as const,
    price: basePreview("CAD", 28000, null),
    promo: null,
    name: "Ana Lee",
    addressError: null,
    supportEmail: "hello@meetroger.ai",
  };

  it("mounts Stripe's Checkout Elements on the server's client secret; the Payment Element shows cards only (no wallets, no Link, no billing fields)", () => {
    stripe.checkout = success;
    const html = renderToStaticMarkup(<PaymentForm {...props} publishableKey="pk_test_x" />);
    expect(stripe.providerOptions[0]).toMatchObject({ clientSecret: "cs_1_secret", elementsOptions: { appearance: { variables: { colorPrimary: "#9a5226", borderRadius: "8px" } } } });
    expect(stripe.elementProps[0].options).toEqual({
      layout: "tabs",
      wallets: { applePay: "never", googlePay: "never", link: "never" },
      fields: { billingDetails: { name: "never", email: "never", phone: "never", address: "never" } },
    });
    expect(button(html)).not.toContain("disabled");
    // The country defaults from the account currency.
    expect(html).toMatch(/<option value="CA" selected/);
    expect(text(html)).toContain("Not now");
  });

  it("without a publishable key the card form cannot load: the failure message, and the button disabled", () => {
    const html = renderToStaticMarkup(<PaymentForm {...props} publishableKey={null} />);
    expect(text(html)).toContain("The card form didn’t load.");
    expect(button(html)).toContain("disabled");
    expect(stripe.providerOptions).toHaveLength(0);
  });

  it("shows the return page's address message above the form", () => {
    const html = renderToStaticMarkup(<PaymentForm {...props} publishableKey="pk_test_x" addressError="Stripe couldn’t use that billing address." />);
    expect(html).toMatch(/role="alert"[^>]*>Stripe couldn’t use that billing address\./);
    expect(html.indexOf("Stripe couldn’t use")).toBeLessThan(html.indexOf("Start free trial"));
  });
});
