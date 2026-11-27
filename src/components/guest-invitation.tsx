"use client";

import { useActionState, useEffect } from "react";
import { rememberInviterAction, rsvpAction, type RsvpState } from "@/app/g/[token]/actions";
import { clearExpectedResult, expectResult } from "@/components/result-status";

/**
 * Sets the inviter as this browser's referrer once the guest page has loaded
 * (cookies can't be set while a page renders). Renders nothing.
 */
export function RememberInviter({ token }: { token: string }) {
  useEffect(() => {
    void rememberInviterAction(token);
  }, [token]);
  return null;
}

/** The guest's "I'm coming" button (B2 plan Unit 9). The Meet link appears after it; its message line is always in the page. */
export function RsvpButton({ token, label, error }: { token: string; label: string; error: string }) {
  const [s, action, pending] = useActionState<RsvpState, FormData>(rsvpAction, { status: "idle" });
  useEffect(() => {
    if (s.status === "error") clearExpectedResult();
  }, [s]);
  return (
    <form action={action} onSubmit={expectResult} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="token" value={token} />
      <button type="submit" disabled={pending} className="btn btn-l">
        {label}
      </button>
      <p role="status" className="text-small text-error">
        {s.status === "error" ? error : ""}
      </p>
    </form>
  );
}
