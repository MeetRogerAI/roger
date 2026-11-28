import { connection } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { when } from "@/lib/admin/format";
import { loadInterest, type FunnelWeek } from "@/lib/admin/interest";
import { query } from "@/lib/db-query";

/** The funnel's columns (plan 2026-11-26-001, Unit 9; origin R30), in order. */
const FUNNEL_COLUMNS: [keyof FunnelWeek, string][] = [
  ["week", "Sign-up week"],
  ["signedUp", "Signed up"],
  ["zackConnected", "Zack connected"],
  ["firstTeaser", "First teaser"],
  ["cardSaved", "Card saved"],
  ["firstCharge", "First charge"],
];

/** Interest (spec B.12): "not ready" emails, cancellation reasons, members by kind of account, and the sign-up funnel. */
export default async function InterestPage() {
  await connection();
  if (!(await isAdmin())) return null;
  const i = await loadInterest(query);
  const stat = (n: number, text: string) => (
    <div className="py-2">
      <p className="text-h2 leading-none">{n}</p>
      <p className="mt-2 text-small text-ink-2">{text}</p>
    </div>
  );

  return (
    <section className="max-w-[56rem] space-y-12">
      <header>
        <h1 className="text-h3">Interest</h1>
      </header>

      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {stat(i.plans.monthly, "paying monthly")}
        {stat(i.plans.trial, "on the trial")}
        {stat(i.plans.sponsored, "sponsored")}
        {stat(i.notOpen, "asked to hear when sign-up opens")}
      </div>

      <div>
        <h2 id="funnel-h" className="text-title">
          Sign-up funnel
        </h2>
        <p className="mt-2 text-small text-ink-2">
          The last 26 weeks, by the week the account was made (Toronto, weeks start Monday): how many of those people have reached each step so far. Sponsored members and admin accounts are left out.
        </p>
        {i.funnel.every((f) => f.signedUp === 0) ? (
          <p className="mt-3 text-small text-ink-2">Nobody has signed up in the last 26 weeks.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table aria-labelledby="funnel-h" className="w-full min-w-[36rem] border-collapse text-left text-small tabular-nums">
              <thead>
                <tr className="border-b border-ink text-ink-2">
                  {FUNNEL_COLUMNS.map(([, label]) => (
                    <th key={label} scope="col" className="py-2 pr-4 font-[500]">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {i.funnel.map((f) => (
                  <tr key={f.week} className="border-b border-rule">
                    <th scope="row" className="py-2 pr-4 font-[500]">
                      {f.week}
                    </th>
                    {FUNNEL_COLUMNS.slice(1).map(([k, label]) => (
                      <td key={label} className="py-2 pr-4">
                        {f[k]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-title">Cancellation reasons</h2>
        {i.cancelReasons.length === 0 ? (
          <p className="mt-3 text-small text-ink-2">Nobody has cancelled.</p>
        ) : (
          <ul className="mt-3 text-small">
            {i.cancelReasons.map((c) => (
              <li key={c.reason}>
                {c.n} · {c.reason}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-title">“Not ready” emails ({i.notReady.length})</h2>
        {i.notReady.length === 0 ? (
          <p className="mt-3 text-small text-ink-2">None yet.</p>
        ) : (
          <ul className="mt-3 text-small">
            {i.notReady.map((l) => (
              <li key={l.email}>
                {l.email} <span className="text-ink-2">· {when(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Behind a login and read per request (await connection()): a navigation into it waits for the server, as the layout says. */
export const instant = false;
