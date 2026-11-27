import Link from "next/link";
import { connection } from "next/server";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { unsubscribed } from "@/lib/mail/unsubscribe";
import { unsubscribeAction } from "./actions";

/** The words of /u/{token}, in one place (listed for sign-off in artifacts/wording-signoff.md). */
export const UNSUB_WORDS = {
  invalid: { title: "That link isn’t valid.", body: "Nothing has changed. You can choose which emails you get in your settings." },
  done: { title: "You won’t get the Wednesday stats email any more.", body: "Your Monday list email is not affected. You can switch the stats email back on in your settings." },
  ask: { title: "Stop the Wednesday stats email?", body: "Your Monday list email keeps coming. You can switch the stats email back on in your settings at any time.", button: "Stop the Wednesday email" },
  error: "That didn’t work. Try again.",
  settings: "Open settings",
  loading: "Checking your link…",
} as const;

/**
 * The stats email's unsubscribe page (B2 plan Unit 8). Opening it changes
 * nothing, because mail scanners open links too: one button (a POST) switches
 * the Wednesday email off. Any token that does not verify, or names no
 * member, gets the same generic message, whatever was wrong with it.
 */
export async function UnsubscribeView({ token, error }: { token: string; error: boolean }) {
  await connection();
  const off = hasDb() ? await unsubscribed(query, token).catch(() => null) : null;
  if (off === null || off) {
    const w = off === null ? UNSUB_WORDS.invalid : UNSUB_WORDS.done;
    return (
      <>
        <h1 className="text-h2">{w.title}</h1>
        <p className="mt-6 text-lead text-ink-2">{w.body}</p>
        <p className="mt-8">
          <Link href="/app/settings" className="btn btn-m">
            {UNSUB_WORDS.settings}
          </Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-h2">{UNSUB_WORDS.ask.title}</h1>
      <p className="mt-6 text-lead text-ink-2">{UNSUB_WORDS.ask.body}</p>
      {error && (
        <p role="alert" className="mt-4 text-small text-error">
          {UNSUB_WORDS.error}
        </p>
      )}
      <form action={unsubscribeAction} className="mt-8">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-l">
          {UNSUB_WORDS.ask.button}
        </button>
      </form>
    </>
  );
}
