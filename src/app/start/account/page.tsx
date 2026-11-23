import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountForm } from "@/components/app/account-form";
import { googleEnabled } from "@/lib/auth/google";
import { decodeDraft, DRAFT_COOKIE } from "@/lib/signup/draft";

/** Spec B.4, screen 2: name, then email link or Google (offered only while Google's keys are set). */
async function Account() {
  const draft = decodeDraft((await cookies()).get(DRAFT_COOKIE)?.value);
  if (!draft) redirect("/start");
  return <AccountForm google={googleEnabled()} />;
}

export default function AccountPage() {
  return (
    <>
      <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">Step 2 of 5</p>
      <h1 className="mt-3 text-h2">Your account</h1>
      <p className="mt-6 max-w-[40rem] text-lead text-ink-2">No password. We’ll email you a link to confirm your address, then you choose your plan.</p>
      <Suspense fallback={null}>
        <Account />
      </Suspense>
    </>
  );
}
