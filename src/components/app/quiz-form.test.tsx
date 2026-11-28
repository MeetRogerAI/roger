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

describe("QuizForm, back from Step 2", () => {
  const initial = {
    work: "other",
    role: "Broker, residential resale",
    uses: "most_weeks",
    agents: ["claude"],
    agentOther: "",
    primary: "claude",
    count: "1-2",
    level: 3,
    help: ["Listings"],
    software: "often",
  } as const;
  const html = renderToStaticMarkup(
    <QuizForm
      params={{ path: null, cur: "USD", ref: null, zack: null, utm: "" } as never}
      agents={[{ value: "claude", label: "Claude" }]}
      categories={["Listings"]}
      initial={initial as never}
    />,
  );
  const checked = (name: string, value: string) => (html.match(/<input[^>]*>/g) ?? []).some((t) => t.includes(`name="${name}"`) && t.includes(`value="${value}"`) && t.includes("checked"));

  it("fills in every answer already given, so nothing is typed again", () => {
    expect(html).toContain('value="Broker, residential resale"');
    expect(checked("work", "other")).toBe(true);
    expect(checked("uses", "most_weeks")).toBe(true);
    expect(checked("agent", "claude")).toBe(true);
    expect(html).toContain('name="primary" value="claude"');
    expect(checked("count", "1-2")).toBe(true);
    expect(checked("level", "3")).toBe(true);
    expect(checked("help", "Listings")).toBe(true);
    expect(checked("software", "often")).toBe(true);
  });
});
