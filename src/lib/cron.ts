import { asOfAllowed, jobNow, moneyAsOfAllowed } from "@/lib/clock";
import { databaseMarkedNonProduction } from "@/lib/db-environment";

/** Cron routes: Vercel's secret, and "as of" only on a preview with a test database. */
export function cronAuthorized(request: Request): boolean {
  return Boolean(process.env.CRON_SECRET) && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

/** `money`: the job can charge, so "as of" also needs a Stripe test key (clock.ts `moneyAsOfAllowed`). */
export async function cronNow(request: Request, o: { money?: boolean } = {}): Promise<Date> {
  const asOf = new URL(request.url).searchParams.get("asOf");
  const c = asOf ? { deployment: process.env.VERCEL_ENV ?? "development", stripeKey: process.env.STRIPE_SECRET_KEY, databaseMarkedNonProduction: await databaseMarkedNonProduction() } : null;
  const allowed = c ? (o.money ? moneyAsOfAllowed(c) : asOfAllowed(c)) : false;
  return jobNow(asOf, allowed);
}
