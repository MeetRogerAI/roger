import { asOfAllowed, jobNow } from "@/lib/clock";
import { databaseMarkedNonProduction } from "@/lib/db-environment";

/** Cron routes: Vercel's secret, and "as of" only on a preview with a test database. */
export function cronAuthorized(request: Request): boolean {
  return Boolean(process.env.CRON_SECRET) && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

export async function cronNow(request: Request): Promise<Date> {
  const asOf = new URL(request.url).searchParams.get("asOf");
  const allowed = asOf
    ? asOfAllowed({ deployment: process.env.VERCEL_ENV ?? "development", stripeKey: process.env.STRIPE_SECRET_KEY, databaseMarkedNonProduction: await databaseMarkedNonProduction() })
    : false;
  return jobNow(asOf, allowed);
}
