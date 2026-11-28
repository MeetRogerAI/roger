/**
 * Fridays at 17:15 UTC (vercel.json): the review bot's close tick. Its own path, like
 * /api/cron/stats-check, so each cron entry has a path of its own. The job reads the clock,
 * so any Friday tick from 17:00 only closes the window: no claim, no lease, no model call.
 */
export { GET } from "../review/route";

/** Written here, not re-exported: Next reads route segment config from this file itself. */
export const maxDuration = 300;
