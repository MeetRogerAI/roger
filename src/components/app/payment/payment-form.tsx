"use client";

import { CheckoutElementsProvider, PaymentElement, useCheckoutElements, type StripeUseCheckoutElementsResult } from "@stripe/react-stripe-js/checkout";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { applyPromo, openSession, quoteTax, removePromo, setPaymentCurrency, type BillingLocationInput, type Priced } from "@/app/start/payment/actions";
import type { MonthlyPreview } from "@/lib/billing/gateway";
import { billingErrors, canQuote, COUNTRIES, OTHER_COUNTRY, TAX_UNAVAILABLE, type PromoView } from "@/lib/billing/payment-view";
import type { Currency } from "@/lib/billing/prices";
import { confirmCard, exclusive, returnPath, type CardCheckout, type ConfirmResult } from "./confirm-card";
import { PriceBox } from "./price-box";
import { PromoField } from "./promo-field";
import { Trust } from "./trust";

/**
 * Step 4, Payment (plan 2026-11-26-001, Unit 6; origin R13–R24): Stripe's
 * embedded card form inside Roger's page, with the Price Box beside it.
 *
 * - Stripe: the Checkout Elements SDK (`CheckoutElementsProvider` from
 *   `@stripe/react-stripe-js/checkout`) on the server-made setup session's
 *   client secret (`ui_mode: 'elements'`). The Payment Element shows the card
 *   fields only: no wallets, no Link, no billing fields of its own.
 * - Roger's own controlled name, country (Canada or the US) and postal code
 *   fields feed the tax line (debounced, server-side) and are pushed to the
 *   session with `updateBillingAddress` before `confirm`.
 * - One change at a time (`exclusive`): while the card is being confirmed, the
 *   currency switched, a promo applied or removed, or a fresh card session
 *   opened, the toggle, the promo controls, Try again and "Start free trial"
 *   are all unavailable. Tax quotes wait too: an in-flight quote is dropped
 *   when a change starts, and the price is asked again after it only if the
 *   location moved meanwhile. A change's answer is always shown.
 * - No server-action `<form>`: React 19 resets such a form after its action,
 *   which would wipe what was typed (docs/solutions/ui-bugs). The server
 *   actions are called from handlers instead.
 */

export type PaymentSession = { sessionId: string; clientSecret: string };

type Fields = { name: string; country: string; postal: string };
type Field = keyof Fields;
type Busy = "confirm" | "currency" | "promo" | "session" | null;

const QUOTE_DELAY_MS = 400;
export const STRIPE_FAILED = "The card form didn’t load. Check your connection, or turn off any blocker for this page, and try again.";
export const FORM_CLOSED = "The card form has closed. Try again to open a fresh one.";
export const FORM_TIMED_OUT = "This form timed out. We’ve opened a fresh one.";
const UNREACHABLE = "We couldn’t reach Roger. Check your connection and try again.";
const CURRENCY_FAILED = "We couldn’t change the currency. Try again.";

/** Roger's look inside Stripe's frame (tokens from globals.css). */
const appearance: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#9a5226",
    colorText: "#1d1d1f",
    colorTextSecondary: "#5d5d63",
    colorDanger: "#b3261e",
    colorBackground: "#ffffff",
    fontFamily: '"Mona Sans", system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSizeBase: "16px",
    borderRadius: "8px",
  },
};
const fonts = [{ cssSrc: "https://fonts.googleapis.com/css2?family=Mona+Sans:wght@400;500;600&display=swap" }];

/** The location key a price was worked out for ("" without a valid location). */
const locationKey = (f: Pick<Fields, "country" | "postal">) => (canQuote(f.country, f.postal) ? `${f.country}|${f.postal.replace(/\s+/g, "").toUpperCase()}` : "");
const locationOf = (f: Fields): BillingLocationInput => (canQuote(f.country, f.postal) ? { country: f.country, postal: f.postal } : {});

export function PaymentForm({
  publishableKey,
  session: initialSession,
  currency: initialCurrency,
  price: initialPrice,
  promo: initialPromo,
  notice: initialNotice = null,
  name,
  addressError,
  supportEmail,
}: {
  publishableKey: string | null;
  session: PaymentSession | null;
  currency: Currency;
  price: MonthlyPreview;
  promo: PromoView | null;
  /** A line for the Price Box from the server (a pending code dropped because it does not apply). */
  notice?: string | null;
  name: string;
  addressError: string | null;
  supportEmail: string;
}) {
  const [session, setSession] = useState(initialSession);
  const [price, setPrice] = useState(initialPrice);
  const [promo, setPromo] = useState(initialPromo);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [fields, setFields] = useState<Fields>({ name, country: initialCurrency === "CAD" ? "CA" : "US", postal: "" });
  const [quoteNonce, setQuoteNonce] = useState(0);
  // One change at a time, held here so a remount of the card form cannot forget it.
  const [lock] = useState(exclusive);

  // Only the newest tax quote is shown; a change (or the location going invalid) drops one in flight.
  const seq = useRef(0);
  const dropQuote = () => void seq.current++;
  // The location the shown price was worked out for, and whether Stripe failed to work out its tax.
  const pricedFor = useRef("");
  const taxRetry = useRef(false);
  const key = locationKey(fields);

  function show(r: Priced, forKey: string) {
    setPrice(r.price);
    if (r.promo !== undefined) setPromo(r.promo);
    setNotice(r.notice ?? null);
    pricedFor.current = forKey;
    taxRetry.current = Boolean(r.taxRetry);
  }

  /** `owned`: asked from inside a change (before a confirm), which holds the lock, so no other answer can race it. */
  async function quote(f: Fields, owned = false) {
    const n = ++seq.current;
    const k = locationKey(f);
    const r = await quoteTax(f.country, f.postal).catch(() => null);
    if (!owned && n !== seq.current) return;
    if (!r) {
      pricedFor.current = k;
      taxRetry.current = true;
      setNotice(TAX_UNAVAILABLE);
      return;
    }
    if (!r.ok) return setNotice(r.message);
    show(r, k);
  }

  // The tax line follows the billing location, once it is valid (debounced; the server caches and limits).
  // It waits while a change is in flight, and is asked again after one only if the location moved meanwhile
  // (or Stripe could not work the tax out last time).
  useEffect(() => {
    if (!key || busy) {
      dropQuote();
      return;
    }
    if (pricedFor.current === key && !taxRetry.current) return;
    const f = fields;
    const t = setTimeout(() => void quote(f), QUOTE_DELAY_MS);
    return () => {
      clearTimeout(t);
      dropQuote();
    };
    // `fields` is read only for the key's location; the name never asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, busy, quoteNonce]);

  // The return page's ?error=address is shown once: the flag leaves the address bar, so a reload does not show it again.
  useEffect(() => {
    if (!addressError) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("error")) return;
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [addressError]);

  function updateFields(next: (prev: Fields) => Fields) {
    setFields(next);
    // Stripe could not work out the tax last time: the next interaction asks once more.
    if (taxRetry.current) setQuoteNonce((n) => n + 1);
  }

  /** Runs one change under the page's lock, with the page showing it as busy. Null: another change holds the lock. */
  function change<R>(kind: Exclude<Busy, null>, fn: () => Promise<R>, keep?: (r: R) => boolean): Promise<R | null> {
    return lock.run(
      kind,
      async () => {
        setBusy(kind);
        let kept = false;
        try {
          const r = await fn();
          kept = Boolean(keep?.(r));
          return r;
        } finally {
          if (!kept) setBusy(null);
        }
      },
      keep,
    );
  }

  /** A fresh card session, with the account's currency and price (always applied). Call inside the lock. */
  async function openFresh(): Promise<boolean> {
    const f = fields;
    const r = await openSession(locationOf(f)).catch(() => null);
    if (!r) {
      setSessionError(UNREACHABLE);
      return false;
    }
    if (!r.ok) {
      setSessionError(r.message);
      return false;
    }
    setSession({ sessionId: r.sessionId, clientSecret: r.clientSecret });
    setSessionError(null);
    show(r, locationKey(f));
    return true;
  }

  async function changeCurrency(c: Currency) {
    await change("currency", async () => {
      const f = fields;
      const k = locationKey(f);
      setFormNotice(null);
      const r = await setPaymentCurrency(c, locationOf(f)).catch(() => null);
      if (r?.ok) {
        setSession({ sessionId: r.sessionId, clientSecret: r.clientSecret });
        setSessionError(null);
        show(r, k);
        return;
      }
      // The server's currency and price, whatever happened: the page never shows a currency the account does not have.
      if (r && "current" in r && r.current) show(r.current, k);
      // The old card session may be closed already: the form waits for a fresh one (Try again).
      setSessionError(r?.message ?? CURRENCY_FAILED);
    });
  }

  async function apply(code: string): Promise<string | null> {
    const r = await change("promo", async () => {
      const f = fields;
      const r = await applyPromo(code, locationOf(f)).catch(() => null);
      if (r?.ok) show(r, locationKey(f));
      return r;
    });
    if (r === null) return "Wait a moment, then try again.";
    return r.ok ? null : r.message;
  }

  async function remove(): Promise<string | null> {
    const r = await change("promo", async () => {
      const f = fields;
      const r = await removePromo(locationOf(f)).catch(() => null);
      if (r?.ok) show(r, locationKey(f));
      return r;
    });
    if (r === null) return "Wait a moment, then try again.";
    if (!r) return "We couldn’t remove the code. Try again.";
    return r.ok ? null : r.message;
  }

  /** Try again: a fresh card session (after a closed or expired one, or a failed open). `timedOut`: say the form was replaced. */
  async function reopen(timedOut: boolean): Promise<void> {
    await change("session", async () => {
      setFormNotice(null);
      if ((await openFresh()) && timedOut) setFormNotice(FORM_TIMED_OUT);
    });
  }

  async function confirm(checkout: CardCheckout, f: Fields, sessionId: string): Promise<ConfirmResult | null> {
    return change(
      "confirm",
      async () => {
        setFormNotice(null);
        // Stripe could not work the tax out last time: once more before the card is confirmed (the total is still shown with the tax to come if it fails).
        if (taxRetry.current && canQuote(f.country, f.postal)) await quote(f, true);
        const r = await confirmCard(checkout, f);
        if (r.ok) {
          window.location.assign(returnPath(sessionId));
          return r;
        }
        if (r.expired && (await openFresh())) setFormNotice(FORM_TIMED_OUT);
        return r;
      },
      (r) => r.ok,
    );
  }

  return (
    <div className="mt-8 md:grid md:grid-cols-[minmax(0,1fr)_17rem] md:items-start md:gap-10">
      <div className="md:sticky md:top-8 md:col-start-2 md:row-start-1">
        <PriceBox
          price={price}
          promo={promo}
          onCurrency={changeCurrency}
          currencyBusy={busy !== null}
          notice={notice}
          promoSlot={<PromoField promo={promo} onApply={apply} onRemove={remove} disabled={busy !== null} />}
        />
      </div>
      <div className="mt-8 md:col-start-1 md:row-start-1 md:mt-0">
        {addressError && (
          <p role="alert" className="mb-6 rounded-[8px] border border-error px-4 py-3 text-small text-error">
            {addressError}
          </p>
        )}
        <StripeCard
          publishableKey={publishableKey}
          session={session}
          sessionError={sessionError}
          onRetrySession={reopen}
          onConfirm={confirm}
          busy={busy}
          notice={formNotice}
          fields={fields}
          setFields={updateFields}
          supportEmail={supportEmail}
        />
        <Trust supportEmail={supportEmail} />
      </div>
    </div>
  );
}

/** Loads Stripe.js (from js.stripe.com) and mounts the Checkout Elements SDK on the session; a failure to load is shown, with a retry. */
function StripeCard(props: {
  publishableKey: string | null;
  session: PaymentSession | null;
  sessionError: string | null;
  onRetrySession: (timedOut: boolean) => Promise<void>;
  onConfirm: (c: CardCheckout, f: Fields, sessionId: string) => Promise<ConfirmResult | null>;
  busy: Busy;
  notice: string | null;
  fields: Fields;
  setFields: (f: (prev: Fields) => Fields) => void;
  supportEmail: string;
}) {
  const { publishableKey, session } = props;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ attempt: number; ok: boolean } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const retryingNow = useRef(false);
  const stripe = useMemo<Promise<Stripe | null>>(
    () => (publishableKey ? loadStripe(publishableKey).catch(() => null) : Promise.resolve(null)),
    // A retry asks again (stripe-js forgets a failed load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publishableKey, attempt],
  );
  useEffect(() => {
    let live = true;
    void stripe.then((s) => live && setLoaded({ attempt, ok: Boolean(s) }));
    return () => {
      live = false;
    };
  }, [stripe, attempt]);
  const stripeFailed = !publishableKey || (loaded?.attempt === attempt && !loaded.ok);

  /**
   * Try again: Stripe.js itself failed → load it again; the session is the
   * problem (none, a failed open, or the provider reports an error, such as
   * an expired session) → a fresh session from the server, whose new client
   * secret remounts the card form. One retry at a time.
   */
  async function retry(checkoutError: boolean) {
    if (retryingNow.current) return;
    retryingNow.current = true;
    setRetrying(true);
    try {
      if (stripeFailed) setAttempt((a) => a + 1);
      if (!session || props.sessionError || checkoutError || !stripeFailed) await props.onRetrySession(checkoutError && !props.sessionError);
    } finally {
      retryingNow.current = false;
      setRetrying(false);
    }
  }

  const common = {
    fields: props.fields,
    setFields: props.setFields,
    supportEmail: props.supportEmail,
    onRetry: retry,
    retrying,
    busy: props.busy !== null,
    pending: props.busy === "confirm",
    notice: props.notice,
    onConfirm: props.onConfirm,
  };
  if (stripeFailed || !session) {
    return <CardForm {...common} checkout={{ type: "error", error: { message: "" } }} problem={stripeFailed ? STRIPE_FAILED : (props.sessionError ?? FORM_CLOSED)} />;
  }
  return (
    <CheckoutElementsProvider
      key={`${session.clientSecret}:${attempt}`}
      stripe={stripe}
      options={{ clientSecret: session.clientSecret, elementsOptions: { appearance, fonts } }}
    >
      <WithCheckout>
        {(checkout) => (
          <CardForm
            {...common}
            sessionId={session.sessionId}
            checkout={checkout}
            problem={props.sessionError ?? (checkout.type === "error" ? FORM_CLOSED : null)}
            paymentElement={<CardElement onLoadError={() => setLoaded({ attempt, ok: false })} />}
          />
        )}
      </WithCheckout>
    </CheckoutElementsProvider>
  );
}

function WithCheckout({ children }: { children: (c: StripeUseCheckoutElementsResult) => ReactNode }) {
  return <>{children(useCheckoutElements())}</>;
}

/** The Payment Element: cards only (the session allows nothing else), no wallets or Link, and no billing fields (Roger's own are above). */
function CardElement({ onLoadError }: { onLoadError: () => void }) {
  return (
    <PaymentElement
      onLoadError={onLoadError}
      options={{
        layout: "tabs",
        wallets: { applePay: "never", googlePay: "never", link: "never" },
        // Only name and address are Roger's own fields (sent with updateBillingAddress). Endive refuses a
        // Payment Element with every billing field set to "never" unless the session also collects them,
        // so email and phone stay on Stripe's default (the customer's email; no phone collection).
        fields: { billingDetails: { name: "never", address: "never" } },
      }}
    />
  );
}

/**
 * The card form: Roger's name, country and postal code, the Payment Element,
 * any error from Stripe, and "Start free trial". Exported for tests (Stripe
 * mocked); the page renders it through `StripeCard`, which passes the page's
 * busy state and its one-at-a-time confirm.
 */
export function CardForm({
  checkout,
  sessionId,
  fields,
  setFields,
  problem,
  onRetry,
  retrying = false,
  busy = false,
  pending = false,
  notice = null,
  onConfirm,
  supportEmail,
  paymentElement,
}: {
  checkout: StripeUseCheckoutElementsResult;
  sessionId?: string;
  fields: Fields;
  setFields: (f: (prev: Fields) => Fields) => void;
  problem: string | null;
  /** `checkoutError`: Stripe's provider reported an error (the session needs replacing). */
  onRetry: (checkoutError: boolean) => void;
  retrying?: boolean;
  /** Another change is in flight (or this confirm): "Start free trial" waits. */
  busy?: boolean;
  /** The card is with Stripe. */
  pending?: boolean;
  /** A line above the card fields (a timed-out form was replaced). */
  notice?: string | null;
  onConfirm: (c: CardCheckout, f: Fields, sessionId: string) => Promise<ConfirmResult | null>;
  supportEmail: string;
  paymentElement?: ReactNode;
}) {
  const id = useId();
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [stripeError, setStripeError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const countryRef = useRef<HTMLSelectElement>(null);
  const postalRef = useRef<HTMLInputElement>(null);
  const focusField = (f: Field) => (f === "name" ? nameRef : f === "country" ? countryRef : postalRef).current?.focus();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const all = billingErrors(fields);
  const shown = (f: Field) => (touched[f] ? all[f] : undefined);
  const ready = checkout.type === "success" && !problem && Boolean(sessionId);
  const unavailable = !ready || busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errors = billingErrors(fields);
    const first = (["name", "country", "postal"] as const).find((f) => errors[f]);
    if (first) {
      setTouched({ name: true, country: true, postal: true });
      focusField(first);
      return;
    }
    // The button stays focusable while it cannot be used (aria-disabled): a press then does nothing.
    if (checkout.type !== "success" || !ready || !sessionId) return;
    setStripeError(null);
    const r = await onConfirm(checkout.checkout, fields, sessionId);
    // Null: another change holds the page. ok: the page is leaving. expired: the page opened a fresh form and says so.
    if (!r || r.ok || r.expired) return;
    setStripeError(r.message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  const set = (f: Field) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setFields((p) => ({ ...p, [f]: v }));
  };
  const blur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));
  const describedBy = (f: Field, extra?: string) => [shown(f) ? `${id}-${f}-error` : null, extra].filter(Boolean).join(" ") || undefined;
  const countryError = shown("country");
  const postalHint = fields.country === "CA" ? "Like A1A 1A1" : fields.country === "US" ? "5 digits" : null;

  return (
    <form onSubmit={submit} noValidate aria-busy={pending || undefined} className="space-y-5">
      <div>
        <label htmlFor={`${id}-name`} className="block text-small font-medium">
          Name on card
        </label>
        <input
          ref={nameRef}
          id={`${id}-name`}
          type="text"
          autoComplete="cc-name"
          value={fields.name}
          onChange={set("name")}
          onBlur={blur("name")}
          aria-invalid={shown("name") ? true : undefined}
          aria-describedby={describedBy("name")}
          className="mt-2 min-h-11 w-full rounded-[8px] border border-rule-strong bg-surface px-3 aria-[invalid=true]:border-error"
        />
        <FieldError id={`${id}-name-error`} message={shown("name")} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-country`} className="block text-small font-medium">
            Country
          </label>
          <select
            ref={countryRef}
            id={`${id}-country`}
            autoComplete="country"
            value={fields.country}
            onChange={(e) => {
              set("country")(e);
              // Another country is explained at once; nothing else to fill in.
              if (e.target.value === OTHER_COUNTRY) setTouched((t) => ({ ...t, country: true }));
            }}
            onBlur={blur("country")}
            aria-invalid={countryError ? true : undefined}
            aria-describedby={describedBy("country")}
            className="mt-2 min-h-11 w-full rounded-[8px] border border-rule-strong bg-surface px-3 aria-[invalid=true]:border-error"
          >
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {countryError && (
            <p id={`${id}-country-error`} role="alert" className="mt-2 text-small text-error">
              {countryError}{" "}
              {fields.country === OTHER_COUNTRY && (
                <>
                  Write to us at{" "}
                  <a className="tlink" href={`mailto:${supportEmail}`}>
                    {supportEmail}
                  </a>
                  .
                </>
              )}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-postal`} className="block text-small font-medium">
            {fields.country === "US" ? "ZIP code" : "Postal code"}
          </label>
          <input
            ref={postalRef}
            id={`${id}-postal`}
            type="text"
            autoComplete="postal-code"
            inputMode={fields.country === "US" ? "numeric" : "text"}
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={fields.country === "US" ? 5 : 7}
            value={fields.postal}
            disabled={fields.country === OTHER_COUNTRY}
            onChange={set("postal")}
            onBlur={blur("postal")}
            aria-invalid={shown("postal") ? true : undefined}
            aria-describedby={describedBy("postal", postalHint ? `${id}-postal-hint` : undefined)}
            className="mt-2 min-h-11 w-full rounded-[8px] border border-rule-strong bg-surface px-3 uppercase aria-[invalid=true]:border-error disabled:bg-ground-2"
          />
          {postalHint && !shown("postal") && (
            <p id={`${id}-postal-hint`} className="mt-1 text-meta text-ink-2">
              {postalHint}
            </p>
          )}
          <FieldError id={`${id}-postal-error`} message={shown("postal")} />
        </div>
      </div>

      <div>
        <p className="text-small font-medium">Card</p>
        {notice && !problem && (
          <p role="status" className="mt-2 text-small text-ink-2">
            {notice}
          </p>
        )}
        <div className="mt-2 min-h-[9rem]">
          {problem ? (
            <div role="alert" className="rounded-[8px] border border-rule-strong bg-ground-2 px-4 py-4 text-small">
              <p>{problem}</p>
              <p className="mt-2 text-ink-2">
                Still stuck? Write to us at{" "}
                <a className="tlink" href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>
                .
              </p>
              <button
                type="button"
                onClick={() => onRetry(checkout.type === "error" && Boolean(sessionId))}
                disabled={retrying || busy}
                aria-busy={retrying || undefined}
                className="btn btn-m btn-ink mt-4 cursor-pointer disabled:cursor-wait"
              >
                {retrying ? "Trying again…" : "Try again"}
              </button>
            </div>
          ) : checkout.type === "loading" ? (
            <p className="text-small text-ink-2" role="status">
              Loading the secure card form…
            </p>
          ) : null}
          {!problem && paymentElement}
        </div>
      </div>

      {stripeError && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-[8px] border border-error px-4 py-3 text-small text-error">
          {stripeError}
        </p>
      )}

      <button
        type="submit"
        aria-disabled={unavailable || undefined}
        aria-busy={pending || undefined}
        className="btn btn-l w-full cursor-pointer aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      >
        {pending && <Spinner />}
        Start free trial
      </button>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-small text-error">
      {message}
    </p>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" className="size-4 animate-spin" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
