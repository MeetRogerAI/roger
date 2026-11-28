/**
 * Every admin screen reads per request (`await connection()`, behind the login), so a click from one screen to
 * another waits for the server. Under `next dev` Next validated each of them for instant navigation and printed
 * "uncached data ... outside of <Suspense>" on every click; `instant = false` on the page says waiting is meant
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN = path.join(process.cwd(), "src/app/admin");
const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? pages(full) : name === "page.tsx" ? [full] : [];
  });

describe("the admin screens", () => {
  it("each say a navigation into them may wait, when they read per request", () => {
    const perRequest = pages(ADMIN).filter((file) => readFileSync(file, "utf8").includes("await connection()"));
    expect(perRequest.length).toBeGreaterThan(15);
    for (const file of perRequest) expect(readFileSync(file, "utf8"), path.relative(ADMIN, file)).toMatch(/^export const instant = false;$/m);
  });
});
