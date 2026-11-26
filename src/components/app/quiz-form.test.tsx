import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/start/actions", () => ({ submitQuiz: async () => ({ status: "idle" }) }));

const { QuizForm } = await import("./quiz-form");

describe("QuizForm, one question per screen", () => {
  const html = renderToStaticMarkup(
    <QuizForm params={{ path: null, cur: "USD", ref: null, zack: null, utm: "" } as never} agents={[{ value: "claude", label: "Claude" }]} categories={["Listings"]} />,
  );
  const fieldsets = html.match(/<fieldset[^>]*>/g) ?? [];

  it("keeps all seven questions in the form and shows only the first", () => {
    expect(fieldsets).toHaveLength(7);
    expect(fieldsets[0]).not.toContain("hidden");
    for (const f of fieldsets.slice(1)) expect(f).toContain("hidden");
  });

  it("starts the progress bar at question 1 of 7, with Next and no Back", () => {
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain("Question 1 of 7");
    expect(html).toContain(">Next<");
    expect(html).not.toContain(">Back<");
    expect(html).not.toContain('type="submit"');
  });
});
