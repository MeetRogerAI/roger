"use server";

import { headers } from "next/headers";
import { hasDb, sql } from "@/lib/db";
import { clientIp, hit, limits } from "@/lib/rate-limit";

export type StartFormState = { status: "idle" | "ok" | "error"; message?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: FormDataEntryValue | null, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * "Not open yet": keep an email so we can write when sign-up opens
 * (requirements R10). Sends nothing, and answers the same whether or not the
 * address is already saved.
 */
export async function saveNotOpenLead(_prev: StartFormState, fd: FormData): Promise<StartFormState> {
  if (clean(fd.get("_gotcha"))) return { status: "ok" };
  const email = clean(fd.get("email"), 254).toLowerCase();
  if (!EMAIL.test(email)) return { status: "error", message: "Enter a valid email address." };
  if (!hasDb()) return { status: "error", message: "This isn’t switched on yet. Try again soon." };
  const ip = clientIp(await headers());
  if (!(await hit(`lead:ip:${ip}`, limits.leadPerIp))) {
    return { status: "error", message: "Too many tries from here. Try again in an hour." };
  }
  const utm = clean(fd.get("utm"), 200);
  await sql`insert into leads (email, kind, persona, utm) values (${email}, 'not_open', 'v3', ${utm}) on conflict do nothing`;
  return { status: "ok" };
}
