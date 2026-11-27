import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { completeCardSetup, type CompleteOutcome } from "@/lib/billing/card-setup";
import { stripeGateway } from "@/lib/billing/gateway";
import { query } from "@/lib/db-query";
import { signupUser } from "@/lib/signup/current";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * Spec B.4, screen 5. The browser usually gets here before Stripe's webhook,
 * so this page finishes the card step itself (the same function the webhook
 * runs; whichever is first does the work). For someone already in trial it
 * runs again only to send a welcome email that failed the first time.
 */
async function Done({ searchParams }: { searchParams: PageProps<"/start/done">["searchParams"] }) {
  const u = await signupUser("/start/done");
  if (u.status !== "signup" && u.status !== "trial") redirect("/app");
  const { session_id } = await searchParams;
  const gw = stripeGateway();

  let outcome: CompleteOutcome | "error" = u.status === "trial" ? "done" : "pending";
  if (typeof session_id === "string" && session_id && gw) {
    try {
      outcome = await completeCardSetup(query, gw, session_id.slice(0, 200), { expectUserId: u.id, getSettings: readV3Settings });
    } catch (e) {
      console.error("[start/done] could not finish the card step", e);
      // The trial may have started and only the email failed: say so plainly.
      const [now] = await query<{ status: string }>(`select status from users where id = $1`, [u.id]).catch(() => []);
      outcome = now?.status === "trial" ? "done" : "error";
    }
  }
  return <Message outcome={outcome} />;
}

function Message({ outcome }: { outcome: CompleteOutcome | "error" }): ReactNode {
  switch (outcome) {
    case "done":
      return (
        <Body title="You’re in." text="Your checklist is waiting. Your first Cora Curation arrives on a Monday, once you’re set up.">
          <Link href="/app" className="btn btn-l">
            Open Roger
          </Link>
        </Body>
      );
    case "address_invalid":
      return (
        <Body title="We need a fuller billing address." text="Stripe couldn’t work out the tax for that address. Add your card again with your full street address and postal code.">
          <Link href="/start/card" className="btn btn-l">
            Try again
          </Link>
        </Body>
      );
    case "not_consented":
      return (
        <Body title="One step is missing." text="Confirm your plan and tick the box to agree before adding your card.">
          <Link href="/start/plan" className="btn btn-l">
            Confirm your plan
          </Link>
        </Body>
      );
    case "plan_not_offered":
      // The card page was opened on one at a time, which is no longer offered (billing/offered.ts): no trial started.
      return (
        <Body title="Your plan needs confirming." text="The plan you chose isn’t offered any more, so nothing has started and nothing was charged. Confirm the monthly plan, then add your card again.">
          <Link href="/start/plan" className="btn btn-l">
            Confirm your plan
          </Link>
        </Body>
      );
    case "not_yours":
    case "unknown_customer":
      return (
        <Body title="That card page isn’t for this account." text="If you were adding your card, start the card step again.">
          <Link href="/start/card" className="btn btn-l">
            Add your card
          </Link>
        </Body>
      );
    case "pending":
      return (
        <Body title="We’re still confirming your card." text="This usually takes a few seconds. Refresh this page. If you left the card page without finishing, add your card again.">
          <Link href="/start/card" className="tlink">
            Back to the card step
          </Link>
        </Body>
      );
    case "error":
      return <Body title="Something went wrong on our side." text="Your card may be saved already. Refresh this page in a minute." />;
    default: {
      const never: never = outcome;
      return never;
    }
  }
}

function Body({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <>
      <h1 className="text-h2">{title}</h1>
      <p className="mt-6 max-w-[40rem] text-lead text-ink-2">{text}</p>
      {children && <p className="mt-8">{children}</p>}
    </>
  );
}

export default function DonePage({ searchParams }: PageProps<"/start/done">) {
  return (
    <>
      <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">Step 5 of 5</p>
      <div className="mt-3">
        <Suspense fallback={<p className="text-lead text-ink-2">Confirming your card…</p>}>
          <Done searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
