// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonthlyPreview } from "@/lib/billing/gateway";
import { basePreview, TAX_UNAVAILABLE, type PromoView } from "@/lib/billing/payment-view";

/**
 * Plan 2026-11-26-001, Unit 6 review fixes: the Payment form in a DOM
 * (happy-dom, this file only), with the server actions and Stripe's SDK
 * mocked. Covers the interaction rules: validation and focus, one change at a
 * time, the currency switch's authoritative answer, out-of-order answers,
 * Try again with a fresh session, the summary bar, and promo focus.
 */

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const actions = vi.hoisted(() => ({
  applyPromo: vi.fn(),
  removePromo: vi.fn(),
  quoteTax: vi.fn(),
  setPaymentCurrency: vi.fn(),
  openSession: vi.fn(),
}));
const stripe = vi.hoisted(() => ({
  checkout: { type: "loading" } as Record<string, unknown>,
  providerSecrets: [] as string[],
  loadStripe: vi.fn(),
}));
vi.mock("@/app/start/payment/actions", () => actions);
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: (...a: unknown[]) => stripe.loadStripe(...a) }));
vi.mock("@stripe/react-stripe-js/checkout", () => ({
  CheckoutElementsProvider: ({ children, options }: { children: React.ReactNode; options: { clientSecret: string } }) => {
    stripe.providerSecrets.push(options.clientSecret);
    return children;
  },
  useCheckoutElements: () => stripe.checkout,
  PaymentElement: () => <div data-stripe="payment-element" />,
}));

const { PaymentForm, FORM_CLOSED, FORM_TIMED_OUT, STRIPE_FAILED } = await import("./payment-form");

const CAD = basePreview("CAD", 28000, null);
const USD = basePreview("USD", 20000, null);
const quoted = (currency: "CAD" | "USD", subtotal: number, tax: number): MonthlyPreview => ({
  currency,
  subtotalCents: subtotal,
  discountCents: 0,
  tax: "calculated",
  taxCents: tax,
  taxName: tax ? "HST" : null,
  taxRate: tax ? 13 : null,
  totalCents: subtotal + tax,
});
const SAVE20: PromoView = { code: "SAVE20", label: "Launch 20%", duration: "once", durationInMonths: null, percentOff: 20, amountOffCents: null };

function success() {
  const confirm = vi.fn(async () => ({ type: "success" as const }));
  const updateBillingAddress = vi.fn(async () => ({ type: "success" as const }));
  stripe.checkout = { type: "success", checkout: { confirm, updateBillingAddress, status: { type: "open" } } };
  return { confirm, updateBillingAddress };
}

const props = {
  publishableKey: "pk_test_x",
  session: { sessionId: "cs_1", clientSecret: "cs_1_secret" },
  currency: "CAD" as const,
  price: CAD,
  promo: null as PromoView | null,
  name: "Ana Lee",
  addressError: null as string | null,
  supportEmail: "hello@meetroger.ai",
};

const text = () => document.body.textContent ?? "";
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const submitButton = () => button("Start free trial");
const postal = () => screen.getByLabelText("Postal code") as HTMLInputElement;
const pressed = () => screen.getAllByRole("button").find((b) => b.getAttribute("aria-pressed") === "true")?.textContent;

async function renderForm(p: Partial<typeof props> & { notice?: string | null } = {}) {
  const r = render(<PaymentForm {...props} {...p} />);
  // Stripe.js "loads" (the mock resolves), then the card form is ready.
  await act(async () => {});
  return r;
}

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
  actions.quoteTax.mockResolvedValue({ ok: true, price: quoted("CAD", 28000, 3640) });
  stripe.loadStripe.mockReset();
  stripe.loadStripe.mockResolvedValue({});
  stripe.providerSecrets.length = 0;
  stripe.checkout = { type: "loading" };
});
afterEach(() => cleanup());

describe("the billing fields", () => {
  it("shows an error on blur, tied to the field with aria-describedby", async () => {
    success();
    await renderForm();
    const name = screen.getByLabelText("Name on card") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "  " } });
    fireEvent.blur(name);
    const error = screen.getByText("Enter the name on your card.");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
  });

  it("a failed submit marks every field, focuses the first invalid one, and calls neither confirm nor the tax quote", async () => {
    const { confirm } = success();
    await renderForm();
    fireEvent.click(submitButton());
    await act(async () => {});
    expect(document.activeElement).toBe(postal());
    expect(text()).toContain("Enter your postal code.");
    expect(confirm).not.toHaveBeenCalled();
    expect(actions.quoteTax).not.toHaveBeenCalled();
  });
});

describe("Start free trial", () => {
  it("a valid submit confirms once; a double click still confirms once", async () => {
    const { confirm } = success();
    const d = deferred<{ type: "error"; error: { message: string } }>();
    confirm.mockReturnValueOnce(d.promise as never);
    await renderForm();
    fireEvent.change(postal(), { target: { value: "M5V 2T6" } });
    fireEvent.click(submitButton());
    fireEvent.click(submitButton());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(submitButton().getAttribute("aria-disabled")).toBe("true");
    expect(submitButton().getAttribute("aria-busy")).toBe("true");
    await act(async () => d.resolve({ type: "error", error: { message: "Your card was declined." } }));
    expect(screen.getByText("Your card was declined.")).toBeTruthy();
    // Usable again after a decline, and focusable throughout (no native disabled).
    expect(submitButton().hasAttribute("disabled")).toBe(false);
    expect(submitButton().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(submitButton());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
  });

  it("while the card is with Stripe, the currency toggle and promo controls wait", async () => {
    const { confirm } = success();
    confirm.mockReturnValueOnce(new Promise(() => {}) as never);
    await renderForm();
    fireEvent.change(postal(), { target: { value: "M5V 2T6" } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect((button("USD") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button("USD"));
    expect(actions.setPaymentCurrency).not.toHaveBeenCalled();
    fireEvent.click(button("Have a promo code?"));
    expect((button("Apply") as HTMLButtonElement).disabled).toBe(true);
  });

  it("an expired session on confirm opens a fresh one and says so", async () => {
    const { confirm } = success();
    confirm.mockResolvedValueOnce({ type: "error", error: { message: "This Checkout Session has expired." } } as never);
    actions.openSession.mockResolvedValue({ ok: true, sessionId: "cs_2", clientSecret: "cs_2_secret", currency: "CAD", price: CAD });
    await renderForm();
    fireEvent.change(postal(), { target: { value: "M5V 2T6" } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(actions.openSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(stripe.providerSecrets.at(-1)).toBe("cs_2_secret"));
    expect(text()).toContain(FORM_TIMED_OUT);
    expect(text()).not.toContain("This Checkout Session has expired.");
  });

  it("when Stripe could not work out the tax, the quote is asked once more before the card is confirmed", async () => {
    const { confirm } = success();
    actions.quoteTax.mockResolvedValueOnce({ ok: true, price: CAD, notice: TAX_UNAVAILABLE, taxRetry: true });
    await renderForm();
    fireEvent.change(postal(), { target: { value: "M5V 2T6" } });
    await waitFor(() => expect(text()).toContain(TAX_UNAVAILABLE));
    expect(actions.quoteTax).toHaveBeenCalledTimes(1);
    confirm.mockResolvedValueOnce({ type: "error", error: { message: "Declined." } } as never);
    fireEvent.click(submitButton());
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(actions.quoteTax).toHaveBeenCalledTimes(2);
    expect(actions.quoteTax.mock.invocationCallOrder[1]).toBeLessThan(confirm.mock.invocationCallOrder[0]);
    expect(text()).toContain("HST");
  });
});

describe("the currency switch", () => {
  it("when the new session cannot be opened, shows the server's currency and price, with Try again", async () => {
    success();
    actions.setPaymentCurrency.mockResolvedValue({ ok: false, message: "We couldn’t open the card form. Try again in a moment.", current: { ok: true, currency: "USD", price: USD } });
    await renderForm();
    fireEvent.click(button("USD"));
    await waitFor(() => expect(pressed()).toBe("USD"));
    expect(text()).toContain("US$200");
    expect(text()).not.toContain("CA$280");
    expect(text()).toContain("We couldn’t open the card form. Try again in a moment.");
    expect(button("Try again")).toBeTruthy();
  });

  it("a quote and a currency change answered in either order end on the currency change's price", async () => {
    for (const order of ["currency first", "quote first"] as const) {
      cleanup();
      actions.quoteTax.mockReset();
      actions.setPaymentCurrency.mockReset();
      success();
      const q = deferred<unknown>();
      const c = deferred<unknown>();
      actions.quoteTax.mockReturnValueOnce(q.promise);
      actions.setPaymentCurrency.mockReturnValueOnce(c.promise);
      await renderForm();
      fireEvent.change(postal(), { target: { value: "M5V 2T6" } });
      await waitFor(() => expect(actions.quoteTax).toHaveBeenCalledTimes(1));
      fireEvent.click(button("USD"));
      expect(actions.setPaymentCurrency).toHaveBeenCalledWith("USD", { country: "CA", postal: "M5V 2T6" });
      const answers = [
        () => c.resolve({ ok: true, sessionId: "cs_2", clientSecret: "cs_2_secret", currency: "USD", price: quoted("USD", 20000, 2600) }),
        () => q.resolve({ ok: true, price: quoted("CAD", 28000, 3640) }),
      ];
      if (order === "quote first") answers.reverse();
      for (const a of answers) await act(async () => a());
      await act(async () => new Promise((r) => setTimeout(r, 450)));
      expect(pressed(), order).toBe("USD");
      expect(text(), order).toContain("US$226");
      expect(text(), order).not.toContain("CA$316.40");
      // The change priced this location already: no second quote after it.
      expect(actions.quoteTax, order).toHaveBeenCalledTimes(1);
      expect(stripe.providerSecrets.at(-1)).toBe("cs_2_secret");
    }
  });

  it("drops a pending code that does not apply in the new currency, and says so (no location needed)", async () => {
    success();
    actions.setPaymentCurrency.mockResolvedValue({
      ok: true,
      sessionId: "cs_2",
      clientSecret: "cs_2_secret",
      currency: "USD",
      price: USD,
      promo: null,
      notice: "That code no longer applies, so the price is the regular one.",
    });
    await renderForm({ promo: SAVE20, price: basePreview("CAD", 28000, SAVE20) });
    expect(text()).toContain("Code SAVE20 applied");
    fireEvent.click(button("USD"));
    await waitFor(() => expect(text()).toContain("That code no longer applies"));
    expect(text()).not.toContain("Code SAVE20 applied");
    expect(button("Have a promo code?")).toBeTruthy();
  });

  it("the page-load notice for a dropped code is shown", async () => {
    success();
    await renderForm({ notice: "That code no longer applies, so the price is the regular one." });
    expect(text()).toContain("That code no longer applies");
  });
});

describe("the tax quote", () => {
  it("an answer for a location that has since become invalid is ignored", async () => {
    success();
    const q = deferred<unknown>();
    actions.quoteTax.mockReturnValueOnce(q.promise);
    await renderForm();
    fireEvent.change(postal(), { target: { value: "M5V 2T6" } });
    await waitFor(() => expect(actions.quoteTax).toHaveBeenCalledTimes(1));
    fireEvent.change(postal(), { target: { value: "M5V" } });
    await act(async () => q.resolve({ ok: true, price: quoted("CAD", 28000, 3640) }));
    expect(text()).not.toContain("CA$316.40");
    expect(text()).toContain("Calculated from your billing address");
  });
});

describe("Try again", () => {
  it("after the provider reports an error: a fresh session from the server, its client secret used, and the timed-out line", async () => {
    stripe.checkout = { type: "error", error: { message: "This Checkout Session is no longer active." } };
    const d = deferred<unknown>();
    actions.openSession.mockReturnValueOnce(d.promise);
    await renderForm();
    expect(text()).toContain(FORM_CLOSED);
    fireEvent.click(button("Try again"));
    fireEvent.click(button(/Try/));
    expect(actions.openSession).toHaveBeenCalledTimes(1);
    expect((button(/Try/) as HTMLButtonElement).disabled).toBe(true);
    success();
    await act(async () => d.resolve({ ok: true, sessionId: "cs_2", clientSecret: "cs_2_secret", currency: "CAD", price: CAD }));
    expect(stripe.providerSecrets.at(-1)).toBe("cs_2_secret");
    expect(text()).toContain(FORM_TIMED_OUT);
    expect(text()).not.toContain(FORM_CLOSED);
    expect(stripe.loadStripe).toHaveBeenCalledTimes(1);
  });

  it("after Stripe.js failed to load: loads it again, without a new session", async () => {
    stripe.loadStripe.mockResolvedValueOnce(null);
    success();
    await renderForm();
    expect(text()).toContain(STRIPE_FAILED);
    fireEvent.click(button("Try again"));
    await act(async () => {});
    expect(stripe.loadStripe).toHaveBeenCalledTimes(2);
    expect(actions.openSession).not.toHaveBeenCalled();
    expect(text()).not.toContain(STRIPE_FAILED);
  });
});

describe("the Price Box and promo", () => {
  it("the mobile summary bar opens and closes the details (aria-expanded)", async () => {
    success();
    await renderForm();
    const bar = screen.getByRole("button", { name: /\/ month/ });
    expect(bar.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(bar);
    expect(bar.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(bar.getAttribute("aria-controls")!)?.className).toMatch(/\bblock\b/);
    fireEvent.click(bar);
    expect(bar.getAttribute("aria-expanded")).toBe("false");
  });

  it("focus moves to Remove after Apply, back to 'Have a promo code?' after Remove; a failed Remove says so", async () => {
    success();
    actions.applyPromo.mockResolvedValue({ ok: true, price: basePreview("CAD", 28000, SAVE20), promo: SAVE20 });
    actions.removePromo.mockResolvedValueOnce({ ok: false, message: "Too many tries. Wait a while and try again." });
    actions.removePromo.mockResolvedValueOnce({ ok: true, price: CAD, promo: null });
    await renderForm();
    fireEvent.click(button("Have a promo code?"));
    fireEvent.change(screen.getByLabelText("Promo code"), { target: { value: "save20" } });
    fireEvent.click(button("Apply"));
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Remove"));
    expect(text()).toContain("Code SAVE20 applied");

    fireEvent.click(button("Remove"));
    await waitFor(() => expect(text()).toContain("Too many tries. Wait a while and try again."));
    expect(document.activeElement?.textContent).toBe("Remove");

    fireEvent.click(button("Remove"));
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Have a promo code?"));
  });
});

describe("the address message", () => {
  it("is shown, and the flag leaves the address bar so a reload does not show it again", async () => {
    success();
    window.history.replaceState(null, "", "/start/payment?error=address&x=1");
    await renderForm({ addressError: "Stripe couldn’t use that billing address." });
    expect(text()).toContain("Stripe couldn’t use that billing address.");
    expect(window.location.pathname + window.location.search).toBe("/start/payment?x=1");
  });
});
