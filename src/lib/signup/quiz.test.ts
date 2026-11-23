import { describe, expect, it } from "vitest";
import { parseQuiz, routeFor } from "./quiz";

const slugs = ["claude", "grok-bot", "duet", "hark"];

function form(over: Record<string, string | string[]> = {}) {
  const base: Record<string, string | string[]> = {
    work: "real_estate",
    role: "Agent, residential resale",
    uses: "most_weeks",
    agent: "grok-bot",
    count: "1-2",
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
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["agent", "count", "role", "software", "uses", "work"]);
  });

  it("asks which agent when 'Another one' has no name", () => {
    const r = parseQuiz(form({ agent: "other" }), slugs);
    expect(!r.ok && r.errors.agentOther).toBe("Which AI agent?");
    expect(parseQuiz(form({ agent: "other", agentOther: "Lindy" }), slugs).ok).toBe(true);
  });

  it("refuses an agent or category that is not offered", () => {
    expect(parseQuiz(form({ agent: "evil" }), slugs).ok).toBe(false);
    expect(parseQuiz(form({ help: ["Crypto"] }), slugs).ok).toBe(false);
  });
});
