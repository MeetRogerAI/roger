"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { setAttendance } from "@/lib/growth/session-attendance";

/**
 * /admin/sessions (B2 plan Unit 9, origin R5): ticking who attended a group
 * session. A server action is a public endpoint, so it checks the admin
 * first, and every change is logged with the admin's email.
 */
export type AttendanceState = { status: "idle" | "ok" | "error"; message?: string; at?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setAttendanceAction(_prev: AttendanceState, fd: FormData): Promise<AttendanceState> {
  const by = await requireAdmin();
  const kind = field(fd, "kind", 10);
  const id = field(fd, "id", 40);
  if ((kind !== "member" && kind !== "guest") || !UUID.test(id)) return { status: "error", message: "No such person.", at: Date.now() };
  const r = await setAttendance(query, by, { date: field(fd, "date", 10), kind, id, attended: field(fd, "attended", 1) === "1" });
  if (r.ok) refresh();
  return { status: r.ok ? "ok" : "error", message: r.message, at: Date.now() };
}
