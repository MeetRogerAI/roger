import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/start/actions", () => ({ submitQuiz: async () => ({ status: "idle" }) }));

const { QuizForm } = await import("./quiz-form");
const { rogerLevels } = await import("@/data/roger-levels");

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

describe("QuizForm, question 5: Levels 0 to 9", () => {
  const html = renderToStaticMarkup(
    <QuizForm params={{ path: null, cur: "USD", ref: null, zack: null, utm: "" } as never} agents={[{ value: "claude", label: "Claude" }]} categories={["Listings"]} />,
  );
  const q5 = html.match(/<fieldset[^>]*data-q="4"[\s\S]*?<\/fieldset>/)?.[0] ?? "";
  const options = q5.match(/<label[^>]*>[\s\S]*?<\/label>/g) ?? [];
  // renderToStaticMarkup escapes quotes; compare against the same escaping.
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

  it("offers ten levels, each as one radio in the question's fieldset", () => {
    expect(q5).toContain("<legend");
    expect(options).toHaveLength(10);
    const values = options.map((o) => o.match(/<input[^>]*name="level"[^>]*value="(\d+)"/)?.[1]);
    expect(values).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("labels each option 'Level N · Name' with its own description", () => {
    expect(rogerLevels).toHaveLength(10);
    rogerLevels.forEach((l, i) => {
      expect(options[i]).toContain(`Level ${l.level}</span> · ${esc(l.name)}`);
      expect(options[i]).toContain(esc(l.does));
    });
  });

  it("shows on options 0 to 8 what would move them to the next level, and no Next line on 9", () => {
    // Plain text of an option, tags dropped.
    const text = (o: string | undefined) => (o ?? "").replace(/<[^>]+>/g, "");
    for (let i = 0; i < 9; i++) {
      const up = rogerLevels.find((l) => l.level === i + 1);
      expect(up?.symptom, `level ${i + 1} has a symptom`).toEqual(expect.any(String));
      // The symptom's text from its second letter on (the first is lower-cased to read as "when you…").
      expect(text(options[i]), `option ${i}`).toContain(`Next: Level ${i + 1} when `);
      expect(text(options[i]), `option ${i}`).toContain(esc(up?.symptom?.slice(1) ?? "missing"));
    }
    // Word for word from the levels file v1.1, section 1.
    expect(text(options[0])).toContain("Next: Level 1 when you do everything by hand while everyone around you talks about AI.");
    expect(text(options[3])).toContain("Next: Level 4 when nothing happens unless you open a chat and say &quot;go&quot;.");
    expect(text(options[4])).toContain("Next: Level 5 when one agent mixes up its jobs, or you are the switchboard passing work between chats.");
    expect(text(options[5])).toContain(
      "Next: Level 6 when results end in &quot;should work now&quot;, the same correction comes back every week, or the bill grows faster than the work.",
    );
    expect(text(options[8])).toContain("Next: Level 9 when the only person your system helps is you.");
    expect(options[9]).not.toContain("Next:");
  });

  it("names each radio by its 'Level N · Name' line and describes it by the lines beneath, all ids present", () => {
    const radios = q5.match(/<input[^>]*name="level"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(10);
    const ids = new Set([...q5.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    radios.forEach((r, i) => {
      const named = r.match(/aria-labelledby="([^"]+)"/)?.[1];
      const described = r.match(/aria-describedby="([^"]+)"/)?.[1]?.split(" ") ?? [];
      expect(named && ids.has(named), `radio ${i} label`).toBe(true);
      expect(described).toHaveLength(i < 9 ? 2 : 1);
      for (const d of described) expect(ids.has(d), `radio ${i} ${d}`).toBe(true);
      // From the name span to the next span with an id: the "Level N · Name" line.
      const from = q5.indexOf(`id="${named}"`);
      const nameSpan = q5.slice(q5.indexOf(">", from) + 1, q5.indexOf(" id=", from + 1));
      expect(nameSpan.replace(/<[^>]+>/g, "").replace(/<span$/, "").trim()).toBe(`Level ${i} · ${esc(rogerLevels[i]?.name ?? "")}`);
    });
  });
});

describe("QuizForm, question 5 coming back from Step 2", () => {
  const render = (answers: Record<string, unknown>) =>
    renderToStaticMarkup(
      <QuizForm
        params={{ path: null, cur: "USD", ref: null, zack: null, utm: "" } as never}
        agents={[{ value: "claude", label: "Claude" }]}
        categories={["Listings"]}
        initial={{ work: "other", role: "Broker", uses: "every_day", agents: ["claude"], agentOther: "", primary: "claude", count: "6+", help: [], software: "often", ...answers } as never}
      />,
    );
  const checkedLevels = (html: string) => (html.match(/<input[^>]*name="level"[^>]*>/g) ?? []).filter((t) => /\schecked/.test(t)).map((t) => t.match(/value="(\d+)"/)?.[1]);

  it("asks a v1.0 answer again: level 8 with no marker pre-selects nothing", () => {
    expect(checkedLevels(render({ level: 8 }))).toEqual([]);
  });

  it("keeps a v1.1 answer: level 9 with the marker is the one level checked", () => {
    expect(checkedLevels(render({ level: 9, levelQuiz: "1.1" }))).toEqual(["9"]);
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
    levelQuiz: "1.1",
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
