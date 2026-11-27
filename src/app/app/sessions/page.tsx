import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { InviteGuestForm, ResendInviteButton } from "@/components/app/session-forms";
import { ResultStatus } from "@/components/result-status";
import { requireUser } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { myGuest } from "@/lib/growth/session-guests";
import { SESSION_WORDS } from "@/lib/growth/session-words";
import { nextSession, sessionAccess, sessionPlan, sessionsOn, sessionWhen } from "@/lib/growth/sessions";
import { getV3SettingsForDisplay } from "@/lib/v3-settings-display";

export const metadata: Metadata = { title: SESSION_WORDS.title };

const formWords = { guestName: SESSION_WORDS.guestName, guestEmail: SESSION_WORDS.guestEmail, send: SESSION_WORDS.send, sending: SESSION_WORDS.sending, resend: SESSION_WORDS.resend };

/** The calendar file is a route that checks access itself (it carries the Meet link). */
const MEMBER_CALENDAR_PATH = "/app/sessions/calendar.ics";

/**
 * /app/sessions (spec B.15 "Group session", B2 plan Unit 9). Paying and
 * sponsored members see the next session, its Meet link and "Add to
 * calendar", and can invite one guest. Anyone else sees the card greyed out
 * with "Opens when you subscribe", and the page carries no link at all. While
 * the v3 app is dark or any session setting is empty, only "coming soon".
 */
async function Sessions() {
  await connection();
  const session = await requireUser("/app/sessions");
  const [u] = await query<{ status: string; sponsored: boolean }>(`select status, sponsor_id is not null as sponsored from users where id = $1`, [session.userId]);
  if (!u || u.status === "signup") redirect("/start");
  const settings = await getV3SettingsForDisplay();
  const plan = sessionsOn(settings) ? sessionPlan(settings) : null;
  if (!plan) return <p className="text-small text-ink-2">{SESSION_WORDS.comingSoon}</p>;

  const now = new Date();
  const next = nextSession(plan, now);
  if (sessionAccess(u) === "locked") {
    return (
      <section aria-labelledby="card-h" aria-describedby="card-locked" data-access="locked" className="rounded-[var(--radius-control)] border border-dashed border-rule-strong bg-ground-2 px-4 py-4 text-ink-2">
        <h2 id="card-h" className="text-title">
          {SESSION_WORDS.cardHeading}
        </h2>
        <p className="mt-2 text-small">{sessionWhen(next)}</p>
        <p className="mt-2 text-small">{SESSION_WORDS.cardBody}</p>
        <p className="mt-4 text-small font-[600] text-ink">{SESSION_WORDS.locked}</p>
        <p id="card-locked" className="sr-only">
          {SESSION_WORDS.lockedNote}
        </p>
      </section>
    );
  }

  const guest = await myGuest(query, session.userId, next.date, now);
  return (
    <div className="space-y-10">
      <section aria-labelledby="card-h" data-access="full" className="rounded-[var(--radius-control)] border border-rule bg-surface px-4 py-4">
        <h2 id="card-h" className="text-title">
          {SESSION_WORDS.cardHeading}
        </h2>
        <p className="mt-2 text-small">
          <time dateTime={next.start.toISOString()}>{sessionWhen(next)}</time>
        </p>
        <p className="mt-2 text-small text-ink-2">{SESSION_WORDS.cardBody}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={plan.link} target="_blank" rel="noopener noreferrer" className="btn btn-s btn-ink">
            {SESSION_WORDS.join}
          </a>
          <a href={MEMBER_CALENDAR_PATH} download className="btn btn-s">
            {SESSION_WORDS.calendar}
          </a>
        </div>
      </section>

      <section aria-labelledby="guest-h" className="space-y-3">
        <h2 id="guest-h" className="text-h3">
          {SESSION_WORDS.guestHeading}
        </h2>
        {guest ? (
          <>
            <ResultStatus className="text-small">
              {guest.emailState === "sent"
                ? SESSION_WORDS.guestSent(guest.name)
                : guest.emailState === "failed"
                  ? SESSION_WORDS.guestFailed(guest.name)
                  : guest.canResend
                    ? SESSION_WORDS.guestStuck(guest.name)
                    : SESSION_WORDS.guestSending(guest.name)}
            </ResultStatus>
            {guest.canResend && <ResendInviteButton words={formWords} />}
            <p className="text-small text-ink-2">{SESSION_WORDS.guestNext}</p>
          </>
        ) : (
          <>
            <p className="text-small text-ink-2">{SESSION_WORDS.guestBody}</p>
            <InviteGuestForm words={formWords} />
          </>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-h2">{SESSION_WORDS.title}</h1>
      </header>
      <Suspense fallback={<p className="text-lead text-ink-2">{SESSION_WORDS.loading}</p>}>
        <Sessions />
      </Suspense>
    </div>
  );
}
