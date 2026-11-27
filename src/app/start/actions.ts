"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { zackAgents } from "@/data/zack";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { field, honeypotTripped, isEmail } from "@/lib/form";
import { clientIp, hit, limits } from "@/lib/rate-limit";
import { beginGoogle, GOOGLE_STATE_COOKIE, googleConfig, googleStateCookie } from "@/lib/auth/google";
import { newAccountFrom, startAccount } from "@/lib/signup/account";
import { decodeDraft, DRAFT_COOKIE, DRAFT_DAYS, encodeDraft, type SignupDraft } from "@/lib/signup/draft";
import { parseStartParams } from "@/lib/signup/params";
import { parseQuiz, routeFor } from "@/lib/signup/quiz";
import { rememberEmail } from "@/lib/signup/known-email";
import { resolveReferrer, type Referrer } from "@/lib/referrals/attribution";
import { REF_COOKIE } from "@/lib/referrals/cookie";
import { readV3Settings } from "@/lib/v3-settings";

export type StartFormState = { status: "idle" | "ok" | "error"; message?: string; errors?: Record<string, string>; email?: string };

const OUR_SIDE = "Something went wrong on our side. Try again in a minute.";

/** Sign-up is open only when the uncached setting says so; any doubt means closed. */
export async function signupOpen(): Promise<boolean> {
  try {
    return (await readV3Settings()).signupOpen;
  } catch {
    return false;
  }
}

async function saveDraft(d: SignupDraft) {
  (await cookies()).set(DRAFT_COOKIE, encodeDraft(d), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/start",
    maxAge: DRAFT_DAYS * 86_400,
  });
}

async function readDraft(): Promise<SignupDraft | null> {
  return decodeDraft((await cookies()).get(DRAFT_COOKIE)?.value);
}

/**
 * The referrer this browser's `roger-ref` cookie names, read when the sign-up
 * link is asked for (B2 Unit 3): the link may be opened on another device.
 * Any doubt means no referrer; it never stops a sign-up.
 */
async function cookieReferrer(): Promise<Referrer | null> {
  try {
    return await resolveReferrer(query, (await cookies()).get(REF_COOKIE)?.value, new Date());
  } catch (e) {
    console.error("[start] referral cookie not read", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Saves an email for later. Sends nothing, and answers the same whether or not it was already saved. */
async function leadFrom(fd: FormData, kind: "not_open" | "not_ready"): Promise<StartFormState> {
  if (honeypotTripped(fd)) return { status: "ok" };
  const email = field(fd, "email", 254).toLowerCase();
  if (!isEmail(email)) return { status: "error", message: "Enter a valid email address." };
  if (!hasDb()) return { status: "error", message: "This isn’t switched on yet. Try again soon." };
  try {
    const ip = clientIp(await headers());
    if (!(await hit(`lead:ip:${ip}`, limits.leadPerIp))) return { status: "error", message: "Too many tries from here. Try again in an hour." };
    const utm = parseStartParams({ utm: field(fd, "utm", 200) }).utm;
    await query(`insert into leads (email, kind, persona, utm) values ($1, $2, 'v3', $3) on conflict (email, kind, persona) do update set created_at = now()`, [email, kind, utm]);
    await rememberEmail(email);
  } catch (e) {
    console.error("[start] lead not saved", e);
    return { status: "error", message: OUR_SIDE };
  }
  return { status: "ok" };
}

/** "Not open yet": keep an email so we can write when sign-up opens (requirements R10). */
export async function saveNotOpenLead(_prev: StartFormState, fd: FormData): Promise<StartFormState> {
  return leadFrom(fd, "not_open");
}

/** "Not ready": "leave your email and we'll check in later" (spec B.4). */
export async function saveNotReadyLead(_prev: StartFormState, fd: FormData): Promise<StartFormState> {
  return leadFrom(fd, "not_ready");
}

/** Step 1: the quiz. Saves the answers and moves on. */
export async function submitQuiz(_prev: StartFormState, fd: FormData): Promise<StartFormState> {
  if (!(await signupOpen())) redirect("/start");
  const parsed = parseQuiz(fd, zackAgents.map((a) => a.slug));
  if (!parsed.ok) return { status: "error", message: "A few answers are missing.", errors: parsed.errors };
  const p = parseStartParams({
    path: field(fd, "path"),
    cur: field(fd, "cur"),
    ref: field(fd, "ref"),
    zack: field(fd, "zack", 200),
    utm: field(fd, "utm", 200),
  });
  const path = routeFor(parsed.answers);
  await saveDraft({ answers: parsed.answers, path, continuedAnyway: false, source: p.path, cur: p.cur ?? "USD", ref: p.ref, zack: p.zack, utm: p.utm });
  redirect(path === "not_ready" ? "/start/not-ready" : "/start/account");
}

/** "Start anyway" on the not-ready note: on to the account, on the new path, tag kept. */
export async function startAnyway() {
  if (!(await signupOpen())) redirect("/start");
  const d = await readDraft();
  if (!d) redirect("/start");
  await saveDraft({ ...d, continuedAnyway: true });
  redirect("/start/account");
}

/**
 * Step 2 with Google (plan Unit 18): the sign-up's details travel on the
 * Google sign-in, as they do on the email link, and the account is made only
 * once Google has confirmed a verified address. The name is optional here:
 * Google's name is used when none was typed.
 */
export async function startGoogleSignup(fd: FormData) {
  if (!(await signupOpen())) redirect("/start");
  const cfg = googleConfig();
  if (!cfg || !hasDb() || honeypotTripped(fd)) redirect("/start/account");
  const d = await readDraft();
  if (!d) redirect("/start");
  let url = "/signin?e=google";
  try {
    if (!(await hit(`google:ip:${clientIp(await headers())}`, limits.googleStartPerIp))) {
      url = "/signin?e=limited";
    } else {
      const newAccount = newAccountFrom(d, `${field(fd, "firstName", 40)} ${field(fd, "lastName", 40)}`.trim(), await cookieReferrer());
      const started = await beginGoogle(query, cfg, { next: "/start/plan", newAccount });
      (await cookies()).set(GOOGLE_STATE_COOKIE, started.state, googleStateCookie());
      url = started.url;
    }
  } catch (e) {
    console.error("[start] google start failed", e instanceof Error ? e.message : e);
  }
  redirect(url);
}

/**
 * Step 2: first and last name, and the email (filled in already when this
 * browser typed it before). Ends at "check your email" for a valid address.
 */
export async function submitAccount(_prev: StartFormState, fd: FormData): Promise<StartFormState> {
  if (!(await signupOpen())) redirect("/start");
  if (honeypotTripped(fd)) return { status: "ok" };
  const d = await readDraft();
  if (!d) redirect("/start");
  const firstName = field(fd, "firstName", 40);
  const lastName = field(fd, "lastName", 40);
  const name = `${firstName} ${lastName}`.trim();
  const email = field(fd, "email", 254);
  const errors: Record<string, string> = {};
  if (!firstName) errors.firstName = "Enter your first name.";
  if (!lastName) errors.lastName = "Enter your last name.";
  if (!isEmail(email)) errors.email = "Enter a valid email address.";
  if (Object.keys(errors).length) return { status: "error", errors };
  try {
    const outcome = await startAccount(query, { name, email, draft: d, ip: clientIp(await headers()), referrer: await cookieReferrer() });
    if (outcome === "send_failed") return { status: "error", message: "We couldn’t send the email just now. Try again in a minute." };
    await rememberEmail(email);
  } catch (e) {
    console.error("[start] account step failed", e);
    return { status: "error", message: OUR_SIDE };
  }
  return { status: "ok", email };
}
