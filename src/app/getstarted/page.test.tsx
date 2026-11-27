import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";

// The data-backed steps are covered by their own tests; here only the static install step matters.
vi.mock("@/components/app/getstarted-parts", () => ({ GoalForMember: () => null, NextStep: () => null, PublishedSetupStep: () => null }));

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  const { prelude } = await prerender(<Page />);
  return new Response(prelude).text();
}

describe("/getstarted", () => {
  it("links the Grok Bot download from the install step, in a new tab", async () => {
    const out = await html();
    expect(out).toMatch(/<a[^>]*href="https:\/\/x\.ai\/bot"[^>]*>[^<]*Grok Bot site[^<]*<\/a>/);
    expect(out).toMatch(/<a[^>]*href="https:\/\/x\.ai\/bot"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  });
});
