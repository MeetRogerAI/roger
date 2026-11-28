import { cookies } from "next/headers";
import { SignupSteps } from "@/components/app/signup-steps";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountForm } from "@/components/app/account-form";
import { googleEnabled } from "@/lib/auth/google";
import { decodeDraft, DRAFT_COOKIE } from "@/lib/signup/draft";
import { knownEmail } from "@/lib/signup/known-email";

/** Spec B.4, screen 2: first and last name, the email (skipped when already known), then email link or Google (offered only while Google's keys are set). */
async function Account() {
  const draft = decodeDraft((await cookies()).get(DRAFT_COOKIE)?.value);
  if (!draft) redirect("/start");
  return <AccountForm google={googleEnabled()} knownEmail={await knownEmail()} />;
}

export default function AccountPage() {
  return (
    <>
      <SignupSteps current={2} back={{ href: "/start", label: "Back to the questions" }} links={{ 1: "/start" }} />
      <h1 className="text-h2">Your account</h1>
      <p className="mt-6 max-w-[40rem] text-lead text-ink-2">No password. We’ll email you a link to confirm your address, then you read how Roger works and what it costs.</p>
      <Suspense fallback={null}>
        <Account />
      </Suspense>
    </>
  );
}
