import type { Query } from "@/lib/db-query";

/**
 * Named leases (the `leases` table): one process at a time for a job that has
 * no transaction to hold a lock across slow work (Neon over HTTP). Used by the
 * Cora merge and the points refresh. A lease guards entry; the writes it
 * protects check the holder too (docs/solutions/best-practices/
 * lease-must-guard-every-write-not-just-entry-2026-11-23.md).
 */

/** Takes or renews a named lease; false when someone else holds it. */
export async function takeLease(q: Query, name: string, holder: string, seconds: number): Promise<boolean> {
  const rows = await q(
    `insert into leases (name, holder, until) values ($1, $2, now() + make_interval(secs => $3))
     on conflict (name) do update set holder = excluded.holder, until = excluded.until
     where leases.until < now() or leases.holder = excluded.holder
     returning name`,
    [name, holder, seconds],
  );
  return rows.length > 0;
}

export async function releaseLease(q: Query, name: string, holder: string): Promise<void> {
  await q(`delete from leases where name = $1 and holder = $2`, [name, holder]);
}
