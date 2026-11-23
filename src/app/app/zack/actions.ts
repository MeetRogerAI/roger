"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireUserForAction } from "@/lib/auth/access";
import type { Currency, Plan } from "@/lib/billing/prices";
import { query } from "@/lib/db-query";
import { field } from "@/lib/form";
import { processArrived } from "@/lib/intake/arrival";
import { appUrl } from "@/lib/mail/layout";
import { sendToUser } from "@/lib/mail/send";
import { keyReplacedEmail } from "@/lib/mail/templates/zack-page";
import { clientIp, hit, limits } from "@/lib/rate-limit";
import { readV3Settings } from "@/lib/v3-settings";
import { zackFileFor } from "@/lib/zack/agents";
import { connectorText, testPrompt } from "@/lib/zack/instructions";
import { replaceZackKey } from "@/lib/zack/key";
import { checkReport, MAX_REPORT_CHARS, storeReport } from "@/lib/zack/receive";
import { deleteRun, saveZackSettings, setSharing, validateSettings, type SettingsErrors, type Sharing } from "@/lib/zack/settings";
import { sharingEffect } from "@/lib/zack/sharing-effect";
import { noticeQuoteChange } from "@/lib/billing/quote";
import { stripeBilling } from "@/lib/billing/subscriptions";

type Me = { id: string; email: string; plan: Plan; currency: Currency | null; sharing: Sharing; agent: string; status: string; trial_started_at: string | null };

/** The signed-in user, who must have an account that can receive lists (the same rule as the Zack endpoints). */
async function me(): Promise<Me> {
  const s = await requireUserForAction();
  const [u] = await query<Me>(
    `select id, email, plan, currency, sharing, agent, status, trial_started_at::text from users where id = $1`,
    [s.userId],
  );
  if (!u || u.status === "signup") redirect("/start");
  if (!["trial", "active", "held"].includes(u.status)) redirect("/app/zack");
  return u;
}

export type SettingsValues = {
  skipCategories: string[];
  skipSensitive: string[];
  outlineCategories: string[];
  neverWords: string[];
  playsPerWeek: number;
  extraRules: string;
};
export type SettingsState = { status: "idle" | "saved" | "error"; errors?: SettingsErrors; message?: string; values?: SettingsValues; at?: number };

export async function saveSettings(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const u = await me();
  const raw = {
    skipCategories: fd.getAll("skipCategories").map(String),
    skipSensitive: fd.getAll("skipSensitive").map(String),
    outlineCategories: fd.getAll("outlineCategories").map(String),
    neverWords: field(fd, "neverWords", 20_000),
    playsPerWeek: field(fd, "playsPerWeek"),
    extraRules: field(fd, "extraRules", 10_000),
  };
  // What the user typed comes back on an error, so the form keeps it.
  const typed: SettingsValues = { ...raw, neverWords: raw.neverWords.split(/\r?\n/), playsPerWeek: Number(raw.playsPerWeek) || 4 };
  const v = validateSettings(raw);
  if (!v.ok) return { status: "error", errors: v.errors, values: typed, message: "Check the fields marked above." };
  if (!(await hit(`zack:settings:${u.id}`, { limit: 40, windowSeconds: 24 * 60 * 60 }))) {
    return { status: "error", values: typed, message: "Too many changes today. Try again tomorrow." };
  }
  await saveZackSettings(query, u, v.settings);
  refresh();
  return { status: "saved", message: "Saved. Zack follows this from his next run.", values: v.settings, at: Date.now() };
}

export type SharingState = { status: "idle" | "confirm" | "saved" | "error"; sharing?: Sharing; effect?: string | null; message?: string };

/** Two steps: the first states the price effect, the second (confirm=yes) saves. */
export async function changeSharing(_prev: SharingState, fd: FormData): Promise<SharingState> {
  const u = await me();
  const sharing = field(fd, "sharing") as Sharing;
  if (!["share", "match_only", "off"].includes(sharing)) return { status: "error", message: "Choose one." };
  if (sharing === u.sharing) return { status: "saved", sharing, message: "That’s already your setting." };
  const effect = sharingEffect({ settings: await readV3Settings(), plan: u.plan, currency: u.currency, from: u.sharing, to: sharing, trialStartedAt: u.trial_started_at, status: u.status });
  if (field(fd, "confirm") !== "yes") return { status: "confirm", sharing, effect };
  await setSharing(query, u, sharing, { priceLine: effect });
  // The first charge's stored amount follows the change, and the user is told if it moved (spec check 21).
  const gw = stripeBilling();
  if (gw) await noticeQuoteChange(query, { gw, settings: await readV3Settings(), now: new Date() }, u.id).catch((e) => console.error("[quote] after sharing", e instanceof Error ? e.message : e));
  refresh();
  return { status: "saved", sharing, message: "Saved. This applies to sharing straight away." };
}

export type KeyState = { status: "idle" | "shown" | "error"; key?: string; connector?: string; test?: string; message?: string };

/** Shows the new key once, with the connector text and test prompt filled in. The old key stops working at once, and the user is emailed. */
export async function newKey(_prev: KeyState, fd: FormData): Promise<KeyState> {
  const u = await me();
  if (field(fd, "confirm") !== "yes") return { status: "error", message: "Tick the box to confirm." };
  if (!(await hit(`zack:newkey:${u.id}`, { limit: 10, windowSeconds: 24 * 60 * 60 }))) return { status: "error", message: "Too many new keys today. Try again tomorrow." };
  const key = await replaceZackKey(query, u.id);
  const prefix = key.slice(0, 11);
  await sendToUser({ id: u.id, email: u.email }, "zack_key_replaced", prefix, keyReplacedEmail({ prefix })).catch((e) =>
    console.error("[zack] key email failed", e instanceof Error ? e.message : e),
  );
  const agent = zackFileFor(u.agent);
  refresh();
  return { status: "shown", key, connector: await connectorText(agent, key, appUrl), test: testPrompt(agent, key, appUrl) };
}

export async function removeRun(fd: FormData) {
  const u = await me();
  if (field(fd, "confirm") !== "yes") redirect("/app/zack#runs");
  await deleteRun(query, u, field(fd, "run", 64));
  redirect("/app/zack?deleted=1#runs");
}

export type UploadState = { status: "idle" | "saved" | "error"; message?: string; text?: string };

/** The upload fallback (spec B.5): pasted text or a .md file, through the same path as the endpoint. A chosen file wins over pasted text. */
export async function uploadReport(_prev: UploadState, fd: FormData): Promise<UploadState> {
  const u = await me();
  const file = fd.get("file");
  const pasted = typeof fd.get("text") === "string" ? String(fd.get("text")) : "";
  let text = pasted;
  const fail = (message: string): UploadState => ({ status: "error", message, text: pasted.slice(0, MAX_REPORT_CHARS + 10) });
  if (file instanceof File && file.size > 0) {
    if (!/\.(md|markdown|txt)$/i.test(file.name)) return fail("Upload the .md file Zack made.");
    if (file.size > MAX_REPORT_CHARS * 4) return fail(`The file is over ${MAX_REPORT_CHARS.toLocaleString("en-US")} characters.`);
    text = await file.text();
  }
  const kind = field(fd, "kind") === "profile" ? "profile" : "run";
  const checked = checkReport(text, kind);
  if (!checked.ok) return fail(checked.error);
  const ip = clientIp(await headers());
  if (!(await hit(`zack:upload:${u.id}`, limits.zackSendsPerKey)) || !(await hit(`zack:upload-ip:${ip}`, { limit: 30, windowSeconds: 24 * 60 * 60 }))) {
    return fail("Six uploads a day is the limit. Try again tomorrow.");
  }
  const settings = await readV3Settings();
  const stored = await storeReport(query, u, checked, { route: "upload", test: false, cutoff: settings.runCutoff });
  after(() => processArrived(query, stored).catch((e) => console.error("[intake] upload", e instanceof Error ? e.message : e)));
  refresh();
  return {
    status: "saved",
    message: `${kind === "run" ? "Report" : "Profile"} received for your list on ${stored.week_of}${stored.replaced ? ", replacing the earlier one" : ""}.`,
  };
}
