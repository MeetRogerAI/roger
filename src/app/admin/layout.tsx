import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminSidebar, LoginForm } from "@/components/admin-ui";
import { isAdmin } from "@/lib/admin-auth";
import { stripeMode } from "@/lib/billing/stripe";
import { hasDb } from "@/lib/db";
import { signOutAction } from "./actions";

export const metadata: Metadata = { title: { absolute: "Admin · Roger" }, robots: { index: false, follow: false } };

/** Behind a login: it renders per request, so there is no instant shell to keep. */
export const instant = false;

async function Gate({ children }: { children: React.ReactNode }) {
  await connection(); // always per request: the session is checked live
  if (!hasDb() || (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_EMAILS))
    return (
      <section className="wrap max-w-[40rem] py-24">
        <h1 className="text-h3">Admin isn’t switched on yet</h1>
        <p className="mt-3 text-small text-ink-2">Add DATABASE_URL, ADMIN_EMAILS (or ADMIN_PASSWORD), ADMIN_SECRET and CRON_SECRET in the Vercel project’s environment variables, then redeploy. The README lists what each one does.</p>
      </section>
    );
  if (!(await isAdmin()))
    return (
      <>
        {process.env.ADMIN_PASSWORD && <LoginForm />}
        {process.env.ADMIN_EMAILS && (
          <p className="wrap max-w-[40rem] pb-24 text-small text-ink-2">
            Admins listed in ADMIN_EMAILS:{" "}
            <Link href="/signin?next=/admin" className="tlink">
              sign in with an email link
            </Link>
            .
          </p>
        )}
      </>
    );
  return (
    // The sidebar is a left column from lg and a folded menu below it. min-w-0 lets a wide table scroll inside the page column instead of widening the document.
    <div className="wrap pb-24 pt-2 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:pt-4">
      <AdminSidebar>
        <StripeModeBadge />
        <form action={signOutAction}>
          <button type="submit" className="-mx-3 min-h-10 rounded-full px-3 text-small text-ink-2 underline underline-offset-4 hover:text-ink">
            Sign out
          </button>
        </form>
      </AdminSidebar>
      <div className="mt-6 min-w-0 lg:mt-1">{children}</div>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<p className="wrap py-24 text-small text-ink-2">Loading…</p>}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

/** Requirements R12: never confuse a sandbox with real money. */
function StripeModeBadge() {
  const mode = stripeMode();
  const text = mode === "live" ? "Stripe: live, real charges" : mode === "test" ? "Stripe: test mode" : "Stripe: not set up";
  return <span className={`rounded-full border px-3 py-1 text-meta ${mode === "live" ? "border-accent text-accent" : "border-rule text-ink-2"}`}>{text}</span>;
}
