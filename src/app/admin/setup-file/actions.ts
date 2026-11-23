"use server";

import { refresh, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { getSession, isEmailAdmin } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { checkVersion, MAX_NOTE_CHARS, MAX_SETUP_CHARS, publishVersion, restoreVersion, saveVersion, SETUP_FILE_TAG } from "@/lib/setup-file";

export type SetupFileState = { status: "idle" | "ok" | "error"; message?: string; body?: string; note?: string; at?: number };

/** Who saved it: the admin's email, or the shared password while that login still exists. */
async function who(): Promise<string> {
  const s = await getSession();
  return s && (await isEmailAdmin()) ? s.email : "admin (password)";
}

const versionOf = (fd: FormData) => {
  const n = Number(fd.get("version"));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** "Save as new version": always adds a version, never overwrites one (spec check 33). */
export async function saveSetupFile(_prev: SetupFileState, fd: FormData): Promise<SetupFileState> {
  await requireAdmin();
  const body = typeof fd.get("body") === "string" ? String(fd.get("body")).replace(/\r\n/g, "\n") : "";
  const note = typeof fd.get("note") === "string" ? String(fd.get("note")).trim() : "";
  const bad = checkVersion(body, note);
  if (bad) {
    const message = { empty: "The setup file is empty.", too_long: `The setup file is over ${MAX_SETUP_CHARS.toLocaleString("en-US")} characters.`, no_note: "Say what changed." }[bad];
    return { status: "error", message, body, note };
  }
  if (note.length > MAX_NOTE_CHARS) return { status: "error", message: `Keep the note under ${MAX_NOTE_CHARS} characters.`, body, note };
  const version = await saveVersion(query, { bodyMd: body, note, savedBy: await who() });
  refresh();
  return { status: "ok", message: `Saved as version ${version}. It isn’t live until you publish it.`, body, note: "", at: Date.now() };
}

/** "Publish": makes one version the live one on /getstarted, at once. */
export async function publishSetupFile(fd: FormData) {
  await requireAdmin();
  const v = versionOf(fd);
  if (v === null) return;
  try {
    await publishVersion(query, v);
  } finally {
    // Whatever happened, the public page must not keep showing a stale answer.
    updateTag(SETUP_FILE_TAG);
    refresh();
  }
}

/** "Restore": copies an old version into a new, unpublished one. */
export async function restoreSetupFile(fd: FormData) {
  await requireAdmin();
  const v = versionOf(fd);
  if (v === null) return;
  await restoreVersion(query, v, await who());
  refresh();
}
