"use server";

import { redirect } from "next/navigation";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { optOutGuest } from "@/lib/mail/suppression";

/**
 * The /o/{token} button (B2 whole-branch review): suppresses the token's
 * address, so no member can invite it again, then shows the page again, which
 * now says it is done. A token that does not verify changes nothing and the
 * page shows its generic message.
 */
export async function optOutAction(fd: FormData): Promise<void> {
  const raw = fd.get("token");
  const token = typeof raw === "string" ? raw.slice(0, 512) : "";
  if (hasDb() && token) {
    try {
      await optOutGuest(query, token);
    } catch (e) {
      console.error("[opt-out] page", e instanceof Error ? e.message : e);
      redirect(`/o/${encodeURIComponent(token)}?error=1`);
    }
  }
  redirect(`/o/${encodeURIComponent(token || "-")}`);
}
