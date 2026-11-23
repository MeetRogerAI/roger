import type { Query } from "@/lib/db-query";
import { staleClaims, takeOver } from "@/lib/billing/claims";
import { closeUnpaidTrials, dueRetries, repairPaidUsers, takeOverFirstCharge, type ChargeDeps } from "@/lib/billing/first-charge";

/**
 * The hourly pass (plan Unit 12): a list of due tasks that later units add
 * to. Each task is safe to run twice and works only on what is due now. One
 * failing task never stops the others.
 */
export type HourlyTask = { name: string; run: (q: Query, d: ChargeDeps) => Promise<unknown> };

export const HOURLY_TASKS: HourlyTask[] = [
  {
    // Claims left open past 15 minutes: looked up by claim id, then repeated with the same key.
    name: "charge_takeover",
    run: async (q, d) => {
      const out: string[] = [];
      for (const c of await staleClaims(q)) {
        if (c.purpose === "order") continue; // Unit 12b
        if (await takeOver(q, c.id)) out.push(await takeOverFirstCharge(q, d, c));
      }
      return out;
    },
  },
  // Retries on days 1, 3 and 7, and amount-changed charges after 24 hours.
  { name: "charge_retries", run: (q, d) => dueRetries(q, d) },
  // After the retries, so a day-7 attempt runs before its trial closes.
  { name: "close_unpaid_trials", run: (q, d) => closeUnpaidTrials(q, d) },
  // A paid user left held or in trial is made active.
  { name: "repair_paid_users", run: (q, d) => repairPaidUsers(q, d) },
];

export async function runHourly(q: Query, d: ChargeDeps, tasks: HourlyTask[] = HOURLY_TASKS): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (!d.settings.cycleLive) return { skipped: "The cycle is not live." };
  for (const t of tasks) {
    try {
      out[t.name] = await t.run(q, d);
    } catch (e) {
      console.error(`[hourly] ${t.name}`, e instanceof Error ? e.message : e);
      out[t.name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}
