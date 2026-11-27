import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { normalizeAppPath } from "next/dist/shared/lib/router/utils/app-paths";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { INSTRUCTION_FILES } from "./version";

/*
 * Bundling is checked by a test, not by memory (B3 plan Unit 2). Every app entry point whose
 * imports reach src/lib/instructions/version.ts reads instruction files from disk at runtime, so
 * on Vercel the files must be traced into that function: next.config.ts outputFileTracingIncludes
 * needs a key matching the route whose globs cover every file version.ts can hash. Matching is
 * done the way Next does it (collect-build-traces.js: picomatch with dot and contains, against
 * normalizeAppPath of the entry).
 */

const root = path.resolve(__dirname, "../../..");
const VERSION = "src/lib/instructions/version.ts";
const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch") as (glob: string | string[], o?: { dot?: boolean; contains?: boolean }) => (s: string) => boolean;

type Read = (file: string) => string | null;
const fromDisk: Read = (file) => (existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), "utf8") : null);

/** Static and dynamic imports and re-exports of a module, type-only ones left out (they are erased). */
function specifiers(text: string): string[] {
  const out: string[] = [];
  const re = /\b(?:import|export)\s+(type\s+)?(?:[^'"`;]*?\sfrom\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of text.matchAll(re)) {
    if (m[1]) continue;
    out.push(m[2] ?? m[3]);
  }
  return out;
}

function resolve(from: string, spec: string, read: Read): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.posix.join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.posix.join(path.posix.dirname(from), spec);
  else return null; // a package
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (/\.(ts|tsx|mjs|js)$/.test(c) && read(c) !== null) return c;
  }
  return null;
}

/** Whether the import graph from `entry` reaches version.ts. */
function reachesVersion(entry: string, read: Read = fromDisk): boolean {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!;
    if (f === VERSION) return true;
    if (seen.has(f)) continue;
    seen.add(f);
    const text = read(f);
    if (text === null) continue;
    for (const s of specifiers(text)) {
      const r = resolve(f, s, read);
      if (r && !seen.has(r)) todo.push(r);
    }
  }
  return false;
}

/**
 * The route an outputFileTracingIncludes key is matched against, for an entry file under src/app:
 * the route path, as the Next docs describe it ("/api/hello", "/products/[id]"). The webpack build
 * matches against "/app" + that path with contains, which every key matching this form also matches.
 */
function routeOf(entry: string): string {
  return normalizeAppPath(entry.replace(/^src\/app\//, "").replace(/\.(ts|tsx)$/, ""));
}

/** The instruction files a route's includes leave out. */
function uncovered(route: string, includes: Record<string, string[]>): string[] {
  const globs = Object.entries(includes)
    .filter(([key]) => picomatch(key, { dot: true, contains: true })(route))
    .flatMap(([, g]) => g.map((x) => x.replace(/\\/g, "/").replace(/^\.\//, "")));
  if (!globs.length) return [...INSTRUCTION_FILES];
  const covers = picomatch(globs, { dot: true });
  return INSTRUCTION_FILES.filter((f) => !covers(f));
}

function entries(dir = "src/app"): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) => {
    const p = `${dir}/${d.name}`;
    if (d.isDirectory()) return entries(p);
    return /^(route\.ts|page\.tsx)$/.test(d.name) ? [p] : [];
  });
}

const includes = nextConfig.outputFileTracingIncludes ?? {};

describe("outputFileTracingIncludes covers every entry point that hashes instruction files", () => {
  const reaching = entries().filter((e) => reachesVersion(e));

  it("finds the entry points that stamp versions", () => {
    for (const e of ["src/app/api/zack/instructions/route.ts", "src/app/api/zack/runs/route.ts", "src/app/api/cron/cora/route.ts"]) expect(reaching).toContain(e);
  });

  it("bundles content/zack and content/cora for each of them", () => {
    const missing = reaching.map((e) => [e, routeOf(e), uncovered(routeOf(e), includes)] as const).filter(([, , m]) => m.length);
    expect(missing).toEqual([]);
  });

  it("fails for an entry point that imports version.ts without a matching include", () => {
    const fixture: Record<string, string> = {
      "src/app/fixture-only/route.ts": 'import { helper } from "./helper";\nexport const GET = helper;',
      "src/app/fixture-only/helper.ts": 'import type { X } from "@/lib/types-only";\nexport { fileVersion as helper } from "@/lib/instructions/version";',
      [VERSION]: "",
    };
    const read: Read = (f) => fixture[f] ?? null;
    expect(reachesVersion("src/app/fixture-only/route.ts", read)).toBe(true);
    expect(uncovered(routeOf("src/app/fixture-only/route.ts"), includes)).toEqual([...INSTRUCTION_FILES]);
    // A type-only import is erased, so it does not count.
    expect(reachesVersion("src/app/typed/route.ts", (f) => ({ "src/app/typed/route.ts": 'import type { InstructionFile } from "@/lib/instructions/version";' })[f] ?? null)).toBe(false);
  });

  it("reads routes the way Next does", () => {
    expect(routeOf("src/app/admin/users/[id]/page.tsx")).toBe("/admin/users/[id]");
    expect(routeOf("src/app/api/cron/cora/route.ts")).toBe("/api/cron/cora");
    expect(routeOf("src/app/(site)/start/page.tsx")).toBe("/start");
  });
});
