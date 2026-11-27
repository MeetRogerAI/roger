import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { bricks, history } from "@/lib/app/week";
import { requireUser } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { longDate } from "@/lib/mail/templates/welcome";

export const metadata: Metadata = { title: "Every idea" };

/** Every idea the user has had, newest first, with its state and the brick count. */
async function History() {
  await connection();
  const session = await requireUser("/app/history");
  const [rows, b] = await Promise.all([history(query, session.userId), bricks(query, session.userId)]);
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-h2">Every idea</h1>
        <p className="mt-3 text-small text-ink-2">
          {b.marked} set up{b.confirmed ? `, ${b.confirmed} confirmed by Zack` : ""}.
        </p>
      </header>
      {rows.length ? (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map((r) => (
            <li key={`${r.week}-${r.position}`} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-small">
              <Link href={`/app/week/${r.week}`} className="tlink">
                {r.title}
              </Link>
              <span className="text-ink-2">
                {r.category} · {longDate(r.week)} · {r.confirmed ? "set up, confirmed" : r.setUp ? "set up" : "not set up"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-ink-2">No ideas yet. Your first Cora Curation arrives on a Monday morning.</p>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-lead text-ink-2">Loading…</p>}>
      <History />
    </Suspense>
  );
}
