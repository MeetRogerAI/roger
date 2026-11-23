import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleSignInLink } from "@/components/app/google-button";
import { SignInForm } from "@/components/app/signin-form";
import { safeNext } from "@/lib/auth/tokens";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

const notes: Record<string, string> = {
  expired: "That link has expired or was already used. Ask for a new one below.",
  noaccount: "There’s no Roger account for that address yet.",
  retry: "Something went wrong on our side while signing you in. Ask for a new link below.",
  changed: "Your email address is changed. Sign in with the new address.",
  approved: "Approved. If the change is still current, we’ve sent a link to the new address. Open it there to finish the change.",
  google: "We couldn’t sign you in with Google. Try again, or ask for an email link below.",
  google_cancelled: "Google sign-in was cancelled. Try again, or ask for an email link below.",
  google_unverified: "Google hasn’t verified that email address, so we can’t use it to sign you in. Ask for an email link below.",
  google_other: "This Roger account is linked to a different Google account. Sign in with that one, or ask for an email link below.",
  google_email_first: "Sign in with an email link first, then you can use Google.",
  google_admin: "Admin accounts sign in with an email link only. Ask for one below.",
  google_closed: "Sign-up isn’t open right now, so no account was made.",
  google_check_email: "Google can’t confirm that address for us, so we’ve emailed it a link to finish signing up. Open it on this device.",
  limited: "Too many sign-in attempts from here. Try again in a few minutes.",
};

async function Body({ searchParams }: { searchParams: PageProps<"/signin">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  const note = typeof sp.e === "string" ? notes[sp.e] : undefined;
  return (
    <>
      {note && (
        <p role="alert" className="mt-6 rounded-[8px] border border-rule bg-ground-2 p-4 text-small">
          {note}
        </p>
      )}
      <SignInForm next={next} />
      <GoogleSignInLink next={next} />
    </>
  );
}

export default function SignInPage({ searchParams }: PageProps<"/signin">) {
  return (
    <section className="mx-auto max-w-[760px] px-4 py-16 sm:px-6 lg:py-24">
      <h1 className="text-h2">Sign in to Roger</h1>
      <p className="mt-6 max-w-[40rem] text-lead text-ink-2">We’ll email you a link. No password.</p>
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
      <p className="mt-10 text-small text-ink-2">
        New to Roger?{" "}
        <Link href="/start" className="tlink">
          Start here
        </Link>
      </p>
    </section>
  );
}
