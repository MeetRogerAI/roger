import { logAdminAction } from "@/lib/admin/log";
import { addDays, isRealDate } from "@/lib/clock";
import type { Query } from "@/lib/db-query";
import { nextSession, type SessionPlan } from "./sessions";

/**
 * Group-session attendance for admins (spec B.15 "Admins ... tick who
 * attended", B2 plan Unit 9). One `session_attendance` row per member or
 * guest who came, with the admin's email in `marked_by`; every tick and
 * untick is also in the admin action log.
 */

/** The dates an admin can pick: the next session, the last eight by the plan's weekday, and any date with guests or ticks. Newest first. */
export async function sessionDates(q: Query, plan: SessionPlan | null, now: Date): Promise<{ upcoming: string | null; dates: string[] }> {
  const upcoming = plan ? nextSession(plan, now).date : null;
  const planned = upcoming ? Array.from({ length: 9 }, (_, i) => addDays(upcoming, -7 * i)) : [];
  const rows = await q<{ d: string }>(
    `select d::text from (
       select session_date as d from session_guests
       union select session_date from session_attendance
     ) x order by d desc limit 30`,
  );
  const dates = [...new Set([...planned, ...rows.map((r) => r.d)])].sort().reverse();
  return { upcoming, dates };
}

export type AttendanceRow = { kind: "member" | "guest"; id: string; name: string; detail: string; attended: boolean; markedBy: string | null };

/**
 * Who could have come on `date`, and who is ticked: paying and sponsored
 * members, anyone already ticked, and that session's guests (a purged guest
 * shows as "Guest (details removed)").
 */
export async function attendanceFor(q: Query, date: string): Promise<AttendanceRow[]> {
  const members = await q<{ id: string; name: string; email: string; marked_by: string | null }>(
    `select u.id, u.name, u.email, a.marked_by from users u
     left join session_attendance a on a.user_id = u.id and a.session_date = $1::date
     where a.id is not null or u.status = 'active' or (u.sponsor_id is not null and u.status = 'trial')
     order by (a.id is null), lower(u.name), u.email`,
    [date],
  );
  const guests = await q<{ id: string; name: string | null; email: string | null; inviter: string; marked_by: string | null }>(
    `select g.id, g.name, g.email, coalesce(nullif(i.name, ''), i.email) as inviter, a.marked_by from session_guests g
     join users i on i.id = g.inviter_id
     left join session_attendance a on a.guest_id = g.id and a.session_date = $1::date
     where g.session_date = $1::date
     order by g.created_at`,
    [date],
  );
  return [
    ...members.map((m) => ({ kind: "member" as const, id: m.id, name: m.name || m.email, detail: m.email, attended: m.marked_by !== null, markedBy: m.marked_by })),
    ...guests.map((g) => ({
      kind: "guest" as const,
      id: g.id,
      name: g.name ?? "Guest (details removed)",
      detail: `${g.email ? `${g.email}, ` : ""}guest of ${g.inviter}`,
      attended: g.marked_by !== null,
      markedBy: g.marked_by,
    })),
  ];
}

export type AttendanceChange = { date: string; kind: "member" | "guest"; id: string; attended: boolean };

/** Ticks or unticks one person for one session, and logs it. Ticking twice changes nothing. */
export async function setAttendance(q: Query, by: string, c: AttendanceChange): Promise<{ ok: boolean; message: string }> {
  if (!isRealDate(c.date)) return { ok: false, message: "That isn’t a session date." };
  const col = c.kind === "member" ? "user_id" : "guest_id";
  if (c.kind === "guest") {
    const [g] = await q(`select 1 from session_guests where id = $1 and session_date = $2::date`, [c.id, c.date]);
    if (!g) return { ok: false, message: "That guest wasn’t invited to this session." };
  } else {
    const [u] = await q(`select 1 from users where id = $1`, [c.id]);
    if (!u) return { ok: false, message: "No such member." };
  }
  if (c.attended) {
    await q(`insert into session_attendance (session_date, ${col}, marked_by) values ($1::date, $2, $3) on conflict do nothing`, [c.date, c.id, by]);
  } else {
    await q(`delete from session_attendance where session_date = $1::date and ${col} = $2`, [c.date, c.id]);
  }
  await logAdminAction(q, {
    by,
    userId: c.kind === "member" ? c.id : null,
    action: c.attended ? "session_attended" : "session_attended_undo",
    detail: { sessionDate: c.date, ...(c.kind === "guest" ? { guestId: c.id } : {}) },
  });
  return { ok: true, message: c.attended ? "Marked as attended." : "Attendance removed." };
}
