import Link from "next/link";
import { connection } from "next/server";
import { recordGetStartedView } from "@/lib/app/onboarding";
import { getSession } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { getPublishedSetupFile, type PublishedSetup } from "@/lib/setup-file";
import { GoalButton } from "./goal-button";
import { SetupStep } from "./setup-step";

const log = (what: string) => (e: unknown) => console.error(`[getstarted] ${what}`, e instanceof Error ? e.message : e);

/**
 * The published file, or null. A failed read is not cached (the reader
 * throws): during a prerender this part is moved to request time instead, so
 * a database blip at build time never bakes "no setup file" into the page.
 */
async function publishedOrNull(): Promise<PublishedSetup | null> {
  try {
    return await getPublishedSetupFile();
  } catch (e) {
    await connection();
    try {
      return await getPublishedSetupFile();
    } catch (again) {
      log("setup file")(again ?? e);
      return null;
    }
  }
}

/** Spec B.11 item 2, through the cached, tagged reader: publishing shows on the next view. Render inside <Suspense>. */
export async function PublishedSetupStep() {
  return <SetupStep file={await publishedOrNull()} />;
}

/** "That's my goal", for a signed-in visitor only. Render inside <Suspense>. */
export async function GoalForMember() {
  const s = await getSession();
  if (!s) return null;
  const [u] = await query<{ goal: string | null }>(`select onboarding->>'goal_at' as goal from users where id = $1`, [s.userId]).catch(() => []);
  return <GoalButton agreed={Boolean(u?.goal)} />;
}

/**
 * Spec B.11 item 4: signed out, the start button; signed in, "Connect Zack".
 * A signed-in view also records what the checklist needs (spec B.10). Render inside <Suspense>.
 */
export async function NextStep() {
  const s = await getSession();
  if (!s) {
    return (
      <>
        <p className="mt-3 text-ink-2">Roger sends you three ideas every Monday, picked for how you use your AI agent.</p>
        <Link href="/start" className="btn btn-m mt-5">
          Start free
        </Link>
      </>
    );
  }
  await recordGetStartedView(query, s.userId, await publishedOrNull()).catch(log("onboarding"));
  return (
    <>
      <p className="mt-3 text-ink-2">Connect Zack to your AI agent, so Roger can pick your Monday ideas.</p>
      <Link href="/app/zack" className="btn btn-m mt-5">
        Connect Zack
      </Link>
    </>
  );
}
