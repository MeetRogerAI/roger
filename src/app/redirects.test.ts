import { existsSync, readFileSync } from "node:fs";
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

  // Peter's decision of November 27, 2026: /pricing and /agents are deleted. The price is a section of the homepage.
  it("sends /pricing to the homepage's price section and /agents to the homepage, permanently", async () => {
    const list = await nextConfig.redirects!();
    expect(list.filter((r) => r.source === "/pricing")).toEqual([{ source: "/pricing", destination: "/#price", permanent: true }]);
    expect(list.filter((r) => r.source === "/agents")).toEqual([{ source: "/agents", destination: "/", permanent: true }]);
  });

  // Peter's decision of November 28, 2026: /refunds is deleted. The refund rule is the terms' refunds section, the one main's Payment page link opens.
  it("sends /refunds to the terms' refunds section, permanently, and that section has the id the redirect names", async () => {
    const list = await nextConfig.redirects!();
    expect(list.filter((r) => r.source === "/refunds")).toEqual([{ source: "/refunds", destination: "/terms#roger-monthly", permanent: true }]);
    expect(existsSync(path.join(process.cwd(), "src/app/refunds"))).toBe(false);
    const { siteTerms } = await import("@/data/site/legal");
    expect(siteTerms.sections.find((s) => s.id === "roger-monthly")?.heading).toBe("Refunds and cancelling");
    expect(Object.keys(await import("@/data/legal"))).not.toContain("refunds");
  });

  it("has no /pricing or /agents route, page component or traced files left, and the price section has the id the redirect names", () => {
    const at = (name: string) => existsSync(path.join(process.cwd(), name));
    for (const name of ["src/app/pricing", "src/app/agents", "src/components/site/v1/pricing.tsx", "src/components/site/v1/agents.tsx"]) expect(at(name), name).toBe(false);
    expect(Object.keys(nextConfig.outputFileTracingIncludes ?? {})).not.toContain("/agents");
    const block = readFileSync(path.join(process.cwd(), "src/components/site/v1/blocks/price-block.tsx"), "utf8");
    expect(block).toContain('id = "price"');
    // The sticky header must not cover the heading a link lands on: the section has a scroll margin of its own,
    // worked out against the page's scroll padding and the header's height, which are what they were.
    expect(block).toMatch(/<section id=\{id\}[^>]*-scroll-mt-3/);
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("scroll-padding-top: 72px;");
    expect(readFileSync(path.join(process.cwd(), "src/components/site-header.tsx"), "utf8")).toContain('className="wrap flex h-[60px] items-center gap-4 sm:gap-6"');
  });

  it("links to the price section, never to a redirected address, from the header and the footer", () => {
    const chrome = readFileSync(path.join(process.cwd(), "src/lib/site/chrome.ts"), "utf8");
    expect(chrome).toContain('export const PRICE_SECTION_HREF = "/#price";');
    expect(chrome).not.toMatch(/href: "\/(?:pricing|agents)"/);
  });

  it("matches those three addresses exactly, so /rlpsignature is untouched", async () => {
    const list = await nextConfig.redirects!();
    // A source with no ":" or "*" matches one path only.
    for (const r of list) expect(r.source, r.source).toMatch(/^\/[a-z]+$/);
    expect(list.map((r) => r.source)).not.toContain("/rlpsignature");
    expect(list.map((r) => r.source)).not.toContain("/zack");
    // No redirect leads to an address that is itself redirected.
    for (const r of list) expect(list.map((x) => x.source), r.source).not.toContain(r.destination.split("#")[0]);
  });

  it("has no route left at a redirected address, and keeps /rlpsignature and /zack", () => {
    const route = (name: string) => existsSync(path.join(process.cwd(), "src/app", name));
    for (const name of ["hampton", "rlp", "founders"]) expect(route(name), name).toBe(false);
    expect(route("rlpsignature/page.tsx")).toBe(true);
    expect(route("zack/page.tsx")).toBe(true);
  });
});
