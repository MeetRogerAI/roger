import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CancelForm, UndoForm, UpdateCardButton } from "@/components/app/billing-panel";
import { invoiceAmount, loadBilling } from "@/lib/app/billing";
import { loadHome } from "@/lib/app/home";
import { requireUser } from "@/lib/auth/access";
import { completeCardUpdate, type CardUpdateOutcome } from "@/lib/billing/card-setup";
import { stripeGateway } from "@/lib/billing/gateway";
import { afterCardChange } from "@/lib/billing/renewals";
import { stripeAdjustments, stripeBilling, stripeOrders, stripePlans } from "@/lib/billing/subscriptions";
import { torontoDate } from "@/lib/clock";
import { query } from "@/lib/db-query";
import { longDate } from "@/lib/dates";
import { readV3Settings } from "@/lib/v3-settings";

export const metadata: Metadata = { title: "Billing" };

const STATUS_WORDS: Record<string, string> = { paid: "Paid", open: "Unpaid", void: "Cancelled", uncollectible: "Unpaid" };

const CARD_WORDS: Record<CardUpdateOutcome | "error", string> = {
  done: "Your new card is saved.",
  pending: "We’re still confirming your card. Refresh this page in a few seconds.",
  address_invalid: "Stripe couldn’t work out the tax for that address. Update your card again with your full street address and postal code.",
  not_yours: "That card page wasn’t for this account.",
  unknown_customer: "That card page wasn’t for this account.",
  error: "Something went wrong on our side. Your card may be saved already; refresh this page in a minute.",
};

/**
 * Spec B.10: plan, price, next charge with tax, the status strip, invoices, update card, cancel. Monthly is the only
 * plan (plan 2026-11-26-001, Unit 9): no switch and no order box; that code is dormant (Scope Boundaries).
 */
async function BillingPage({ searchParams }: { searchParams: PageProps<"/app/billing">["searchParams"] }) {
  await connection();
  const session = await requireUser("/app/billing");
  const sp = await searchParams;
  const settings = await readV3Settings();
  const now = new Date();
  const plans = stripePlans();
  const gw = stripeBilling();
  const adjust = stripeAdjustments();
  const orders = stripeOrders();

  // Back from Stripe's card page: finish here as well as in the webhook (whichever wins the claim does it; a held
  // charge is retried once), then come back to a clean address so the session id leaves the URL and the history.
  const sessionId = typeof sp.session_id === "string" ? sp.session_id.slice(0, 200) : "";
  const cardGw = stripeGateway();
  if (sessionId && cardGw) {
    let outcome: CardUpdateOutcome | "error";
    try {
      outcome = await completeCardUpdate(query, cardGw, sessionId, {
        expectUserId: session.userId,
        after: (userId) => afterCardChange(query, { plans: plans ?? undefined, gw: gw ?? undefined, orders: orders ?? undefined, adjust: adjust ?? undefined, settings, now }, userId, sessionId),
      });
    } catch (e) {
      console.error("[billing] card update", e instanceof Error ? e.message : e);
      outcome = "error";
    }
    redirect(`/app/billing?card=${outcome}`);
  }
  const card = typeof sp.card === "string" && Object.hasOwn(CARD_WORDS, sp.card) ? (sp.card as CardUpdateOutcome | "error") : null;

  const [view, home] = await Promise.all([loadBilling(query, session.userId, { settings, now, plans, adjust, orders }), loadHome(query, session.userId, settings, now)]);
  if (!view || !home) redirect("/start");

  return (
    <div className="space-y-14">
      <header>
        <h1 className="text-h2">Billing</h1>
        {card && (
          <p role={card === "done" ? "status" : "alert"} className="mt-3 text-small text-ink-2">
            {CARD_WORDS[card]}
          </p>
        )}
      </header>

      <section aria-labelledby="plan-h">
        <h2 id="plan-h" className="text-h3">
          Your plan
        </h2>
        <p className="mt-3">{view.planLine}</p>
        <p className="mt-2 text-small text-ink-2">
          {view.nextCharge}
          {view.cardLink && (
            <>
              {" "}
              <Link href={view.cardLink.href} className="tlink">
                {view.cardLink.label}
              </Link>
            </>
          )}
        </p>
        {view.nextChargeCredit && <p className="mt-1 text-small text-ink-2 tabular-nums">{view.nextChargeCredit}</p>}
        <p className="mt-4 rounded-[8px] border border-rule bg-surface p-4 text-small">{home.missBanner ?? home.statusLine}</p>
        {view.canUpdateCard && (
          <div className="mt-4">
            <UpdateCardButton />
          </div>
        )}
      </section>

      <section aria-labelledby="invoices-h">
        <h2 id="invoices-h" className="text-h3">
          Invoices
        </h2>
        {view.invoicesFailed ? (
          <p className="mt-3 text-small text-ink-2">Your invoices couldn’t be loaded just now. Refresh in a minute.</p>
        ) : view.invoices.length ? (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {view.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-small">
                <span>
                  {longDate(torontoDate(new Date(i.created * 1000)))}
                  {i.number ? ` · ${i.number}` : ""} · {invoiceAmount(i)} · {STATUS_WORDS[i.status] ?? i.status}
                </span>
                {i.hostedUrl && (
                  <a href={i.hostedUrl} className="tlink" target="_blank" rel="noopener noreferrer">
                    View<span className="sr-only"> the invoice of {longDate(torontoDate(new Date(i.created * 1000)))}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-small text-ink-2">No invoices yet.</p>
        )}
      </section>

      {(view.cancel || view.undo) && (
        <section aria-labelledby="cancel-h">
          <h2 id="cancel-h" className="text-h3">
            {view.undo ? "Cancelled" : "Cancel"}
          </h2>
          <div className="mt-4 max-w-[36rem]">{view.undo ? <UndoForm until={view.undo.until} /> : <CancelForm label={view.cancel!.label} />}</div>
        </section>
      )}
    </div>
  );
}

export default function Page({ searchParams }: PageProps<"/app/billing">) {
  return (
    <Suspense fallback={<p className="text-lead text-ink-2">Loading…</p>}>
      <BillingPage searchParams={searchParams} />
    </Suspense>
  );
}
