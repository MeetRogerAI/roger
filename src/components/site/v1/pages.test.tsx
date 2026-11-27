/**
 * The four v1 reading pages (plan U7): /pricing, /faq, /how-it-works and
 * /about, each in its spec section's order (A.7 to A.10), and the rules all
 * four keep (vocabulary, claims, amounts from the settings, start links with
 * no audience of their own).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig, v3Defaults } from "@/data/config";
import { letter, letterShown } from "@/data/site/letter";
import { samplePlay } from "@/data/site/sample-play";
import { v1Copy } from "@/data/site/v1";
import { amountsFrom, hasBareDollar } from "@/lib/site/amounts";
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
const { V1Pricing, V1PricingView } = await import("./pricing");
const { V1Faq, V1FaqView } = await import("./faq");
const { V1HowItWorks, V1HowItWorksView, PREFACE_MARK, annotate, playbookParts, zackFiles } = await import("./how-it-works");
const { V1About, V1AboutView } = await import("./about");

const amounts = amountsFrom(v3Defaults);
const { copy } = v1Copy(amounts);
const preface = v3Defaults.playbookPreface;
const idea = publicIdeaView(samplePlay, preface);
const files = [
  { name: "Claude", href: "/zack/zack-the-collector-claude.md" },
  { name: "Duet", href: "/zack/zack-the-collector-duet.md" },
  { name: "Grok Bot", href: "/zack/zack-the-collector-grok-bot.md" },
  { name: "Hark", href: "/zack/zack-the-collector-hark.md" },
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

const hrefs = (markup: string) => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((h) => !h.startsWith("/_next/"));

/** The page's own sections in order, each with its background. */
function sections(markup: string): { name: string; ground: "night" | "ground" }[] {
  return [...markup.matchAll(/<section\b[^>]*aria-labelledby="([\w-]+)-title"[^>]*>/g)].map((m) => {
    const classes = /class="([^"]*)"/.exec(m[0])?.[1].split(" ") ?? [];
    return { name: m[1], ground: classes.includes("bg-night") ? "night" : "ground" };
  });
}

/** One section's markup, from its opening tag to the next page section or the start band. */
function sectionMarkup(markup: string, name: string): string {
  const start = markup.search(new RegExp(`<section\\b[^>]*aria-labelledby="${name}-title"`));
  expect(start, name).toBeGreaterThan(-1);
  const rest = markup.slice(start + 1);
  const next = rest.search(/<section\b[^>]*aria-labelledby="[\w-]+-title"|<div data-start-band/);
  return markup.slice(start, next === -1 ? undefined : start + 1 + next);
}

const startBand = (markup: string) => /<div data-start-band[\s\S]*?<\/div><\/div>/.exec(markup)?.[0] ?? "";

// The shell is the page a visitor with no script reads; the part streamed in for the visitor's country follows it.
const STREAMED = '<div hidden id="S:';
const shell = (markup: string) => markup.split(STREAMED)[0];
const streamed = (markup: string) => markup.slice(shell(markup).length);

/** The one block the vocabulary rule leaves out: the quotation of the playbook preface, by its mark. */
const prefaceQuote = new RegExp(`<blockquote data-verbatim="${PREFACE_MARK}"[^>]*>([\\s\\S]*?)</blockquote>`, "g");
const withoutPrefaceQuote = (markup: string) => markup.replace(prefaceQuote, "");

const bareAgent = /(?<!\bAI )\bagents?\b/i;
const timeFigure = /\d\s*(?:hours?|hrs?|minutes?|mins?)\b/i;
const emoji = /\p{Extended_Pictographic}/u;

const pricing = async (over: { amounts?: typeof amounts } = {}) => shell(await pageMarkup(<V1PricingView version="v1" amounts={over.amounts ?? amounts} />));
const faq = async (over: { amounts?: typeof amounts } = {}) => shell(await pageMarkup(<V1FaqView version="v1" amounts={over.amounts ?? amounts} />));
const how = async (over: { amounts?: typeof amounts; idea?: typeof idea; preface?: string; files?: typeof files } = {}) =>
  shell(await pageMarkup(<V1HowItWorksView version="v1" amounts={over.amounts ?? amounts} idea={over.idea ?? idea} preface={over.preface ?? preface} files={over.files ?? files} />));
const about = async (over: { photo?: string; signature?: string } = {}) =>
  shell(await pageMarkup(<V1AboutView version="v1" amounts={amounts} photo={over.photo ?? ""} signature={over.signature ?? ""} />));

/** The four pages as each route serves them, and as each view renders with the test's own inputs. */
const pages = {
  pricing: { served: (v: "v1" | "v2" | "v3" = "v1") => pageMarkup(<V1Pricing version={v} />), view: pricing, mark: copy.pricing.included.title },
  faq: { served: (v: "v1" | "v2" | "v3" = "v1") => pageMarkup(<V1Faq version={v} />), view: faq, mark: "Zack and privacy" },
  "how-it-works": { served: (v: "v1" | "v2" | "v3" = "v1") => pageMarkup(<V1HowItWorks version={v} />), view: how, mark: copy.howItWorks.cora.title },
  about: { served: (v: "v1" | "v2" | "v3" = "v1") => pageMarkup(<V1About version={v} />), view: about, mark: letter.greeting },
};
const each = Object.entries(pages);

beforeEach(() => resetNextFakes());

describe("/pricing on v1", () => {
  it("has A.7's six parts in order: the price block as the heading, four sections on ground, then the start button", async () => {
    const markup = await pricing();
    expect(sections(markup)).toEqual([
      { name: "price", ground: "night" },
      { name: "included", ground: "ground" },
      { name: "explained", ground: "ground" },
      { name: "contributing", ground: "ground" },
      { name: "refunds", ground: "ground" },
    ]);
    expect(markup.indexOf("data-start-band")).toBeGreaterThan(markup.indexOf('id="refunds"'));
    // Three hairlines: between each pair of ground sections that are neighbours.
    expect(markup.match(/data-hairline/g)).toHaveLength(3);
  });

  it("opens with the price block as the page's one h1, Peter's line under it, and monthly as the one plan", async () => {
    const markup = await pricing();
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toMatch(/<h1 id="price-title"[^>]*>Pricing<\/h1>/);
    const price = sectionMarkup(markup, "price");
    expect(text(price).startsWith("Pricing Get two Cora Curations for free and pay only after you have tried the product for two full weeks.")).toBe(true);
    expect([...price.matchAll(/data-plan="(\w+)"/g)].map((m) => m[1])).toEqual(["monthly"]);
    expect(text(price)).not.toMatch(/Most people choose this|one list|one at a time|\/ list\b/i);
    for (const line of ["US$200 / month USD", "CA$280 / month CAD"]) expect(text(price)).toContain(line);
    expect(text(price)).toContain(copy.trialLine);
  });

  it("never skips a heading level: the plan's name is an h2 under the h1, and no level is jumped after it", async () => {
    const full = await pageMarkup(<V1PricingView version="v1" amounts={amounts} />);
    // The shell, and a streamed copy of the price block if there is one.
    for (const part of [shell(full), streamed(full)].filter(Boolean)) {
      const price = sectionMarkup(part, "price");
      expect([...price.matchAll(/<(h[1-6])\b[^>]*>(.*?)<\/\1>/g)].map((m) => `${m[1]} ${m[2]}`)).toEqual(["h1 Pricing", "h2 Monthly"]);
    }
    const levels = [...shell(full).matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    for (const [i, level] of levels.entries()) if (i > 0) expect(level, `heading ${i + 1} of ${levels.join(" ")}`).toBeLessThanOrEqual(levels[i - 1] + 1);
  });

  it("renders the price block for the visitor's country", async () => {
    // Whether the block for the country is in place or streamed in after a USD shell, the last one rendered is the one shown.
    const pressed = (markup: string) => [...markup.matchAll(/aria-pressed="true"[^>]*>(\w+)</g)].map((m) => m[1]);
    expect(pressed(await pageMarkup(<V1PricingView version="v1" amounts={amounts} />)).at(-1)).toBe("USD");
    resetNextFakes({}, { "x-vercel-ip-country": "CA" });
    const canada = await pageMarkup(<V1PricingView version="v1" amounts={amounts} />);
    expect(pressed(canada).at(-1)).toBe("CAD");
    expect(pressed(canada).slice(0, -1).every((c) => c === "USD")).toBe(true);
    // Both currencies stay in the markup either way, for a visitor with no script.
    for (const line of ["US$200 / month USD", "CA$280 / month CAD"]) expect(text(canada)).toContain(line);
    expect(hrefs(sectionMarkup(streamed(canada) || canada, "price"))).toEqual(["/start"]);
  });

  it("lists what is included as a plain list of four, with no group session line", async () => {
    const included = sectionMarkup(await pricing(), "included");
    expect([...included.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => text(m[1]))).toEqual([
      "A Cora Curation every Monday: three ideas picked for you by Cora, each with a full playbook.",
      "Your own history of every idea you have received.",
      "Your Zack controls.",
      "A compounding view of what you have set up.",
    ]);
    expect(text(await pricing())).not.toMatch(/group session|weekly session/i);
  });

  it("explains monthly, the one way to buy, in one paragraph with one line under it (covers AE3)", async () => {
    const markup = await pricing();
    const explained = sectionMarkup(markup, "explained");
    // No columns to compare: there is nothing to compare monthly with.
    expect(explained).not.toMatch(/<h3\b|grid-cols-2/);
    expect(text(explained)).toBe(
      "Monthly, explained A Cora Curation every Monday. Your first two are free. Your card is charged once a month, starting with your third Cora Curation. One price, charged once a month. Cancel in one click.",
    );
    expect(explained).toMatch(/<p data-under-monthly[^>]*>One price, charged once a month\./);
    // Nothing on the page offers or explains buying one list, as the page serves it too.
    for (const page of [markup, await pageMarkup(<V1Pricing version="v1" />)]) {
      expect(text(page)).not.toMatch(/one list|one at a time|one-at-a-time|lists you order|Monday lists?\b/i);
    }
  });

  it("explains contributing in the copy's words, with both currencies for the higher rate", async () => {
    const contributing = text(sectionMarkup(await pricing(), "contributing"));
    expect(contributing).toBe(`How contributing works ${copy.pricing.contributing.body}`);
    for (const fact of [
      "the first miss each month is forgiven",
      "A second miss makes that month US$400 (CA$560 in Canada).",
      "We email you both times, and the difference appears on your next invoice.",
      "If you switch sharing off in your dashboard, the monthly price is US$400 (CA$560 in Canada).",
    ])
      expect(contributing).toContain(fact);
    expect(contributing).not.toMatch(/one-at-a-time|On monthly/i);
  });

  it("never presents the higher rate as a plan to choose", async () => {
    const markup = await pageMarkup(<V1PricingView version="v1" amounts={amounts} />);
    // One plan, in the price block and nowhere else, in the shell and in a streamed copy of the block if there is one.
    for (const part of [shell(markup), streamed(markup)].filter(Boolean)) expect([...part.matchAll(/data-plan="(\w+)"/g)].map((m) => m[1])).toEqual(["monthly"]);
    const page = shell(markup);
    // The higher rate is in the running text of one section, and in no other.
    for (const s of sections(page)) expect(/US\$400|CA\$560/.test(sectionMarkup(page, s.name)), s.name).toBe(s.name === "contributing");
    expect(startBand(page)).not.toMatch(/US\$400|CA\$560/);
    const contributing = sectionMarkup(page, "contributing");
    // That section is a heading and one paragraph: no card, no price line, no list, no button and no link.
    expect(contributing).not.toMatch(/data-plan|<a\b|<button\b|<h3\b|<ul\b|<li\b|rounded-\[8px\]|\/ month|\/ list/);
    expect(contributing.match(/<p\b/g)).toHaveLength(1);
    // Never set as a price: the figure is not followed by a unit and a currency code, anywhere.
    expect(text(markup)).not.toMatch(/(?:US\$400|CA\$560) \/ /);
    // And not called a plan, an option or a tier.
    expect(text(contributing)).not.toMatch(/\bplan\b|\boption\b|\btier\b|\bchoose\b/i);
  });

  it("states the no-refund line plainly", async () => {
    const refunds = text(sectionMarkup(await pricing(), "refunds"));
    expect(refunds).toBe("No refunds There are no refunds. You get two free Cora Curations before any charge, and you can cancel in one click.");
  });

  it("ends on the primary start button, with the card line under it", async () => {
    const band = startBand(await pricing());
    expect(text(band)).toBe("Get two free Cora Curations Card required. Charged only with your third Cora Curation.");
    expect(band).toMatch(/<a class="btn btn-l" href="\/start">/);
  });

  it("takes every price from the amounts, never from the copy", async () => {
    const other = amountsFrom({ ...v3Defaults, priceUsd: 311, priceCad: 433, priceRunUsd: 322, priceRunCad: 444, priceHigherUsd: 655, priceHigherCad: 877, freeRuns: 3 });
    const seen = text(await pricing({ amounts: other }));
    for (const line of [
      "US$311 / month USD",
      "CA$433 / month CAD",
      "A second miss makes that month US$655 (CA$877 in Canada).",
      "You get three free Cora Curations before any charge",
      // Both counts in Peter's line are the number of free Cora Curations.
      "Get three Cora Curations for free and pay only after you have tried the product for three full weeks.",
    ])
      expect(seen).toContain(line);
    // The price of one list is not on the page.
    expect([...new Set(seen.match(/(?:US|CA)\$\d+(?:,\d{3})*/g))].sort()).toEqual(["CA$433", "CA$877", "US$311", "US$655"]);
  });
});

describe("/faq on v1", () => {
  it("has the four groups in order, each under its own heading, after the page's one h1", async () => {
    const markup = await faq();
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toMatch(/<h1 id="page-title"[^>]*>Questions<\/h1>/);
    expect(sections(markup).map((s) => s.name)).toEqual(["page", "getting-started", "zack-and-privacy", "cora-and-the-ideas", "price-and-billing"]);
    expect([...markup.matchAll(/<h2 id="[\w-]+-title"[^>]*>(.*?)<\/h2>/g)].map((m) => m[1])).toEqual(["Getting started", "Zack and privacy", "Cora and the ideas", "Price and billing"]);
  });

  it("shows every question in the copy file, each under its own group with its answer as written", async () => {
    const markup = await faq();
    const all = copy.questions.flatMap((g) => g.items);
    expect(all).toHaveLength(18);
    expect(markup.match(/<details/g)).toHaveLength(18);
    for (const group of copy.questions) {
      const part = sectionMarkup(markup, group.id);
      expect(part.match(/<details/g), group.id).toHaveLength(group.items.length);
      expect(text(part), group.id).toBe([group.title, ...group.items.map((item) => `${item.q} ${item.a}`)].join(" "));
    }
    // The answers name amounts, and each is filled.
    expect(text(markup)).toContain("US$200 a month, plus tax where it applies. In Canada it is CA$280 a month, plus HST. Get two Cora Curations for free and pay only after you have tried the product for two full weeks.");
    // No question is there only to explain buying one list.
    expect(text(markup)).not.toMatch(/one list|one at a time|Monday lists?\b/i);
    expect(text(markup)).toContain("A second miss makes that month US$400 (CA$560 in Canada).");
    expect(text(markup)).not.toMatch(/[{}]/);
  });

  it("opens and closes each answer with a native details element, and links nowhere but the start button", async () => {
    const markup = await faq();
    expect(markup.match(/<summary/g)).toHaveLength(18);
    // Closed until asked for: no details element carries the open attribute.
    expect(markup).not.toMatch(/<details[^>]*\sopen(?:[\s=>])/);
    expect(hrefs(markup)).toEqual(["/start"]);
    expect(text(startBand(markup))).toBe("Get two free Cora Curations Card required. Charged only with your third Cora Curation.");
  });

  it("keeps one answer open at a time on the whole page: all eighteen, in every group, share one native name", async () => {
    const names = [...(await faq()).matchAll(/<details\b([^>]*)>/g)].map((m) => /\sname="([^"]*)"/.exec(m[1])?.[1] ?? "");
    expect(names).toHaveLength(18);
    expect(new Set(names)).toEqual(new Set(["faq-questions"]));
  });
});

describe("/how-it-works on v1", () => {
  it("has A.8's six sections in order under the page's one h1, then the start button", async () => {
    const markup = await how();
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toMatch(/<h1 id="page-title"[^>]*>How it works<\/h1>/);
    expect(sections(markup).map((s) => s.name)).toEqual(["page", "week", "zack", "cora", "anatomy", "first-weeks", "no-agent"]);
    expect([...markup.matchAll(/<h2 id="[\w-]+-title"[^>]*>(.*?)<\/h2>/g)].map((m) => text(m[1]))).toEqual([
      "The week",
      "Zack, in detail",
      "Cora, in detail",
      "The anatomy of an idea",
      "Your first two weeks",
      "If you have no AI agent yet",
    ]);
    expect(markup.indexOf("data-start-band")).toBeGreaterThan(markup.indexOf('id="no-agent"'));
  });

  it("the week: Sunday, Monday, Tuesday and Wednesday, one short paragraph each", async () => {
    const week = sectionMarkup(await how(), "week");
    expect([...week.matchAll(/<dt[^>]*>(.*?)<\/dt>/g)].map((m) => m[1])).toEqual(["Sunday", "Monday", "Tuesday", "Wednesday"]);
    expect(text(week)).toBe(`The week ${copy.howItWorks.week.days.map((d) => `${d.day} ${d.body}`).join(" ")}`);
  });

  it("Zack: the anchor id zack, which the control block links to, and the four points", async () => {
    const markup = await how();
    expect(markup).toMatch(/<section id="zack" aria-labelledby="zack-title" class="[^"]*scroll-mt-14[^"]*"/);
    expect(markup.match(/ id="zack"/g)).toHaveLength(1);
    expect(copy.control.link.href).toBe("/how-it-works#zack");
    const zack = sectionMarkup(markup, "zack");
    expect([...zack.matchAll(/<dt[^>]*>(.*?)<\/dt>/g)].map((m) => m[1])).toEqual(["What he reads", "What he never reads", "What he removes", "What you can change"]);
    for (const point of copy.howItWorks.zack.points) expect(text(zack)).toContain(`${point.title} ${point.body}`);
  });

  it("Zack: links each public Zack file, so anyone can read them before signing up, and never /zack itself", async () => {
    const zack = sectionMarkup(await how(), "zack");
    expect(text(zack)).toContain("Read the Zack files before you sign up Claude Duet Grok Bot Hark");
    expect(hrefs(zack)).toEqual(files.map((f) => f.href));
    for (const f of files) expect(zack).toContain(`<a href="${f.href}" class="tlink chev">${f.name}</a>`);
    expect(hrefs(await how())).not.toContain("/zack");
  });

  it("Zack: the links are the files on disk, one for each AI agent that has one, and the block is left out when none has", async () => {
    // What the page serves: the four files in public/zack today.
    expect(zackFiles()).toEqual(files);
    expect(hrefs(sectionMarkup(shell(await pageMarkup(<V1HowItWorks version="v1" />)), "zack"))).toEqual(files.map((f) => f.href));
    const some = zackFiles([
      { name: "Hark", file: "h.md", available: true },
      { name: "Viktor", file: "v.md", available: false },
      { name: "Claude", file: "c.md", available: true },
    ]);
    expect(some).toEqual([
      { name: "Claude", href: "/zack/c.md" },
      { name: "Hark", href: "/zack/h.md" },
    ]);
    const none = sectionMarkup(await how({ files: [] }), "zack");
    expect(none).not.toContain("data-zack-files");
    expect(text(none)).not.toContain(copy.howItWorks.zack.filesLink.label);
    expect(hrefs(none)).toEqual([]);
  });

  it("Zack: with no Zack file available the links block is absent, and nothing else on the page changes", async () => {
    const withFiles = await how();
    const without = await how({ files: [] });
    expect(without).not.toContain("data-zack-files");
    expect(text(without)).not.toContain(copy.howItWorks.zack.filesLink.label);
    expect(hrefs(without).filter((h) => h.startsWith("/zack"))).toEqual([]);
    // The page with the files, less that one block, is the page without them.
    const block = /<div data-zack-files[\s\S]*?<\/ul><\/div>/;
    expect(block.exec(withFiles)?.[0]).toContain(files.at(-1)!.href);
    expect(withFiles.replace(block, "")).toBe(without);
    // The four points are still there, and every section.
    for (const point of copy.howItWorks.zack.points) expect(text(sectionMarkup(without, "zack"))).toContain(`${point.title} ${point.body}`);
    expect(sections(without)).toEqual(sections(withFiles));
  });

  it("Cora: the five scores, never what you already run, never who a play came from", async () => {
    const cora = text(sectionMarkup(await how(), "cora"));
    expect(cora).toBe(
      "Cora, in detail Cora scores every play on five things: hours saved, reach, ease to copy, proof and surprise. She never sends you something you already run, and never names who a play came from.",
    );
  });

  it("anatomy: the preface first, labelled, then the nine notes in order, each before its own part", async () => {
    const anatomy = sectionMarkup(await how(), "anatomy");
    const seen = text(anatomy);
    const parts = ["1. Play", "2. Trigger", "3. Setup first", "4. Steps", "5. Guardrails", "6. Output", "7. Pitfalls seen", "8. Done when", idea.pasteToInstall];
    const notes = copy.howItWorks.anatomy.notes;
    expect(notes.map((n) => n.part)).toEqual(["Play", "Trigger", "Setup first", "Steps", "Guardrails", "Output", "Pitfalls seen", "Done when", "Paste to install"]);
    const marks = ["Added to the top of every playbook", preface, idea.title, ...notes.flatMap((n, i) => [`${n.part} ${n.note}`, parts[i]])];
    const at = marks.map((mark) => seen.indexOf(mark));
    for (const [i, where] of at.entries()) expect(where, marks[i]).toBeGreaterThan(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(anatomy.match(/<p data-note/g)).toHaveLength(9);
    expect(anatomy).toContain('data-anatomy="paired"');
    // The whole playbook is there, and the copy button of the card.
    for (const line of ["Claude drafts only. It never sends.", "The user can paste either version and send it with no more than a name swap."]) expect(seen).toContain(line);
    expect(anatomy).toMatch(/<button type="button" class="btn btn-m btn-ink[^"]*">/);
    expect(anatomy).not.toMatch(/<dialog/i);
  });

  it("anatomy: prints the preface word for word as a marked quotation, the one block the vocabulary rule leaves out", async () => {
    const markup = await how();
    const quotes = [...markup.matchAll(prefaceQuote)];
    expect(quotes).toHaveLength(1);
    // The mark holds the preface and nothing else, so nothing else escapes the rule.
    expect(text(quotes[0][1])).toBe(preface);
    expect(markup).toMatch(/<figure data-preface[^>]*><figcaption[^>]*>Added to the top of every playbook<\/figcaption><blockquote data-verbatim="playbook-preface"/);
    // Today's preface says "agent" without "AI": it is the reason for the mark.
    expect(preface).toMatch(bareAgent);
    expect(text(markup)).toMatch(bareAgent);
    expect(text(withoutPrefaceQuote(markup))).not.toMatch(bareAgent);
    // Whatever the setting says is what is printed.
    const other = "Adapt this to my setup, then install it.";
    expect(text([...(await how({ preface: other })).matchAll(prefaceQuote)][0][1])).toBe(other);
  });

  it("anatomy: a playbook written another way gets the notes as a list, never a note beside the wrong part", async () => {
    const notes = copy.howItWorks.anatomy.notes.slice(0, -1);
    expect(playbookParts(samplePlay.playbookMd)).toHaveLength(8);
    expect(annotate(samplePlay.playbookMd, notes)?.map((row) => row.part.split("\n")[0])).toEqual(["## 1. Play", "## 2. Trigger", "## 3. Setup first", "## 4. Steps", "## 5. Guardrails", "## 6. Output", "## 7. Pitfalls seen", "## 8. Done when"]);
    expect(playbookParts("Before any heading.\n\n## One\ntext\n## Two")).toEqual(["Before any heading.", "## One\ntext", "## Two"]);
    // Eight parts in another order, and a playbook with fewer parts: no pairing.
    expect(annotate(samplePlay.playbookMd.replace("## 1. Play", "## 1. Trigger").replace("## 2. Trigger", "## 2. Play"), notes)).toBeNull();
    const short = "## What it does\nDrafts a reply.\n\n## Steps\n1. Read the note.";
    expect(annotate(short, notes)).toBeNull();

    const anatomy = sectionMarkup(await how({ idea: publicIdeaView({ ...samplePlay, playbookMd: short }, preface) }), "anatomy");
    expect(anatomy).toContain('data-anatomy="listed"');
    const seen = text(anatomy);
    const marks = ["Added to the top of every playbook", preface, ...notes.map((n) => `${n.part} ${n.note}`), "What it does", "Drafts a reply.", "Paste to install The prompt you copy. The playbook goes with it.", idea.pasteToInstall];
    const at = marks.map((mark) => seen.indexOf(mark));
    for (const [i, where] of at.entries()) expect(where, marks[i]).toBeGreaterThan(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("anatomy: prints no time-saved figure, even from a play that carries figures", async () => {
    const withFigures = publicIdeaView({ ...samplePlay, figures: { current_hours_week: 3.5, minutes_saved_each: 12, runners: 4, math: "12 minutes, 18 times a week" } }, preface);
    const seen = text(await how({ idea: withFigures }));
    expect(seen).not.toMatch(timeFigure);
    expect(seen).not.toMatch(/Time saved|Each time|Run by/);
  });

  it("your first two weeks: the trial step by step, with the card and the charge date stated again", async () => {
    const first = sectionMarkup(await how(), "first-weeks");
    expect(first.match(/<li/g)).toHaveLength(6);
    expect(text(first)).toContain("You start, and we ask for a card. It is not charged.");
    expect(text(first)).toContain("Your first two Cora Curations arrive, one each Monday. They are free.");
    expect(text(first)).toContain("After your second Cora Curation, we email you with what happens next.");
    expect(text(first)).toContain("Your card is charged with your third Cora Curation, and once a month after that. Cancel before then and you pay nothing.");
    expect(text(first)).toContain("If no first Cora Curation is delivered within 21 days of sign-up, the trial closes without a charge.");
    expect(text(first)).not.toMatch(/\blists?\b|one at a time|On monthly/i);
    // The count of free Cora Curations and the days are the settings', in the heading too.
    const other = text(sectionMarkup(await how({ amounts: amountsFrom({ ...v3Defaults, freeRuns: 3, trialCloseDays: 30 }) }), "first-weeks"));
    expect(other).toContain("Your first three weeks");
    expect(other).toContain("charged with your fourth Cora Curation");
    expect(other).toContain("within 30 days of sign-up");
  });

  it("if you have no AI agent yet: two sentences and a link to /getstarted", async () => {
    const none = sectionMarkup(await how(), "no-agent");
    expect(text(none)).toBe("If you have no AI agent yet You can still start. The startup page walks you through installing one and setting up a starter team. Go to the startup page");
    expect(none).toMatch(/<a class="tlink chev" href="\/getstarted">Go to the startup page<\/a>/);
    expect(hrefs(none)).toEqual(["/getstarted"]);
  });
});

describe("/about on v1", () => {
  it("renders with no photograph and no signature file: the text column alone, and Peter's name typed", async () => {
    const markup = await about();
    expect(markup).not.toMatch(/<img\b/);
    expect(markup).not.toContain("data-photo");
    expect(markup).not.toContain("grid");
    expect(markup).toMatch(/<div class="mx-auto mt-14 max-w-\[40rem\]"><div data-letter/);
    expect(markup).toMatch(/<p data-signature="typed"[^>]*>Peter<\/p>/);
    expect(markup).not.toContain('data-signature="file"');
  });

  it("takes the photograph and the signature from the configuration, whichever each is today", async () => {
    const { photo, signature } = siteConfig.founder;
    const served = shell(await pageMarkup(<V1About version="v1" />));
    expect(served).toBe(await about({ photo, signature }));
    expect(served.includes("data-photo")).toBe(photo !== "");
    expect(served.includes('data-signature="file"')).toBe(signature !== "");
    expect(served.includes('data-signature="typed"')).toBe(signature === "");
  });

  it("prints the letter: the lead-in, the greeting, only the paragraphs that are still true, the sign-off and the name", async () => {
    const markup = await about();
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toMatch(/<h1 id="about-title"[^>]*>About<\/h1>/);
    expect(letterShown.map((p) => p.id)).toEqual(["who", "noticed", "background"]);
    expect(text(sectionMarkup(markup, "about"))).toBe(["About", "Roger is run by Peter Kuperman.", "Hey there,", ...letterShown.map((p) => p.shown), "Thanks,", "Peter"].join(" "));
    // The held-back paragraphs, about Circles and applications, are not there.
    for (const p of letter.paragraphs.filter((x) => !x.stillTrue)) expect(text(markup)).not.toContain(p.shown);
    expect(text(markup)).not.toMatch(/Circle|application|\bapply\b/i);
    // The shown text, not Peter's original where the two differ.
    expect(text(markup)).toContain("The most useful things people do with AI agents never get shared with others.");
  });

  it("renders the photograph once its path is set, beside the letter", async () => {
    const markup = await about({ photo: "/media/peter.jpg" });
    expect(markup).toContain("data-photo");
    const img = /<img\b[^>]*>/.exec(markup)![0];
    expect(img).toContain('alt="Peter Kuperman"');
    expect(img).toMatch(/src="[^"]*peter\.jpg/);
    expect(markup.match(/<img\b/g)).toHaveLength(1);
    expect(markup).toContain("md:grid-cols-[minmax(0,16rem)_minmax(0,40rem)]");
    expect(markup.indexOf("data-photo")).toBeLessThan(markup.indexOf("data-letter"));
    expect(markup).toMatch(/<p data-signature="typed"[^>]*>Peter<\/p>/);
  });

  it("renders the signature file once its path is set, in place of the typed name", async () => {
    const markup = await about({ signature: "/media/peter-signature.png" });
    expect(markup).toContain('data-signature="file"');
    expect(markup).not.toContain('data-signature="typed"');
    const img = /<img\b[^>]*>/.exec(markup)![0];
    expect(img).toContain('alt="Peter’s signature"');
    expect(img).toMatch(/src="[^"]*peter-signature\.png/);
    expect(markup).not.toContain("data-photo");
  });

  it("renders both once both paths are set: the photograph beside the letter, the signature file under it", async () => {
    const markup = await about({ photo: "/media/peter.jpg", signature: "/media/peter-signature.png" });
    const imgs = markup.match(/<img\b[^>]*>/g) ?? [];
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toContain('alt="Peter Kuperman"');
    expect(imgs[0]).toMatch(/src="[^"]*peter\.jpg/);
    expect(imgs[1]).toContain('alt="Peter’s signature"');
    expect(imgs[1]).toMatch(/src="[^"]*peter-signature\.png/);
    expect(markup).toContain("md:grid-cols-[minmax(0,16rem)_minmax(0,40rem)]");
    expect(markup.indexOf("data-photo")).toBeLessThan(markup.indexOf("data-letter"));
    expect(markup.indexOf("data-letter")).toBeLessThan(markup.indexOf('data-signature="file"'));
    expect(markup).not.toContain('data-signature="typed"');
    // The letter's words are the same as with neither file.
    expect(text(sectionMarkup(markup, "about"))).toBe(text(sectionMarkup(await about(), "about")).replace(/ Peter$/, ""));
  });

  it("ends on the start button", async () => {
    const markup = await about();
    expect(text(startBand(markup))).toBe("Get two free Cora Curations Card required. Charged only with your third Cora Curation.");
    expect(hrefs(markup)).toEqual(["/start"]);
  });
});

describe("the four reading pages together", () => {
  it("serve v1's page under every site version, with that version's wrapper", async () => {
    for (const [name, page] of each) {
      for (const version of ["v1", "v2", "v3"] as const) {
        const markup = await page.served(version);
        expect(markup, `${name} ${version}`).toContain(`data-site="${version}"`);
        expect(text(markup), `${name} ${version}`).toContain(page.mark);
      }
    }
  });

  it("never say agent without AI in front, leaving out only the marked quotation of the preface", async () => {
    for (const [name, page] of each) {
      for (const markup of [await page.served(), await page.view()]) {
        const seen = text(withoutPrefaceQuote(markup));
        expect(seen.length, name).toBeGreaterThan(300);
        expect(bareAgent.exec(seen)?.[0] ?? null, `${name}: ${seen.slice(Math.max(0, (bareAgent.exec(seen)?.index ?? 0) - 60)).slice(0, 120)}`).toBeNull();
        // Only /how-it-works has the marked block, and it has one.
        expect(markup.match(prefaceQuote)?.length ?? 0, name).toBe(name === "how-it-works" ? 1 : 0);
      }
    }
    // The rule has teeth here: three of the pages name AI agents.
    for (const name of ["faq", "how-it-works", "about"] as const) expect(text(await pages[name].view()), name).toMatch(/\bAI agents?\b/);
  });

  it("keep the claims rules: no bare dollar sign, no exclamation mark, no time-saved figure, no emoji, nothing of Circles", async () => {
    for (const [name, page] of each) {
      for (const markup of [await page.served(), await page.view()]) {
        const seen = text(markup);
        expect(hasBareDollar(seen), name).toBe(false);
        expect(seen, name).not.toContain("!");
        expect(seen, name).not.toMatch(timeFigure);
        expect(seen, name).not.toMatch(emoji);
        expect(seen, name).not.toMatch(/Circle/);
        expect(seen, name).not.toMatch(/[{}]\w|\w\}/);
        expect(seen, name).not.toMatch(/join (?:hundreds|thousands)|income|revenue|\bearn/i);
      }
    }
  });

  it("show no dollar figure but the settings' amounts", async () => {
    const seen = (await Promise.all(each.map(([, page]) => page.served()))).map(text).join(" ");
    // Four amounts: the monthly price and the higher rate, each in two currencies. The price of one list is on none of these pages.
    expect([...new Set(seen.match(/(?:US|CA)\$\d+(?:,\d{3})*/g))].sort()).toEqual(["CA$280", "CA$560", "US$200", "US$400"]);
    const dearerList = amountsFrom({ ...v3Defaults, priceRunUsd: 322, priceRunCad: 444 });
    const withList = [await pricing({ amounts: dearerList }), await faq({ amounts: dearerList }), await how({ amounts: dearerList })].map(text).join(" ");
    expect(withList).not.toMatch(/322|444/);
  });

  it("give no start button a path in its server-rendered address, so a remembered audience carries through (AE11)", async () => {
    // The price block and the band on /pricing; the band alone on the other three.
    const counts = { pricing: 2, faq: 1, "how-it-works": 1, about: 1 };
    for (const [name, page] of each) {
      for (const markup of [shell(await page.served()), await page.view()]) {
        const starts = hrefs(markup).filter((h) => h.startsWith("/start"));
        expect(starts, name).toEqual(Array(counts[name as keyof typeof counts]).fill("/start"));
        expect(markup.match(/>Get two free Cora Curations<\/a>/g), name).toHaveLength(starts.length);
        expect(markup, name).not.toMatch(/path=|cur=/);
      }
    }
  });

  it("link to no Circles or legacy page, and to /zack from none of them", async () => {
    const all = (await Promise.all(each.map(([, page]) => page.served()))).flatMap((markup) => hrefs(shell(markup)));
    expect([...new Set(all)].sort()).toEqual(["/getstarted", "/start", ...files.map((f) => f.href)].sort());
  });

  it("end on the start band, a night chapter, with the primary button", async () => {
    for (const [name, page] of each) {
      const markup = await page.view();
      const band = startBand(markup);
      expect(band, name).toMatch(/^<div data-start-band="true" class="on-night bg-night text-night-ink">/);
      expect(band, name).toMatch(/<a class="btn btn-l" href="\/start">Get two free Cora Curations<\/a>/);
      expect(markup.endsWith(`${band}</div>`), name).toBe(true);
    }
  });
});
