import { describe, expect, it } from "vitest";
import { parseQuiz, primaryAgent, routeFor } from "./quiz";

const slugs = ["claude", "grok-bot", "duet", "hark"];

function form(over: Record<string, string | string[]> = {}) {
  const base: Record<string, string | string[]> = {
    work: "real_estate",
    role: "Agent, residential resale",
    uses: "most_weeks",
    agent: "grok-bot",
    count: "1-2",
    level: "3",
    help: ["Listings", "Client follow-up"],
    software: "if_shown",
    ...over,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
}

describe("routeFor", () => {
  it("sends daily users and people with three or more routines to the running path", () => {
    expect(routeFor({ uses: "every_day", count: "none", software: "often" })).toBe("running");
    expect(routeFor({ uses: "most_weeks", count: "3-5", software: "if_shown" })).toBe("running");
    expect(routeFor({ uses: "most_weeks", count: "6+", software: "avoid" })).toBe("running");
  });

  it("sends everyone else to the new path", () => {
    expect(routeFor({ uses: "most_weeks", count: "none", software: "if_shown" })).toBe("new");
    expect(routeFor({ uses: "not_yet", count: "none", software: "often" })).toBe("new");
  });

  it("shows the not-ready note only for both 'Not yet' and 'I avoid it'", () => {
    expect(routeFor({ uses: "not_yet", count: "none", software: "avoid" })).toBe("not_ready");
    expect(routeFor({ uses: "not_yet", count: "1-2", software: "if_shown" })).toBe("new");
    expect(routeFor({ uses: "most_weeks", count: "none", software: "avoid" })).toBe("new");
  });
});

describe("parseQuiz", () => {
  it("accepts a complete form", () => {
    const r = parseQuiz(form(), slugs);
    expect(r.ok && r.answers.help).toEqual(["Listings", "Client follow-up"]);
  });

  it("accepts no help categories", () => {
    expect(parseQuiz(form({ help: [] }), slugs).ok).toBe(true);
  });

  it("names each missing answer", () => {
    const fd = new FormData();
    const r = parseQuiz(fd, slugs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["agent", "count", "level", "role", "software", "uses", "work"]);
  });

  it("asks which agent when 'Another one' has no name", () => {
    const r = parseQuiz(form({ agent: "other" }), slugs);
    expect(!r.ok && r.errors.agentOther).toBe("Which AI agent?");
    expect(parseQuiz(form({ agent: "other", agentOther: "Lindy" }), slugs).ok).toBe(true);
  });

  it("refuses an agent or category that is not offered", () => {
    expect(parseQuiz(form({ agent: "evil" }), slugs).ok).toBe(false);
    expect(parseQuiz(form({ agent: ["claude", "evil"] }), slugs).ok).toBe(false);
    expect(parseQuiz(form({ help: ["Crypto"] }), slugs).ok).toBe(false);
  });

  it("accepts several agents, in the order the quiz lists them, once each", () => {
    const r = parseQuiz(form({ agent: ["hark", "claude", "hark"] }), slugs);
    expect(r.ok && r.answers.agents).toEqual(["claude", "hark"]);
  });

  it("drops 'Not sure yet' when an agent is also named", () => {
    const r = parseQuiz(form({ agent: ["not_sure", "duet"] }), slugs);
    expect(r.ok && r.answers.agents).toEqual(["duet"]);
    const alone = parseQuiz(form({ agent: "not_sure" }), slugs);
    expect(alone.ok && alone.answers.agents).toEqual(["not_sure"]);
  });

  it("asks which agent when 'Another one' is ticked with others but has no name", () => {
    const r = parseQuiz(form({ agent: ["claude", "other"] }), slugs);
    expect(!r.ok && r.errors.agentOther).toBe("Which AI agent?");
  });
});

describe("primary agent and level", () => {
  it("keeps the agent marked primary when it is ticked", () => {
    const r = parseQuiz(form({ agent: ["claude", "hark"], primary: "hark" }), slugs);
    expect(r.ok && r.answers.primary).toBe("hark");
    expect(r.ok && primaryAgent(r.answers)).toBe("hark");
  });

  it("ignores a primary that isn't ticked or is 'Not sure yet'", () => {
    const r = parseQuiz(form({ agent: ["claude"], primary: "hark" }), slugs);
    expect(r.ok && r.answers.primary).toBe("");
    expect(r.ok && primaryAgent(r.answers)).toBe("claude");
    const n = parseQuiz(form({ agent: "not_sure", primary: "not_sure" }), slugs);
    expect(n.ok && n.answers.primary).toBe("");
  });

  it("uses the typed name when 'Another one' is primary", () => {
    const r = parseQuiz(form({ agent: ["claude", "other"], agentOther: "Lindy", primary: "other" }), slugs);
    expect(r.ok && primaryAgent(r.answers)).toBe("Lindy");
  });

  it("takes levels 0 to 8 only", () => {
    const zero = parseQuiz(form({ level: "0" }), slugs);
    expect(zero.ok && zero.answers.level).toBe(0);
    expect(parseQuiz(form({ level: "8" }), slugs).ok).toBe(true);
    for (const bad of ["9", "-1", "2.5", "x"]) expect(parseQuiz(form({ level: bad }), slugs).ok, bad).toBe(false);
  });
});

describe("primaryAgent", () => {
  it("sets the account up for the first chosen agent that has a Zack file", () => {
    expect(primaryAgent({ agents: ["other", "hark"], agentOther: "Lindy", primary: "" })).toBe("hark");
    expect(primaryAgent({ agents: ["claude", "hark"], agentOther: "", primary: "" })).toBe("claude");
  });

  it("falls back to the typed name, then 'not_sure'", () => {
    expect(primaryAgent({ agents: ["other"], agentOther: "Lindy", primary: "" })).toBe("Lindy");
    expect(primaryAgent({ agents: ["instinct"], agentOther: "", primary: "" })).toBe("instinct");
    expect(primaryAgent({ agents: ["not_sure"], agentOther: "", primary: "" })).toBe("not_sure");
  });
});
