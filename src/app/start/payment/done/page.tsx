import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/access";
import { cardSavePath } from "@/lib/billing/card-saved";
import { finishCardSave } from "@/lib/billing/card-setup";
import { stripeGateway } from "@/lib/billing/gateway";
import { query } from "@/lib/db-query";
import { readV3Settings } from "@/lib/v3-settings";

export const metadata: Metadata = { title: "Payment" };

/** How many times the page re-checks a card Stripe has not confirmed yet before it stops refreshing. */
const MAX_CHECKS = 10;
/** Seconds between re-checks. */
const CHECK_EVERY = 3;

/**
 * Where Stripe sends the person after the Payment page's card form (plan
 * 2026-11-26-001, Unit 5): `/start/payment/done?session_id=…`. It runs the
 * same completion as the webhook (whichever is first saves the card and
 * unlocks the held list) for the signed-in user, then sends them on:
 * - saved → the unlocked week, with "Your card is saved. Here are your ideas."
 *   (or the promo note when the code could not be applied);
 * - not confirmed yet → "Confirming your card…", re-checked every few seconds;
 * - an address Stripe cannot place for tax → back to Payment with the message;
 * - not this person's session → back to Payment.
 */
async function Done({ searchParams }: { searchParams: PageProps<"/start/payment/done">["searchParams"] }) {
  const { session_id, check } = await searchParams;
  // The completion reads the clock and Stripe: always at request time.
  await connection();
  const session = await requireUser("/start/payment/done");
  const id = typeof session_id === "string" ? session_id.trim().slice(0, 200) : "";
  const gw = stripeGateway();
  if (!id || !gw) redirect("/start/payment");

  const r = await finishCardSave(query, gw, id, { expectUserId: session.userId, getSettings: readV3Settings });
  if (r.outcome !== "pending") redirect(cardSavePath(r));

  const n = Math.max(0, Math.min(MAX_CHECKS, Number(typeof check === "string" ? check : 0) || 0));
  return <Confirming next={n < MAX_CHECKS ? `/start/payment/done?session_id=${encodeURIComponent(id)}&check=${n + 1}` : null} />;
}

/** "Confirming your card…", re-loaded every few seconds (no script needed) until Stripe confirms or the checks run out. */
function Confirming({ next }: { next: string | null }) {
  return (
    <>
      {next && <meta httpEquiv="refresh" content={`${CHECK_EVERY};url=${next}`} />}
      <p role="status" className="text-lead">
        {next ? "Confirming your card…" : "This is taking longer than usual."}
      </p>
      <p className="mt-6 max-w-[40rem] text-small text-ink-2">
        {next
          ? "This usually takes a few seconds. This page checks again on its own."
          : "Stripe hasn’t confirmed your card yet. Refresh this page in a minute, or go back to Payment if you didn’t finish adding your card."}
      </p>
      {!next && (
        <p className="mt-8 flex flex-wrap gap-6">
          <Link href="/start/payment" className="tlink">
            Back to Payment
          </Link>
          <Link href="/app" className="tlink">
            Go to Roger
          </Link>
        </p>
      )}
    </>
  );
}

export default function PaymentDonePage({ searchParams }: PageProps<"/start/payment/done">) {
  return (
    <>
      <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">Step 4 of 4</p>
      <h1 className="mt-3 text-h2">Payment</h1>
      <div className="mt-8">
        <Suspense fallback={<p className="text-lead">Confirming your card…</p>}>
          <Done searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
