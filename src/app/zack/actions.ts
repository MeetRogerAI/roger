"use server";

import { headers } from "next/headers";
import { v1Zack } from "@/data/site/v1";
import { emailKey, hashSecret } from "@/lib/auth/tokens";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { field, honeypotTripped, isEmail } from "@/lib/form";
import { clientIp, hit, limits } from "@/lib/rate-limit";
import { checkFreeReport, FREE_RUN_REPORT_CHARS, isRunToken, newRunToken, saveReport, startRun } from "@/lib/site/free-run";
import { playTitles } from "@/lib/site/report-plays";
import { freeRunAgent } from "@/lib/site/zack-files";

/**
 * The two actions of the free Zack run (plan KTD12, spec A.11), after the
 * public-form pattern of leadFrom() in src/app/start/actions.ts.
 *
 * Every error answer carries what the visitor typed, so the form can show it
 * again: React resets a form's fields once its action has run.
 */

// v2 and v3 use v1's words until each has a copy file of its own (U13, U17).
const copy = v1Zack;

export type StartRunState = {
  status: "idle" | "ok" | "error";
  /** A message for the whole form. */
  message?: string;
  errors?: { email?: string };
  /** What was typed, on every error. */
  values?: { email: string };
  /** On "ok": the new run's token, for the page address. Never a token issued before. */
  token?: string;
};

/**
 * Step 2: an agent and an email start a run. The answer is the same whether
 * the email is new, has a run waiting or has one already attached to an
 * account: "ok" and a new token, which opens an empty run in all three.
 */
export async function startFreeRun(_prev: StartRunState, fd: FormData): Promise<StartRunState> {
  const typed = field(fd, "email", 254);
  const values = { email: typed };
  // A bot gets the same answer as a person, and a token that opens nothing.
  if (honeypotTripped(fd)) return { status: "ok", token: newRunToken() };
  const agent = freeRunAgent(field(fd, "agent", 40));
  if (!agent) return { status: "error", message: copy.ourSide, values };
  const email = typed.toLowerCase();
  if (!isEmail(email)) return { status: "error", errors: { email: copy.email.invalid }, values };
  if (!hasDb()) return { status: "error", message: copy.noDatabase, values };
  try {
    const now = new Date();
    // The per-IP backstop is checked first, so a start it refuses does not use up one of the email's tries.
    // It is set high: many people share an office address. The per-email limit is the one a person meets.
    if (!(await hit(`zack:run:ip:${clientIp(await headers())}`, limits.zackRunPerIp, now))) return { status: "error", message: copy.email.limitedHere, values };
    if (!(await hit(`zack:run:email:${emailKey(email)}`, limits.zackRunPerEmail, now))) return { status: "error", message: copy.email.limited, values };
    const { token } = await startRun(query, { email, agent: agent.slug, now });
    return { status: "ok", token };
  } catch (e) {
    console.error("[zack] run not started", e instanceof Error ? e.message : e);
    return { status: "error", message: copy.ourSide, values };
  }
}

export type ReportState = {
  /** "gone": the run link is no longer active, so nothing was stored. */
  status: "idle" | "ok" | "error" | "gone";
  message?: string;
  errors?: { report?: string };
  /** What was pasted, on every answer but "ok". */
  values?: { report: string };
  /** On "ok": the play titles read from the report. Empty when none could be read; the report is saved all the same. */
  titles?: string[];
};

/** Step 4: the report, stored on the run its token names and nowhere else. */
export async function saveFreeReport(_prev: ReportState, fd: FormData): Promise<ReportState> {
  const raw = fd.get("report");
  // A text box sends each line break as two characters; count and keep one.
  const report = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n") : "";
  const values = { report };
  if (honeypotTripped(fd)) return { status: "ok", titles: [] };
  const check = checkFreeReport(report);
  if (check === "empty") return { status: "error", errors: { report: copy.paste.empty }, values };
  if (check === "too_long") return { status: "error", errors: { report: copy.paste.tooLong.replace("[max]", FREE_RUN_REPORT_CHARS.toLocaleString("en-US")) }, values };
  if (!hasDb()) return { status: "error", message: copy.noDatabase, values };
  const token = field(fd, "run", 200);
  try {
    const now = new Date();
    if (!(await hit(`zack:report:ip:${clientIp(await headers())}`, limits.zackReportPerIp, now))) return { status: "error", message: copy.email.limitedHere, values };
    if (!isRunToken(token)) return { status: "gone", message: copy.paste.notSaved, values };
    // The key holds a hash of the token, never the token.
    if (!(await hit(`zack:report:run:${hashSecret(token).slice(0, 22)}`, limits.zackReportPerRun, now))) return { status: "error", message: copy.paste.limited, values };
    const saved = await saveReport(query, { token, report, now });
    if (saved !== "saved") return { status: "gone", message: copy.paste.notSaved, values };
    return { status: "ok", titles: playTitles(report) };
  } catch (e) {
    console.error("[zack] report not saved", e instanceof Error ? e.message : e);
    return { status: "error", message: copy.ourSide, values };
  }
}
