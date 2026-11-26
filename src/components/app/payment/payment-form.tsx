"use client";

import { CheckoutElementsProvider, PaymentElement, useCheckoutElements, type StripeUseCheckoutElementsResult } from "@stripe/react-stripe-js/checkout";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { applyPromo, openSession, quoteTax, removePromo, setPaymentCurrency, type Priced } from "@/app/start/payment/actions";
import type { MonthlyPreview } from "@/lib/billing/gateway";
import { billingErrors, canQuote, COUNTRIES, OTHER_COUNTRY, type PromoView } from "@/lib/billing/payment-view";
import type { Currency } from "@/lib/billing/prices";
import { confirmCard, oneAtATime, returnPath } from "./confirm-card";
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
 * - No server-action `<form>`: React 19 resets such a form after its action,
 *   which would wipe what was typed (docs/solutions/ui-bugs). The server
 *   actions are called from handlers instead.
 */

export type PaymentSession = { sessionId: string; clientSecret: string };

type Fields = { name: string; country: string; postal: string };
type Field = keyof Fields;

const QUOTE_DELAY_MS = 400;
const STRIPE_FAILED = "The card form didn’t load. Check your connection, or turn off any blocker for this page, and try again.";

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

export function PaymentForm({
  publishableKey,
  session: initialSession,
  currency: initialCurrency,
  price: initialPrice,
  promo: initialPromo,
  name,
  addressError,
  supportEmail,
}: {
  publishableKey: string | null;
  session: PaymentSession | null;
  currency: Currency;
  price: MonthlyPreview;
  promo: PromoView | null;
  name: string;
  addressError: string | null;
  supportEmail: string;
}) {
  const [session, setSession] = useState(initialSession);
  const [price, setPrice] = useState(initialPrice);
  const [promo, setPromo] = useState(initialPromo);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const [fields, setFields] = useState<Fields>({ name, country: initialCurrency === "CAD" ? "CA" : "US", postal: "" });

  // Only the newest price answer is shown (typing, the toggle and the promo all ask).
  const seq = useRef(0);
  const location = { country: fields.country, postal: fields.postal };
  const quotable = canQuote(fields.country, fields.postal);

  function show(r: Priced) {
    setPrice(r.price);
    if (r.promo !== undefined) setPromo(r.promo);
    setNotice(r.notice ?? null);
  }

  // The tax line follows the billing location, once it is valid (debounced; the server caches and limits).
  useEffect(() => {
    if (!quotable) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = await quoteTax(fields.country, fields.postal).catch(() => null);
      if (n !== seq.current || !r) return;
      if (!r.ok) return setNotice(r.message);
      setPrice(r.price);
      if (r.promo !== undefined) setPromo(r.promo);
      setNotice(r.notice ?? null);
    }, QUOTE_DELAY_MS);
    return () => clearTimeout(t);
  }, [fields.country, fields.postal, quotable]);

  async function changeCurrency(c: Currency) {
    if (currencyBusy) return;
    setCurrencyBusy(true);
    const n = ++seq.current;
    const r = await setPaymentCurrency(c, quotable ? location : {}).catch(() => null);
    setCurrencyBusy(false);
    if (!r) return setNotice("We couldn’t change the currency. Try again.");
    if (!r.ok) {
      // The old session may be closed already: the form waits for a new one (Retry).
      setSessionError(r.message);
      return;
    }
    setSession({ sessionId: r.sessionId, clientSecret: r.clientSecret });
    setSessionError(null);
    if (n === seq.current) show(r);
  }

  async function apply(code: string): Promise<string | null> {
    const n = ++seq.current;
    const r = await applyPromo(code, quotable ? location : {});
    if (!r.ok) return r.message;
    if (n === seq.current) show(r);
    else if (r.promo !== undefined) setPromo(r.promo);
    return null;
  }

  async function remove() {
    const n = ++seq.current;
    const r = await removePromo(quotable ? location : {});
    if (!r.ok) return setNotice(r.message);
    if (n === seq.current) show(r);
    else setPromo(null);
  }

  async function reopen() {
    const r = await openSession().catch(() => null);
    if (!r) return setSessionError("We couldn’t reach Roger. Check your connection and try again.");
    if (!r.ok) return setSessionError(r.message);
    setSession({ sessionId: r.sessionId, clientSecret: r.clientSecret });
    setSessionError(null);
  }

  return (
    <div className="mt-8 md:grid md:grid-cols-[minmax(0,1fr)_17rem] md:items-start md:gap-10">
      <div className="md:sticky md:top-8 md:col-start-2 md:row-start-1">
        <PriceBox
          price={price}
          promo={promo}
          onCurrency={changeCurrency}
          currencyBusy={currencyBusy}
          notice={notice}
          promoSlot={<PromoField promo={promo} onApply={apply} onRemove={remove} />}
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
          fields={fields}
          setFields={setFields}
          supportEmail={supportEmail}
        />
        <Trust supportEmail={supportEmail} />
        <p className="mt-8">
          <Link href="/app" className="tlink-quiet text-small">
            Not now
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Loads Stripe.js (from js.stripe.com) and mounts the Checkout Elements SDK on the session; a failure to load is shown, with a retry. */
function StripeCard(props: {
  publishableKey: string | null;
  session: PaymentSession | null;
  sessionError: string | null;
  onRetrySession: () => Promise<void>;
  fields: Fields;
  setFields: (f: (prev: Fields) => Fields) => void;
  supportEmail: string;
}) {
  const { publishableKey, session } = props;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ attempt: number; ok: boolean } | null>(null);
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
  const failed = !publishableKey || (loaded?.attempt === attempt && !loaded.ok);

  async function retry() {
    setAttempt((a) => a + 1);
    if (props.sessionError || !session) await props.onRetrySession();
  }

  const common = { fields: props.fields, setFields: props.setFields, supportEmail: props.supportEmail, onRetry: retry };
  if (failed || !session) {
    return <CardForm {...common} checkout={{ type: "error", error: { message: "" } }} problem={failed ? STRIPE_FAILED : (props.sessionError ?? STRIPE_FAILED)} />;
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
            problem={props.sessionError ?? (checkout.type === "error" ? STRIPE_FAILED : null)}
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
        fields: { billingDetails: { name: "never", email: "never", phone: "never", address: "never" } },
      }}
    />
  );
}

/**
 * The card form: Roger's name, country and postal code, the Payment Element,
 * any error from Stripe, and "Start free trial". Exported for tests (Stripe
 * mocked); the page renders it through `StripeCard`.
 */
export function CardForm({
  checkout,
  sessionId,
  fields,
  setFields,
  problem,
  onRetry,
  supportEmail,
  paymentElement,
}: {
  checkout: StripeUseCheckoutElementsResult;
  sessionId?: string;
  fields: Fields;
  setFields: (f: (prev: Fields) => Fields) => void;
  problem: string | null;
  onRetry: () => void;
  supportEmail: string;
  paymentElement?: ReactNode;
}) {
  const id = useId();
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [pending, setPending] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const countryRef = useRef<HTMLSelectElement>(null);
  const postalRef = useRef<HTMLInputElement>(null);
  const focusField = (f: Field) => (f === "name" ? nameRef : f === "country" ? countryRef : postalRef).current?.focus();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const all = billingErrors(fields);
  const shown = (f: Field) => (touched[f] ? all[f] : undefined);
  const ready = checkout.type === "success" && !problem && Boolean(sessionId);

  // One confirm at a time, whatever the clicks: the flag is set before any await.
  const submitOnce = useRef(
    oneAtATime(async (c: Parameters<typeof confirmCard>[0], f: Fields) => confirmCard(c, f)),
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errors = billingErrors(fields);
    const first = (["name", "country", "postal"] as const).find((f) => errors[f]);
    if (first) {
      setTouched({ name: true, country: true, postal: true });
      focusField(first);
      return;
    }
    if (checkout.type !== "success" || !ready || !sessionId) return;
    setPending(true);
    setStripeError(null);
    const r = await submitOnce.current(checkout.checkout, fields);
    if (r === null) return; // a second press while the first is with Stripe
    if (r.ok) {
      window.location.assign(returnPath(sessionId));
      return;
    }
    setPending(false);
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
              <button type="button" onClick={onRetry} className="btn btn-m btn-ink mt-4 cursor-pointer">
                Try again
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
        disabled={!ready || pending}
        aria-disabled={!ready || undefined}
        aria-busy={pending || undefined}
        className="btn btn-l w-full cursor-pointer disabled:cursor-not-allowed"
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
