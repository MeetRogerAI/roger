import { z } from "zod";
import { v3Defaults } from "@/data/config";
import { parseHm } from "./clock";
import { hasDb, sql } from "./db";

/**
 * The v3 settings (spec 0.9), stored in the `settings` table as "v3.<name>"
 * over the defaults in data/config.ts.
 *
 * `readV3Settings()` is for anything that moves money or runs a job: it is
 * never cached, and it throws when the database cannot be read or a saved
 * value is invalid, so callers fail closed ("do nothing") instead of acting
 * on defaults. Pages that only display a value use getV3SettingsForDisplay()
 * in v3-settings-display.ts.
 */

const money = z.number().int().positive().max(100_000);
const hm = z.string().refine((s) => {
  try {
    parseHm(s);
    return true;
  } catch {
    return false;
  }
}, "Use HH:MM, 24-hour");

/** Monday job times must fall between 1:00 AM and 11:00 AM (the cron window, plan: The weekly jobs). */
const jobTime = hm.refine((s) => parseHm(s) >= 60 && parseHm(s) <= 660, "Between 01:00 and 11:00");

/**
 * The Wednesday stats email goes out after this Toronto time. 08:00 to 12:00 fits inside the
 * cron window (12:00 to 18:00 UTC) in both summer and winter time (B2 plan: The Wednesday stats job).
 * Enforced when saving only: a stored time outside the window loads as the default, so it can
 * never make every job that reads the settings fail closed.
 */
const inStatsWindow = (s: string) => parseHm(s) >= 480 && parseHm(s) <= 720;
const statsTime = hm.refine(inStatsWindow, "Between 08:00 and 12:00");

export const v3Schema = z
  .object({
    priceUsd: money,
    priceCad: money,
    priceRunUsd: money,
    priceRunCad: money,
    priceHigherUsd: money,
    priceHigherCad: money,
    freeRuns: z.number().int().min(0).max(10),
    trialCloseDays: z.number().int().min(1).max(90),
    forgivenMissesPerMonth: z.number().int().min(0).max(4),
    // A cutoff in the small hours would land in the hour a clock change skips or repeats.
    runCutoff: hm.refine((s) => parseHm(s) >= 18 * 60, "Sunday evening, 18:00 or later"),
    coraAt: jobTime,
    chargeAt: jobTime,
    sendAt: jobTime,
    statsAt: hm,
    zackDefaultSchedule: hm,
    playbookPreface: z.string().trim().min(1).max(2000),
    retentionDays: z.number().int().min(30).max(3650),
    signupOpen: z.boolean(),
    cycleLive: z.boolean(),
    // B2 per-feature switches. Each also sits behind signupOpen / cycleLive (B2 origin R2).
    referralsOn: z.boolean(),
    leaderboardOn: z.boolean(),
    statsOn: z.boolean(),
    sponsorsOn: z.boolean(),
    sessionDay: z.string().max(40),
    sessionTime: z.string().max(40),
    sessionLink: z.union([z.literal(""), z.url()]),
    recencyWeights: z.object({
      recentWeeks: z.number().int().min(1),
      recent: z.number().min(0).max(1),
      midWeeks: z.number().int().min(1),
      mid: z.number().min(0).max(1),
      old: z.number().min(0).max(1),
      retireWeeks: z.number().int().min(1),
    }),
  })
  .refine((s) => parseHm(s.coraAt) < parseHm(s.chargeAt) && parseHm(s.chargeAt) < parseHm(s.sendAt), {
    message: "Cora, then charge, then send",
  });

export type V3Settings = z.infer<typeof v3Schema>;
export type V3Key = keyof V3Settings;

export const V3_PREFIX = "v3.";
/** When v3.cycleLive was first switched on (not a setting: mergeV3 ignores it). */
export const CYCLE_LIVE_SINCE = "v3.cycleLiveSince";

/**
 * Overlay saved rows on the defaults and validate the result. Throws on an invalid value,
 * except a well-formed statsAt outside 08:00 to 12:00, which falls back to the default.
 */
export function mergeV3(rows: { key: string; value: unknown }[]): V3Settings {
  const out: Record<string, unknown> = structuredClone(v3Defaults) as Record<string, unknown>;
  for (const r of rows) {
    if (!r.key.startsWith(V3_PREFIX)) continue;
    const name = r.key.slice(V3_PREFIX.length);
    if (Object.hasOwn(v3Defaults, name)) out[name] = r.value;
  }
  const s = v3Schema.parse(out);
  return inStatsWindow(s.statsAt) ? s : { ...s, statsAt: v3Defaults.statsAt };
}

export class SettingsUnavailable extends Error {}

/** The current v3 settings, uncached. Throws SettingsUnavailable when they cannot be trusted. */
export async function readV3Settings(): Promise<V3Settings> {
  if (!hasDb()) throw new SettingsUnavailable("No database configured.");
  let rows: { key: string; value: unknown }[];
  try {
    rows = (await sql`select key, value from settings where key like 'v3.%'`) as { key: string; value: unknown }[];
  } catch (e) {
    throw new SettingsUnavailable(`Could not read settings: ${(e as Error).message}`);
  }
  try {
    return mergeV3(rows);
  } catch (e) {
    throw new SettingsUnavailable(`A saved v3 setting is invalid: ${(e as Error).message}`);
  }
}

/** Validate and save some v3 settings. Throws (and saves nothing) if the result would be invalid. */
export async function saveV3Settings(patch: Partial<V3Settings>): Promise<void> {
  if (patch.statsAt !== undefined) statsTime.parse(patch.statsAt);
  const current = await readV3Settings();
  const next = v3Schema.parse({ ...current, ...patch });
  const keys = (Object.keys(patch) as V3Key[]).filter((k) => patch[k] !== undefined);
  if (!keys.length) return;
  // One statement: either every key is saved or none is, so a half-saved set can never
  // break a rule that spans keys (such as Cora before charge before send).
  await sql`insert into settings (key, value, updated_at)
            select k, v::jsonb, now() from unnest(${keys.map((k) => V3_PREFIX + k)}::text[], ${keys.map((k) => JSON.stringify(next[k]))}::text[]) as t(k, v)
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
  // The first time the cycle goes live is recorded once and never moved (the trial clock starts
  // there at the earliest, src/lib/housekeeping/trial.ts). Turning it off and on again changes nothing.
  if (next.cycleLive) await sql`insert into settings (key, value) values (${CYCLE_LIVE_SINCE}, to_jsonb(now())) on conflict (key) do nothing`;
}

// The defaults must satisfy the type; a mistake here fails the build, not a page.
const _defaultsFit: V3Settings = { ...v3Defaults, recencyWeights: { ...v3Defaults.recencyWeights } };
void _defaultsFit;
