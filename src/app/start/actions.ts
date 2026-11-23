"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { zackAgents } from "@/data/zack";
import { hasDb, sql } from "@/lib/db";
import { query } from "@/lib/db-query";
import { clientIp, hit, limits } from "@/lib/rate-limit";
import { startAccount } from "@/lib/signup/account";
import { decodeDraft, DRAFT_COOKIE, DRAFT_DAYS, encodeDraft, type SignupDraft } from "@/lib/signup/draft";
import { parseStartParams } from "@/lib/signup/params";
import { parseQuiz, routeFor } from "@/lib/signup/quiz";
import { readV3Settings } from "@/lib/v3-settings";

export type StartFormState = { status: "idle" | "ok" | "error"; message?: string; errors?: Record<string, string>; email?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: FormDataEntryValue | null, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Sign-up is open only when the uncached setting says so; any doubt means closed. */
async function signupOpen(): Promise<boolean> {
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

async function leadFrom(fd: FormData, kind: "not_open" | "not_ready"): Promise<StartFormState> {
  if (clean(fd.get("_gotcha"))) return { status: "ok" };
  const email = clean(fd.get("email"), 254).toLowerCase();
  if (!EMAIL.test(email)) return { status: "error", message: "Enter a valid email address." };
  if (!hasDb()) return { status: "error", message: "This isn’t switched on yet. Try again soon." };
  const ip = clientIp(await headers());
  if (!(await hit(`lead:ip:${ip}`, limits.leadPerIp))) return { status: "error", message: "Too many tries from here. Try again in an hour." };
  const utm = clean(fd.get("utm"), 200);
  await sql`insert into leads (email, kind, persona, utm) values (${email}, ${kind}, 'v3', ${utm}) on conflict do nothing`;
  return { status: "ok" };
}

/**
 * "Not open yet": keep an email so we can write when sign-up opens
 * (requirements R10). Sends nothing, and answers the same whether or not the
 * address is already saved.
 */
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
    path: clean(fd.get("path")),
    cur: clean(fd.get("cur")),
    ref: clean(fd.get("ref")),
    zack: clean(fd.get("zack"), 200),
    utm: clean(fd.get("utm"), 200),
  });
  const path = routeFor(parsed.answers);
  await saveDraft({ answers: parsed.answers, path, continuedAnyway: false, source: p.path, cur: p.cur ?? "USD", ref: p.ref, zack: p.zack, utm: p.utm });
  redirect(path === "not_ready" ? "/start/not-ready" : "/start/account");
}

/** "Start anyway" on the not-ready note: on to the account, on the new path, tag kept. */
export async function startAnyway() {
  const d = await readDraft();
  if (!d) redirect("/start");
  await saveDraft({ ...d, continuedAnyway: true });
  redirect("/start/account");
}

/** Step 2: name and email. Always ends at "check your email" for a valid address. */
export async function submitAccount(_prev: StartFormState, fd: FormData): Promise<StartFormState> {
  if (!(await signupOpen())) redirect("/start");
  if (clean(fd.get("_gotcha"))) return { status: "ok" };
  const d = await readDraft();
  if (!d) redirect("/start");
  const name = clean(fd.get("name"), 80);
  const email = clean(fd.get("email"), 254);
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Enter your name.";
  if (!EMAIL.test(email)) errors.email = "Enter a valid email address.";
  if (Object.keys(errors).length) return { status: "error", errors };
  try {
    await startAccount(query, { name, email, draft: d, ip: clientIp(await headers()) });
  } catch (e) {
    console.error("[start] account step failed", e);
    return { status: "error", message: "Something went wrong on our side. Try again in a minute." };
  }
  return { status: "ok", email };
}
