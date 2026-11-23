import type { Query } from "@/lib/db-query";

/**
 * The Interest page (spec B.12): "not ready" emails, cancellation reasons,
 * and how many members are on each plan.
 */
export type Interest = {
  notReady: { email: string; createdAt: string }[];
  notOpen: number;
  cancelReasons: { reason: string; n: number }[];
  plans: { monthly: number; perRun: number; trial: number; sponsored: number };
};

export async function loadInterest(q: Query): Promise<Interest> {
  const notReady = await q<{ email: string; createdAt: string }>(
    `select email, created_at::text as "createdAt" from leads where kind = 'not_ready' order by created_at desc limit 500`,
  );
  const [open] = await q<{ n: number }>(`select count(*)::int as n from leads where kind = 'not_open'`);
  const cancelReasons = await q<{ reason: string; n: number }>(
    `select coalesce(nullif(trim(cancel_reason), ''), '(no answer)') as reason, count(*)::int as n from users
     where cancel_requested_at is not null or status = 'cancelled' group by 1 order by n desc, reason`,
  );
  const [plans] = await q<Interest["plans"]>(
    `select count(*) filter (where status = 'active' and plan = 'monthly' and sponsor_id is null)::int as monthly,
            count(*) filter (where status = 'active' and plan = 'per_run' and sponsor_id is null)::int as "perRun",
            count(*) filter (where status = 'trial')::int as trial,
            count(*) filter (where sponsor_id is not null and status in ('trial', 'active'))::int as sponsored
     from users`,
  );
  return { notReady, notOpen: open?.n ?? 0, cancelReasons, plans };
}
