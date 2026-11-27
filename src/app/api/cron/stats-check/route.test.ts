import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StatsDeps } from "@/lib/growth/stats-job";

let calls: StatsDeps[] = [];
let jobThrows = false;
vi.mock("@/lib/growth/stats-job", async (orig) => ({
  ...(await orig<typeof import("@/lib/growth/stats-job")>()),
  runStatsJob: async (_q: unknown, d: StatsDeps) => {
    if (jobThrows) throw new Error("job failed");
    calls.push(d);
    return { date: "2026-12-16", status: "checked" };
  },
}));
vi.mock("@/lib/db-query", () => ({ query: async () => [] }));
vi.mock("@/lib/v3-settings", async (orig) => {
  const actual = await orig<typeof import("@/lib/v3-settings")>();
  return { ...actual, readV3Settings: async () => actual.mergeV3([]) };
});

const { GET } = await import("./route");
const get = (auth = "Bearer cron-secret") => GET(new Request("http://localhost:3000/api/cron/stats-check", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  calls = [];
  jobThrows = false;
  vi.stubEnv("CRON_SECRET", "cron-secret");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/cron/stats-check", () => {
  it("answers 401 without Vercel's secret", async () => {
    expect((await get("")).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("only ever runs the job in check mode (never sends)", async () => {
    expect((await get()).status).toBe(200);
    expect(calls.map((c) => c.mode)).toEqual(["check"]);
  });

  it("answers 500 when the job throws", async () => {
    jobThrows = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get()).status).toBe(500);
  });
});
