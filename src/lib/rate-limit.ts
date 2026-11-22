import { sql } from "./db";

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
  checkoutPerUser: { limit: 3, windowSeconds: 60 },
  checkoutPerIp: { limit: 10, windowSeconds: 60 },
  zackSendsPerKey: { limit: 6, windowSeconds: 24 * 60 * 60 },
  zackBadKeyPerIp: { limit: 10, windowSeconds: 60 },
  leadPerIp: { limit: 5, windowSeconds: 60 * 60 },
} satisfies Record<string, Limit>;

/** The start of the window that `now` falls in, in whole seconds. */
export function windowStart(now: Date, windowSeconds: number): number {
  const s = Math.floor(now.getTime() / 1000);
  return s - (s % windowSeconds);
}

/** Increments the counter for (key, window) and returns the new count. */
export type Counter = (key: string, windowStart: number, expiresAt: Date) => Promise<number>;

export const postgresCounter: Counter = async (key, start, expiresAt) => {
  const rows = (await sql`
    insert into rate_events (key, window_start, count, expires_at)
    values (${key}, ${start}, 1, ${expiresAt.toISOString()})
    on conflict (key, window_start) do update set count = rate_events.count + 1
    returning count`) as { count: number }[];
  return rows[0].count;
};

/**
 * Counts one attempt and says whether it is within the limit. The attempt is
 * counted either way, so hammering a refused key keeps it refused.
 */
export async function hit(key: string, l: Limit, now: Date = new Date(), counter: Counter = postgresCounter): Promise<boolean> {
  const start = windowStart(now, l.windowSeconds);
  const count = await counter(key, start, new Date((start + l.windowSeconds) * 1000));
  return count <= l.limit;
}

/** The caller's IP as Vercel reports it. Only the platform-set header is trusted. */
export function clientIp(headers: Headers): string {
  return headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
