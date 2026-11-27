"use server";

import { redirect } from "next/navigation";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { unsubscribe } from "@/lib/mail/unsubscribe";

/**
 * The /u/{token} button (B2 plan Unit 8): switches the Wednesday stats email
 * off for the token's member, then shows the page again, which now says it
 * is off. A token that does not verify changes nothing and the page shows its
 * generic error. Monday emails are never touched.
 */
export async function unsubscribeAction(fd: FormData): Promise<void> {
  const raw = fd.get("token");
  const token = typeof raw === "string" ? raw.slice(0, 128) : "";
  if (hasDb() && token) {
    try {
      await unsubscribe(query, token);
    } catch (e) {
      console.error("[unsubscribe] page", e instanceof Error ? e.message : e);
      redirect(`/u/${encodeURIComponent(token)}?error=1`);
    }
  }
  redirect(`/u/${encodeURIComponent(token || "-")}`);
}
