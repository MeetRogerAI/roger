import { connection } from "next/server";
import { SettingsEditor } from "@/components/admin-ui";
import { isAdmin } from "@/lib/admin-auth";
import { getSettings } from "@/lib/settings";

export default async function AdminSettings() {
  await connection();
  if (!(await isAdmin())) return null;
  const s = await getSettings();
  return (
    <section className="max-w-[52rem]">
      <h1 className="text-h3">Settings</h1>
      <p className="mt-2 mb-8 text-small text-ink-2">Changes go live on the site within a minute. Keys and passwords stay in Vercel, not here.</p>
      <SettingsEditor s={s} />
    </section>
  );
}

/** Behind a login and read per request (await connection()): a navigation into it waits for the server, as the layout says. */
export const instant = false;
