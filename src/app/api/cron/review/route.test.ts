import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE_TICK_UTC, FIRST_TICK_UTC, LAST_TICK_UTC, type ReviewJobDeps } from "@/lib/review/job";

let calls: ReviewJobDeps[] = [];
let jobThrows = false;
vi.mock("@/lib/review/job", async (orig) => ({
  ...(await orig<typeof import("@/lib/review/job")>()),
  runReviewJob: async (_q: unknown, d: ReviewJobDeps) => {
    if (jobThrows) throw new Error("job failed");
    calls.push(d);
    return { week: "2026-11-23", status: "done" };
  },
}));
vi.mock("@/lib/db-query", () => ({ query: async () => [] }));
let markedNonProduction = true;
vi.mock("@/lib/db-environment", () => ({ databaseMarkedNonProduction: async () => markedNonProduction }));
vi.mock("@/lib/v3-settings", async (orig) => {
  const actual = await orig<typeof import("@/lib/v3-settings")>();
  return { ...actual, readV3Settings: async () => actual.mergeV3([]) };
});

const { GET, maxDuration } = await import("./route");
const get = (qs = "", auth = "Bearer cron-secret") => GET(new Request(`http://localhost:3000/api/cron/review${qs}`, { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  calls = [];
  jobThrows = false;
  markedNonProduction = true;
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("STRIPE_SECRET_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/cron/review", () => {
  it("answers 401 without Vercel's secret", async () => {
    expect((await get("", "")).status).toBe(401);
    expect((await get("", "Bearer wrong")).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("runs the scheduled job with the gateway model, and allows 300 seconds", async () => {
    expect((await get()).status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ trigger: "schedule", dryRun: false });
    expect(calls[0].model.name).toMatch(/^anthropic\//);
    expect(maxDuration).toBe(300);
  });

  it("refuses an as-of time or a dry run on production (400), and accepts them on a preview with a test database", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await get("?asOf=2026-11-27T15:15:00Z")).status).toBe(400);
    expect((await get("?dryRun=1")).status).toBe(400);
    vi.stubEnv("VERCEL_ENV", "preview");
    markedNonProduction = false;
    expect((await get("?dryRun=1")).status).toBe(400);
    expect(calls).toEqual([]);
    markedNonProduction = true;
    expect((await get("?asOf=2026-11-27T15:15:00Z&dryRun=1")).status).toBe(200);
    expect(calls[0]).toMatchObject({ dryRun: true, now: new Date("2026-11-27T15:15:00Z") });
  });

  it("answers 500 when the job throws", async () => {
    jobThrows = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await get()).status).toBe(500);
    } finally {
      err.mockRestore();
    }
  });
});

/** The values a cron field allows, within [lo, hi]: `*`, `*\/n`, `a-b`, `a,b` and plain numbers. */
function expand(field: string, lo: number, hi: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [range, step = "1"] = part.split("/");
    const [a, b] = range === "*" ? [lo, hi] : range.includes("-") ? range.split("-").map(Number) : [Number(range), range === part ? Number(range) : hi];
    for (let v = a; v <= b; v += Number(step)) out.add(v);
  }
  return out;
}
const overlaps = (x: Set<number>, y: Set<number>) => [...x].some((v) => y.has(v));

describe("the review schedule (vercel.json)", () => {
  const crons = (JSON.parse(readFileSync(new URL("../../../../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] }).crons;
  const reviews = crons.filter((c) => c.path === "/api/cron/review" || c.path === "/api/cron/review-close");
  const ticksOf = (schedule: string) => {
    const [minute, hour, dom, month, dow] = schedule.split(" ");
    expect([dom, month, [...expand(dow, 0, 6)]]).toEqual(["*", "*", [5]]);
    return [...expand(hour, 0, 23)].flatMap((h) => [...expand(minute, 0, 59)].map((m) => h * 60 + m));
  };

  it("ticks on Fridays from FIRST_TICK_UTC to LAST_TICK_UTC, then once at CLOSE_TICK_UTC on the same path", () => {
    expect(reviews).toEqual([
      { path: "/api/cron/review", schedule: "15,45 14-16 * * 5" },
      { path: "/api/cron/review-close", schedule: "15 17 * * 5" },
    ]);
    const ticks = ticksOf(reviews[0].schedule);
    expect(Math.min(...ticks)).toBe(FIRST_TICK_UTC);
    expect(Math.max(...ticks)).toBe(LAST_TICK_UTC);
    expect(ticksOf(reviews[1].schedule)).toEqual([CLOSE_TICK_UTC]);
    // The close tick is outside the window (from 17:00), so the job only closes it.
    expect(CLOSE_TICK_UTC).toBeGreaterThanOrEqual(17 * 60);
  });

  it("shares no day with the Monday and Wednesday schedules, and no minute with any other cron on a Friday", () => {
    const fields = (s: string) => {
      const [minute, hour, , , dow] = s.split(" ");
      return { minutes: expand(minute, 0, 59), hours: expand(hour, 0, 23), days: expand(dow, 0, 6) };
    };
    for (const review of reviews) {
      const r = fields(review.schedule);
      for (const c of crons.filter((x) => x.path !== review.path)) {
        const o = fields(c.schedule);
        if (!overlaps(o.days, r.days)) continue;
        // A cron that also runs on Fridays (daily or hourly) never fires in the same minute.
        expect(overlaps(o.hours, r.hours) && overlaps(o.minutes, r.minutes), `${c.path} ${c.schedule} vs ${review.schedule}`).toBe(false);
      }
      for (const weekly of crons.filter((c) => c.schedule.split(" ")[4] !== "*" && !c.path.startsWith("/api/cron/review"))) {
        expect(overlaps(fields(weekly.schedule).days, r.days), weekly.path).toBe(false);
      }
    }
  });
});
