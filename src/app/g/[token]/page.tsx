import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RememberInviter, RsvpButton } from "@/components/guest-invitation";
import { ResultStatus } from "@/components/result-status";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { guestForToken, type GuestView } from "@/lib/growth/session-guests";
import { GUEST_WORDS } from "@/lib/growth/session-words";
import { sessionOn, sessionPlan, sessionsOn, sessionWhen } from "@/lib/growth/sessions";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

/** Never indexed, and the token never leaves in a Referer (next.config.ts sends the same as headers). */
export const metadata: Metadata = { title: GUEST_WORDS.tabTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }> };

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="text-h2">{title}</h1>
      <p className="mt-6 text-lead text-ink-2">{body}</p>
      <p className="mt-8">
        <Link href="/" className="tlink">
          {GUEST_WORDS.more}
        </Link>
      </p>
    </>
  );
}

/**
 * A guest's invitation, /g/{token} (spec B.15, B2 plan Unit 9, origin R13).
 * It shows the session's day and time and the inviter's display name (or
 * "A Roger member"), nothing else about them. The Meet link and the calendar
 * file are offered only after the guest says they're coming. An unknown,
 * malformed or purged token, or sessions switched off, all get the same
 * generic page; a database failure gets a neutral "try again", which says
 * nothing about the token. Once the session has ended the page says so.
 * Opening it remembers the inviter as the referrer (`RememberInviter`), if
 * the browser holds none.
 */
async function Invitation({ params }: Props) {
  const { token } = await params;
  await connection();
  const settings = await getV3SettingsForDisplay();
  const plan = sessionsOn(settings) ? sessionPlan(settings) : null;
  let g: GuestView | null = null;
  if (hasDb() && plan) {
    try {
      g = await guestForToken(query, token);
    } catch (e) {
      console.error("[g] invitation lookup failed", e instanceof Error ? e.message : e);
      return <Notice title={GUEST_WORDS.unavailableTitle} body={GUEST_WORDS.unavailableBody} />;
    }
  }
  if (!g || !plan) return <Notice title={GUEST_WORDS.invalidTitle} body={GUEST_WORDS.invalidBody} />;
  const now = new Date();
  const session = sessionOn(plan, g.sessionDate);
  if (session.end.getTime() <= now.getTime()) return <Notice title={GUEST_WORDS.passedTitle} body={GUEST_WORDS.passedBody} />;

  return (
    <>
      <RememberInviter token={token} />
      <h1 className="text-h2">{GUEST_WORDS.heading(g.inviterName)}</h1>
      <p className="mt-6 text-lead">
        <time dateTime={session.start.toISOString()}>{sessionWhen(session)}</time>
      </p>
      <p className="mt-3 text-lead text-ink-2">{GUEST_WORDS.body}</p>
      <div className="mt-8">
        {g.rsvpAt ? (
          <div className="space-y-4" data-rsvp="yes">
            <ResultStatus className="text-small">{GUEST_WORDS.coming}</ResultStatus>
            <div className="flex flex-wrap gap-3">
              <a href={plan.link} target="_blank" rel="noopener noreferrer" className="btn btn-l btn-ink">
                {GUEST_WORDS.join}
              </a>
              <a href={`/g/${encodeURIComponent(token)}/calendar.ics`} download className="btn btn-l">
                {GUEST_WORDS.calendar}
              </a>
            </div>
          </div>
        ) : (
          <RsvpButton token={token} label={GUEST_WORDS.rsvp} error={GUEST_WORDS.rsvpError} />
        )}
      </div>
      <p className="mt-10">
        <Link href="/" className="tlink">
          {GUEST_WORDS.more}
        </Link>
      </p>
    </>
  );
}

export default function GuestPage({ params }: Props) {
  return (
    <section className="mx-auto max-w-[760px] px-4 py-16 sm:px-6 lg:py-24">
      <Suspense fallback={<p className="text-lead text-ink-2">{GUEST_WORDS.loading}</p>}>
        <Invitation params={params} />
      </Suspense>
    </section>
  );
}
