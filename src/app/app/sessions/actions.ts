"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserForAction } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { inviteAsMember, resendGuestInvite } from "@/lib/growth/session-guests";
import { sessionPlan, sessionsOn } from "@/lib/growth/sessions";
import { readV3Settings } from "@/lib/v3-settings";

/**
 * The session page's actions (B2 plan Unit 9): invite one guest to the next
 * session, and send the invitation again if its email failed or never went.
 * Settings are read uncached and fail closed: anything unclear means no
 * invitation. On success the page is refreshed so it shows the guest; on an
 * error what was typed comes back in the state, with the field the error is
 * about (React 19 form reset, docs/solutions/ui-bugs).
 */
export type InviteState = { status: "idle" | "sent" | "error"; message?: string; field?: "name" | "email"; values?: { name: string; email: string }; at?: number };

async function member(): Promise<string> {
  const s = await requireUserForAction();
  const [u] = await query<{ status: string }>(`select status from users where id = $1`, [s.userId]);
  if (!u || u.status === "signup") redirect("/start");
  return s.userId;
}

const settings = () => readV3Settings().catch(() => null);

export async function inviteGuestAction(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const userId = await member();
  const values = { name: field(fd, "name", 200), email: field(fd, "email", 300) };
  const r = await inviteAsMember(query, { userId, name: values.name, email: values.email, settings: await settings(), now: new Date() });
  if (!r.ok) return { status: "error", message: r.message, field: r.field, values, at: Date.now() };
  refresh();
  return { status: r.sent === "failed" ? "error" : "sent", message: r.message, values: { name: "", email: "" }, at: Date.now() };
}

export async function resendInviteAction(): Promise<InviteState> {
  const userId = await member();
  const s = await settings();
  const r = await resendGuestInvite(query, { inviterId: userId, plan: s && sessionsOn(s) ? sessionPlan(s) : null, now: new Date() });
  refresh();
  return { status: r.ok ? "sent" : "error", message: r.message, at: Date.now() };
}
