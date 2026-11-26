/**
 * Renders a page or layout to its complete markup, waiting for async server
 * components and Suspense children the way a prerender does.
 *
 * The caller mocks next/navigation, next/headers, next/cache and
 * next/font/google; nothing here knows about a request.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ReactNode } from "react";
import { prerender } from "react-dom/static";
import { expect } from "vitest";

export async function pageMarkup(el: ReactNode): Promise<string> {
  const errors: unknown[] = [];
  const { prelude } = await prerender(el, { onError: (e) => void errors.push(e) });
  const text = await new Response(prelude).text();
  if (errors.length > 0) throw errors[0];
  return text;
}

/** One tag per line, so a changed fixture reads as a diff. */
const lines = (markup: string) => `${markup.replace(/\r\n/g, "\n").replace(/></g, ">\n<")}\n`;

/**
 * Compares markup with a committed fixture file. A missing fixture fails;
 * UPDATE_FIXTURES=1 writes them, which is only right when the change in output is intended.
 * An update run never passes: it refuses to write in CI, and anywhere else it
 * fails after writing, so the fixtures are always proven by a second run without the flag.
 */
export function expectFixture(file: string, markup: string) {
  const got = lines(markup);
  if (process.env.UPDATE_FIXTURES === "1") {
    if (process.env.CI) throw new Error(`UPDATE_FIXTURES=1 is refused in CI: ${file} was not written. Fixtures are rewritten locally and committed.`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, got);
    throw new Error(`UPDATE_FIXTURES=1 rewrote ${file}. Fixtures were rewritten, so this run proves nothing: run the tests again without the flag.`);
  }
  expect(existsSync(file), `fixture ${file} is missing`).toBe(true);
  // Compared as a boolean first: a mismatch in a page this size would print the whole page twice.
  const want = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (got !== want) expect(firstDifference(got, want), `markup differs from ${file}`).toBe("");
}

function firstDifference(got: string, want: string) {
  const a = got.split("\n");
  const b = want.split("\n");
  const i = a.findIndex((line, n) => line !== b[n]);
  const at = i === -1 ? a.length : i;
  return `line ${at + 1}\n  rendered: ${a[at] ?? "(end)"}\n  fixture:  ${b[at] ?? "(end)"}`;
}
