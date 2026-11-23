"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { EMAIL_PREF_KEYS, saveProfile, validateProfile, type EmailPrefKey, type ProfileErrors } from "@/lib/app/settings";
import { requireUserForAction } from "@/lib/auth/access";
import { requestEmailChange } from "@/lib/auth/email-change";
import { unlinkGoogle } from "@/lib/auth/google";
import { emailKey } from "@/lib/auth/tokens";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { hit } from "@/lib/rate-limit";

/** The signed-in user. Every action here changes only this user's own row. */
async function me(): Promise<{ id: string; email: string }> {
  const s = await requireUserForAction();
  const [u] = await query<{ id: string; email: string; status: string }>(`select id, email, status from users where id = $1`, [s.userId]);
  if (!u || u.status === "signup") redirect("/start");
  return u;
}

export type ProfileValues = { name: string; displayName: string; timezone: string; prefs: Record<EmailPrefKey, boolean> };
export type ProfileState = { status: "idle" | "saved" | "error"; errors?: ProfileErrors; message?: string; values?: ProfileValues; at?: number };

export async function saveProfileAction(_prev: ProfileState, fd: FormData): Promise<ProfileState> {
  const u = await me();
  const prefs = Object.fromEntries(EMAIL_PREF_KEYS.map((k) => [k, fd.get(`pref_${k}`) === "on"])) as Record<EmailPrefKey, boolean>;
  const typed: ProfileValues = { name: field(fd, "name", 200), displayName: field(fd, "displayName", 200), timezone: field(fd, "timezone", 64), prefs };
  const v = validateProfile(typed);
  if (!v.ok) return { status: "error", errors: v.errors, values: typed, message: "Check the fields marked above." };
  if (!(await hit(`settings:profile:${u.id}`, { limit: 40, windowSeconds: 24 * 60 * 60 }))) return { status: "error", values: typed, message: "Too many changes today. Try again tomorrow." };
  await saveProfile(query, u.id, { ...v.value, prefs });
  refresh();
  return { status: "saved", message: "Saved.", values: { ...v.value, prefs }, at: Date.now() };
}

/** "Unlink Google": Google stops signing this account in; other Google sessions end, this one stays. */
export async function unlinkGoogleAction() {
  const s = await requireUserForAction();
  await unlinkGoogle(query, s.userId, s.idHash);
  redirect("/app/settings?google=unlinked");
}

export type EmailState ={ status: "idle" | "sent" | "error"; message?: string; email?: string };

/** Sends a confirmation link to the new address. The same answer whether or not another account uses it. */
export async function changeEmailAction(_prev: EmailState, fd: FormData): Promise<EmailState> {
  const u = await me();
  const email = field(fd, "email", 254);
  const day = { limit: 5, windowSeconds: 24 * 60 * 60 };
  const tooMany: EmailState = { status: "error", email, message: "Too many changes today. Try again tomorrow." };
  if (!(await hit(`settings:email:${u.id}`, day))) return tooMany;
  // The per-address limit counts only real attempts: a typo or "same" never uses it up.
  const tryAgain: EmailState = { status: "error", email, message: "We couldn’t send the email just now, so nothing has changed. Try again in a minute." };
  let r: Awaited<ReturnType<typeof requestEmailChange>>;
  try {
    r = await requestEmailChange(query, u, email, { allow: (to) => hit(`settings:email-to:${emailKey(to)}`, day) });
  } catch (e) {
    console.error("[settings] email change request failed", e instanceof Error ? e.message : e);
    return tryAgain;
  }
  if (r === "invalid") return { status: "error", email, message: "Enter a full email address." };
  if (r === "same") return { status: "error", email, message: "That’s already your email address." };
  if (r === "limited") return tooMany;
  if (r === "send_failed") return tryAgain;
  return {
    status: "sent",
    email: "",
    message: `We’ve emailed ${u.email} to approve the change. Open that link within 60 minutes, then the link we send to the new address. Until then, nothing changes.`,
  };
}
