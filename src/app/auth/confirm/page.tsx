import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { livePurpose, pressesItself, type LinkPurpose } from "@/lib/auth/login-link";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { confirmSignIn } from "./actions";
import { AutoConfirm } from "./auto-confirm";
import { CONFIRM_WAIT_CSS, WAIT } from "./wait";

/**
 * `strict-origin`: no request from this page carries its address (and so the token) anywhere, only the site's origin.
 * Not `no-referrer`: under it the browser sends `Origin: null` with the form's own POST when the page's scripts have
 * not loaded, and Next.js refuses that as a cross-site server action (found November 28, 2026), so the button the
 * page falls back on did nothing.
 */
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "strict-origin" };

const WORDS: Record<"signin", { title: string; body: string; button: string }> & Partial<Record<LinkPurpose, { title: string; body: string; button: string }>> = {
  signin: { title: "Sign in to Roger", body: "Signing you in on this device. If nothing happens, press the button.", button: "Sign in" },
  email_change: { title: "Confirm your new email address", body: "Press the button to make this your Roger email address.", button: "Confirm this address" },
  email_approve: {
    title: "Approve the change to your email address",
    body: "Press the button to approve it. We’ll then send a link to the new address, and the change happens only when that link is opened.",
    button: "Approve the change",
  },
};

/**
 * Where an emailed link lands. Fetching it changes nothing: mail scanners open
 * links too. Only the button signs in.
 *
 * For a sign-in link the page presses the button itself once it is on screen
 * (AutoConfirm), so the reader goes straight in (Peter, November 27, 2026).
 * A change of email address still waits for the reader's own press.
 */

async function Confirm({ searchParams }: { searchParams: PageProps<"/auth/confirm">["searchParams"] }) {
  const { t } = await searchParams;
  await connection(); // the token check reads the clock: always at request time
  const token = typeof t === "string" ? t : "";
  const purpose = hasDb() && token ? await livePurpose(query, token) : null;
  if (!purpose) {
    return (
      <>
        <h1 className="text-h2">That link has expired.</h1>
        <p className="mt-6 text-lead text-ink-2">Links work once, for 15 minutes. Ask for a new one and it will arrive in a minute.</p>
        <p className="mt-8">
          <Link href="/signin" className="btn btn-m">
            Get a new link
          </Link>
        </p>
      </>
    );
  }
  const words = WORDS[purpose] ?? WORDS.signin;
  const form = (
    <form action={confirmSignIn} className="mt-8">
      <input type="hidden" name="t" value={token} />
      {pressesItself(purpose) ? <AutoConfirm /> : null}
      <button type="submit" className="btn btn-l">
        {words.button}
      </button>
    </form>
  );
  if (!pressesItself(purpose)) {
    return (
      <>
        <h1 className="text-h2">{words.title}</h1>
        <p className="mt-6 text-lead text-ink-2">{words.body}</p>
        {form}
      </>
    );
  }
  // A link that signs in. With script running (the head script's `js` class, set before first paint) the reader
  // sees only "Signing you in…" while AutoConfirm presses the button; the button and a plain sentence appear only
  // if that has not happened after a few seconds. With no script, the button shows as it always has.
  return (
    <>
      <style>{CONFIRM_WAIT_CSS}</style>
      <h1 className="text-h2">{words.title}</h1>
      <p className="mt-6 text-lead text-ink-2 confirm-nojs">{words.body}</p>
      <div className="confirm-stack" data-confirm-stack="">
        <p className="mt-6 text-lead text-ink-2 confirm-wait" role="status">
          {WAIT.waiting}
        </p>
        <div className="confirm-late">
          <p className="mt-6 text-lead text-ink-2 confirm-js">{WAIT.late}</p>
          {form}
        </div>
      </div>
    </>
  );
}

export default function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  return (
    <section className="mx-auto max-w-[760px] px-4 py-16 sm:px-6 lg:py-24">
      <Suspense fallback={<p className="text-lead text-ink-2">Checking your link…</p>}>
        <Confirm searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
