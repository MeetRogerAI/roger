import { sql } from "./db";

/**
 * A plain parameterised query: text with $1, $2 … and a list of values,
 * returning rows. Modules that must be exactly right about claims (charges,
 * emails, picks, sign-in tokens) take one of these, so tests can run the
 * same SQL against an in-process Postgres instead of mocking it.
 */
export type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

export const query: Query = async <T,>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[];
