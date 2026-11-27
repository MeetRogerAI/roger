/**
 * The v1 homepage (plan U5): the spec's eleven sections in order, the hero's
 * four parts and the compounding loop as the server sends them, and the rules a homepage
 * must keep (card line, audience, no /zack link, no broken image, copy rules).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig, v3Defaults } from "@/data/config";
import { compoundingFinal, compoundingSteps } from "@/data/site/compounding";
import { letter, letterShown } from "@/data/site/letter";
import { samplePlay } from "@/data/site/sample-play";
import { questionsOn, v1Copy } from "@/data/site/v1";
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

const { publicIdeaView } = await import("@/lib/site/sample");
const { V1Home, V1HomeView } = await import("./home");
const { Compounding } = await import("./blocks/compounding");

const amounts = amountsFrom(v3Defaults);
const { copy } = v1Copy(amounts);
const idea = publicIdeaView(samplePlay, v3Defaults.playbookPreface);

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

const full = (over: { testimonials?: Testimonial[]; photo?: string } = {}) =>
  pageMarkup(<V1HomeView version="v1" amounts={amounts} idea={idea} testimonials={over.testimonials ?? []} photo={over.photo ?? ""} />);
const view = async (over: Parameters<typeof full>[0] = {}) => shell(await full(over));
const served = async (version: "v1" | "v2" | "v3" = "v1") => shell(await pageMarkup(<V1Home version={version} />));

// The same rules as the copy tests in blocks/blocks.test.tsx, applied to what the page prints.
const bareAgent = /(?<!\bAI )\bagents?\b/i;
const timeFigure = /\d\s*(?:hours?|hrs?|minutes?|mins?)\b/i;
const emoji = /\p{Extended_Pictographic}/u;

beforeEach(() => resetNextFakes());

describe("the v1 homepage, as the page serves it", () => {
  it("has the spec's sections in order, with no testimonials section while none is cleared", async () => {
    const markup = await served();
    expect(sections(markup)).toEqual([
      { name: "hero", ground: "night" },
      { name: "problem", ground: "ground" },
      { name: "how", ground: "night" },
      { name: "sample", ground: "ground" },
      { name: "compounds", ground: "ground-2" },
      { name: "control", ground: "ground" },
      { name: "who", ground: "ground" },
      { name: "price", ground: "night" },
      { name: "questions", ground: "ground" },
      { name: "closing", ground: "night" },
    ]);
    // No dangling heading or wrapper where the testimonials would be.
    expect(text(markup)).not.toContain(copy.testimonials.title);
    expect(markup).not.toContain('id="say"');
    expect(markup).toContain('data-site="v1"');
    expect(markup).toContain('<section id="how"');
  });

  it("prints each section's own words, in the spec's order", async () => {
    const seen = text(await served());
    const marks = [
      copy.home.hero.headline,
      copy.home.hero.sub,
      copy.home.problem.statements[0],
      copy.home.problem.statements[2],
      copy.home.how.steps[0].body,
      copy.home.how.steps[3].body,
      copy.sample.line,
      idea.title,
      copy.home.compounds.line,
      copy.control.title,
      copy.home.whoRuns.leadIn,
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
  it("puts testimonials sixth when there are some, and keeps night chapters apart either way", async () => {
    const withQuotes = sections(await view({ testimonials: quotes }));
    expect(withQuotes.map((s) => s.name)).toEqual(["hero", "problem", "how", "sample", "compounds", "say", "control", "who", "price", "questions", "closing"]);
    expect(withQuotes[5]).toEqual({ name: "say", ground: "ground" });
    expect(text(await view({ testimonials: quotes }))).toContain("“A made-up quote, to place the section.”");

    for (const list of [withQuotes, sections(await view())]) {
      for (const [i, s] of list.entries()) if (i > 0 && s.ground === "night") expect(list[i - 1].ground, s.name).not.toBe("night");
      expect(list[0].ground).toBe("night");
      expect(list.at(-1)!.ground).toBe("night");
    }
  });

  it("keeps two ground sections that are neighbours apart with a hairline, and adds none elsewhere", async () => {
    // Without testimonials: before "who runs this" only. With them: before the control block too.
    expect((await view()).match(/data-hairline/g)).toHaveLength(1);
    expect((await view({ testimonials: quotes })).match(/data-hairline/g)).toHaveLength(2);
  });

  it("has one h1, the headline, and a heading for every section", async () => {
    const markup = await view({ testimonials: quotes });
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(text(/<h1\b[\s\S]*?<\/h1>/.exec(markup)![0])).toBe(copy.home.hero.headline);
    for (const s of sections(markup)) expect(markup, s.name).toMatch(new RegExp(`<h[12] id="${s.name}-title"`));
  });

  it("hero: the card line sits directly under the two buttons, in small type", async () => {
    const hero = sectionMarkup(await view(), "hero");
    const actions = /<div data-hero-actions[\s\S]*?<\/div>/.exec(hero)![0];
    expect(text(actions)).toBe(`${copy.buttons.start} ${copy.home.hero.secondary.label}`);
    expect(hrefs(actions)).toEqual(["/start?path=re", "#how"]);
    expect(copy.cardLine).toBe("Card required. Charged only with your third Cora Curation.");
    // The very next element after the buttons is the card line.
    expect(hero.slice(hero.indexOf(actions) + actions.length)).toMatch(/^<p class="[^"]*text-meta[^"]*">Card required\. Charged only with your third Cora Curation\.<\/p>/);
  });

  it("hero: the sub-line is Peter's, for anyone and not for one trade", async () => {
    const hero = sectionMarkup(await view(), "hero");
    expect(text(hero)).toContain("Roger makes your AI agents smarter every week, with battle tested ideas that have already worked for real people in the network.");
    expect(text(hero)).not.toMatch(/real estate/i);
  });

  it("hero: the picture is the four parts of “How it works”, each under its label, all readable with no script", async () => {
    const page = await view();
    const hero = sectionMarkup(page, "hero");
    // The old picture, the brick stack that dropped three bricks, is gone from this page.
    expect(hero).not.toContain("bricks-arrive");
    expect(hero).toContain("data-hero-steps");
    const parts = [...hero.matchAll(/<li data-step="\d"[^>]*>(.*?)<\/li>/g)].map((m) => text(m[1]));
    // The headlines are the section's own, read from the copy and not typed again: Use is step 1, and so on.
    const labels = ["Use", "Collect", "Curate", "Deploy"];
    expect(parts).toEqual(copy.home.how.steps.map((step, i) => `${labels[i]} ${step.title}`));
    const how = text(sectionMarkup(page, "how"));
    for (const step of copy.home.how.steps) expect(how).toContain(step.title);
    // Headline only: no step's body is in the hero, and no number is printed there.
    for (const step of copy.home.how.steps) expect(text(hero)).not.toContain(step.body);
    expect(text(hero)).not.toMatch(/\d/);
    expect(hero).not.toMatch(/aria-live/);
  });

  it("the problem: the three statements", async () => {
    const problem = sectionMarkup(await view(), "problem");
    expect(problem.match(/<li/g)).toHaveLength(3);
    expect(text(problem)).toBe(`${copy.home.problem.title} ${copy.home.problem.statements.join(" ")}`);
  });

  it("how it works: four numbered steps, and a stack one week taller at each", async () => {
    const how = sectionMarkup(await view(), "how");
    const steps = how.split(/<li>/).slice(1);
    expect(steps).toHaveLength(4);
    // Four steps keep the four-across grid; three steps (the /agents page) use another.
    expect(how).toMatch(/<ol data-reveal="true" class="[^"]*sm:grid-cols-2 lg:grid-cols-4[^"]*"/);
    expect(how).not.toContain("md:grid-cols-3");
    for (const [i, step] of steps.entries()) {
      expect(step).toContain("sm:h-[98px]");
      expect(step).not.toContain("md:h-[72px]");
      expect(step).toContain(`data-bricks="${(i + 1) * 3}"`);
      expect(step).toContain(`--step:${i}`);
      expect(step.match(/<span class="sr-only">Week \d+, idea [123]: set up<\/span>/g)).toHaveLength((i + 1) * 3);
      // The large numeral is decoration, above the short title.
      expect(step).toMatch(new RegExp(`<p aria-hidden="true"[^>]*>${i + 1}</p><h3[^>]*>${copy.home.how.steps[i].title}</h3>`));
      expect(text(step)).toContain(copy.home.how.steps[i].body);
    }
  });

  it("what arrives on Monday: the sample card under its one line", async () => {
    const sample = sectionMarkup(await view(), "sample");
    expect(text(sample).startsWith(`${copy.sample.title} This is one idea, as it arrives. ${idea.category} ${idea.title}`)).toBe(true);
    expect(sample).not.toMatch(/<dialog/i);
  });

  it("what arrives on Monday: folded when the page loads, with all of the play's text still in the page", async () => {
    const sample = sectionMarkup(await view(), "sample");
    const rows = sample.match(/<details\b[^>]*>/g) ?? [];
    // Summary, What To Copy, the one playbook row, and the eight steps inside it.
    expect(rows).toHaveLength(11);
    for (const row of rows) expect(row).not.toMatch(/\sopen\b/);
    const seen = text(sample);
    expect(seen).toContain(samplePlay.description);
    expect(seen).toContain(samplePlay.pasteToInstall);
    expect(seen).toContain("Claude drafts only. It never sends.");
    expect(seen).toContain("The Idea");
    expect(seen).toContain("The Playbook");
  });

  it("who runs this: the lead-in, the first three still-true letter paragraphs as shown, and the link to /about", async () => {
    const who = sectionMarkup(await view(), "who");
    const three = letterShown.slice(0, 3);
    expect(three.map((p) => p.id)).toEqual(["who", "noticed", "background"]);
    expect(text(who)).toBe(`${copy.home.whoRuns.title} Roger is run by Peter Kuperman. ${three.map((p) => p.shown).join(" ")} ${copy.home.whoRuns.link.label}`);
    for (const p of letter.paragraphs.filter((x) => !x.stillTrue)) expect(text(who)).not.toContain(p.shown);
    expect(hrefs(who)).toEqual(["/about"]);
  });

  it("who runs this: no image element and no empty frame while the photograph's path is empty, and the photograph once it is set", async () => {
    const without = await view({ photo: "" });
    expect(without).not.toMatch(/<img\b/i);
    expect(without).not.toMatch(/<picture\b/i);
    expect(without).not.toContain("data-photo");
    // The text-only layout: one narrow column, no grid with a slot for the picture.
    expect(sectionMarkup(without, "who")).toContain("max-w-[40rem]");
    expect(sectionMarkup(without, "who")).not.toContain("md:grid-cols-");

    const withPhoto = await view({ photo: "/media/peter.jpg" });
    const imgs = withPhoto.match(/<img\b[^>]*>/g) ?? [];
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toContain('alt="Peter Kuperman"');
    expect(imgs[0]).toContain("peter.jpg");
    expect(sectionMarkup(withPhoto, "who")).toContain("data-photo");
    expect(sectionMarkup(withPhoto, "who")).toContain("md:grid-cols-");
  });

  it("who runs this: the page takes the photograph from the configuration, never from the disk", async () => {
    // What the page serves follows siteConfig.founder.photo, whichever it is today.
    const who = sectionMarkup(await served(), "who");
    expect(who.includes("data-photo")).toBe(siteConfig.founder.photo !== "");
    expect((who.match(/<img\b/g) ?? []).length).toBe(siteConfig.founder.photo === "" ? 0 : 1);
    // Nothing on the homepage's path reads the file system to decide.
    for (const file of ["src/components/site/v1/home.tsx", "src/components/site/v1/blocks/who-runs-this.tsx"]) {
      expect(readFileSync(path.join(process.cwd(), file), "utf8"), file).not.toMatch(/node:fs|existsSync/);
    }
  });

  it("price: the price block for the visitor's country, both currencies in the markup", async () => {
    const usd = sectionMarkup(await view(), "price");
    expect(usd).toMatch(/aria-pressed="true"[^>]*>USD</);
    for (const line of ["US$200 / month USD", "CA$280 / month CAD"]) expect(text(usd)).toContain(line);
    expect(text(usd)).toContain(copy.trialLine);
    // Monthly only, under Peter's line.
    expect(usd.match(/data-plan="/g)).toHaveLength(1);
    expect(text(usd)).not.toMatch(/one list|one at a time|\/ list\b/i);
    expect(text(usd).startsWith(`${copy.priceBlock.title} Get two Cora Curations for free and pay only after you have tried the product for two full weeks.`)).toBe(true);

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

  it("closing band: the line, the line under the price, the button and the trial line, all about Cora Curations", async () => {
    expect(text(sectionMarkup(await view(), "closing"))).toBe(
      `See what your first two Cora Curations bring. Get two Cora Curations for free and pay only after you have tried the product for two full weeks. ${copy.buttons.start} ${copy.trialLine}`,
    );
  });
});

describe("the v1 homepage's links", () => {
  it("gives every start button the audience re in its server-rendered address", async () => {
    for (const markup of [await view(), await view({ testimonials: quotes })]) {
      const starts = hrefs(markup).filter((h) => h.startsWith("/start"));
      // The hero, the price block and the closing band.
      expect(starts).toEqual(["/start?path=re", "/start?path=re", "/start?path=re"]);
      expect(markup.match(/>Get two free Cora Curations<\/a>/g)).toHaveLength(3);
      // Every link to /start reads exactly that, and nothing else.
      const labels = [...markup.matchAll(/<a\b[^>]*href="\/start[^"]*"[^>]*>(.*?)<\/a>/g)].map((m) => text(m[1]));
      expect(labels).toEqual(["Get two free Cora Curations", "Get two free Cora Curations", "Get two free Cora Curations"]);
    }
  });

  it("has no link to /zack, and none to a Circles or legacy page", async () => {
    const all = hrefs(await view({ testimonials: quotes, photo: "/media/peter.jpg" }));
    expect(all.filter((h) => h.startsWith("/zack"))).toEqual([]);
    expect(all.filter((h) => !h.startsWith("/_next/"))).toEqual(["/start?path=re", "#how", "/how-it-works#zack", "/about", "/start?path=re", "/faq", "/start?path=re"]);
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

  it("shows every state's week and brick count as text, in the copy's words and the data's numbers", () => {
    const labels = [...markup.matchAll(/<li data-loop-state="(\d+)"[^>]*>(.*?)<\/li>/g)];
    expect(labels.map((m) => Number(m[1]))).toEqual(storySteps.map((s) => s.week));
    for (const [i, step] of storySteps.entries()) {
      const caption = compoundingCaption(copy.bricks.caption, step);
      expect(text(labels[i][2])).toBe(`${caption.week} ${caption.bricks}`);
    }
    expect(seen).toContain("Week 1 3 bricks Week 2 6 bricks Week 3 9 bricks Week 4 12 bricks Week 10 30 bricks Week 17 51 bricks Week 26 78 bricks");
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
    // Outside the media block there is only the keyframe, the failsafe that ends an animation, and the print rules (below).
    expect(outside).not.toMatch(/opacity: 0(?:\.\d+)?;[\s\S]*opacity: 0/);
    expect(outside).not.toContain("data-out");
    expect(outside).not.toContain("bricks-grow");
    // Inside it, every rule starts from a class that only script adds.
    const selectors = [...inside.matchAll(/^ {2}(\.[^{]+) \{$/gm)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(8);
    for (const selector of selectors) expect(selector).toMatch(/^\.js |^\.reveal-ready /);
  });

  it("force the finished picture in print, whatever classes script has added", () => {
    const print = printRules(block);
    const rules = [...print.matchAll(/^ {2}((?:\.[^{]+?,\n {2})*\.[^{]+?) \{\n([\s\S]*?)\n {2}\}/gm)].map((m) => ({ selectors: m[1].split(/,\n\s*/), body: m[2] }));
    const shows = rules.find((r) => r.body.includes("opacity: 1 !important"))!;
    // Every brick the rules above can hide or move: the two stacks, the loop's, and the four of the hero's picture.
    expect(shows.selectors).toEqual([".bricks-arrive [data-brick]", ".bricks-grow [data-brick]", ".compounding-loop [data-brick]", ".hero-steps [data-step-bricks] li"]);
    for (const line of ["animation: none !important;", "transition: none !important;", "opacity: 1 !important;", "transform: none !important;"]) expect(shows.body).toContain(line);
    // The hero's four parts are printed as the still list: every part shown, with its label, and no control.
    const parts = rules.find((r) => r.selectors.includes(".hero-steps [data-step]"))!;
    for (const line of ["opacity: 1 !important;", "visibility: visible !important;", "grid-area: auto !important;"]) expect(parts.body).toContain(line);
    const controls = rules.find((r) => r.selectors.includes(".compounding-loop [data-loop-pause]"))!;
    expect(controls.selectors).toEqual([".hero-steps [data-step-tabs]", ".hero-steps [data-step-pause]", ".compounding-loop [data-loop-pause]"]);
    expect(controls.body).toContain("display: none !important;");
    // No print selector waits on a class that script adds, so none can miss.
    for (const rule of rules) for (const selector of rule.selectors) expect(selector).not.toMatch(/data-out|is-in|\.js\b|reveal-ready|settled/);
    // Every hidden state above is beaten: none of the rules that hide is marked important, and each of these is.
    const media = "@media (prefers-reduced-motion: no-preference) {";
    expect(block.slice(block.indexOf(media), block.indexOf("@keyframes"))).not.toContain("!important");
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
    // The higher rate appears twice, in the control block and in the answer to "What does it cost?", each time with both currencies and as what turning sharing off does.
    expect(seen.match(/US\$400/g)).toHaveLength(2);
    expect(seen.match(/the price becomes US\$400 a month \(CA\$560 in Canada\)\./g)).toHaveLength(2);
  });

  it("speak to anyone, of Cora Curations and of one monthly price (Peter's homepage review, November 26, 2026)", async () => {
    const page = await view({ testimonials: [] });
    // Peter's own letter keeps his own history, word for word; nothing else on the page names a trade.
    const outsideLetter = text(page.replace(sectionMarkup(page, "who"), ""));
    expect(outsideLetter).not.toMatch(/real estate/i);
    expect(text(sectionMarkup(page, "who"))).toContain("I made my first real estate investment");
    const seen = text(page);
    expect(seen).not.toMatch(/Monday lists?\b|one list at a time|one at a time/i);
    expect(seen.match(/Cora Curations?/g)!.length).toBeGreaterThan(10);
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
