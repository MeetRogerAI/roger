import { connection } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { when } from "@/lib/admin/format";
import { loadInterest } from "@/lib/admin/interest";
import { oneAtATimeOffered } from "@/lib/billing/offered";
import { query } from "@/lib/db-query";

/** Interest (spec B.12): "not ready" emails, cancellation reasons, and members on each plan. */
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

      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
        {stat(i.plans.monthly, "paying monthly")}
        {stat(i.plans.perRun, oneAtATimeOffered() ? "paying one at a time" : "paying one at a time (not offered at launch)")}
        {stat(i.plans.trial, "on the trial")}
        {stat(i.plans.sponsored, "sponsored")}
        {stat(i.notOpen, "asked to hear when sign-up opens")}
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
