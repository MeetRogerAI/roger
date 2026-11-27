import Link from "next/link";
import { connection } from "next/server";
import { ActionButton, CoraButtons, SeedImportForm } from "@/components/app/admin-v3";
import { isAdmin } from "@/lib/admin-auth";
import { notReadyReason, userPicks, weekState } from "@/lib/admin/cora";
import { when } from "@/lib/admin/format";
import { recentActions } from "@/lib/admin/log";
import { asOfAllowed, currentMonday } from "@/lib/clock";
import { databaseMarkedNonProduction } from "@/lib/db-environment";
import { query } from "@/lib/db-query";
import { readV3Settings } from "@/lib/v3-settings";

/** "Run Cora now" and the seed import can take minutes; server actions take the page's limit. */
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** This week’s run, once "Cora" (spec B.12): the week, the buttons over the existing jobs, the seed import, and any user's picks (read-only). */
export default async function CoraPage({ searchParams }: PageProps<"/admin/cora">) {
  await connection();
  if (!(await isAdmin())) return null;
  const sp = await searchParams;
  const settings = await readV3Settings();
  const now = new Date();
  const week = typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : currentMonday(now);
  const userId = typeof sp.user === "string" && UUID.test(sp.user) ? sp.user : null;
  const [w, users, picks, log, nonProd] = await Promise.all([
    weekState(query, week, settings),
    query<{ id: string; email: string }>(`select id, email from users where status in ('trial', 'active', 'held', 'cancelled') order by email`),
    userId ? userPicks(query, userId) : Promise.resolve([]),
    recentActions(query, { actions: ["run_cora", "run_dry", "run_charge", "run_send", "run_hourly", "charge_and_send", "seed_import", "close_failed_week_orders"], limit: 10 }),
    databaseMarkedNonProduction().catch(() => false),
  ]);
  const allowAsOf = asOfAllowed({ deployment: process.env.VERCEL_ENV ?? "development", stripeKey: process.env.STRIPE_SECRET_KEY, databaseMarkedNonProduction: nonProd });
  const reason = notReadyReason(w, settings);

  return (
    <section className="max-w-[60rem] space-y-10">
      <header>
        <h1 className="text-h3">This week’s run</h1>
        <p className="mt-2 text-small text-ink-2">
          Week of {week}. The cycle is {settings.cycleLive ? "live" : "not live (v3.cycleLive is off): real runs, charges and sends do nothing; a dry run still works"}.
        </p>
      </header>

      <div>
        <h2 className="text-title">This week</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-small sm:grid-cols-[12rem_1fr]">
          <dt className="text-ink-2">Status</dt>
          <dd>
            {w.status ?? "not started"}
            {w.phase ? `, phase ${w.phase}` : ""}
            {w.dryRun ? " (dry run)" : ""}
          </dd>
          <dt className="text-ink-2">Counts</dt>
          <dd>
            {w.runsRead} runs read · {w.playsMerged} plays merged · pool of {w.poolSize} · {w.usersPicked} users picked for
          </dd>
          <dt className="text-ink-2">Times</dt>
          <dd>
            Cora {when(w.coraAt)} · charge {when(w.chargeAt)} · send {when(w.sendAt)}
          </dd>
          {w.sentAt && (
            <>
              <dt className="text-ink-2">Sent</dt>
              <dd>{when(w.sentAt)}</dd>
            </>
          )}
          {w.error && (
            <>
              <dt className="text-ink-2">Last error</dt>
              <dd className="text-error [overflow-wrap:anywhere]">{w.error}</dd>
            </>
          )}
          <dt className="text-ink-2">Charge and send</dt>
          <dd>{reason ?? "Ready: “Charge and send now” charges first, then sends."}</dd>
        </dl>
      </div>

      <div>
        <h2 className="text-title">Run</h2>
        <p className="mt-1 text-small text-ink-2">
          These call the same jobs as the schedule, with all their checks. A dry run stores picks nobody receives. “Charge and send now” does nothing on a week that isn’t ready, and says why.
        </p>
        <div className="mt-4">
          <CoraButtons asOfAllowed={allowAsOf} />
        </div>
        <div className="mt-6">
          <ActionButton action="closeOrders" label="Close open orders in failed weeks" />
        </div>
        {log.length > 0 && (
          <ul className="mt-6 text-meta text-ink-2">
            {log.map((l) => (
              <li key={l.id} className="[overflow-wrap:anywhere]">
                {when(l.createdAt)} · {l.adminEmail} · {l.action} · {String(l.detail.result ?? l.detail.week ?? "")}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-title">Seed import</h2>
        <p className="mt-1 text-small text-ink-2">One pilot run file under a hidden contributor; it goes through intake and into the pool at once.</p>
        <div className="mt-4">
          <SeedImportForm />
        </div>
      </div>

      <div>
        <h2 className="text-title">A user’s picks</h2>
        <form className="mt-3 flex max-w-lg flex-wrap items-end gap-2">
          <label htmlFor="picks-user" className="sr-only">
            User
          </label>
          {/* min-w-0: a select is as wide as its longest address, and without it one long email widens the page on a phone. */}
          <select id="picks-user" name="user" defaultValue={userId ?? ""} className="h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 text-small">
            <option value="">Choose a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-s btn-ink">
            Show picks
          </button>
        </form>
        {userId &&
          (picks.length === 0 ? (
            <p className="mt-4 text-small text-ink-2">No picks for this user.</p>
          ) : (
            <ul className="mt-4 divide-y divide-rule text-small">
              {picks.map((p) => (
                <li key={`${p.weekOf}-${p.position}-${p.dryRun}`} className="py-2">
                  {p.weekOf} #{p.position}
                  {p.dryRun ? " (dry run)" : ""}: <span className="font-[600]">{p.title}</span> · fit {p.fit} · score {p.personalScore} · {p.deliveredAt ? "sent" : "not sent"}
                  <p className="text-meta text-ink-2">{p.reason}</p>
                </li>
              ))}
            </ul>
          ))}
        {userId && (
          <p className="mt-3 text-small">
            <Link href={`/admin/users/${userId}`} className="tlink">
              Open this user
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
