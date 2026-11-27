import Link from "next/link";
import { connection } from "next/server";
import { AttendanceToggle } from "@/components/admin-sessions";
import { isAdmin } from "@/lib/admin-auth";
import { isRealDate } from "@/lib/clock";
import { longDate } from "@/lib/dates";
import { query } from "@/lib/db-query";
import { attendanceFor, sessionDates } from "@/lib/growth/session-attendance";
import { ADMIN_SESSION_WORDS as W } from "@/lib/growth/session-words";
import { sessionPlan } from "@/lib/growth/sessions";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * /admin/sessions (spec B.15, B2 plan Unit 9): pick a session date, then
 * tick who attended, members and guests. The day, time and Meet link are v3
 * settings (launch list S11); while any is empty there is no next session,
 * but past dates can still be ticked.
 */
export default async function SessionsAdminPage({ searchParams }: PageProps<"/admin/sessions">) {
  await connection();
  if (!(await isAdmin())) return null;
  const sp = await searchParams;
  const settings = await readV3Settings().catch(() => null);
  const plan = settings ? sessionPlan(settings) : null;
  const { upcoming, dates } = await sessionDates(query, plan, new Date());
  const asked = typeof sp.date === "string" && isRealDate(sp.date) ? sp.date : null;
  const date = asked ?? upcoming ?? dates[0] ?? null;
  const rows = date ? await attendanceFor(query, date) : [];
  const members = rows.filter((r) => r.kind === "member");
  const guests = rows.filter((r) => r.kind === "guest");

  return (
    <section className="max-w-[56rem] space-y-10">
      <header className="space-y-2">
        <h1 className="text-h3">Group sessions</h1>
        <p className="text-small text-ink-2">
          {plan
            ? `Next session: ${upcoming ? longDate(upcoming) : "none"}, at ${plan.hm} Toronto time.`
            : "The session day, time or Meet link isn’t set (v3.sessionDay, v3.sessionTime, v3.sessionLink), so members don’t see the session card."}
        </p>
      </header>

      {dates.length > 0 && (
        <nav aria-label={W.datesNav} className="flex flex-wrap gap-2">
          {dates.map((d) => (
            <Link
              key={d}
              href={`/admin/sessions?date=${d}`}
              aria-current={d === date ? "page" : undefined}
              className={`chip flex min-h-11 items-center rounded-full border px-4 text-small ${d === date ? "border-ink bg-ink text-ground" : "border-rule text-ink-2 hover:text-ink"}`}
            >
              {d === upcoming ? `${longDate(d)}${W.nextSuffix}` : longDate(d)}
            </Link>
          ))}
        </nav>
      )}

      {date && (
        <>
          <div>
            <h2 className="text-title">Guests on {longDate(date)}</h2>
            {guests.length ? <People date={date} rows={guests} /> : <p className="mt-2 text-small text-ink-2">No guests were invited to this session.</p>}
          </div>
          <div>
            <h2 className="text-title">Members</h2>
            <p className="mt-1 text-small text-ink-2">Paying and sponsored members, and anyone already ticked.</p>
            {members.length ? <People date={date} rows={members} /> : <p className="mt-2 text-small text-ink-2">No members yet.</p>}
          </div>
        </>
      )}
    </section>
  );
}

function People({ date, rows }: { date: string; rows: Awaited<ReturnType<typeof attendanceFor>> }) {
  return (
    <ul className="mt-3 divide-y divide-rule border-y border-rule">
      {rows.map((r) => (
        <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p className="text-small font-[600]">{r.name}</p>
            <p className="text-meta text-ink-2">
              {r.detail}
              {r.markedBy ? ` · ticked by ${r.markedBy}` : ""}
            </p>
          </div>
          <AttendanceToggle date={date} kind={r.kind} id={r.id} attended={r.attended} words={{ attended: W.attended, markAttended: W.markAttended, saving: W.saving, forPerson: W.forPerson(r.name) }} />
        </li>
      ))}
    </ul>
  );
}
