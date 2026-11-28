/**
 * The v1 homepage (plan U5; Peter's homepage reviews of November 26 and 27,
 * 2026): its sections in order, the hero's four steps and the compounding
 * loop as the server sends them, the examples, and the rules a homepage must
 * keep (audience, no /zack link, no image, copy rules).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { compoundingFinal, compoundingSteps } from "@/data/site/compounding";
import { examples } from "@/data/site/examples";
import { letterShown } from "@/data/site/letter";
import { questionsOn } from "@/data/site/v1";
import { emptyOverlay, type Overlay } from "@/lib/site/content/format";
import { v1Copy } from "@/lib/site/content/model";
import { siteRegistry } from "@/lib/site/content/registry";
import { amountsFrom, hasBareDollar } from "@/lib/site/amounts";
import { compoundingCaption } from "@/lib/site/compounding";
import type { Testimonial } from "@/lib/site/testimonials";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";

vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { exampleViews } = await import("@/lib/site/sample");
const { V1Home, V1HomeView } = await import("./home");
const { Compounding } = await import("./blocks/compounding");

const amounts = amountsFrom(v3Defaults);
const { copy } = v1Copy(amounts);
const shown = exampleViews(examples, v3Defaults.playbookPreface);

// Made up, for these tests only: no testimonial is cleared, so the real list is empty.
const quotes: Testimonial[] = [
  { id: "a", person: "Sample P.", attribution: "Made-up attribution", quote: "A made-up quote, to place the section.", saidOn: null, audience: "re", position: 0, cleared: true },
];

/** What a reader sees: the markup with its tags taken out. */
const text = (markup: string) =>
  markup
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const hrefs = (markup: string) => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

/** The page's own sections in order, each with its background. The sample card's inner sections are not among them. */
function sections(markup: string): { name: string; ground: "night" | "ground-2" | "ground" }[] {
  return [...markup.matchAll(/<section\b[^>]*aria-labelledby="([\w-]+)-title"[^>]*>/g)].map((m) => {
    const classes = /class="([^"]*)"/.exec(m[0])?.[1].split(" ") ?? [];
    return { name: m[1], ground: classes.includes("bg-night") ? "night" : classes.includes("bg-ground-2") ? "ground-2" : "ground" };
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

/**
 * A prerender holds the page twice over where it streams: the shell, with the
 * price block for USD in place, and after it the part streamed in for the
 * visitor's country, which script swaps in. The shell is the page a visitor
 * with no script reads, and it is what these tests read unless they say so.
 */
const STREAMED = '<div hidden id="S:';
const shell = (markup: string) => markup.split(STREAMED)[0];
const streamed = (markup: string) => markup.slice(shell(markup).length);

const full = (over: { testimonials?: Testimonial[]; content?: Overlay } = {}) =>
  pageMarkup(<V1HomeView version="v1" amounts={amounts} preface={v3Defaults.playbookPreface} testimonials={over.testimonials ?? []} content={over.content} />);
const view = async (over: Parameters<typeof full>[0] = {}) => shell(await full(over));
const served = async (version: "v1" | "v2" | "v3" = "v1") => shell(await pageMarkup(<V1Home version={version} />));

// The same rules as the copy tests in blocks/blocks.test.tsx, applied to what the page prints.
const bareAgent = /(?<!\bAI )\bagents?\b/i;
const timeFigure = /\d\s*(?:hours?|hrs?|minutes?|mins?)\b/i;
const emoji = /\p{Extended_Pictographic}/u;

beforeEach(() => resetNextFakes());

describe("the v1 homepage, as the page serves it", () => {
  it("has its eight sections in order, with no testimonials section while none is cleared", async () => {
    const markup = await served();
    expect(sections(markup)).toEqual([
      { name: "hero", ground: "night" },
      { name: "problem", ground: "ground" },
      { name: "examples", ground: "ground" },
      { name: "compounds", ground: "ground-2" },
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

  it("has no “How it works” section and no “Who runs this” section (Peter, November 27, 2026)", async () => {
    const markup = await served();
    expect(markup).not.toContain('id="how"');
    expect(markup).not.toContain('id="who"');
    expect(markup).not.toContain('href="#how"');
    const headings = [...markup.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].map((m) => text(m[1]));
    expect(headings).not.toContain("How it works");
    expect(headings).not.toContain("Who runs this");
    // Peter's letter is on /about, not here: none of it is printed, there is no photograph, and nothing links to /about from the page's own sections.
    for (const p of letterShown) expect(text(markup)).not.toContain(p.shown);
    expect(text(markup)).not.toContain("Roger is run by Peter Kuperman.");
    expect(markup).not.toMatch(/<img\b|<picture\b|data-photo/i);
    expect(hrefs(markup)).not.toContain("/about");
    // The files and the copy of both sections are gone, not only unused.
    for (const file of ["blocks/who-runs-this.tsx", "blocks/how-it-works.tsx"]) expect(() => readFileSync(path.join(process.cwd(), "src/components/site/v1", file))).toThrow();
    expect(Object.keys(copy.home).sort()).toEqual(["closing", "compounds", "hero", "problem"]);
  });

  it("prints each section's own words, in order", async () => {
    const seen = text(await served());
    const marks = [
      copy.home.hero.headline,
      copy.home.hero.sub,
      copy.home.hero.graphic.steps[0].body,
      copy.home.hero.graphic.steps[3].body,
      copy.home.problem.statements[0].text,
      copy.home.problem.statements[2].text,
      copy.sample.title,
      shown[0].idea.title,
      copy.home.compounds.line,
      copy.control.title,
      copy.priceBlock.title,
      copy.questionsBlock.title,
      copy.home.closing.line,
    ];
    const at = marks.map((mark) => seen.indexOf(mark));
    for (const [i, where] of at.entries()) expect(where, marks[i]).toBeGreaterThan(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("shows v1's home for a later version until it has its own, under that version's wrapper", async () => {
    const markup = await served("v2");
    expect(markup).toContain('data-site="v2"');
    expect(text(markup)).toContain(copy.home.hero.headline);
  });
});

describe("the v1 homepage's sections", () => {
  it("puts testimonials fifth when there are some, and keeps night chapters apart either way", async () => {
    const withQuotes = sections(await view({ testimonials: quotes }));
    expect(withQuotes.map((s) => s.name)).toEqual(["hero", "problem", "examples", "compounds", "say", "control", "price", "questions", "closing"]);
    expect(withQuotes[4]).toEqual({ name: "say", ground: "ground" });
    expect(text(await view({ testimonials: quotes }))).toContain("“A made-up quote, to place the section.”");

    for (const list of [withQuotes, sections(await view())]) {
      for (const [i, s] of list.entries()) if (i > 0 && s.ground === "night") expect(list[i - 1].ground, s.name).not.toBe("night");
      expect(list[0].ground).toBe("night");
      expect(list.at(-1)!.ground).toBe("night");
    }
  });

  it("keeps two ground sections that are neighbours apart with a hairline, and adds none elsewhere", async () => {
    // Without testimonials: between the problem and the examples only. With them: before the control block too.
    const page = await view();
    expect(page.match(/data-hairline/g)).toHaveLength(1);
    expect(page.indexOf("data-hairline")).toBeGreaterThan(page.indexOf('id="problem"'));
    expect(page.indexOf("data-hairline")).toBeLessThan(page.indexOf('id="examples"'));
    expect((await view({ testimonials: quotes })).match(/data-hairline/g)).toHaveLength(2);
  });

  it("has one h1, the headline, and a heading for every section", async () => {
    const markup = await view({ testimonials: quotes });
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(text(/<h1\b[\s\S]*?<\/h1>/.exec(markup)![0])).toBe(copy.home.hero.headline);
    for (const s of sections(markup)) expect(markup, s.name).toMatch(new RegExp(`<h[12] id="${s.name}-title"`));
  });

  it("hero: one button, with no second link beside it and no card line under it (Peter, November 27, 2026)", async () => {
    const hero = sectionMarkup(await view(), "hero");
    const actions = /<div data-hero-actions[\s\S]*?<\/div>/.exec(hero)![0];
    expect(text(actions)).toBe(copy.buttons.start);
    expect(hrefs(actions)).toEqual(["/start?path=re"]);
    expect(hrefs(hero)).toEqual(["/start?path=re"]);
    expect(text(hero)).not.toContain("See how it works");
    // The card sentence is not in the hero, in this wording or the one before it.
    expect(text(hero)).not.toMatch(/card/i);
    // Nothing follows the button inside the left column: the column ends with it.
    expect(hero.slice(hero.indexOf(actions) + actions.length)).toMatch(/^<\/div><\/div><div data-hero-steps/);
    // The card line itself still exists, for the reading pages' start band.
    expect(copy.cardLine).toBe("We ask for your card when your first Cora Curation is ready.");
    expect(text(await view())).not.toContain(copy.cardLine);
  });

  it("hero: the sub-line is Peter's, for anyone and not for one trade", async () => {
    const hero = sectionMarkup(await view(), "hero");
    expect(text(hero)).toContain("Roger makes your AI agents smarter every week, with battle-tested ideas that have already worked for real people in the network.");
    expect(text(hero)).not.toMatch(/real estate/i);
  });

  it("hero: the right side is “How it works” whole, the four steps each with its label, number, headline, text and ideas, all readable with no script", async () => {
    const hero = sectionMarkup(await view(), "hero");
    expect(hero).toContain("data-hero-steps");
    const parts = [...hero.matchAll(/<li data-step="\d" data-active="(?:yes|no)">(.*?)<\/li>(?=<li data-step|<\/ol>)/g)].map((m) => m[1]);
    expect(parts).toHaveLength(4);
    const steps = copy.home.hero.graphic.steps;
    expect(steps.map((s) => s.label)).toEqual(["Use", "Collect", "Curate", "Deploy"]);
    for (const [i, part] of parts.entries()) {
      // Without the ideas' own labels, a step reads: label, number, headline, text.
      const read = text(part.replace(/<span class="sr-only">.*?<\/span>/g, ""));
      expect(read, steps[i].label).toBe(`${steps[i].label} ${i + 1} ${steps[i].title} ${steps[i].body}`);
      // 3, 6, 9 and 12 ideas, each labelled.
      expect(part, steps[i].label).toContain(`data-bricks="${(i + 1) * 3}"`);
      expect(part.match(/<span class="sr-only">Week \d+, idea [123]: set up<\/span>/g), steps[i].label).toHaveLength((i + 1) * 3);
    }
    // The fourth step in Peter's words.
    expect(text(parts[3].replace(/<span class="sr-only">.*?<\/span>/g, ""))).toBe("Deploy 4 Approve The Ideas Say yes to the ideas you like and see them in action for you.");
    // The only digits a reader sees in the hero are the four step numbers.
    expect(text(hero.replace(/<span class="sr-only">.*?<\/span>/g, "")).match(/\d+/g)).toEqual(["1", "2", "3", "4"]);
    expect(hero).not.toMatch(/aria-live/);
  });

  it("the problem: the three statements", async () => {
    const problem = sectionMarkup(await view(), "problem");
    expect(problem.match(/<li/g)).toHaveLength(3);
    expect(text(problem)).toBe(`${copy.home.problem.title} ${copy.home.problem.statements.map((statement) => statement.text).join(" ")}`);
  });

  it("examples: the heading “Cora Curation Examples” with no line under it, then the short titles to pick by", async () => {
    const section = sectionMarkup(await view(), "examples");
    expect(copy.sample.title).toBe("Cora Curation Examples");
    // The heading's block holds the heading and nothing else.
    expect(section).toMatch(/<div class="mx-auto max-w-\[44rem\] text-center "><h2 id="examples-title" class="text-h2">Cora Curation Examples<\/h2><\/div>/);
    const seen = text(section);
    expect(seen.startsWith("Cora Curation Examples On-demand video creation 20 new prospects every day A printed daily paper for the family On-demand video creation Phone camera roll to styled Reels")).toBe(true);
    expect(seen).not.toContain("This is one idea, as it arrives.");
    expect(seen).not.toContain("What arrives on Monday");
    expect(section).not.toMatch(/<dialog/i);
  });

  it("examples: with no script every example is in the page, each short title a link to its example, and no tab role is claimed", async () => {
    const section = sectionMarkup(await view(), "examples");
    const tabs = [...section.matchAll(/<a\b([^>]*)data-example-tab="([^"]*)"([^>]*)>([^<]*)<\/a>/g)];
    expect(tabs.map((t) => [t[2], t[4]])).toEqual([
      ["video", "On-demand video creation"],
      ["prospects", "20 new prospects every day"],
      ["paper", "A printed daily paper for the family"],
    ]);
    expect(tabs.map((t) => /href="([^"]*)"/.exec(t[0])![1])).toEqual(["#examples-video", "#examples-prospects", "#examples-paper"]);
    const panels = [...section.matchAll(/<div id="(examples-[a-z-]+)" data-example-panel="([^"]*)" data-selected="(yes|no)"/g)];
    expect(panels.map((p) => [p[1], p[2], p[3]])).toEqual([
      ["examples-video", "video", "yes"],
      ["examples-prospects", "prospects", "no"],
      ["examples-paper", "paper", "no"],
    ]);
    // The roles are given only once script is running, so a reader with none is never told of tabs that do nothing.
    expect(section).not.toMatch(/role="(?:tablist|tab|tabpanel)"|aria-selected|aria-controls/);
    // Nothing hides a panel in the markup: the one rule that does is under html.js, in globals.css.
    for (const panel of section.matchAll(/<div id="examples-[a-z-]+" data-example-panel[^>]*>/g)) expect(panel[0]).not.toMatch(/\bhidden\b|display/);
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain('.js .examples [data-example-panel][data-selected="no"] {');
    expect(css.match(/\[data-example-panel\]\[data-selected="no"\]/g)).toHaveLength(1);
  });

  it("examples: each is a full card, folded when the page loads, with all of its play's text in the page", async () => {
    const section = sectionMarkup(await view(), "examples");
    const cards = section.split('<article aria-labelledby="').slice(1);
    expect(cards).toHaveLength(examples.length);
    for (const [i, card] of cards.entries()) {
      const { label, play } = examples[i];
      const rows = card.match(/<details\b[^>]*>/g) ?? [];
      // Summary, What To Copy, the one playbook row, and the eight steps inside it.
      expect(rows, label).toHaveLength(11);
      for (const row of rows) expect(row, label).not.toMatch(/\sopen\b/);
      const seen = text(card);
      // The short title over the play's own title, then the two headings and their rows.
      expect(seen, label).toContain(`${label} ${play.title} The Idea Summary`);
      expect(seen, label).toContain(play.description);
      expect(seen, label).toContain(play.pasteToInstall);
      expect(seen, label).toContain("The Playbook 8 steps 1. Play");
      expect(seen, label).toContain("8. Done when");
    }
    expect(text(cards[0])).toContain("Never post or schedule anything on social media. Finished files and drafts only.");
    expect(text(cards[1])).toContain("Never send. Drafts only, and the member sends.");
  });

  it("examples: under What To Copy the copy button is the last thing, and no “Written on” line is anywhere", async () => {
    const section = sectionMarkup(await view(), "examples");
    expect(text(section)).not.toMatch(/Written on|may have another name on your AI agent/);
    const folds = [...section.matchAll(/<details data-fold="copy"[^>]*>(.*?)<\/details>/g)].map((m) => m[1]);
    expect(folds).toHaveLength(examples.length);
    // The row's content ends on the button: nothing is printed beneath it.
    for (const fold of folds) expect(fold).toMatch(/<button\b[^>]*>(?:(?!<\/button>).)*<\/button><\/div>$/);
    expect(Object.keys(copy.sample.install).sort()).toEqual(["copy", "help"]);
  });

  it("examples: none says where it came from, and none carries a figure about time or money", async () => {
    const seen = text(sectionMarkup(await view(), "examples"));
    expect(seen).not.toMatch(/hours? (?:a|per) week|minutes saved|time saved|Doing this by hand|Confidence|Over a year|Heavy use/i);
    expect(seen).not.toContain("$");
    expect(seen).not.toMatch(/Client email in two tones/);
  });

  it("price: the price block for the visitor's country, both currencies in the markup", async () => {
    const usd = sectionMarkup(await view(), "price");
    expect(usd).toMatch(/aria-pressed="true"[^>]*>USD</);
    for (const line of ["US$200 / month USD", "CA$280 / month CAD"]) expect(text(usd)).toContain(line);
    // The note under the price, exactly (Peter, November 27, 2026).
    expect(text(/<p data-trial-line[^>]*>(.*?)<\/p>/.exec(usd)![1])).toBe("Your first two Cora Curations are free. Payment starts no earlier than week 3.");
    expect(copy.trialLine).toBe("Your first two Cora Curations are free. Payment starts no earlier than week 3.");
    expect(text(usd)).not.toMatch(/We ask for a card|Cancel before then/);
    // The header's "Pricing" lands here: the section has the id, and room for the sticky header above its heading.
    expect(usd).toMatch(/^<section id="price" aria-labelledby="price-title" class="[^"]*-scroll-mt-3\b/);
    // Monthly only, under Peter's line.
    expect(usd.match(/data-plan="/g)).toHaveLength(1);
    expect(text(usd)).not.toMatch(/one list|one at a time|\/ list\b/i);
    expect(text(usd).startsWith(`${copy.priceBlock.title} USD`)).toBe(true);
    expect(text(usd)).not.toContain("two full weeks");

    // The block is the child of CountryDefault: the part streamed in for a visitor in Canada opens on CAD, with the same audience.
    expect(streamed(await full())).toMatch(/aria-pressed="true"[^>]*>USD</);
    resetNextFakes({}, { "x-vercel-ip-country": "CA" });
    const canada = await full();
    expect(shell(canada)).toMatch(/aria-pressed="true"[^>]*>USD</);
    expect(streamed(canada)).toMatch(/aria-pressed="true"[^>]*>CAD</);
    expect(hrefs(streamed(canada))).toEqual(["/start?path=re"]);
    expect(sections(streamed(canada)).map((s) => s.name)).toEqual(["price"]);
  });

  it("questions: the seven tagged for the homepage, and the link to /faq", async () => {
    const questions = sectionMarkup(await view(), "questions");
    const seven = questionsOn(copy, "home");
    expect(seven).toHaveLength(7);
    expect(questions.match(/<details/g)).toHaveLength(7);
    for (const q of seven) expect(text(questions)).toContain(`${q.q} ${q.a}`);
    expect(hrefs(questions)).toEqual(["/faq"]);
  });

  it("questions: an answer edited in the admin is printed in place of the built-in one, with its amounts filled in", async () => {
    // The edits as the page is handed them: one overlay on the code copy, each text under its field's id.
    const content: Overlay = {
      ...emptyOverlay,
      text: {
        "questions.price-and-billing.items.cost.a": "It is {monthlyUsd} a month. Your first {freeLists} Cora Curations are free.",
        "questions.getting-started.items.each-week.q": "What is my part each week?",
      },
    };
    const edited = sectionMarkup(await view({ content }), "questions");
    expect(text(edited)).toContain("What does it cost? It is US$200 a month. Your first two Cora Curations are free.");
    expect(text(edited)).not.toContain("plus tax where it applies");
    // A question whose wording alone was edited keeps its built-in answer.
    expect(text(edited)).toContain("What is my part each week? Open your three ideas on Monday and set up the ones you want.");
    expect(edited.match(/<details/g)).toHaveLength(7);
  });

  it("closing band: the heading and the button only, and the button in Peter's words (November 27, 2026)", async () => {
    const closing = sectionMarkup(await view(), "closing");
    expect(text(closing)).toBe("See what your first two Cora Curations bring. Level up your use of AI Agents Now.");
    // Nothing under the heading and nothing under the button.
    expect(closing).not.toContain("data-closing-sub");
    expect(closing).not.toContain("data-closing-trial");
    expect(closing.match(/<p\b/g)).toBeNull();
    expect(closing).toMatch(/<a class="btn btn-l" href="\/start\?path=re">Level up your use of AI Agents Now\.<\/a>/);
    // "AI Agents" with a capital A keeps the vocabulary rule: "agent" never without "AI" in front.
    expect(text(closing)).not.toMatch(bareAgent);
  });
});

describe("the v1 homepage's links", () => {
  it("gives every start button the audience re in its server-rendered address", async () => {
    for (const markup of [await view(), await view({ testimonials: quotes })]) {
      const starts = hrefs(markup).filter((h) => h.startsWith("/start"));
      // The hero, the price block and the closing band.
      expect(starts).toEqual(["/start?path=re", "/start?path=re", "/start?path=re"]);
      // The hero's and the price block's read the same. The closing band's alone has its own words.
      const labels = [...markup.matchAll(/<a\b[^>]*href="\/start[^"]*"[^>]*>(.*?)<\/a>/g)].map((m) => text(m[1]));
      expect(labels).toEqual(["Get two free Cora Curations", "Get two free Cora Curations", "Level up your use of AI Agents Now."]);
    }
  });

  it("has no link to /zack, to the deleted /pricing or /agents, to the deleted section's anchor, or to a Circles or legacy page", async () => {
    const all = hrefs(await view({ testimonials: quotes }));
    expect(all.filter((h) => h.startsWith("/zack"))).toEqual([]);
    expect(all.filter((h) => /^\/(?:pricing|agents)\b|#how$/.test(h))).toEqual([]);
    expect(all.filter((h) => !h.startsWith("/_next/"))).toEqual(["/start?path=re", "#examples-video", "#examples-prospects", "#examples-paper", "/how-it-works#zack", "/start?path=re", "/faq", "/start?path=re"]);
  });
});

describe("the compounding loop, with no script", () => {
  const markup = renderToStaticMarkup(<Compounding copy={copy.home.compounds} words={copy.bricks} />);
  const seen = text(markup);
  const storySteps = compoundingSteps;

  it("has seven states, weeks 1, 2, 3, 4, 10, 17 and 26, each at three bricks a week, from the data", () => {
    expect(storySteps).toHaveLength(7);
    expect(storySteps.map((s) => s.week)).toEqual([1, 2, 3, 4, 10, 17, 26]);
    expect(storySteps.at(-1)).toEqual(compoundingFinal);
    expect(storySteps.map((s) => s.bricks)).toEqual(storySteps.map((s) => s.week * 3));
    expect(storySteps.map((s) => s.bricks)).toEqual([3, 6, 9, 12, 30, 51, 78]);
  });

  it("is the finished week 26 stack: every brick there, set up and labelled, and none hidden", () => {
    expect(markup).toContain(`data-bricks="${compoundingFinal.bricks}"`);
    const bricks = markup.match(/<li[^>]*data-brick[^>]*>.*?<\/li>/g) ?? [];
    expect(bricks).toHaveLength(compoundingFinal.bricks);
    for (const brick of bricks) {
      expect(brick).toContain('data-set-up="yes"');
      expect(brick).toMatch(/<span class="sr-only">Week \d+, idea [123]: set up<\/span>/);
    }
    expect(bricks.at(-1)).toContain(`data-week="${compoundingFinal.week}"`);
    // No brick is marked out, and nothing but the one button is hidden: with no script this is what stays on screen.
    expect(markup).not.toContain("data-out=");
    expect(markup).not.toMatch(/opacity|display:\s*none/);
    expect(markup.match(/class="[^"]*\bhidden\b[^"]*"/g)).toHaveLength(1);
    expect(markup).toMatch(/<button type="button" data-loop-pause="true" class="[^"]*\bhidden\b/);
  });

  it("shows every state's week and count of ideas as text, in the copy's words and the data's numbers", () => {
    const labels = [...markup.matchAll(/<li data-loop-state="(\d+)"[^>]*>(.*?)<\/li>/g)];
    expect(labels.map((m) => Number(m[1]))).toEqual(storySteps.map((s) => s.week));
    for (const [i, step] of storySteps.entries()) {
      const caption = compoundingCaption(copy.bricks.caption, step);
      expect(text(labels[i][2])).toBe(`${caption.week} ${caption.bricks}`);
    }
    expect(seen).toContain("Week 1 3 ideas Week 2 6 ideas Week 3 9 ideas Week 4 12 ideas Week 10 30 ideas Week 17 51 ideas Week 26 78 ideas");
    // "Ideas" throughout: the section never says "bricks" (Peter, November 26, 2026).
    expect(seen).not.toMatch(/bricks?/i);
    // The list is read by everyone. The large caption above the stack repeats its last line, so that one is kept from a screen reader.
    expect(markup).toMatch(/<ol data-loop-states="true"/);
    expect(markup).not.toMatch(/<ol[^>]*aria-hidden/);
    expect(markup).toMatch(/<p aria-hidden="true" data-loop-caption="true"/);
    expect(markup).not.toMatch(/aria-live/);
  });

  it("has one sentence of copy, and no number about time or money", () => {
    expect(seen.startsWith(`${copy.home.compounds.title} ${copy.home.compounds.line} `)).toBe(true);
    expect(copy.home.compounds.line).toBe("Three ideas a week. Each one you set up stays set up. Six months in, your AI agents do things you would not have thought to ask for.");
    expect(seen).not.toContain("$");
    expect(seen).not.toMatch(timeFigure);
    // Every digit on show belongs to a week label or a brick count: the large caption of the last state, then the seven lines.
    const visible = text(markup.replace(/<span class="sr-only">.*?<\/span>/g, ""));
    expect(visible.match(/\d+/g)).toEqual([String(compoundingFinal.week), String(compoundingFinal.bricks), ...storySteps.flatMap((s) => [String(s.week), String(s.bricks)])]);
  });

  it("is on ground-2, and nothing in it is pinned", () => {
    expect(markup).toMatch(/^<section id="compounds" aria-labelledby="compounds-title" class="[^"]*bg-ground-2/);
    expect(markup).not.toMatch(/\bsticky\b|\bfixed\b/);
  });
});

describe("the shared button and link movements", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("shrink a pressed button and nudge a link's chevron only where motion is allowed (U10 acceptance, open defect 2)", () => {
    const allowed = "@media (prefers-reduced-motion: no-preference) {\n";
    for (const [selector, movement] of [
      [".btn:active", "transform: scale(0.98);"],
      [".chev:hover::after", "transform: translateX(2px);"],
    ]) {
      const rule = new RegExp(`\\n( *)${selector.replace(/[.:]/g, "\\$&")} \\{\\n\\s*${movement.replace(/[().]/g, "\\$&")}\\n\\s*\\}`);
      const found = [...css.matchAll(new RegExp(rule, "g"))];
      expect(found, selector).toHaveLength(1);
      // The rule is the first thing inside a no-preference block, and is nowhere else.
      const before = css.slice(0, found[0].index! + 1);
      expect(before.endsWith(allowed), selector).toBe(true);
      expect(css.split(`${selector} {`), selector).toHaveLength(2);
    }
  });
});

describe("the motion rules for the bricks", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\r\n/g, "\n");
  // The rules without their comments, which name the same classes.
  const from = css.indexOf("*/", css.indexOf("Bricks in motion")) + 2;
  const block = css.slice(from, css.indexOf("/* The pricing stage")).replace(/\/\*[\s\S]*?\*\//g, "");

  it("hide or move a brick only where motion is allowed, and only once script is running", () => {
    const media = "@media (prefers-reduced-motion: no-preference) {";
    expect(block.split(media)).toHaveLength(2);
    const inside = block.slice(block.indexOf(media), block.indexOf("\n}\n", block.indexOf(media)));
    const outside = block.replace(inside, "").replace(printRules(block), "");
    // Outside the media block there are only the examples' two rules (which hide a panel, not a brick) and the print rules (below).
    expect(outside).not.toMatch(/opacity: 0/);
    expect(outside).not.toContain("data-out");
    expect(outside).not.toContain("[data-brick]");
    // The stacks of the deleted sections have no rules left.
    expect(css).not.toMatch(/bricks-grow|bricks-arrive|brick-drop|data-step-bricks/);
    // Inside it, every rule starts from the class that only script adds.
    const selectors = [...inside.matchAll(/^ {2}(\.[^{]+) \{$/gm)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(8);
    for (const selector of selectors) expect(selector).toMatch(/^\.js /);
  });

  it("force the finished picture in print, whatever classes script has added", () => {
    const print = printRules(block);
    const rules = [...print.matchAll(/^ {2}((?:\.[^{]+?,\n {2})*\.[^{]+?) \{\n([\s\S]*?)\n {2}\}/gm)].map((m) => ({ selectors: m[1].split(/,\n\s*/), body: m[2] }));
    const shows = rules.find((r) => r.body.includes("opacity: 1 !important"))!;
    // Every brick the rules above can hide or move: the loop's, and the stacks of the hero's four steps.
    expect(shows.selectors).toEqual([".compounding-loop [data-brick]", ".hero-steps [data-brick]"]);
    for (const line of ["animation: none !important;", "transition: none !important;", "opacity: 1 !important;", "transform: none !important;"]) expect(shows.body).toContain(line);
    // The hero's four steps are printed as the still list: every step shown, with its label, and no control.
    const parts = rules.find((r) => r.selectors.includes(".hero-steps [data-step]"))!;
    for (const line of ["opacity: 1 !important;", "visibility: visible !important;", "grid-area: auto !important;"]) expect(parts.body).toContain(line);
    const controls = rules.find((r) => r.selectors.includes(".compounding-loop [data-loop-pause]"))!;
    expect(controls.selectors).toEqual([".hero-steps [data-step-tabs]", ".hero-steps [data-step-controls]", ".compounding-loop [data-loop-pause]"]);
    expect(controls.body).toContain("display: none !important;");
    // Every example is printed, one under another, without the row that switches between them.
    expect(rules.find((r) => r.selectors.includes(".examples [data-example-panel]"))!.body).toContain("display: block !important;");
    expect(rules.find((r) => r.selectors.includes(".examples [data-example-tabs]"))!.body).toContain("display: none !important;");
    // No print selector waits on a class that script adds, so none can miss.
    for (const rule of rules) for (const selector of rule.selectors) expect(selector).not.toMatch(/data-out|is-in|\.js\b|reveal-ready|settled|data-selected/);
    // Every hidden state above is beaten: none of the rules that hide is marked important, and each of these is.
    const media = "@media (prefers-reduced-motion: no-preference) {";
    expect(block.slice(block.indexOf(media), block.indexOf("@media print"))).not.toContain("!important");
  });
});

/** The print block of the brick rules, from its opening line to its closing brace. */
function printRules(block: string): string {
  const start = block.indexOf("@media print {");
  expect(start).toBeGreaterThan(-1);
  return block.slice(start, block.indexOf("\n}\n", start) + 3);
}

describe("the v1 homepage's words", () => {
  it("keep the copy rules: no bare dollar sign, no agent without AI, no time figure, no exclamation mark or emoji", async () => {
    const seen = text(await view({ testimonials: [] }));
    expect(seen.length).toBeGreaterThan(2000);
    expect(hasBareDollar(seen)).toBe(false);
    expect(seen).not.toMatch(bareAgent);
    expect(seen).not.toMatch(timeFigure);
    expect(seen).not.toContain("!");
    expect(seen).not.toMatch(emoji);
    expect(seen).not.toMatch(/Circle/);
    // The higher rate is not on the homepage: Peter took it out of the control block and out of "What does it cost?"
    // (November 26, 2026). It is stated in two answers on /faq and in the terms.
    expect(seen).not.toMatch(/US\$400|CA\$560|the price becomes/);
    expect(seen).not.toMatch(/bricks?/i);
  });

  it("the third point under “You decide what Zack shares” leads with turning sharing off, and says nothing more than Peter's line", async () => {
    const control = text(sectionMarkup(await view(), "control"));
    expect(control).toContain("Turn sharing off any time in your dashboard. Protect your privacy and your most valuable ideas at any time. How Zack works");
    expect(control).not.toMatch(/Cora Curations keep coming|\$/);
  });

  it("answers the two money questions in Peter's cut: no higher rate in “What does it cost?”, and “When is my card charged?” starts at the first charge", async () => {
    const questions = sectionMarkup(await view(), "questions");
    const answer = (q: string) => text(new RegExp(`<summary[^>]*>${q.replace("?", "\\?")}.*?</summary>(.*?)</details>`).exec(questions)![1]);
    expect(answer("What does it cost?")).toBe(
      "US$200 a month, plus tax where it applies. In Canada it is CA$280 a month, plus applicable tax. Get two Cora Curations for free and pay only after you have tried the product for two full weeks.",
    );
    expect(answer("When is my card charged?")).toBe(
      "The first charge comes with your third Cora Curation, and the charge repeats once a month after that. Your first two Cora Curations are free, and we email you after the second one with what happens next.",
    );
    // The one place the homepage still says when a card is charged is that answer: the hero and the price note no longer do.
    expect(text(sectionMarkup(await view(), "hero"))).not.toMatch(/card/i);
  });

  it("opens one row at a time within each example: the questions share one name, and every example has a name for its rows and another for its steps, with no script", async () => {
    const markup = await view();
    const names = (html: string, fold?: string) => [...html.matchAll(/<details\b([^>]*)>/g)].filter((m) => fold === undefined || m[1].includes(`data-fold="${fold}"`)).map((m) => /\sname="([^"]*)"/.exec(m[1])?.[1] ?? "");
    const questions = names(sectionMarkup(markup, "questions"));
    expect(questions).toHaveLength(7);
    expect(new Set(questions)).toEqual(new Set(["questions-rows"]));
    const section = sectionMarkup(markup, "examples");
    const rows = [...section.matchAll(/<details\b([^>]*)>/g)].map((m) => ({ fold: /data-fold="([^"]*)"/.exec(m[1])![1], name: /\sname="([^"]*)"/.exec(m[1])?.[1] ?? "" }));
    const top = rows.filter((r) => r.fold !== "step");
    const steps = rows.filter((r) => r.fold === "step");
    expect(top.map((r) => r.fold)).toEqual(examples.flatMap(() => ["summary", "copy", "playbook"]));
    // Opening a row of one example never closes a row of another: each example's rows have their own name.
    expect(top.map((r) => r.name)).toEqual(examples.flatMap((e) => Array(3).fill(`examples-${e.id}-card-rows`)));
    expect(steps.map((r) => r.name)).toEqual(examples.flatMap((e) => Array(8).fill(`examples-${e.id}-card-steps`)));
    // The questions' group, and two for each example, so a step opening never closes the row it is in.
    expect(new Set([...questions, ...rows.map((r) => r.name)]).size).toBe(1 + 2 * examples.length);
    // Every row on the page that folds is in one of them, and none arrives open.
    for (const m of markup.matchAll(/<details\b([^>]*)>/g)) {
      expect(m[1]).toMatch(/\sname="[^"]+"/);
      expect(m[1]).not.toMatch(/\sopen(?:[\s=]|$)/);
    }
  });

  it("speak to anyone, of Cora Curations and of one monthly price (Peter's homepage review, November 26, 2026)", async () => {
    const page = await view({ testimonials: [] });
    // Nothing on the page names a trade.
    const seen = text(page);
    expect(seen).not.toMatch(/real estate/i);
    expect(seen).not.toMatch(/Monday lists?\b|one list at a time|one at a time/i);
    expect(seen.match(/Cora Curations?/g)!.length).toBeGreaterThan(10);
  });
});

/**
 * The sections an admin has switched off or moved (plan U6, R7). The built-in order above is what the page prints
 * with nothing stored. With something stored, the page prints the sections that are on, in the stored order, and
 * one rule decides what stands between two neighbours, whatever the order:
 *
 *   both on ground      the hairline, as the built-in order has between the problem and the examples
 *   both on night       the same line in the night's rule colour, so two dark chapters never run into one block
 *   anything else       nothing: the change of background is the break
 *
 * A section that prints nothing (no testimonial is cleared) is no neighbour.
 */
describe("the v1 homepage with its sections switched off or moved (plan U6)", () => {
  const HOME = ["hero", "problem", "examples", "compounds", "testimonials", "control", "price", "questions", "closing"];
  /** The name each section has in the markup, by its id in the registry. */
  const named: Record<string, string> = { testimonials: "say" };
  const laid = (home: { order?: string[]; off?: string[] }, more: Overlay["sections"] = {}): Overlay => ({ ...emptyOverlay, sections: { ...more, home: { order: home.order ?? [], off: home.off ?? [] } } });
  /** The page's sections and what stands between them, in order: a section by its name, "—" for a hairline, "=" for the line between two night chapters. */
  const flow = (markup: string) =>
    [...markup.matchAll(/<section\b[^>]*aria-labelledby="([\w-]+)-title"|data-hairline|data-seam="([\w-]+)"/g)].map((m) => (m[1] ? m[1] : m[2] ? (m[2] === "night" ? "=" : `=${m[2]}`) : "—"));
  const swapped = HOME.map((id) => (id === "price" ? "questions" : id === "questions" ? "price" : id));

  it("is the same page, byte for byte, with no entry, an entry that changes nothing, and nonsense where the entry should be", async () => {
    for (const testimonials of [[], quotes]) {
      const plain = await full({ testimonials });
      for (const content of [emptyOverlay, laid({}), laid({ order: HOME }), laid({ order: ["gone"], off: ["nope"] }), { ...emptyOverlay, sections: { home: "x" } } as never, { ...emptyOverlay, sections: { faq: { order: [], off: [] } } }]) {
        expect(await full({ testimonials, content }), JSON.stringify(content)).toBe(plain);
      }
    }
  });

  it("has the registry's ground under every section, and the registry's anchor as the section's id", async () => {
    const markup = await view({ testimonials: quotes });
    const page = siteRegistry.pages.find((entry) => entry.id === "home")!;
    expect(page.sections.map((section) => section.id)).toEqual(HOME);
    expect(sections(markup).map((s) => s.ground)).toEqual(page.sections.map((section) => section.ground));
    for (const section of page.sections) {
      const tag = new RegExp(`<section\\b[^>]*aria-labelledby="${named[section.id] ?? section.id}-title"[^>]*>`).exec(markup)![0];
      expect(/\sid="([^"]*)"/.exec(tag)?.[1] ?? null, section.id).toBe(section.anchor);
    }
  });

  it("leaves a switched-off section out, heading and all, and puts a hairline between the two ground sections that are now neighbours", async () => {
    const page = await view({ content: laid({ off: ["compounds"] }) });
    expect(page).not.toContain('id="compounds"');
    expect(text(page)).not.toContain(copy.home.compounds.title);
    expect(text(page)).not.toContain(copy.home.compounds.line);
    // The examples and the control block are both on ground, with nothing between them now: one hairline, by the rule.
    expect(flow(page)).toEqual(["hero", "problem", "—", "examples", "—", "control", "price", "questions", "closing"]);
    // Every other section is what it was.
    const plain = await view();
    for (const name of ["hero", "problem", "control", "questions", "closing"]) expect(sectionMarkup(page, name).replace(/<div data-hairline[\s\S]*$/, ""), name).toBe(sectionMarkup(plain, name).replace(/<div data-hairline[\s\S]*$/, ""));
    // With testimonials cleared, they stand between the two: the hairline is theirs, as in the built-in order.
    expect(flow(await view({ testimonials: quotes, content: laid({ off: ["compounds"] }) }))).toEqual(["hero", "problem", "—", "examples", "—", "say", "—", "control", "price", "questions", "closing"]);
  });

  it("follows a stored order: Questions above Price, both with their ids, and a line between the two night chapters that now meet", async () => {
    const page = await view({ content: laid({ order: swapped }) });
    expect(sections(page).map((s) => s.name)).toEqual(["hero", "problem", "examples", "compounds", "control", "questions", "price", "closing"]);
    expect(page.indexOf('id="questions"')).toBeGreaterThan(-1);
    expect(page.indexOf('id="questions"')).toBeLessThan(page.indexOf('id="price"'));
    // Control and Questions are two ground neighbours: a hairline. Price and Closing are two night ones: the night's line, and no hairline.
    expect(flow(page)).toEqual(["hero", "problem", "—", "examples", "compounds", "control", "—", "questions", "price", "=", "closing"]);
    expect(page).toMatch(/<div data-seam="night" class="bg-night"><div class="wrap"><hr class="border-night-rule"\/><\/div><\/div>/);
  });

  it("gives Problem and Control a hairline when they are made neighbours, and Price and Closing none", async () => {
    const order = ["hero", "problem", "control", "examples", "compounds", "testimonials", "price", "questions", "closing"];
    expect(flow(await view({ content: laid({ order }) }))).toEqual(["hero", "problem", "—", "control", "—", "examples", "compounds", "price", "questions", "closing"]);
    // Questions switched off: Price and Closing meet. No hairline is added for them; the night's own line keeps them apart.
    const page = await view({ content: laid({ off: ["questions"] }) });
    expect(flow(page)).toEqual(["hero", "problem", "—", "examples", "compounds", "control", "price", "=", "closing"]);
    expect(page.match(/data-hairline/g)).toHaveLength(1);
  });

  it("ignores a stored id the page does not have, and prints a section the stored order does not name where the code has it", async () => {
    // An order from before "It compounds" and the testimonials existed, with a section that is gone.
    const older = ["hero", "who-runs-this", "examples", "problem", "control", "price", "questions", "closing"];
    expect(sections(await view({ testimonials: quotes, content: laid({ order: older }) })).map((s) => s.name)).toEqual(["hero", "examples", "compounds", "say", "problem", "control", "price", "questions", "closing"]);
  });

  it("does not count a section that prints nothing as a neighbour: testimonials with no cleared quote", async () => {
    // Testimonials moved between Price and Closing. With none cleared, the two night chapters are neighbours.
    const order = ["hero", "problem", "examples", "compounds", "control", "questions", "price", "testimonials", "closing"];
    expect(flow(await view({ content: laid({ order }) }))).toEqual(["hero", "problem", "—", "examples", "compounds", "control", "—", "questions", "price", "=", "closing"]);
    expect(flow(await view({ testimonials: quotes, content: laid({ order }) }))).toEqual(["hero", "problem", "—", "examples", "compounds", "control", "—", "questions", "price", "say", "closing"]);
    // Switched off, they are absent even with a quote cleared.
    expect(await view({ testimonials: quotes, content: laid({ off: ["testimonials"] }) })).not.toContain('id="say"');
  });

  it("keeps the rule for any order and any sections switched off: one line between two neighbours on the same ground, none between two on different grounds", async () => {
    const ground = (name: string) => siteRegistry.pages.find((entry) => entry.id === "home")!.sections.find((section) => (named[section.id] ?? section.id) === name)!.ground;
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let seams = 0;
    for (let run = 0; run < 40; run++) {
      const order = HOME.map((id) => [next(), id] as const).sort((a, b) => a[0] - b[0]).map(([, id]) => id);
      const off = HOME.filter(() => next() < 0.25);
      const testimonials = next() < 0.5 ? quotes : [];
      const page = await view({ testimonials, content: laid({ order, off }) });
      const seen = flow(page);
      const names = seen.filter((mark) => mark !== "—" && !mark.startsWith("="));
      const label = `order ${order.join(",")} off ${off.join(",")}`;
      // Exactly the sections that are on and print something, in the stored order.
      expect(names, label).toEqual(order.filter((id) => !off.includes(id) && (id !== "testimonials" || testimonials.length > 0)).map((id) => named[id] ?? id));
      const expected: string[] = [];
      for (const [i, name] of names.entries()) {
        if (i > 0 && ground(names[i - 1]) === ground(name)) expected.push(ground(name) === "ground" ? "—" : ground(name) === "night" ? "=" : `=${ground(name)}`);
        expected.push(name);
      }
      expect(seen, label).toEqual(expected);
      seams += seen.filter((mark) => mark === "=").length;
      // Never two sections' markup for one id, and at most one h1.
      expect((page.match(/<h1\b/g) ?? []).length, label).toBe(off.includes("hero") ? 0 : 1);
    }
    // The orders tried do put night chapters side by side.
    expect(seams).toBeGreaterThan(5);
  });

  it("takes its questions from the groups /faq shows: a group switched off there is left out here, and /faq's order is this section's", async () => {
    const all = questionsOn(copy, "home");
    const ofGroup = (id: string) => copy.questions.find((group) => group.id === id)!.items.filter((item) => item.on.includes("home"));
    const asked = (markup: string) => [...sectionMarkup(markup, "questions").matchAll(/<summary\b[^>]*>([\s\S]*?)<svg/g)].map((m) => text(m[1]));
    expect(asked(await view())).toEqual(all.map((item) => item.q));
    // The group with the most of the homepage's questions, switched off on /faq.
    const group = [...copy.questions].sort((a, b) => ofGroup(b.id).length - ofGroup(a.id).length)[0];
    expect(ofGroup(group.id).length).toBeGreaterThan(0);
    const without = await view({ content: { ...emptyOverlay, sections: { faq: { order: [], off: [group.id] } } } });
    expect(asked(without)).toEqual(all.filter((item) => !ofGroup(group.id).some((gone) => gone.q === item.q)).map((item) => item.q));
    // /faq's groups in reverse: the homepage's questions follow.
    const reversed = [...copy.questions].reverse();
    const turned = await view({ content: { ...emptyOverlay, sections: { faq: { order: reversed.map((entry) => entry.id), off: [] } } } });
    expect(asked(turned)).toEqual(reversed.flatMap((entry) => ofGroup(entry.id)).map((item) => item.q));
    // Every group off: the section has nothing to show, and is not printed, heading and all.
    const none = await view({ content: { ...emptyOverlay, sections: { faq: { order: [], off: copy.questions.map((entry) => entry.id) } } } });
    expect(none).not.toContain('id="questions"');
    expect(flow(none)).toEqual(["hero", "problem", "—", "examples", "compounds", "control", "price", "=", "closing"]);
  });

  it("still has no element with the id price when Price is off: the header's link then opens the page at its top", async () => {
    const page = await view({ content: laid({ off: ["price"] }) });
    expect(page).not.toMatch(/\sid="price"/);
    expect(text(page)).not.toContain(copy.priceBlock.title);
    expect(flow(page)).toEqual(["hero", "problem", "—", "examples", "compounds", "control", "—", "questions", "closing"]);
    // Nothing is streamed in for a price block that is not there.
    expect(streamed(await full({ content: laid({ off: ["price"] }) }))).not.toContain(copy.priceBlock.title);
  });
});

describe("the homepage's metadata", () => {
  it("is indexable under v1, with the v1 title and description", async () => {
    const { metadata } = await import("@/app/page");
    expect(metadata.robots).toBeUndefined();
    expect(metadata.title).toEqual({ absolute: "Roger: Your AI agents, smarter every Monday." });
    expect(metadata.description).toBe(copy.meta.description);
    expect(metadata.alternates).toEqual({ canonical: "/" });
  });

  it("is unchanged under Circles", async () => {
    vi.resetModules();
    process.env.SITE_VERSION = "circles";
    try {
      const { metadata } = await import("@/app/page");
      expect(metadata).toEqual({
        title: { absolute: "Roger Circles: Stop figuring out AI agents alone." },
        description: "A confidential Circle of eight people who use AI agents heavily for work. Trade what works, get ranked playbooks every Monday, and help each other install them.",
        alternates: { canonical: "/" },
        openGraph: { url: "/", title: "Stop figuring out AI agents alone.", description: "Eight people. Any agents. A better week of work." },
      });
    } finally {
      process.env.SITE_VERSION = "v1";
      vi.resetModules();
    }
  });
});
