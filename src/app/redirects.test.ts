import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * Peter's decision of November 26, 2026: /hampton, /rlp and /founders are
 * deleted and /zack is the single address for running Zack. Links already
 * sent to people must still land on the tool, so each old address answers
 * with a permanent redirect.
 */
describe("the redirect list", () => {
  it("sends /hampton, /rlp and /founders to /zack, permanently", async () => {
    const list = await nextConfig.redirects!();
    for (const source of ["/hampton", "/rlp", "/founders"]) {
      expect(list.filter((r) => r.source === source), source).toEqual([{ source, destination: "/zack", permanent: true }]);
    }
  });

  it("matches those three addresses exactly, so /rlpsignature is untouched", async () => {
    const list = await nextConfig.redirects!();
    // A source with no ":" or "*" matches one path only.
    for (const r of list) expect(r.source, r.source).toMatch(/^\/[a-z]+$/);
    expect(list.map((r) => r.source)).not.toContain("/rlpsignature");
    expect(list.map((r) => r.source)).not.toContain("/zack");
    // No redirect leads to an address that is itself redirected.
    for (const r of list) expect(list.map((x) => x.source), r.source).not.toContain(r.destination);
  });

  it("has no route left at a redirected address, and keeps /rlpsignature and /zack", () => {
    const route = (name: string) => existsSync(path.join(process.cwd(), "src/app", name));
    for (const name of ["hampton", "rlp", "founders"]) expect(route(name), name).toBe(false);
    expect(route("rlpsignature/page.tsx")).toBe(true);
    expect(route("zack/page.tsx")).toBe(true);
  });
});
