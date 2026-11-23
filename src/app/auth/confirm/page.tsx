import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { tokenIsLive } from "@/lib/auth/login-link";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { confirmSignIn } from "./actions";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * Where an emailed link lands. Opening it changes nothing: mail scanners open
 * links too. Only pressing the button signs in.
 */
async function Confirm({ searchParams }: { searchParams: PageProps<"/auth/confirm">["searchParams"] }) {
  const { t } = await searchParams;
  await connection(); // the token check reads the clock: always at request time
  const token = typeof t === "string" ? t : "";
  const live = hasDb() && token ? await tokenIsLive(query, token) : false;
  if (!live) {
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
  return (
    <>
      <h1 className="text-h2">Sign in to Roger</h1>
      <p className="mt-6 text-lead text-ink-2">Press the button to finish signing in on this device.</p>
      <form action={confirmSignIn} className="mt-8">
        <input type="hidden" name="t" value={token} />
        <button type="submit" className="btn btn-l">
          Sign in
        </button>
      </form>
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
