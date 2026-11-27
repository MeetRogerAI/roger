import { neon } from "@neondatabase/serverless";

/**
 * Neon over HTTP: one round trip per query, fine for serverless functions.
 *
 * `cache: "no-store"` on the driver's fetch: a query is never answered from Next's fetch cache. Without it,
 * `next build` keeps the answer of every query made inside a "use cache" function in .next/cache/fetch-cache
 * (Next does this for any fetch that says nothing about caching, to share it between its build workers), and
 * the next build that finds that folder prerenders its pages from those answers without asking the database:
 * the site's words, its prices and its settings as they were at an earlier build
 * (docs/solutions/runtime-errors/next-build-answers-queries-from-the-previous-builds-fetch-cache-2026-11-27.md).
 * The "use cache" functions around the queries still cache their results, with their own lifetimes and tags.
 */
export const sql = neon(process.env.DATABASE_URL ?? "postgres://missing", { fetchOptions: { cache: "no-store" } });

export const hasDb = () => Boolean(process.env.DATABASE_URL);
