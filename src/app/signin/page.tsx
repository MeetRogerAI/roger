import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "@/components/app/signin-form";
import { safeNext } from "@/lib/auth/secrets";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

const notes: Record<string, string> = {
  expired: "That link has expired or was already used. Ask for a new one below.",
  noaccount: "There’s no Roger account for that address yet.",
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
