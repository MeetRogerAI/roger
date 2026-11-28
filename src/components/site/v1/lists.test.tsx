/**
 * The lists of the covered pages as an admin leaves them (plan U7, R8, AE8):
 * with no list entry every block's markup is what it was, and with one each
 * block prints the items the layers leave, in their order, laid out by how
 * many there are. What counts items follows the list: the hero's buttons and
 * squares, the numbers of the first-weeks steps, the homepage's questions.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { examples, firstExample } from "@/data/site/examples";
import { questionsOn } from "@/data/site/v1";
import { amountsFrom } from "@/lib/site/amounts";
import { emptyOverlay, type ListEdit, type Overlay } from "@/lib/site/content/format";
import { v1Copy } from "@/lib/site/content/model";
import { siteRegistry } from "@/lib/site/content/registry";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";
import { ControlBlock } from "./blocks/control-block";
import { HeroSteps } from "./blocks/hero-steps";
import { Problem, itemColumns } from "./blocks/sections";

vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { V1HomeView } = await import("./home");
const { V1FaqView } = await import("./faq");
const { V1HowItWorksView } = await import("./how-it-works");

const amounts = amountsFrom(v3Defaults);
const preface = v3Defaults.playbookPreface;

const STATEMENTS = "home.problem.statements";
const STEPS = "home.hero.graphic.steps";
const POINTS = "control.points";
const DAYS = "howItWorks.week.days";
const FIRST = "howItWorks.firstWeeks.steps";
const STARTED = "questions.getting-started.items";
const BILLING = "questions.price-and-billing.items";
const entry = (parts: Partial<ListEdit>): ListEdit => ({ order: [], removed: [], added: [], ...parts });
const stored = (lists: Overlay["lists"], text: Overlay["text"] = {}): Overlay => ({ ...emptyOverlay, text, lists });

const home = (content?: Overlay) => pageMarkup(<V1HomeView version="v1" amounts={amounts} preface={preface} testimonials={[]} content={content} />);
const faq = (content?: Overlay) => pageMarkup(<V1FaqView version="v1" amounts={amounts} content={content} />);
const how = (content?: Overlay) => pageMarkup(<V1HowItWorksView version="v1" amounts={amounts} preface={preface} files={[]} content={content} />);
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
/** One section's markup, by its id. */
const section = (markup: string, id: string) => {
  const start = markup.indexOf(`<section id="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  return markup.slice(start, markup.indexOf("</section>", start));
};
/** The questions a page prints, in order. */
const asked = (markup: string) => [...markup.matchAll(/<summary[^>]*>(.*?)<svg/g)].map((m) => text(m[1]));

beforeEach(() => resetNextFakes());

describe("with no list entry", () => {
  it("prints every covered page byte for byte as it was, and so does an entry that changes nothing or names nothing the list has", async () => {
    const same: Overlay[] = [
      emptyOverlay,
      stored({ [STATEMENTS]: entry({}) }),
      stored({ [STATEMENTS]: entry({ order: ["told", "unposted", "alone"] }) }),
      stored({ [STEPS]: entry({ order: ["gone"], removed: ["nope"], added: ["x-no-texts"] }) }),
      stored({ [STARTED]: "x", [POINTS]: null } as never),
      // A text for an item no list has.
      stored({}, { [`${STARTED}.x-1.q`]: "Nobody added me?", [`${STARTED}.x-1.a`]: "No." }),
    ];
    for (const page of [home, faq, how]) {
      const plain = await page();
      for (const content of same) expect(await page(content), JSON.stringify(content)).toBe(plain);
    }
  });

  it("lays three statements and three points out as it always has, class for class", () => {
    const { copy } = v1Copy(amounts);
    expect(itemColumns(3)).toBe("max-w-[64rem] gap-10 md:grid-cols-3 md:gap-12");
    expect(renderToStaticMarkup(<Problem copy={copy.home.problem} />)).toContain('class="mx-auto mt-14 grid max-w-[64rem] gap-10 md:grid-cols-3 md:gap-12"');
    expect(renderToStaticMarkup(<ControlBlock copy={copy.control} />)).toContain('class="mx-auto mt-14 grid max-w-[64rem] gap-10 md:grid-cols-3 md:gap-12"');
    const hero = renderToStaticMarkup(<HeroSteps copy={copy.home.hero.graphic} words={copy.bricks} />);
    expect(hero).toContain('aria-label="How Roger works, in four parts" class="mb-3 hidden grid-cols-4 gap-1 ');
    expect(hero.match(/<div class="flex h-\[98px\] items-end justify-between gap-6">/g)).toHaveLength(4);
  });
});

describe("the problem statements and the control points", () => {
  it("prints the statements reordered third, first, second in that order", async () => {
    const { copy } = v1Copy(amounts);
    const [told, unposted, alone] = copy.home.problem.statements.map((statement) => statement.text);
    const page = section(await home(stored({ [STATEMENTS]: entry({ order: ["alone", "told", "unposted"] }) })), "problem");
    expect([...page.matchAll(/<p class="text-lead">(.*?)<\/p>/g)].map((m) => text(m[1]))).toEqual([alone, told, unposted]);
  });

  it("prints an added control point with a title and a body last, and second to last once it is moved up one", async () => {
    const added = { [`${POINTS}.x-1.title`]: "Start small.", [`${POINTS}.x-1.body`]: "Share an outline only, for {monthlyUsd} a month all the same." };
    const titles = (markup: string) => [...section(markup, "control").matchAll(/<p class="text-title">(.*?)<\/p>/g)].map((m) => text(m[1]));
    const last = await home(stored({ [POINTS]: entry({ added: ["x-1"] }) }, added));
    expect(titles(last)).toEqual(["Read every line.", "Set your own rules.", "Turn sharing off any time in your dashboard.", "Start small."]);
    // Its amount is filled like any other line's.
    expect(text(section(last, "control"))).toContain("Share an outline only, for US$200 a month all the same.");
    // Four are two rows of two.
    expect(section(last, "control")).toContain("md:grid-cols-2");
    const moved = await home(stored({ [POINTS]: entry({ order: ["read", "rules", "x-1", "off"], added: ["x-1"] }) }, added));
    expect(titles(moved)).toEqual(["Read every line.", "Set your own rules.", "Start small.", "Turn sharing off any time in your dashboard."]);
  });

  it("gives a row to every count the list may hold, with no hole in it: one, two and four in columns of their own, the rest in threes", () => {
    expect([1, 2, 3, 4, 5, 6].map((count) => /md:grid-cols-(\d)/.exec(itemColumns(count))![1])).toEqual(["1", "2", "3", "2", "3", "3"]);
  });

  it("renders a section whose list has been emptied without the list, and does not throw", async () => {
    const emptied = stored({ [STATEMENTS]: entry({ removed: ["told", "unposted", "alone"] }), [POINTS]: entry({ removed: ["read", "rules", "off"] }) });
    const page = await home(emptied);
    const problem = section(page, "problem");
    expect(text(problem)).toBe("The problem");
    expect(problem).not.toContain("<ul");
    const control = section(page, "control");
    expect(control).not.toContain("<ul");
    expect(text(control)).toBe("You decide what Zack shares How Zack works");
  });
});

describe("the hero's steps", () => {
  const steps = (markup: string) => [...markup.matchAll(/<li data-step="(\d)" data-active="(yes|no)">(.*?)<\/li>(?=<li data-step|<\/ol>)/g)];
  const tabs = (markup: string) => [...(/<div data-step-tabs[^>]*>(.*?)<\/div>/.exec(markup)?.[1] ?? "").matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]));

  it("leaves a removed step out of the still picture and the row of buttons, and lays three steps out as three", async () => {
    const page = await home(stored({ [STEPS]: entry({ removed: ["collect"] }) }));
    expect(tabs(page)).toEqual(["Use", "Curate", "Deploy"]);
    expect(/<div data-step-tabs[^>]*>/.exec(page)![0]).toContain(" grid-cols-3 ");
    const parts = steps(page);
    expect(parts.map((part) => text(/<span data-step-label[^>]*>(.*?)<\/span>/.exec(part[3])![1]))).toEqual(["Use", "Curate", "Deploy"]);
    // The numbers and the stacks follow the list: one to three, with three more squares at each step.
    expect(parts.map((part) => text(/<span[^>]*data-step-number[^>]*>(.*?)<\/span>/.exec(part[3])![1]))).toEqual(["1", "2", "3"]);
    expect(parts.map((part) => /data-bricks="(\d+)"/.exec(part[3])![1])).toEqual(["3", "6", "9"]);
    // Every step's box is as tall as the last step's stack: three rows.
    expect(page.match(/<div class="flex h-\[72px\] items-end justify-between gap-6">/g)).toHaveLength(3);
    expect(page).not.toContain("Zack reviews your week");
    // The name a screen reader hears no longer says "four".
    expect(page).toContain('aria-label="How Roger works, step by step"');
    expect(parts.map((part) => part[2])).toEqual(["yes", "no", "no"]);
  });

  it("keeps the picture's labels, squares and numbers together when the steps are reordered", async () => {
    const page = await home(stored({ [STEPS]: entry({ order: ["deploy", "use", "collect", "curate"] }) }));
    expect(tabs(page)).toEqual(["Deploy", "Use", "Collect", "Curate"]);
    const parts = steps(page);
    expect(parts.map((part) => [text(/<span data-step-label[^>]*>(.*?)<\/span>/.exec(part[3])![1]), text(/<h2 data-step-headline[^>]*>(.*?)<\/h2>/.exec(part[3])![1]), /data-bricks="(\d+)"/.exec(part[3])![1]])).toEqual([
      ["Deploy", "Approve The Ideas", "3"],
      ["Use", "Set up your AI agents", "6"],
      ["Collect", "Zack reviews your week", "9"],
      ["Curate", "Cora picks your three ideas", "12"],
    ]);
    expect(page).toContain('aria-label="How Roger works, in four parts"');
    expect(page.match(/h-\[98px\]/g)).toHaveLength(4);
  });

  it("draws five steps, the most the list may hold: five buttons, and stacks up to fifteen squares in a box five rows tall", async () => {
    const added = { [`${STEPS}.x-1.label`]: "Repeat", [`${STEPS}.x-1.title`]: "Every week", [`${STEPS}.x-1.body`]: "Three more ideas arrive each Monday." };
    const page = await home(stored({ [STEPS]: entry({ added: ["x-1"] }) }, added));
    expect(tabs(page)).toEqual(["Use", "Collect", "Curate", "Deploy", "Repeat"]);
    expect(/<div data-step-tabs[^>]*>/.exec(page)![0]).toContain(" grid-cols-5 ");
    expect(steps(page).map((part) => /data-bricks="(\d+)"/.exec(part[3])![1])).toEqual(["3", "6", "9", "12", "15"]);
    expect(page.match(/<div class="flex h-\[124px\] items-end justify-between gap-6">/g)).toHaveLength(5);
    // A sixth is not drawn, whatever is stored: the list holds five.
    const six = await home(stored({ [STEPS]: entry({ added: ["x-1", "x-2"] }) }, { ...added, [`${STEPS}.x-2.label`]: "More", [`${STEPS}.x-2.title`]: "And more", [`${STEPS}.x-2.body`]: "Text." }));
    expect(tabs(six)).toEqual(["Use", "Collect", "Curate", "Deploy", "Repeat"]);
    // And never fewer than two.
    expect(tabs(await home(stored({ [STEPS]: entry({ removed: ["use", "collect", "curate", "deploy"] }) })))).toEqual(["Use", "Collect"]);
  });
});

describe("the days of the week and the first-weeks steps on /how-it-works", () => {
  it("prints the days in the stored order, with an added one, and numbers the first-weeks steps by their place", async () => {
    const page = await how(
      stored(
        { [DAYS]: entry({ order: ["monday", "sunday", "tuesday", "wednesday", "x-1"], added: ["x-1"] }), [FIRST]: entry({ order: ["zack-runs", "start", "arrive", "email", "charged"], removed: ["closes"] }) },
        { [`${DAYS}.x-1.day`]: "Thursday", [`${DAYS}.x-1.body`]: "Nothing to do." },
      ),
    );
    expect([...section(page, "week").matchAll(/<dt class="text-title">(.*?)<\/dt>/g)].map((m) => m[1])).toEqual(["Monday", "Sunday", "Tuesday", "Wednesday", "Thursday"]);
    const first = [...section(page, "first-weeks").matchAll(/<li[^>]*>\s*<span[^>]*>(\d+)<\/span>\s*<span class="text-body">(.*?)<\/span>/g)].map((m) => [m[1], text(m[2])]);
    expect(first.map(([number]) => number)).toEqual(["1", "2", "3", "4", "5"]);
    expect(first[0][1]).toBe("Zack runs on Sunday.");
    expect(first[1][1]).toBe("You start, and we ask for a card. It is not charged.");
    expect(first.map(([, words]) => words).join(" ")).not.toContain("the trial closes without a charge");
  });

  it("renders both sections without their lists when every item is removed", async () => {
    const days = siteRegistry.lists.get(DAYS)!.items;
    const first = siteRegistry.lists.get(FIRST)!.items;
    const page = await how(stored({ [DAYS]: entry({ removed: [...days] }), [FIRST]: entry({ removed: [...first] }) }));
    expect(section(page, "week")).not.toContain("<dl");
    expect(text(section(page, "week"))).toBe("The week");
    expect(section(page, "first-weeks")).not.toContain("<ol");
  });
});

describe("the questions (AE8)", () => {
  const { copy } = v1Copy(amounts);
  const started = copy.questions[0].items.map((item) => item.q);

  it("shows questions reordered within a group in the new order on /faq and on the homepage", async () => {
    const content = stored({ [STARTED]: entry({ order: ["each-week", "no-agents-yet", "which-agents"] }) });
    expect(asked(section(await faq(content), "getting-started"))).toEqual([started[2], started[0], started[1]]);
    const before = asked(section(await home(), "questions"));
    const after = asked(section(await home(content), "questions"));
    // The homepage's subset keeps /faq's order: the same questions, the ones of this group in the new order.
    expect([...after].sort()).toEqual([...before].sort());
    const ofGroup = (list: string[]) => list.filter((q) => started.includes(q));
    expect(ofGroup(after)).toEqual([started[2], started[0], started[1]].filter((q) => before.includes(q)));
    expect(ofGroup(after)).not.toEqual(ofGroup(before));
  });

  it("takes a question off the homepage when its switch is off, and leaves it on /faq; switched on, one that was not there joins in /faq's order", async () => {
    const onHome = questionsOn(copy, "home").map((item) => item.q);
    const cost = copy.questions[3].items.find((item) => item.id === "cost")!.q;
    const refund = copy.questions[3].items.find((item) => item.id === "refund")!.q;
    expect(onHome).toContain(cost);
    expect(onHome).not.toContain(refund);
    const content = stored({}, { [`${BILLING}.cost.home`]: "no", [`${BILLING}.refund.home`]: "yes" });
    const homeAsks = asked(section(await home(content), "questions"));
    expect(homeAsks).not.toContain(cost);
    expect(homeAsks).toContain(refund);
    expect(homeAsks).toHaveLength(onHome.length);
    const faqAsks = asked(await faq(content));
    expect(faqAsks).toContain(cost);
    expect(faqAsks).toEqual(copy.questions.flatMap((group) => group.items.map((item) => item.q)));
  });

  it("prints an added question with its amount filled, on /faq only until it is switched onto the homepage", async () => {
    const added = { [`${BILLING}.x-1.q`]: "Is there a yearly price?", [`${BILLING}.x-1.a`]: "Not yet. It is {monthlyUsd} a month." };
    const content = stored({ [BILLING]: entry({ order: ["x-1", "cost"], added: ["x-1"] }) }, added);
    const page = await faq(content);
    expect(asked(section(page, "price-and-billing"))[0]).toBe("Is there a yearly price?");
    expect(text(section(page, "price-and-billing"))).toContain("Not yet. It is US$200 a month.");
    expect(text(await home(content))).not.toContain("Is there a yearly price?");
    const onHome = await home(stored(content.lists, { ...added, [`${BILLING}.x-1.home`]: "yes" }));
    const asks = asked(section(onHome, "questions"));
    // In /faq's order: before "What does it cost?", which it was moved above.
    expect(asks.indexOf("Is there a yearly price?")).toBe(asks.indexOf(copy.questions[3].items[0].q) - 1);
  });

  it("removes a question from both pages, and a group emptied of its questions prints nothing at all", async () => {
    const content = stored({ [STARTED]: entry({ removed: ["no-agents-yet", "which-agents", "each-week"] }) });
    const page = await faq(content);
    expect(page).not.toContain('id="getting-started"');
    expect(asked(page)).toEqual(copy.questions.slice(1).flatMap((group) => group.items.map((item) => item.q)));
    for (const q of started) expect(text(await home(content))).not.toContain(q);
    // /faq still has one main heading.
    expect(page.match(/<h1\b/g)).toHaveLength(1);
  });

  it("still shares one name across all groups on /faq, added questions included, so one answer is open on the whole page", async () => {
    const page = await faq(stored({ [STARTED]: entry({ added: ["x-1"] }) }, { [`${STARTED}.x-1.q`]: "Is it new?", [`${STARTED}.x-1.a`]: "Yes." }));
    const names = [...page.matchAll(/<details[^>]*\sname="([^"]*)"/g)].map((m) => m[1]);
    expect(names).toHaveLength(copy.questions.flatMap((group) => group.items).length + 1);
    expect(new Set(names)).toEqual(new Set(["faq-questions"]));
  });
});

describe("the Cora Curation examples (plan U8, AE8)", () => {
  const EXAMPLES = "examples";
  /** The examples section, to the next section of the page: its cards hold sections of their own. */
  const ofExamples = (markup: string) => {
    const start = markup.indexOf('<section id="examples"');
    expect(start).toBeGreaterThan(-1);
    const end = markup.indexOf('<section id=', start + 1);
    return markup.slice(start, end === -1 ? undefined : end);
  };
  const tabs = (markup: string) => [...markup.matchAll(/data-example-tab="([^"]*)"/g)].map((m) => m[1]);
  const panels = (markup: string) => [...markup.matchAll(/data-example-panel="([^"]*)" data-selected="(yes|no)"/g)].map((m) => [m[1], m[2]]);
  const added = (id: string, playbook: string, more: Record<string, string> = {}) => ({
    [`${EXAMPLES}.${id}.label`]: "Weekly invoice chaser",
    [`${EXAMPLES}.${id}.category`]: "Getting paid",
    [`${EXAMPLES}.${id}.title`]: "Chase unpaid invoices every Friday",
    [`${EXAMPLES}.${id}.summary`]: "Each Friday the AI agent lists unpaid invoices and drafts a polite reminder for each.",
    [`${EXAMPLES}.${id}.install`]: "Save this as a skill called Invoice chaser.",
    [`${EXAMPLES}.${id}.playbook`]: playbook,
    ...more,
  });

  it("with no list entry, prints the three examples as before", async () => {
    const section_ = ofExamples(await home());
    expect(tabs(section_)).toEqual(examples.map((example) => example.id));
    expect(text(section_)).toContain(examples[2].play.title);
  });

  it("covers AE8: with the first example removed, its tab and its card are gone and the first remaining one is the one shown", async () => {
    const page = ofExamples(await home(stored({ [EXAMPLES]: entry({ removed: ["video"] }) })));
    expect(tabs(page)).toEqual(["prospects", "paper"]);
    expect(panels(page)).toEqual([
      ["prospects", "yes"],
      ["paper", "no"],
    ]);
    expect(text(page)).not.toContain(examples[0].play.title);
    expect(page).not.toContain('id="examples-video"');
  });

  it("prints the examples in a new order, the first of them shown", async () => {
    const page = ofExamples(await home(stored({ [EXAMPLES]: entry({ order: ["paper", "video", "prospects"] }) })));
    expect(tabs(page)).toEqual(["paper", "video", "prospects"]);
    expect(panels(page)[0]).toEqual(["paper", "yes"]);
  });

  it("prints an added example with a playbook of three headed parts as a card of three steps, folded, with its text in the page, and no scores or figures", async () => {
    const playbook = "## What it does\nLists the unpaid invoices.\n\n## Steps\n1. Read the ledger.\n2. Draft a reminder for each.\n\n## Guardrails\nNever send anything.";
    const page = ofExamples(await home(stored({ [EXAMPLES]: entry({ added: ["x-chase"] }) }, added("x-chase", playbook))));
    expect(tabs(page)).toEqual(["video", "prospects", "paper", "x-chase"]);
    const card = page.slice(page.indexOf('id="examples-x-chase"'));
    expect(card).toContain('data-steps="3"');
    expect(text(card)).toContain("3 steps");
    expect(text(card)).toContain("Getting paid Chase unpaid invoices every Friday");
    for (const words of ["Lists the unpaid invoices.", "Draft a reminder for each.", "Never send anything.", "Save this as a skill called Invoice chaser."]) expect(text(card)).toContain(words);
    // Folded: no row of the card is open.
    expect(card.slice(0, card.indexOf("</article>"))).not.toMatch(/<details[^>]*\bopen\b/);
    expect(card).not.toContain('data-fold="scores"');
    expect(text(card)).not.toMatch(/\d\s*(?:hours?|minutes?)\b/i);
  });

  it("degrades a playbook whose parts the card cannot find (a heading broken in Pages) to the whole text under one row, and the page still renders", async () => {
    const broken = examples[1].play.playbookMd.replace("## 1. Play", "#1. Play").replace(/^## /gm, "##");
    const page = ofExamples(await home(stored({}, { [`${EXAMPLES}.prospects.playbook`]: broken })));
    const card = page.slice(page.indexOf('id="examples-prospects"'), page.indexOf('id="examples-paper"'));
    expect(card).not.toContain("data-steps=");
    expect(text(card)).toContain(v1Copy(amounts).copy.sample.playbook.whole);
    expect(text(card)).toContain("Daily prospect outreach drafts. Each weekday morning");
    // The other examples keep their steps.
    expect(page.match(/data-steps="8"/g)).toHaveLength(2);
  });

  it("with every example removed, the homepage has no examples section, and How it works takes apart the first built-in one", async () => {
    const content = stored({ [EXAMPLES]: entry({ removed: ["video", "prospects", "paper"] }) });
    const page = await home(content);
    expect(page).not.toContain('id="examples"');
    expect(page).not.toContain("data-example-tab");
    const anatomy = section(await how(content), "anatomy");
    expect(anatomy).toContain('data-anatomy="paired"');
    expect(text(anatomy)).toContain(firstExample.play.title);
  });

  it("has How it works take apart the first example as published: another one moved first, or the first one's edited text", async () => {
    const moved = section(await how(stored({ [EXAMPLES]: entry({ order: ["prospects", "video", "paper"] }) })), "anatomy");
    expect(text(moved)).toContain(examples[1].play.title);
    expect(text(moved)).not.toContain(examples[0].play.title);
    // The prospects play has the notes' eight parts, so each note is beside its part.
    expect(moved).toContain('data-anatomy="paired"');
    // The paper's seventh part is "Pitfalls to watch for", and the note is for "Pitfalls seen": moved first, it is shown
    // whole with the notes beside it (the Pages editor says so under its playbook).
    const paper = section(await how(stored({ [EXAMPLES]: entry({ order: ["paper", "video", "prospects"] }) })), "anatomy");
    expect(text(paper)).toContain(examples[2].play.title);
    expect(paper).toContain('data-anatomy="listed"');
    const retitled = section(await how(stored({}, { [`${EXAMPLES}.video.title`]: "Camera roll to Reels" })), "anatomy");
    expect(text(retitled)).toContain("Camera roll to Reels");
    // A first example whose parts are not the notes' is shown whole, with the notes in a list beside it.
    const listed = section(await how(stored({ [EXAMPLES]: entry({ added: ["x-chase"], order: ["x-chase", "video", "prospects", "paper"] }) }, added("x-chase", "## One\nA.\n\n## Two\nB."))), "anatomy");
    expect(listed).toContain('data-anatomy="listed"');
    expect(text(listed)).toContain("Chase unpaid invoices every Friday");
  });

  it("prints no time figure from an example, built-in or added", async () => {
    const page = await home(stored({ [EXAMPLES]: entry({ added: ["x-chase"] }) }, added("x-chase", "## One\nA.\n\n## Two\nB.")));
    expect(text(ofExamples(page))).not.toMatch(/\d\s*(?:hours?|hrs?|minutes?|mins?)\b|Time saved|Each time|Run by/i);
  });
});
