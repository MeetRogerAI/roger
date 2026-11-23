import { describe, expect, it } from "vitest";
import type { RunListRow } from "./settings";
import { statusLines } from "./status";

const run = (o: Partial<RunListRow>): RunListRow => ({ id: "r", week_of: "2026-11-30", route: "connector", status: "accepted", reason: "", is_test: false, plays: 2, received_at: "2026-11-29T23:00:00Z", ...o });
const base = { keyPrefix: "rgr_zk_abcd", keyCreatedAt: "2026-11-20T00:00:00Z", sharing: "share" as const, when: (s: string) => s.slice(0, 10) };

describe("statusLines", () => {
  it("says not connected without a key, even with an uploaded report", () => {
    const l = statusLines({ ...base, keyPrefix: "", keyCreatedAt: null, runs: [run({ route: "upload" })] });
    expect(l[0]).toMatch(/^Not connected yet: make your key/);
    expect(l[1]).toBe("Last report: 2026-11-29, uploaded, 2 plays.");
  });

  it("says 'Connected: test received' once, for a test sent with this key", () => {
    const l = statusLines({ ...base, runs: [run({ is_test: true })] });
    expect(l.filter((x) => x.startsWith("Connected"))).toEqual(["Connected: test received."]);
  });

  it("does not count reports sent with an older key, or uploads", () => {
    expect(statusLines({ ...base, keyCreatedAt: "2026-11-30T00:00:00Z", runs: [run({})] })[0]).toMatch(/^Not connected yet: paste/);
    expect(statusLines({ ...base, runs: [run({ route: "upload" })] })[0]).toMatch(/^Not connected yet/);
    expect(statusLines({ ...base, runs: [run({})] })[0]).toBe("Connected.");
  });

  it("picks the latest real report by arrival, and says nothing is expected with Zack off", () => {
    const l = statusLines({ ...base, sharing: "off", runs: [run({ received_at: "2026-11-22T00:00:00Z", plays: 1 }), run({ received_at: "2026-11-29T23:00:00Z", plays: 3 })] });
    expect(l).toContain("Last report: 2026-11-29, sent by Zack, 3 plays.");
    expect(l.at(-1)).toBe("Zack is off, so no report is expected.");
  });
});
