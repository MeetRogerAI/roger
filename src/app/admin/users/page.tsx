import Link from "next/link";
import { connection } from "next/server";
import { PilotLinkForm } from "@/components/app/admin-v3";
import { isAdmin } from "@/lib/admin-auth";
import { when } from "@/lib/admin/format";
import { loadOps, statusKey } from "@/lib/admin/ops";
import { query } from "@/lib/db-query";
import { readV3Settings } from "@/lib/v3-settings";

/** Users (spec B.12): everyone, newest first, and a new pilot account with its link (R11). */
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await connection();
  if (!(await isAdmin())) return null;
  const sp = await searchParams;
  const find = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const settings = await readV3Settings();
  const { rows } = await loadOps(query, { now: new Date(), settings });
  const shown = find ? rows.filter((r) => r.email.toLowerCase().includes(find) || r.name.toLowerCase().includes(find)) : rows;

  return (
    <section className="space-y-10">
      <header>
        <h1 className="text-h3">Users</h1>
        <p className="mt-2 text-small text-ink-2">{rows.length} accounts. Open one for everything about that person and the actions on it.</p>
      </header>

      <div>
        <h2 className="text-title">New pilot account</h2>
        <p className="mt-1 text-small text-ink-2">Makes the account and a sign-in link that opens at the plan step, so they add a card and start their free lists.</p>
        <div className="mt-4 max-w-[48rem]">
          <PilotLinkForm />
        </div>
      </div>

      <div>
        <form className="flex max-w-md gap-2" role="search">
          <label htmlFor="user-q" className="sr-only">
            Find a user
          </label>
          <input id="user-q" name="q" defaultValue={find} placeholder="Name or email" className="h-11 flex-1 rounded-[var(--radius-control)] border border-rule-strong bg-surface px-3 text-small" />
          <button type="submit" className="btn btn-s btn-ink">
            Find
          </button>
        </form>
        {shown.length === 0 ? (
          <p className="mt-6 text-small text-ink-2">No users{find ? " match" : " yet"}.</p>
        ) : (
          <ul className="mt-6 divide-y divide-rule border-y border-rule">
            {shown.map((r) => (
              <li key={r.id} className="grid gap-1 py-3 text-small sm:grid-cols-[1fr_10rem_12rem] sm:gap-6">
                <div>
                  <Link href={`/admin/users/${r.id}`} className="tlink font-[600]">
                    {r.name || r.email}
                  </Link>
                  <p className="text-meta text-ink-2 [overflow-wrap:anywhere]">{r.email}</p>
                </div>
                <p>{statusKey(r)}</p>
                <p className="text-meta text-ink-2">Last sign-in: {when(r.lastSignIn)}</p>
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
