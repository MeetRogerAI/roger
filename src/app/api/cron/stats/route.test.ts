import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAST_RUN_UTC, type StatsDeps } from "@/lib/growth/stats-job";

let calls: StatsDeps[] = [];
let jobThrows = false;
vi.mock("@/lib/growth/stats-job", async (orig) => ({
  ...(await orig<typeof import("@/lib/growth/stats-job")>()),
  runStatsJob: async (_q: unknown, d: StatsDeps) => {
    if (jobThrows) throw new Error("job failed");
    calls.push(d);
    return { date: "2026-12-16", status: "done" };
  },
}));
vi.mock("@/lib/db-query", () => ({ query: async () => [] }));
let markedNonProduction = true;
vi.mock("@/lib/db-environment", () => ({ databaseMarkedNonProduction: async () => markedNonProduction }));
vi.mock("@/lib/v3-settings", async (orig) => {
  const actual = await orig<typeof import("@/lib/v3-settings")>();
  return { ...actual, readV3Settings: async () => actual.mergeV3([]) };
});

const { GET } = await import("./route");
const get = (qs = "", auth = "Bearer cron-secret") => GET(new Request(`http://localhost:3000/api/cron/stats${qs}`, { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  calls = [];
  jobThrows = false;
  markedNonProduction = true;
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("STRIPE_SECRET_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/cron/stats", () => {
  it("answers 401 without Vercel's secret", async () => {
    expect((await get("", "")).status).toBe(401);
    expect((await get("", "Bearer wrong")).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("sends by default, and only checks with ?check=1", async () => {
    expect((await get()).status).toBe(200);
    expect((await get("?check=1")).status).toBe(200);
    expect(calls.map((c) => c.mode)).toEqual(["send", "check"]);
    expect(calls[0].dryRun).toBe(false);
  });

  it("refuses an as-of time or a dry run on production (400), and accepts them on a preview with a test database", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await get("?asOf=2026-12-16T14:00:00Z")).status).toBe(400);
    expect((await get("?dryRun=1")).status).toBe(400);
    vi.stubEnv("VERCEL_ENV", "preview");
    markedNonProduction = false;
    expect((await get("?dryRun=1")).status).toBe(400);
    expect(calls).toEqual([]);
    markedNonProduction = true;
    expect((await get("?asOf=2026-12-16T14:00:00Z&dryRun=1")).status).toBe(200);
    expect(calls[0]).toMatchObject({ dryRun: true, now: new Date("2026-12-16T14:00:00Z") });
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

describe("the stats schedule (vercel.json)", () => {
  const crons = (JSON.parse(readFileSync(new URL("../../../../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] }).crons;

  it("ends its sending runs at LAST_RUN_UTC, Wednesdays only", () => {
    const send = crons.find((c) => c.path === "/api/cron/stats")!;
    const [minute, hour, , , dow] = send.schedule.split(" ");
    expect(dow).toBe("3");
    const step = Number(minute.replace("*/", ""));
    const lastHour = Number(hour.split("-")[1]);
    const lastMinute = Math.floor(59 / step) * step;
    expect(lastHour * 60 + lastMinute).toBe(LAST_RUN_UTC);
  });

  it("has the 18:00 UTC check run on Wednesdays", () => {
    expect(crons).toContainEqual({ path: "/api/cron/stats-check", schedule: "0 18 * * 3" });
  });
});
