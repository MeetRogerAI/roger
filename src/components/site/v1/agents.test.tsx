/**
 * The v1 /agents page (plan U6): the spec's nine sections in A.6's order, the
 * strip of agents built from the Zack data, and the rules the page must keep
 * (audience "agents" on every start button, the link to /zack, copy rules).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { samplePlay } from "@/data/site/sample-play";
import { questionsOn, v1Agents, v1Copy } from "@/data/site/v1";
import { amountsFrom, hasBareDollar } from "@/lib/site/amounts";
import { forAudience, type Testimonial } from "@/lib/site/testimonials";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";

type ZackAgent = { slug: string; name: string; file: string; available: boolean };

// The Zack data as the page reads it: the real list, unless a test puts its own in place.
const zack = vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
  return { override: null as ZackAgent[] | null };
});
vi.mock("@/data/zack", async (orig) => {
  const real = await orig<typeof import("@/data/zack")>();
  return {
    get zackAgents() {
      return zack.override ?? real.zackAgents;
    },
  };
});
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { publicIdeaView } = await import("@/lib/site/sample");
const { V1Agents, V1AgentsView, agentsStripLine, agentsWithFile } = await import("./agents");

const amounts = amountsFrom(v3Defaults);
const { copy, agents } = v1Copy(amounts);
const idea = publicIdeaView(samplePlay, v3Defaults.playbookPreface);
const four = ["Claude", "Duet", "Grok Bot", "Hark"];

const agent = (name: string, available: boolean): ZackAgent => ({ slug: name.toLowerCase().replace(/ /g, "-"), name, file: `${name}.md`, available });

// Made up, for these tests only: no testimonial is cleared, so the real list is empty.
const quote = (id: string, audience: Testimonial["audience"]): Testimonial => ({ id, person: `Sample ${id}.`, attribution: "Made-up attribution", quote: `A made-up quote, number ${id}.`, saidOn: null, audience, position: 0, cleared: true });
const quotes = [quote("a", "agents")];

/** What a reader sees: the markup with its tags taken out. */
const text = (markup: string) =>
  markup
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const hrefs = (markup: string) => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

/** The page's own sections in order, each with its background. The sample card's inner sections are not among them. */
function sections(markup: string): { name: string; ground: "night" | "ground" }[] {
  return [...markup.matchAll(/<section\b[^>]*aria-labelledby="([\w-]+)-title"[^>]*>/g)].map((m) => {
    const classes = /class="([^"]*)"/.exec(m[0])?.[1].split(" ") ?? [];
    return { name: m[1], ground: classes.includes("bg-night") ? "night" : "ground" };
  });
}

/** One section's markup, from its heading's id to the next page section. */
function sectionMarkup(markup: string, name: string): string {
  const start = markup.search(new RegExp(`<section\\b[^>]*aria-labelledby="${name}-title"`));
  expect(start, name).toBeGreaterThan(-1);
  const rest = markup.slice(start + 1);
  const next = rest.search(/<section\b[^>]*aria-labelledby="[\w-]+-title"/);
  return markup.slice(start, next === -1 ? undefined : start + 1 + next);
}

/** The strip under the hero, or nothing when the page has none. */
const stripMarkup = (markup: string) => /<div data-agent-strip[\s\S]*?<\/div><\/div>/.exec(markup)?.[0] ?? "";

// The shell is the page a visitor with no script reads; the part streamed in for the visitor's country follows it.
const STREAMED = '<div hidden id="S:';
const shell = (markup: string) => markup.split(STREAMED)[0];
const streamed = (markup: string) => markup.slice(shell(markup).length);

const full = (over: { testimonials?: Testimonial[]; agentNames?: string[]; amounts?: typeof amounts } = {}) =>
  pageMarkup(<V1AgentsView version="v1" amounts={over.amounts ?? amounts} idea={idea} testimonials={over.testimonials ?? []} agentNames={over.agentNames ?? four} />);
const view = async (over: Parameters<typeof full>[0] = {}) => shell(await full(over));
const served = async (version: "v1" | "v2" | "v3" = "v1") => shell(await pageMarkup(<V1Agents version={version} />));

const bareAgent = /(?<!\bAI )\bagents?\b/i;
const timeFigure = /\d\s*(?:hours?|hrs?|minutes?|mins?)\b/i;
const emoji = /\p{Extended_Pictographic}/u;

const without = ["hero", "problem", "how", "sample", "control", "price", "questions", "closing"];

beforeEach(() => {
  resetNextFakes();
  zack.override = null;
});

describe("the v1 /agents page, as the page serves it", () => {
  it("has A.6's sections in order, with no testimonials section while none is cleared", async () => {
    const markup = await served();
    expect(sections(markup)).toEqual([
      { name: "hero", ground: "night" },
      { name: "problem", ground: "ground" },
      { name: "how", ground: "night" },
      { name: "sample", ground: "ground" },
      { name: "control", ground: "ground" },
      { name: "price", ground: "night" },
      { name: "questions", ground: "ground" },
      { name: "closing", ground: "night" },
    ]);
    // No dangling heading or wrapper where the testimonials would be.
    expect(text(markup)).not.toContain(copy.testimonials.title);
    expect(markup).not.toContain('id="say"');
    expect(markup).toContain('data-site="v1"');
  });

  it("prints each section's own words, in the spec's order", async () => {
    const seen = text(await served());
    const marks = [
      "Stop figuring out AI agents alone.",
      agents.hero.sub,
      "Works with every agent",
      "Any other agent adapts one with a single prompt.",
      agents.problem.statements[0],
      agents.problem.statements[2],
      agents.how.steps[0].body,
      agents.how.steps[2].body,
      copy.sample.line,
      idea.title,
      copy.control.title,
      copy.priceBlock.title,
      copy.questionsBlock.title,
      "Find out what other heavy users know.",
    ];
    const at = marks.map((mark) => seen.indexOf(mark));
    for (const [i, where] of at.entries()) expect(where, marks[i]).toBeGreaterThan(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("lists Claude, Duet, Grok Bot and Hark from the Zack files on disk, and the sentence with \"adapts\"", async () => {
    const strip = stripMarkup(await served());
    expect([...strip.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1])).toEqual(four);
    expect(text(strip)).toBe("Works with every agent Claude Duet Grok Bot Hark Zack files for Claude, Duet, Grok Bot and Hark. Any other agent adapts one with a single prompt.");
  });

  it("shows v1's page for a later version until it has its own, under that version's wrapper", async () => {
    const markup = await served("v2");
    expect(markup).toContain('data-site="v2"');
    expect(text(markup)).toContain(agents.hero.headline);
  });
});

describe("the agent strip", () => {
  it("omits an agent whose file is unavailable, in the list and in the sentence", async () => {
    zack.override = [agent("Hark", false), agent("Viktor", true), agent("Claude", true), agent("Duet", true), agent("Grok Bot", false)];
    expect(agentsWithFile()).toEqual(["Claude", "Duet", "Viktor"]);
    const strip = stripMarkup(await served());
    expect([...strip.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1])).toEqual(["Claude", "Duet", "Viktor"]);
    expect(text(strip)).toContain("Zack files for Claude, Duet and Viktor. Any other agent adapts one with a single prompt.");
    expect(text(strip)).not.toMatch(/Hark|Grok Bot/);
  });

  it("builds the sentence from the names it is given, however many", () => {
    expect(agentsStripLine(agents.strip, four)).toBe("Zack files for Claude, Duet, Grok Bot and Hark. Any other agent adapts one with a single prompt.");
    expect(agentsStripLine(agents.strip, ["Claude", "Hark"])).toBe("Zack files for Claude and Hark. Any other agent adapts one with a single prompt.");
    expect(agentsStripLine(agents.strip, ["Claude"])).toBe("Zack files for Claude. Any other agent adapts one with a single prompt.");
    // No agent's name is typed into the copy.
    for (const name of ["Claude", "Duet", "Grok Bot", "Hark"]) expect(JSON.stringify(v1Agents)).not.toContain(name);
  });

  it("is left out altogether when no agent has a file", async () => {
    zack.override = [agent("Claude", false), agent("Hark", false)];
    const markup = await served();
    expect(markup).not.toContain("data-agent-strip");
    expect(text(markup)).not.toContain(agents.strip.title);
    expect(text(markup)).not.toContain(agents.strip.filesFor);
    expect(sections(markup).map((s) => s.name)).toEqual(without);
  });

  it("is text only, inside the hero's night chapter", async () => {
    const hero = sectionMarkup(await view(), "hero");
    const strip = stripMarkup(hero);
    expect(strip).not.toBe("");
    expect(strip).not.toMatch(/<a\b|<img\b|<svg\b/);
    expect(hero.indexOf(strip)).toBeGreaterThan(hero.indexOf(copy.cardLine));
  });
});

describe("the v1 /agents page's sections", () => {
  it("puts testimonials sixth, under the control block, and keeps night chapters apart either way", async () => {
    const withQuotes = sections(await view({ testimonials: quotes }));
    expect(withQuotes.map((s) => s.name)).toEqual(["hero", "problem", "how", "sample", "control", "say", "price", "questions", "closing"]);
    expect(withQuotes[5]).toEqual({ name: "say", ground: "ground" });
    expect(text(await view({ testimonials: quotes }))).toContain("“A made-up quote, number a.”");

    const withoutQuotes = sections(await view());
    expect(withoutQuotes.map((s) => s.name)).toEqual(without);
    for (const list of [withQuotes, withoutQuotes]) {
      for (const [i, s] of list.entries()) if (i > 0 && s.ground === "night") expect(list[i - 1].ground, s.name).not.toBe("night");
      expect(list[0].ground).toBe("night");
      expect(list.at(-1)!.ground).toBe("night");
    }
  });

  it("keeps two ground sections that are neighbours apart with a hairline, and adds none elsewhere", async () => {
    // Without testimonials: between the sample and the control block only. With them: before the testimonials too.
    const plain = await view();
    expect(plain.match(/data-hairline/g)).toHaveLength(1);
    expect(plain.indexOf("data-hairline")).toBeGreaterThan(plain.indexOf('id="sample"'));
    expect(plain.indexOf("data-hairline")).toBeLessThan(plain.indexOf('id="control"'));
    const quoted = await view({ testimonials: quotes });
    expect(quoted.match(/data-hairline/g)).toHaveLength(2);
    expect(quoted.lastIndexOf("data-hairline")).toBeGreaterThan(quoted.indexOf('id="control"'));
    expect(quoted.lastIndexOf("data-hairline")).toBeLessThan(quoted.indexOf('id="say"'));
  });

  it("shows the quotes for the audience agents, rows marked for both included", async () => {
    const rows = forAudience([quote("a", "agents"), quote("b", "re"), quote("c", "both")], "agents");
    const say = text(sectionMarkup(await view({ testimonials: rows }), "say"));
    expect(say).toContain("number a.");
    expect(say).toContain("number c.");
    expect(say).not.toContain("number b.");
  });

  it("has one h1, the headline, and a heading for every section", async () => {
    const markup = await view({ testimonials: quotes });
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(text(/<h1\b[\s\S]*?<\/h1>/.exec(markup)![0])).toBe("Stop figuring out AI agents alone.");
    for (const s of sections(markup)) expect(markup, s.name).toMatch(new RegExp(`<h[12] id="${s.name}-title"`));
  });

  it("hero: the two buttons, the second to /zack, and the card line directly under them", async () => {
    const hero = sectionMarkup(await view(), "hero");
    const actions = /<div data-hero-actions[\s\S]*?<\/div>/.exec(hero)![0];
    expect(text(actions)).toBe("Get two free Cora Curations Run Zack on yourself first");
    expect(hrefs(actions)).toEqual(["/start?path=agents", "/zack"]);
    expect(actions).toMatch(/<a [^>]*href="\/zack"[^>]*>Run Zack on yourself first<\/a>/);
    expect(hero.slice(hero.indexOf(actions) + actions.length)).toMatch(/^<p class="[^"]*text-meta[^"]*">Card required\. Charged only with your third Cora Curation\.<\/p>/);
  });

  it("the problem: the three statements for people who run agents", async () => {
    const problem = sectionMarkup(await view(), "problem");
    expect(problem.match(/<li/g)).toHaveLength(3);
    expect(text(problem)).toBe(`${agents.problem.title} ${agents.problem.statements.join(" ")}`);
  });

  it("how it works: three numbered steps in three columns, and a stack one week taller at each", async () => {
    const how = sectionMarkup(await view(), "how");
    const steps = how.split(/<li>/).slice(1);
    expect(steps).toHaveLength(3);
    expect(how).toMatch(/<ol data-reveal="true" class="[^"]*md:grid-cols-3[^"]*"/);
    expect(how).not.toContain("grid-cols-4");
    for (const [i, step] of steps.entries()) {
      expect(step).toContain("md:h-[72px]");
      expect(step).not.toContain("sm:h-[98px]");
      expect(step).toContain(`data-bricks="${(i + 1) * 3}"`);
      expect(step).toContain(`--step:${i}`);
      expect(step).toMatch(new RegExp(`<p aria-hidden="true"[^>]*>${i + 1}</p><h3[^>]*>${agents.how.steps[i].title}</h3>`));
      expect(text(step)).toContain(agents.how.steps[i].body);
    }
    expect(agents.how.steps.map((s) => s.title)).toEqual(["Add Zack", "Cora picks your three", "Paste to install"]);
  });

  it("the sample idea and the control block: the shared blocks with the shared words", async () => {
    const markup = await view();
    const sample = sectionMarkup(markup, "sample");
    expect(text(sample).startsWith(`${copy.sample.title} ${copy.sample.line} ${idea.category} ${idea.title}`)).toBe(true);
    expect(sample).not.toMatch(/<dialog/i);
    const control = sectionMarkup(markup, "control");
    expect(text(control)).toBe(`${copy.control.title} ${copy.control.points.map((p) => `${p.title} ${p.body}`).join(" ")} ${copy.control.link.label}`);
    // The words of a shared block are the shared strings: "agent" never without "AI", even here.
    for (const name of ["sample", "control", "price", "questions"]) expect(text(sectionMarkup(markup, name)), name).not.toMatch(bareAgent);
  });

  it("price: the price block for the visitor's country, with the audience agents", async () => {
    const usd = sectionMarkup(await view(), "price");
    expect(usd).toMatch(/aria-pressed="true"[^>]*>USD</);
    for (const line of ["US$200 / month USD", "CA$280 / month CAD"]) expect(text(usd)).toContain(line);
    expect(text(usd)).toContain(copy.trialLine);
    // Monthly only, under Peter's line.
    expect(usd.match(/data-plan="/g)).toHaveLength(1);
    expect(text(usd)).not.toMatch(/one list|one at a time|\/ list\b/i);
    expect(text(usd)).toContain("Get two Cora Curations for free and pay only after you have tried the product for two full weeks.");

    resetNextFakes({}, { "x-vercel-ip-country": "CA" });
    const canada = await full();
    expect(shell(canada)).toMatch(/aria-pressed="true"[^>]*>USD</);
    expect(streamed(canada)).toMatch(/aria-pressed="true"[^>]*>CAD</);
    expect(hrefs(streamed(canada))).toEqual(["/start?path=agents"]);
    expect(sections(streamed(canada)).map((s) => s.name)).toEqual(["price"]);
  });

  it("questions: the seven tagged for this page, and the link to /faq", async () => {
    const questions = sectionMarkup(await view(), "questions");
    const seven = questionsOn(copy, "agents");
    expect(seven).toHaveLength(7);
    expect(questions.match(/<details/g)).toHaveLength(7);
    for (const q of seven) expect(text(questions)).toContain(`${q.q} ${q.a}`);
    expect(hrefs(questions)).toEqual(["/faq"]);
  });

  it("closing band: the line, the line under the price, the button and the trial line", async () => {
    expect(text(sectionMarkup(await view(), "closing"))).toBe(`Find out what other heavy users know. ${copy.priceBlock.sub} ${copy.buttons.start} ${copy.trialLine}`);
  });

  it("the sample idea: the same folded card as the homepage's, with all of the play's text in the page", async () => {
    const sample = sectionMarkup(await view(), "sample");
    const rows = sample.match(/<details\b[^>]*>/g) ?? [];
    expect(rows).toHaveLength(11);
    for (const row of rows) expect(row).not.toMatch(/\sopen\b/);
    expect(text(sample)).toContain(idea.description);
    expect(text(sample)).toContain(idea.pasteToInstall);
  });

  it("opens one row at a time, as the homepage does: the questions share a name, the sample idea's rows another, its steps a third", async () => {
    const markup = await view();
    const named = (html: string) => [...html.matchAll(/<details\b([^>]*)>/g)].map((m) => ({ step: m[1].includes('data-fold="step"'), name: /\sname="([^"]*)"/.exec(m[1])?.[1] ?? "" }));
    expect(new Set(named(sectionMarkup(markup, "questions")).map((r) => r.name))).toEqual(new Set(["questions-rows"]));
    const sample = named(sectionMarkup(markup, "sample"));
    expect(new Set(sample.filter((r) => !r.step).map((r) => r.name))).toEqual(new Set(["sample-rows"]));
    expect(new Set(sample.filter((r) => r.step).map((r) => r.name))).toEqual(new Set(["sample-steps"]));
    for (const row of named(markup)) expect(row.name).not.toBe("");
  });
});

describe("the v1 /agents page's links", () => {
  it("gives every start button the audience agents in its server-rendered address", async () => {
    for (const markup of [await view(), await view({ testimonials: quotes }), await served()]) {
      const starts = hrefs(markup).filter((h) => h.startsWith("/start"));
      // The hero, the price block and the closing band.
      expect(starts).toEqual(["/start?path=agents", "/start?path=agents", "/start?path=agents"]);
      expect(markup.match(/>Get two free Cora Curations<\/a>/g)).toHaveLength(3);
    }
  });

  it("links to /zack once, from the hero, and to no Circles or legacy page", async () => {
    const all = hrefs(await view({ testimonials: quotes }));
    expect(all.filter((h) => !h.startsWith("/_next/"))).toEqual(["/start?path=agents", "/zack", "/how-it-works#zack", "/start?path=agents", "/faq", "/start?path=agents"]);
  });
});

describe("the v1 /agents page's words", () => {
  it("keep the copy rules: no bare dollar sign, no time figure, no exclamation mark or emoji", async () => {
    const seen = text(await view());
    expect(seen.length).toBeGreaterThan(2000);
    expect(hasBareDollar(seen)).toBe(false);
    expect(seen).not.toMatch(timeFigure);
    expect(seen).not.toContain("!");
    expect(seen).not.toMatch(emoji);
    expect(seen).not.toMatch(/Circle/);
    // No claim about income or the number of users, in the page's own words.
    expect(JSON.stringify(v1Agents)).not.toMatch(/\d|income|revenue|earn|thousands|hundreds/i);
  });

  it("take every price from the amounts, never from the copy", async () => {
    const other = amountsFrom({ ...v3Defaults, priceUsd: 311, priceCad: 433, priceRunUsd: 322, priceRunCad: 444, priceHigherUsd: 655, priceHigherCad: 877 });
    const seen = text(await view({ amounts: other }));
    for (const line of ["US$311 / month USD", "CA$433 / month CAD", "US$655 a month (CA$877 in Canada)"]) expect(seen).toContain(line);
    // Every dollar figure on the page is the monthly price or the higher rate. The price of one list is not on the page.
    expect([...new Set(seen.match(/(?:US|CA)\$[\d,]+/g))].sort()).toEqual(["CA$433", "CA$877", "US$311", "US$655"]);
    expect(hasBareDollar(seen)).toBe(false);
  });
});
