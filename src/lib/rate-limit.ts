import { query, type Query } from "./db-query";

/**
 * Fixed-window rate limits kept in Postgres (there is no Redis). One row per
 * key and window, incremented in a single statement, so concurrent requests
 * cannot both slip under the limit.
 *
 * Keys name what is being limited and by whom, e.g. "signin:email:<hash>" or
 * "zack:send:<userId>". Never put a raw email or token in a key.
 */

export type Limit = { limit: number; windowSeconds: number };

export const limits = {
  signinPerEmail: { limit: 5, windowSeconds: 15 * 60 },
  signinPerIp: { limit: 20, windowSeconds: 15 * 60 },
  // Starting a Google sign-in writes one short-lived row; this only stops a script filling the table.
  googleStartPerIp: { limit: 30, windowSeconds: 15 * 60 },
  checkoutPerUser: { limit: 3, windowSeconds: 60 },
  checkoutPerIp: { limit: 10, windowSeconds: 60 },
  // Card-testing scripts open many setup sessions slowly; a daily cap stops that too.
  checkoutPerUserDay: { limit: 10, windowSeconds: 24 * 60 * 60 },
  checkoutPerIpDay: { limit: 40, windowSeconds: 24 * 60 * 60 },
  // Payment page (plan 2026-11-26-001, Unit 4). Promo codes are guessable: a tight hourly cap.
  promoPerUser: { limit: 10, windowSeconds: 60 * 60 },
  promoPerIp: { limit: 30, windowSeconds: 60 * 60 },
  // Tax previews follow typing (debounced); identical inputs come from a cache and are not counted.
  taxPerUser: { limit: 40, windowSeconds: 60 * 60 },
  taxPerIp: { limit: 120, windowSeconds: 60 * 60 },
  // Card-save completions from the return page (Unit 5 review): each asks Stripe; the page re-checks up to 11 times a visit.
  cardSavePerUser: { limit: 30, windowSeconds: 60 * 60 },
  zackSendsPerKey: { limit: 6, windowSeconds: 24 * 60 * 60 },
  zackBadKeyPerIp: { limit: 10, windowSeconds: 60 },
  leadPerIp: { limit: 5, windowSeconds: 60 * 60 },
  // The free Zack run on /zack. Starting one is limited per email first: an office, a campus or a
  // VPN puts many people behind one address, so the per-IP limits are backstops set well above normal use.
  zackRunPerEmail: { limit: 5, windowSeconds: 60 * 60 },
  zackRunPerIp: { limit: 100, windowSeconds: 60 * 60 },
  // Pasting a report back: a few tries per run, and a backstop per IP.
  zackReportPerRun: { limit: 10, windowSeconds: 60 * 60 },
  zackReportPerIp: { limit: 100, windowSeconds: 60 * 60 },
} satisfies Record<string, Limit>;

/** The start of the window that `now` falls in, in whole seconds. */
export function windowStart(now: Date, windowSeconds: number): number {
  const s = Math.floor(now.getTime() / 1000);
  return s - (s % windowSeconds);
}

/** Adds `by` (default 1; -1 for a refund) to the counter for (key, window) and returns the new count. */
export type Counter = (key: string, windowStart: number, expiresAt: Date, by?: number) => Promise<number>;

/** The Postgres counter, over any query function (the app's, or a test database's). */
export function counterFor(q: Query): Counter {
  return async (key, start, expiresAt, by = 1) => {
    const rows = await q<{ count: number | string }>(
      `insert into rate_events (key, window_start, count, expires_at)
       values ($1, $2, greatest($4::int, 0), $3)
       on conflict (key, window_start) do update set count = greatest(rate_events.count + $4::int, 0)
       returning count`,
      [key, start, expiresAt.toISOString(), by],
    );
    // Drivers may hand back integers as strings; compare as numbers.
    return Number(rows[0].count);
  };
}

export const postgresCounter: Counter = (key, start, expiresAt, by) => counterFor(query)(key, start, expiresAt, by);

/**
 * Counts one attempt and says whether it is within the limit. The attempt is
 * counted either way, so hammering a refused key keeps it refused.
 */
export async function hit(key: string, l: Limit, now: Date = new Date(), counter: Counter = postgresCounter): Promise<boolean> {
  const start = windowStart(now, l.windowSeconds);
  const count = await counter(key, start, new Date((start + l.windowSeconds) * 1000));
  return count <= l.limit;
}

/**
 * Gives back one attempt counted by `hit` in the same window, for a call that
 * failed on our side (Stripe down), so the person's budget is not spent on it.
 */
export async function refund(key: string, l: Limit, now: Date = new Date(), counter: Counter = postgresCounter): Promise<void> {
  const start = windowStart(now, l.windowSeconds);
  await counter(key, start, new Date((start + l.windowSeconds) * 1000), -1);
}

/** The caller's IP as Vercel reports it. Only the platform-set header is trusted. */
export function clientIp(headers: Headers): string {
  return headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
