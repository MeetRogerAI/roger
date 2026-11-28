/**
 * The bar on an admin's preview of the drafts (plan U9, R14): what it says,
 * and that "Exit preview" is a form and never a link, since a link can be
 * prefetched and a prefetch would end the preview unasked. Whether it is
 * shown at all is the content reader's answer: the pages test renders every
 * page through the root layout with and without the preview.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PREVIEW_EXIT_ADDRESS, PreviewBar } from "./preview-bar";

const markup = renderToStaticMarkup(<PreviewBar />);
const words = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the preview bar", () => {
  it("says the page shows unpublished drafts and that visitors see the published site", () => {
    expect(words).toContain("Preview: you are seeing unpublished drafts. Visitors see the published site.");
    expect(markup).toContain('role="status"');
    expect(markup).toMatch(/^<aside data-preview-bar="true" aria-label="Preview"/);
  });

  it("ends the preview with a form that posts, not a link", () => {
    expect(PREVIEW_EXIT_ADDRESS).toBe("/admin/pages/preview/exit");
    const exit = /<form[^>]*>[\s\S]*?<\/form>/.exec(markup)![0];
    expect(exit).toContain('method="post"');
    expect(exit).toContain(`action="${PREVIEW_EXIT_ADDRESS}"`);
    expect(exit).toMatch(/<button type="submit"[^>]*>Exit preview<\/button>/);
    expect(markup).not.toContain(`href="${PREVIEW_EXIT_ADDRESS}"`);
    // The exit route exists, and answers a POST only.
    const route = readFileSync(path.join(process.cwd(), "src/app/admin/pages/preview/exit/route.ts"), "utf8");
    expect(route).toMatch(/export async function POST/);
    expect(route).not.toMatch(/export async function GET/);
  });

  it("goes back to Pages by a link that is not prefetched, and keeps no state of its own, so the server markup is what hydrates", () => {
    expect(markup).toContain('href="/admin/pages"');
    expect(words).toContain("Back to Pages");
    const source = readFileSync(path.join(process.cwd(), "src/components/site/preview-bar.tsx"), "utf8");
    expect(source).not.toMatch(/"use client"|useState|useEffect|onClick/);
  });

  it("leaves room at the foot of the window, so a link or field brought into view by Tab is not left under the bar", () => {
    // The bar is pinned to the foot of the window and is 122px tall on a 375px phone, where its words wrap (U9 review).
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const rule = /html:has\(\[data-preview-bar\]\) \{\s*scroll-padding-bottom: (\d+)px;\s*\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(Number(rule![1])).toBeGreaterThanOrEqual(122);
    expect(markup).toMatch(/^<aside[^>]*class="[^"]*\bsticky bottom-0\b/);
  });

  it("styles only its own wrapper", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/site/preview-bar.tsx"), "utf8");
    expect(source).not.toMatch(/<style|:root|:has\(/);
  });
});
