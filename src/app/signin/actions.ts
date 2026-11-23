"use server";

import { headers } from "next/headers";
import { requestSignInLink } from "@/lib/auth/request-link";
import { safeNext } from "@/lib/auth/tokens";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { field, isEmail } from "@/lib/form";
import { clientIp } from "@/lib/rate-limit";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const OUR_SIDE = "Something went wrong on our side and no email was sent. Try again in a minute.";

/**
 * Answers "check your email" for a valid address whether or not it has an
 * account (see requestSignInLink). Says so plainly when nothing could be sent.
 */
export async function requestLinkAction(_prev: SignInState, fd: FormData): Promise<SignInState> {
  const email = field(fd, "email", 254);
  if (!isEmail(email)) return { status: "error", message: "Enter a valid email address." };
  if (!hasDb()) return { status: "error", message: "Sign-in isn’t switched on yet. Try again soon." };
  try {
    const outcome = await requestSignInLink(query, email, clientIp(await headers()), safeNext(field(fd, "next")));
    if (outcome === "send_failed") return { status: "error", message: OUR_SIDE };
  } catch (e) {
    console.error("[signin] request failed", e);
    return { status: "error", message: OUR_SIDE };
  }
  return { status: "sent", email };
}
