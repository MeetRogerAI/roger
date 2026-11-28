import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CopyTextButton } from "@/components/app/copy-text-button";
import { KeyPanel, SettingsForm, SharingForm, UploadForm } from "@/components/app/zack-controls";
import { noteOnboarding } from "@/lib/app/onboarding";
import { requireUser } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { ZACK_CATEGORIES } from "@/lib/intake/validate";
import { appUrl } from "@/lib/mail/layout";
import { longDate } from "@/lib/dates";
import { readV3Settings } from "@/lib/v3-settings";
import { zackFileFor } from "@/lib/zack/agents";
import { coreText, instructionsForUser } from "@/lib/zack/instructions";
import { retryPendingClaim } from "@/lib/zack/receive";
import { loadZackSettings } from "@/lib/zack/rules";
import { listRuns, MAX_EXTRA_RULES, readOwnRun, SENSITIVE_SUBJECTS, type RunListRow, type Sharing } from "@/lib/zack/settings";
import { statusLines } from "@/lib/zack/status";
import { removeRun } from "./actions";

export const metadata: Metadata = { title: "Zack" };

type Me = { id: string; status: string; sharing: Sharing; agent: string; timezone: string; zack_key_prefix: string; key_created_at: string | null };

const ROUTE_WORDS: Record<string, string> = { connector: "sent by Zack", upload: "uploaded", free_tool: "from the free tool", admin: "added by Roger", seed: "seed" };
const STATUS_WORDS: Record<string, string> = { received: "being checked", accepted: "accepted", flagged: "waiting for a check by Roger", rejected: "couldn’t be read" };
const preBox = "mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-[8px] border border-rule bg-surface p-4 text-small [overflow-wrap:anywhere]";

async function ZackPage({ searchParams }: { searchParams: PageProps<"/app/zack">["searchParams"] }) {
  await connection();
  const session = await requireUser("/app/zack");
  const [u] = await query<Me>(
    `select id, status, sharing, agent, timezone, zack_key_prefix,
            to_char(zack_key_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as key_created_at
     from users where id = $1`,
    [session.userId],
  );
  if (!u || u.status === "signup") redirect("/start");
  const canAct = ["trial", "active", "held"].includes(u.status);
  const sp = await searchParams;

  // A free-tool report whose claim failed at trial start gets another chance here.
  if (canAct) await retryPendingClaim(query, u.id, async () => (await readV3Settings()).runCutoff);
  // The onboarding checklist's "Check your Zack controls" step (spec B.10).
  if (canAct) await noteOnboarding(query, u.id, "controls_at").catch((e) => console.error("[onboarding] controls", e instanceof Error ? e.message : e));

  const agent = zackFileFor(u.agent);
  const [rules, runs, core, instructions] = await Promise.all([
    loadZackSettings(query, u.id),
    listRuns(query, u.id),
    coreText(agent),
    // Exactly what the endpoint serves this user (spec check 9): the same function.
    instructionsForUser(query, u, { base: appUrl }),
  ]);
  const version = core.match(/^Version ([\d.]+) · ([^·\n]+)/m);
  const opened = typeof sp.run === "string" ? await readOwnRun(query, u.id, sp.run) : null;
  const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: u.timezone || "America/Toronto" });

  return (
    <div className="space-y-16">
      <header>
        <h1 className="text-h2">Zack</h1>
        <p className="mt-3 max-w-[40rem] text-lead text-ink-2">What Zack does, what he collects, and every report he has sent.</p>
      </header>

      <section aria-labelledby="status-h">
        <h2 id="status-h" className="text-h3">
          Status
        </h2>
        <ul className="mt-4 space-y-2 text-small">
          {statusLines({ keyPrefix: u.zack_key_prefix, keyCreatedAt: u.key_created_at, sharing: u.sharing, runs, when }).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {!canAct && <p className="mt-4 text-small text-ink-2">Your account is closed, so these settings can’t be changed. You can still read and delete your reports.</p>}
      </section>

      {canAct && (
        <>
          <section aria-labelledby="sharing-h">
            <h2 id="sharing-h" className="text-h3">
              Sharing
            </h2>
            <div className="mt-4">
              <SharingForm current={u.sharing} />
            </div>
          </section>

          <section aria-labelledby="collects-h">
            <h2 id="collects-h" className="text-h3">
              What Zack collects
            </h2>
            <div className="mt-4">
              <SettingsForm values={rules} categories={ZACK_CATEGORIES} subjects={SENSITIVE_SUBJECTS} maxRules={MAX_EXTRA_RULES} />
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="exact-h">
        <h2 id="exact-h" className="text-h3">
          Exactly what your Zack runs
        </h2>
        <p className="mt-2 text-small text-ink-2">
          Zack The Collector{version ? `, version ${version[1]}, ${version[2].trim()}` : ""}, as your AI agent receives it, with your rules included.
        </p>
        <CopyTextButton text={instructions} label="Copy" className="btn btn-s mt-3" />
        <pre tabIndex={0} aria-label="Zack's instructions" className={preBox}>
          {instructions}
        </pre>
      </section>

      <section aria-labelledby="runs-h" id="runs">
        <h2 id="runs-h" className="text-h3">
          Run history
        </h2>
        {sp.deleted === "1" && (
          <p role="status" className="mt-3 text-small text-ink-2">
            Deleted.
          </p>
        )}
        <RunHistory runs={runs} />
        {opened && (
          <article className="mt-6" aria-labelledby="opened-h">
            <h3 id="opened-h" className="text-title">
              Report for {longDate(opened.week_of)}, as received
            </h3>
            <pre tabIndex={0} className={preBox}>
              {opened.raw_text}
            </pre>
          </article>
        )}
        {canAct && (
          <>
            <h3 className="mt-10 text-title">Send a report by hand</h3>
            <p className="mt-1 text-small text-ink-2">For an AI agent that can’t send on its own: upload or paste the files Zack made.</p>
            <div className="mt-4">
              <UploadForm />
            </div>
          </>
        )}
      </section>

      {canAct && (
        <section aria-labelledby="key-h">
          <h2 id="key-h" className="text-h3">
            Your Zack key
          </h2>
          <div className="mt-4">
            <KeyPanel prefix={u.zack_key_prefix} />
          </div>
        </section>
      )}
    </div>
  );
}

/** One card per run, so it reads on a phone without sideways scrolling. */
function RunHistory({ runs }: { runs: RunListRow[] }) {
  if (!runs.length) return <p className="mt-4 text-small text-ink-2">No reports yet.</p>;
  return (
    <ul className="mt-4 divide-y divide-rule border-y border-rule">
      {runs.map((r) => (
        <li key={r.id} className="grid gap-2 py-4 text-small sm:grid-cols-[1fr_auto] sm:gap-6">
          <div>
            <p className="font-semibold">
              Cora Curation for {longDate(r.week_of)}
              {r.is_test && <span className="ml-2 font-normal text-ink-2">(test)</span>}
            </p>
            <p className="mt-1 text-ink-2">
              {ROUTE_WORDS[r.route] ?? r.route} · {r.plays} {r.plays === 1 ? "play" : "plays"} · {STATUS_WORDS[r.status] ?? r.status}
            </p>
            {r.status === "rejected" && r.reason && <p className="mt-1 text-ink-2">{r.reason}</p>}
          </div>
          <div className="flex flex-wrap items-start gap-4">
            <a href={`/app/zack?run=${r.id}#runs`} className="tlink">
              Read<span className="sr-only"> the report for {longDate(r.week_of)}</span>
            </a>
            <details>
              <summary className="tlink cursor-pointer">
                Delete<span className="sr-only"> the report for {longDate(r.week_of)}</span>
              </summary>
              <form action={removeRun} className="mt-2 max-w-[20rem] space-y-2">
                <input type="hidden" name="run" value={r.id} />
                <p className="text-ink-2">Deletes this report, its private profile, and any of its plays not yet shared. Plays already in the shared pool stay there in anonymous form.</p>
                <label className="flex gap-2">
                  <input type="checkbox" name="confirm" value="yes" required className="mt-1 size-4 accent-accent" />
                  Delete it
                </label>
                <button type="submit" className="btn btn-s">
                  Delete
                </button>
              </form>
            </details>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Page({ searchParams }: PageProps<"/app/zack">) {
  return (
    <Suspense fallback={<p className="text-lead text-ink-2">Loading…</p>}>
      <ZackPage searchParams={searchParams} />
    </Suspense>
  );
}
