import type { Metadata } from "next";
import { SignupSteps } from "@/components/app/signup-steps";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PaymentForm } from "@/components/app/payment/payment-form";
import { siteConfig } from "@/data/config";
import { requireUser } from "@/lib/auth/access";
import { ADDRESS_ERROR_FLAG, ADDRESS_MESSAGE } from "@/lib/billing/card-saved";
import { CHECKOUT_LIMITED, finishCardSave, openEmbeddedSetup } from "@/lib/billing/card-setup";
import { stripeCredits, stripeGateway } from "@/lib/billing/gateway";
import { finishedSavePath, paymentAccount, paymentCredit, paymentReturnUrl, pendingPromoView, planCents } from "@/lib/billing/payment-page";
import { basePreview } from "@/lib/billing/payment-view";
import { query } from "@/lib/db-query";
import { clientIp } from "@/lib/rate-limit";
import { readV3Settings } from "@/lib/v3-settings";

export const metadata: Metadata = { title: "Payment" };

/**
 * Step 4, Payment (plan 2026-11-26-001, Unit 6; origin R13–R24): the
 * embedded card form for a trial whose first list is held. Anyone else goes
 * to /app (or to sign-in). The open card session is created or reused here
 * (`openEmbeddedSetup`); if the stored one already holds a confirmed card,
 * the card save is finished instead and the member is sent on
 * (`finishedSavePath`, shared with the actions: never back here).
 */
async function Payment({ searchParams }: { searchParams: PageProps<"/start/payment">["searchParams"] }) {
  const { error } = await searchParams;
  // The session, Stripe and the clock are read at request time only.
  await connection();
  const session = await requireUser("/start/payment");
  const account = await paymentAccount(query, session.userId);
  if (!account) redirect("/app");
  const gw = stripeGateway();
  if (!gw) return <Problem message="Card payments aren’t switched on yet. Try again soon." />;

  const r = await openEmbeddedSetup(query, gw, { userId: account.userId, ip: clientIp(await headers()), returnUrl: paymentReturnUrl() });
  if (!r.ok) {
    if (r.reason === "complete") {
      const done = await finishCardSave(query, gw, r.sessionId, { expectUserId: account.userId, getSettings: readV3Settings, credits: stripeCredits() ?? undefined });
      redirect(finishedSavePath(r.sessionId, done));
    }
    if (r.reason === "not_allowed" || r.reason === "not_found") redirect("/app");
    return <Problem message={r.reason === "rate_limited" ? CHECKOUT_LIMITED : "We couldn’t open the card form. Reload the page in a moment."} />;
  }

  // A pending code that does not apply in the account's currency is dropped here, and the page says so.
  const pending = await pendingPromoView(query, gw, { ...account, currency: r.currency });
  // Referral credit already on the balance (B2 plan Unit 5): plain cents and currency for the browser.
  const credit = await paymentCredit(query, account.userId, new Date());
  return (
    <PaymentForm
      publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null}
      session={{ sessionId: r.sessionId, clientSecret: r.clientSecret }}
      currency={r.currency}
      price={basePreview(r.currency, await planCents(r.currency), pending.promo)}
      promo={pending.promo}
      notice={pending.notice ?? null}
      name={account.name}
      addressError={error === ADDRESS_ERROR_FLAG ? ADDRESS_MESSAGE : null}
      supportEmail={siteConfig.contactEmail}
      credit={credit}
    />
  );
}

function Problem({ message }: { message: string }) {
  return (
    <div className="mt-8">
      <p role="alert" className="text-lead">
        {message}
      </p>
      <p className="mt-4 text-small text-ink-2">
        If this keeps happening, write to us at{" "}
        <a className="tlink" href={`mailto:${siteConfig.contactEmail}`}>
          {siteConfig.contactEmail}
        </a>
        .
      </p>
    </div>
  );
}

export default function PaymentPage({ searchParams }: PageProps<"/start/payment">) {
  return (
    <>
      <SignupSteps current={4} back={{ href: "/app", label: "Back to your first list" }} />
      <h1 className="text-h2">Payment</h1>
      <Suspense fallback={<p className="mt-8 text-ink-2">Loading…</p>}>
        <Payment searchParams={searchParams} />
      </Suspense>
    </>
  );
}
