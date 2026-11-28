import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every "use cache" function in src: its body has no try/catch and no .catch.
 * A failure caught inside a cached function is stored as its answer for the
 * entry's whole lifetime (a stale price, the seed library, the built-in
 * wording), and vitest cannot see it, since "use cache" does nothing here. The
 * fallback belongs in a plain function around the cached one
 * (docs/solutions/runtime-errors/catch-inside-use-cache-stores-the-fallback-2026-11-27.md).
 */
const root = path.join(process.cwd(), "src");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Comments and string contents removed, so a word in either is not read as code. Template literals keep their ${} parts. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
}

/** The body of each function that starts with the directive: from the directive to its closing brace. */
function cachedBodies(code: string): string[] {
  const out: string[] = [];
  const marker = /["']use cache(?:: *[a-z]+)?["'];?/g;
  for (let m = marker.exec(code); m; m = marker.exec(code)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < code.length && depth > 0; i++) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") depth--;
    }
    out.push(code.slice(m.index, i));
  }
  return out;
}

describe('"use cache" functions', () => {
  const files = sources(root).filter((f) => /["']use cache/.test(readFileSync(f, "utf8")));

  it("exist (the scan finds them)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [path.relative(process.cwd(), f).replace(/\\/g, "/"), f]))("%s catches nothing inside a cached function", (_name, file) => {
    // Directives are found before strings are blanked; the bodies are then read without comments or strings.
    const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const body of cachedBodies(raw)) {
      expect(codeOnly(body), body.slice(0, 120)).not.toMatch(/\btry\s*\{|\bcatch\b/);
    }
  });
});
