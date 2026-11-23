"use server";

import { headers } from "next/headers";
import { requestSignInLink } from "@/lib/auth/request-link";
import { safeNext } from "@/lib/auth/secrets";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { clientIp } from "@/lib/rate-limit";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

/** Always answers "check your email" for a valid address, whatever happened. */
export async function requestLinkAction(_prev: SignInState, fd: FormData): Promise<SignInState> {
  const email = String(fd.get("email") ?? "").trim().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Enter a valid email address." };
  if (!hasDb()) return { status: "error", message: "Sign-in isn’t switched on yet. Try again soon." };
  const next = safeNext(String(fd.get("next") ?? ""));
  try {
    await requestSignInLink(query, email, clientIp(await headers()), next);
  } catch (e) {
    console.error("[signin] request failed", e);
  }
  return { status: "sent", email };
}
