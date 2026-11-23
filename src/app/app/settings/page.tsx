import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmailForm, ProfileForm } from "@/components/app/settings-forms";
import { siteConfig } from "@/data/config";
import { COMMON_ZONES } from "@/lib/app/settings";
import { requireUser } from "@/lib/auth/access";
import { query } from "@/lib/db-query";

export const metadata: Metadata = { title: "Settings" };

type Me = { email: string; name: string; display_name: string; timezone: string; plan: string; status: string; email_prefs: Record<string, unknown> | null };

/** Spec B.10: name, display name, email, time zone, and which emails to receive. */
async function SettingsPage({ searchParams }: { searchParams: PageProps<"/app/settings">["searchParams"] }) {
  await connection();
  const session = await requireUser("/app/settings");
  const [u] = await query<Me>(`select email, name, display_name, timezone, plan, status, email_prefs from users where id = $1`, [session.userId]);
  if (!u || u.status === "signup") redirect("/start");
  const sp = await searchParams;
  const prefs = u.email_prefs ?? {};
  return (
    <div className="space-y-16">
      <header>
        <h1 className="text-h2">Settings</h1>
        {sp.email === "changed" && (
          <p role="status" className="mt-3 text-small text-ink-2">
            Your email address is now {u.email}.
          </p>
        )}
        {sp.email === "failed" && (
          <p role="alert" className="mt-3 text-small text-ink-2">
            That change couldn’t be completed. Your email address is still {u.email}.
          </p>
        )}
      </header>
      <section aria-labelledby="you-h">
        <h2 id="you-h" className="text-h3">
          You
        </h2>
        <div className="mt-4 max-w-[32rem]">
          <ProfileForm
            values={{ name: u.name, displayName: u.display_name, timezone: u.timezone, prefs: { monday: prefs.monday !== false, friday_prompt: prefs.friday_prompt !== false } }}
            zones={COMMON_ZONES}
            perRun={u.plan === "per_run"}
          />
        </div>
      </section>
      <section aria-labelledby="email-h">
        <h2 id="email-h" className="text-h3">
          Email address
        </h2>
        <div className="mt-4 max-w-[32rem]">
          <EmailForm current={u.email} supportEmail={siteConfig.contactEmail} />
        </div>
      </section>
    </div>
  );
}

export default function Page({ searchParams }: PageProps<"/app/settings">) {
  return (
    <Suspense fallback={<p className="text-lead text-ink-2">Loading…</p>}>
      <SettingsPage searchParams={searchParams} />
    </Suspense>
  );
}
