import { connection } from "next/server";
import { SettingsEditor } from "@/components/admin-ui";
import { B3SwitchesForm } from "@/components/app/admin-v3";
import { isAdmin } from "@/lib/admin-auth";
import { getSettings } from "@/lib/settings";
import { readV3Settings } from "@/lib/v3-settings";

export default async function AdminSettings() {
  await connection();
  if (!(await isAdmin())) return null;
  const s = await getSettings();
  // The switches are read uncached and fail closed: an unreadable set shows a message, never a form of guesses.
  const v3 = await readV3Settings().catch(() => null);
  return (
    <section className="max-w-[52rem]">
      <h1 className="text-h3">Settings</h1>
      <p className="mt-2 mb-8 text-small text-ink-2">Changes go live on the site within a minute. Keys and passwords stay in Vercel, not here.</p>
      <div className="mb-6">
        {v3 ? (
          <B3SwitchesForm values={{ reviewBotOn: v3.reviewBotOn, feedbackOn: v3.feedbackOn, coraUpgradesOn: v3.coraUpgradesOn }} />
        ) : (
          <p role="alert" className="text-small text-error">The v3 settings could not be read, so the switches are not shown.</p>
        )}
      </div>
      <SettingsEditor s={s} />
    </section>
  );
}
