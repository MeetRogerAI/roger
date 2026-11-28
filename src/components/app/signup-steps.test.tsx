import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignupSteps } from "./signup-steps";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("SignupSteps", () => {
  it("names the step, fills the bar and marks the current step", () => {
    const html = renderToStaticMarkup(<SignupSteps current={3} />);
    expect(text(html)).toContain("Step 3 of 4");
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="3"/);
    expect(html).toContain("width:75%");
    const here = html.match(/<li aria-current="step"[^>]*>.*?<\/li>/)?.[0] ?? "";
    expect(text(here).trim()).toBe("Product and Pricing");
    expect(text(html)).toContain("Questions (done)");
    expect(text(html)).toContain("Your account (done)");
    expect(html).not.toContain("<a");
  });

  it("links back, and to earlier steps that can still be changed", () => {
    const html = renderToStaticMarkup(<SignupSteps current={2} back={{ href: "/start", label: "Back to the questions" }} links={{ 1: "/start" }} />);
    expect(html.match(/href="\/start"/g)).toHaveLength(2);
    expect(text(html)).toContain("Back to the questions");
  });

  it("Payment links back to the first list (no 'Not now')", () => {
    const html = renderToStaticMarkup(<SignupSteps current={4} back={{ href: "/app", label: "Back to your first Cora Curation" }} />);
    expect(html).toContain('href="/app"');
    expect(html).toContain("width:100%");
  });
});
