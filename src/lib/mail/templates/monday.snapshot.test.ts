import { describe, expect, it } from "vitest";
import { mondayListEmail, type EmailIdea } from "./monday";

/**
 * B3 plan Unit 12: with no upgrade on the list, the Monday email is exactly what B1 sent. The snapshots were
 * written from the template as it was before Unit 12, so a change to a list without an upgrade fails here.
 */
const ideas: EmailIdea[] = [
  { id: "p1", title: "Inbox triage", reason: "Matches something your week still had you doing by hand.", timeLine: "About 3.5 hours a week for people who run it" },
  { id: "p2", title: "Listing post", reason: "Fits the listings work your week shows.", timeLine: null },
  { id: "p3", title: "Calendar prep", reason: "One of the most useful email and calendar plays in the pool this week.", timeLine: "About 1 hours a week for people who run it" },
];

describe("the Monday email without an upgrade is unchanged", () => {
  it.each([
    ["three ideas", () => mondayListEmail({ week: "2026-11-30", ideas, status: "Your next list comes Monday." })],
    ["two ideas", () => mondayListEmail({ week: "2026-11-30", ideas: ideas.slice(0, 2), status: "Your next list comes Monday." })],
    ["one idea, with a receipt", () => mondayListEmail({ week: "2026-11-30", ideas: ideas.slice(0, 1), status: "s", receipt: { url: "https://example.com/r" } })],
  ])("%s", (_, make) => {
    const m = make();
    expect({ subject: m.subject, text: m.text, html: m.html }).toMatchSnapshot();
  });
});

describe("the Monday email with an upgrade (B3 plan Unit 12)", () => {
  const upgrade = { label: "Upgrade", whatsBetter: "What's better: Adds guardrails your version doesn't have." };
  it("labels only the upgrade and adds its What's better line under the reason", () => {
    const withUp = mondayListEmail({ week: "2026-11-30", ideas: [ideas[0], { ...ideas[1], upgrade }, ideas[2]], status: "Your next list comes Monday." });
    const plain = mondayListEmail({ week: "2026-11-30", ideas, status: "Your next list comes Monday." });
    expect(withUp.subject).toBe(plain.subject);
    expect(withUp.text).toBe(
      plain.text.replace("2. Listing post\nFits the listings work your week shows.", "2. Listing post (Upgrade)\nFits the listings work your week shows.\nWhat's better: Adds guardrails your version doesn't have."),
    );
    expect(withUp.html).toContain("2. Listing post (Upgrade)</p>");
    expect(withUp.html).toContain("What&#39;s better: Adds guardrails your version doesn&#39;t have.");
    expect(withUp.html.match(/\(Upgrade\)/g)).toHaveLength(1);
  });

  it("an upgrade with no stored line has the label only", () => {
    const m = mondayListEmail({ week: "2026-11-30", ideas: [{ ...ideas[0], upgrade: { label: "Upgrade", whatsBetter: null } }], status: "s" });
    expect(m.text).toContain("1. Inbox triage (Upgrade)\n");
    expect(m.text).not.toContain("What's better");
  });
});
