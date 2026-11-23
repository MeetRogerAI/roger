import { torontoDate } from "@/lib/clock";

/**
 * The contributor rule's billing month (spec B.9: "the subscription's own
 * monthly period"). Stripe renews a monthly subscription on the anniversary
 * of its start, at the same time of day, on the last day of a shorter month
 * and back on the anchor day after it. The app started each subscription at
 * the first charge (`users.first_charge_at`), so the periods are computed
 * from it without asking Stripe.
 *
 * A week belongs to the period that contains its Sunday cutoff (plan, "Which
 * moment places a week in a billing period"). A renewal at 6:00 AM Monday is
 * after that cutoff, so the week belongs to the period that is ending.
 */
export type Period = {
  /** How many months after the first charge this period starts. */
  index: number;
  start: Date;
  end: Date;
  /** Toronto calendar dates of the start and of the renewal that ends it. */
  startDate: string;
  endDate: string;
};

const DAY_MS = 86_400_000;
/** The itemised email goes three days before an invoice that carries an adjustment (spec B.9, notice 5). */
export const NOTICE_DAYS = 3;
/** A carried item is made this long after the renewal, once Stripe has drafted the renewal's invoice. */
const AFTER_RENEWAL_MS = 2 * 3600_000;

/** The `k`-th monthly anniversary of `first` (UTC calendar, same time of day, clamped to the month's last day). */
export function anniversary(first: Date, k: number): Date {
  const total = first.getUTCMonth() + k;
  const year = first.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(first.getUTCDate(), last), first.getUTCHours(), first.getUTCMinutes(), first.getUTCSeconds(), first.getUTCMilliseconds()),
  );
}

function period(first: Date, k: number): Period {
  const start = anniversary(first, k);
  const end = anniversary(first, k + 1);
  return { index: k, start, end, startDate: torontoDate(start), endDate: torontoDate(end) };
}

/** The period containing `moment` (start inclusive, end exclusive), or null before the first charge. */
export function periodAt(firstChargeAt: string | Date | null, moment: Date): Period | null {
  if (!firstChargeAt) return null;
  const first = new Date(firstChargeAt);
  if (Number.isNaN(first.getTime()) || moment < first) return null;
  let k = (moment.getUTCFullYear() - first.getUTCFullYear()) * 12 + moment.getUTCMonth() - first.getUTCMonth() + 1;
  while (k > 0 && anniversary(first, k) > moment) k--;
  return period(first, k);
}

/** Weeks that count against the forgiven misses: only "missed". By choice, contributed and excused never count. */
export function countMisses(results: string[]): number {
  return results.filter((r) => r === "missed").length;
}

/**
 * Which invoice an adjustment found at `now` goes on (plan: "A second miss
 * found within three days of the renewal is carried to the invoice after
 * that"), so the three-day itemised email always comes first. A carried item
 * is only made after the coming renewal has been invoiced, so Stripe cannot
 * sweep it into that one.
 */
export function placement(firstChargeAt: string | Date, now: Date): { invoiceAt: Date; createAfter: Date; carried: boolean } | null {
  const p = periodAt(firstChargeAt, now);
  if (!p) return null;
  if (p.end.getTime() - now.getTime() >= NOTICE_DAYS * DAY_MS) {
    // Just after a renewal (a Monday-morning one), Stripe may not have drafted its invoice yet: wait, so the item is not swept into it.
    const settled = new Date(p.start.getTime() + AFTER_RENEWAL_MS);
    return { invoiceAt: p.end, createAfter: now < settled && p.index > 0 ? settled : now, carried: false };
  }
  const next = period(new Date(firstChargeAt), p.index + 1);
  return { invoiceAt: next.end, createAfter: new Date(p.end.getTime() + AFTER_RENEWAL_MS), carried: true };
}

/** "November 30 to December 30, 2026", for the invoice line (spec B.9, notice 6). */
export function periodLabel(p: Pick<Period, "startDate" | "endDate">): string {
  const f = (d: string, year: boolean) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString("en-CA", { month: "long", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  };
  return `${f(p.startDate, false)} to ${f(p.endDate, true)}`;
}
