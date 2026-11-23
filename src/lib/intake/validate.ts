import { z } from "zod";

/** The fixed category list (Zack 2.0 "Facts for Cora", spec B.5). */
export const ZACK_CATEGORIES = [
  "Marketing",
  "Research",
  "Builds",
  "Sales",
  "Operations",
  "Email and calendar",
  "Listings",
  "Client follow-up",
  "Personal errands",
] as const;
export type ZackCategory = (typeof ZACK_CATEGORIES)[number];

/** A figure the report does not state is stored as missing (null), never invented. */
const figure = (max: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : v), z.number().min(0).max(max).nullable());
const text = (max: number) => z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(max));
const oneOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return null;
    const hit = values.find((x) => x.toLowerCase() === v.trim().toLowerCase());
    return hit ?? v;
  }, z.enum(values).nullable());

/** Field names from the spec's sample block, accepted as the Zack 2.0 names. */
function aliases(v: unknown, map: Record<string, string>): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const o = { ...(v as Record<string, unknown>) };
  for (const [from, to] of Object.entries(map)) if (o[to] === undefined && o[from] !== undefined) o[to] = o[from];
  return o;
}

export const playSchema = z.preprocess((v) => aliases(v, { paste_to_install: "install_notes" }), z.object({
  set: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), z.enum(["A", "B"])),
  title: z.string().trim().min(1, "a play has no title").max(160),
  category: z.preprocess(
    (v) => (typeof v === "string" ? (ZACK_CATEGORIES.find((c) => c.toLowerCase() === v.trim().toLowerCase()) ?? v) : v),
    z.enum(ZACK_CATEGORIES, { message: "a category that is not on the list" }),
  ),
  job: text(400),
  description: text(1200),
  origin: text(40),
  roger_idea_id: text(80),
  minutes_saved_each: figure(24 * 60),
  runs_week: figure(500),
  current_hours_week: figure(100),
  // Zack's own formula (manual × 0.7 − member) goes below zero for small plays; that means "none".
  range_low: z.preprocess((v) => (typeof v === "number" && v < 0 ? 0 : v), figure(100)),
  range_high: figure(100),
  basis: oneOf(["Actual", "Implied"] as const),
  basis_note: text(400),
  confidence: oneOf(["High", "Medium", "Low"] as const),
  weeks_running: figure(520),
  heavy_runs_week: figure(500),
  heavy_hours_week: figure(100),
  heavy_use_for: text(300),
  who_can_use_it: text(400),
  requires: z
    .preprocess(
      (v) => v ?? {},
      z.object({
        connections: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.string().max(80)).max(20)),
        features: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.string().max(80)).max(20)),
        site_logins: figure(50),
      }),
    )
    .default({ connections: [], features: [], site_logins: null }),
  size: z
    .preprocess((v) => v ?? {}, z.object({ steps: figure(200), connections: figure(50), setup_questions: figure(50) }))
    .default({ steps: null, connections: null, setup_questions: null }),
  acts: text(40),
  best_trick: text(400),
  working: text(600),
  sensitive: z.preprocess((v) => v === true, z.boolean()),
  outline_only: z.preprocess((v) => v === true, z.boolean()),
  playbook_md: text(40_000),
  install_notes: text(8_000),
}));
export type Play = z.infer<typeof playSchema>;

export const runSchema = z.preprocess((v) => aliases(v, { runners_up: "also_runs" }), z.object({
  zack_version: text(10),
  agent: text(40),
  week_ending: text(20),
  plays: z.array(playSchema).max(4, "more than four plays"),
  also_runs: z
    .preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.object({ title: text(160), category: text(60), job: text(400), runs_this_week: figure(500) })).max(60))
    .default([]),
  // Counts are numbers only; anything else in them is dropped.
  counts: z
    .preprocess(
      (v) => (v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === "number" && Number.isFinite(n))) : {}),
      z.record(z.string().max(60), z.number()),
    )
    .default({}),
}));
export type ParsedRun = z.infer<typeof runSchema>;

export type Validated = { ok: true; run: ParsedRun } | { ok: false; reason: string };

/** Spec B.6 step 3. The reason is shown to the user on /app/zack, so it is plain words. */
export function validateRun(input: unknown): Validated {
  const r = runSchema.safeParse(input);
  if (r.success) {
    const sets = r.data.plays.map((p) => p.set);
    if (sets.filter((s) => s === "A").length > 2 || sets.filter((s) => s === "B").length > 2) {
      return { ok: false, reason: "Zack's report has more than two plays in one set. Ask Zack to run again with the current instructions." };
    }
    for (const p of r.data.plays) {
      if (p.range_low != null && p.range_high != null && p.range_low > p.range_high) {
        return { ok: false, reason: `In "${p.title}", the low end of the hours range is above the high end.` };
      }
    }
    return { ok: true, run: r.data };
  }
  const first = r.error.issues[0];
  const where = first.path[0] === "plays" && typeof first.path[1] === "number" ? `play ${first.path[1] + 1}` : String(first.path.join(".") || "the report");
  const what = first.code === "too_big" ? "a number out of range or text that is too long" : first.message;
  return { ok: false, reason: `Zack's report could not be read: ${where} has ${what}. Ask Zack to run again with the current instructions.` };
}
