import { connection } from "next/server";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { guestOptedOut } from "@/lib/mail/suppression";
import { optOutAction } from "./actions";

/** The words of /o/{token}, in one place (listed for sign-off in artifacts/wording-signoff.md, section 12). */
export const OPT_OUT_WORDS = {
  invalid: { title: "That link isn’t valid.", body: "Nothing has changed." },
  done: { title: "You won’t get any more invitations from Roger.", body: "No Roger member can send an invitation to this address again." },
  ask: {
    title: "Stop invitations from Roger?",
    body: "A Roger member invited you to a group session. This stops every invitation from Roger to this address, whoever sends it.",
    button: "Stop invitations",
  },
  error: "That didn’t work. Try again.",
  loading: "Checking your link…",
} as const;

/**
 * A guest's opt-out page (B2 whole-branch review; CASL and CAN-SPAM).
 * Opening it changes nothing, because mail scanners open links too: one
 * button (a POST) suppresses the address. Any token that does not verify gets
 * the same generic message, whatever was wrong with it.
 */
export async function OptOutView({ token, error }: { token: string; error: boolean }) {
  await connection();
  const off = hasDb() ? await guestOptedOut(query, token).catch(() => null) : null;
  if (off === null || off) {
    const w = off === null ? OPT_OUT_WORDS.invalid : OPT_OUT_WORDS.done;
    return (
      <>
        <h1 className="text-h2">{w.title}</h1>
        <p className="mt-6 text-lead text-ink-2">{w.body}</p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-h2">{OPT_OUT_WORDS.ask.title}</h1>
      <p className="mt-6 text-lead text-ink-2">{OPT_OUT_WORDS.ask.body}</p>
      {error && (
        <p role="alert" className="mt-4 text-small text-error">
          {OPT_OUT_WORDS.error}
        </p>
      )}
      <form action={optOutAction} className="mt-8">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-l">
          {OPT_OUT_WORDS.ask.button}
        </button>
      </form>
    </>
  );
}
