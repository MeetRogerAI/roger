import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PaymentForm } from "@/components/app/payment/payment-form";
import { siteConfig } from "@/data/config";
import { requireUser } from "@/lib/auth/access";
import { ADDRESS_ERROR_FLAG, ADDRESS_MESSAGE, cardSavePath } from "@/lib/billing/card-saved";
import { CHECKOUT_LIMITED, finishCardSave, openEmbeddedSetup } from "@/lib/billing/card-setup";
import { stripeGateway } from "@/lib/billing/gateway";
import { paymentAccount, pendingPromoView } from "@/lib/billing/payment-page";
import { basePreview } from "@/lib/billing/payment-view";
import { amount } from "@/lib/billing/prices";
import { query } from "@/lib/db-query";
import { appUrl } from "@/lib/mail/layout";
import { clientIp } from "@/lib/rate-limit";
import { readV3Settings } from "@/lib/v3-settings";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

export const metadata: Metadata = { title: "Payment" };

/**
 * Step 4, Payment (plan 2026-11-26-001, Unit 6; origin R13–R24): the
 * embedded card form for a trial whose first list is held. Anyone else goes
 * to /app (or to sign-in). The open card session is created or reused here
 * (`openEmbeddedSetup`); if the stored one already holds a confirmed card,
 * the card save is finished instead and the member is sent to their list.
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

  const r = await openEmbeddedSetup(query, gw, {
    userId: account.userId,
    ip: clientIp(await headers()),
    returnUrl: `${appUrl("/start/payment/done")}?session_id={CHECKOUT_SESSION_ID}`,
  });
  if (!r.ok) {
    if (r.reason === "complete") {
      const done = await finishCardSave(query, gw, r.sessionId, { expectUserId: account.userId, getSettings: readV3Settings });
      // Never back to this page (that would loop): a pending save waits on the return page.
      if (done.outcome === "pending") redirect(`/start/payment/done?session_id=${encodeURIComponent(r.sessionId)}`);
      if (done.outcome === "not_yours") return <Problem message="We couldn’t open the card form." />;
      redirect(cardSavePath(done));
    }
    if (r.reason === "not_allowed" || r.reason === "not_found") redirect("/app");
    return <Problem message={r.reason === "rate_limited" ? CHECKOUT_LIMITED : "We couldn’t open the card form. Reload the page in a moment."} />;
  }

  const subtotal = Math.round(amount(await getV3SettingsForDisplay(), "monthly", r.currency) * 100);
  const promo = await pendingPromoView(gw, { ...account, currency: r.currency });
  return (
    <PaymentForm
      publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null}
      session={{ sessionId: r.sessionId, clientSecret: r.clientSecret }}
      currency={r.currency}
      price={basePreview(r.currency, subtotal, promo)}
      promo={promo}
      name={account.name}
      addressError={error === ADDRESS_ERROR_FLAG ? ADDRESS_MESSAGE : null}
      supportEmail={siteConfig.contactEmail}
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
      <p className="mt-8">
        <Link href="/app" className="tlink-quiet text-small">
          Not now
        </Link>
      </p>
    </div>
  );
}

export default function PaymentPage({ searchParams }: PageProps<"/start/payment">) {
  return (
    <>
      <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">Step 4 of 4</p>
      <h1 className="mt-3 text-h2">Payment</h1>
      <Suspense fallback={<p className="mt-8 text-ink-2">Loading…</p>}>
        <Payment searchParams={searchParams} />
      </Suspense>
    </>
  );
}
