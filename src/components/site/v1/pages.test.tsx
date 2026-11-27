/**
 * The three v1 reading pages (plan U7): /faq, /how-it-works and /about, each
 * in its spec section's order (A.8 to A.10), and the rules all three keep
 * (vocabulary, claims, amounts from the settings, start links with no
 * audience of their own). /pricing was a fourth until November 27, 2026.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig, v3Defaults } from "@/data/config";
import { firstExample } from "@/data/site/examples";
import { letter, letterShown } from "@/data/site/letter";
import { emptyOverlay, type Overlay } from "@/lib/site/content/format";
import { v1Copy } from "@/lib/site/content/model";
import { siteRegistry } from "@/lib/site/content/registry";
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
const { V1Faq, V1FaqView } = await import("./faq");
const { V1HowItWorks, V1HowItWorksView, PREFACE_MARK, annotate, playbookParts, zackFiles } = await import("./how-it-works");
const { V1About, V1AboutView } = await import("./about");

const amounts = amountsFrom(v3Defaults);
const { copy } = v1Copy(amounts);
const preface = v3Defaults.playbookPreface;
// The idea /how-it-works takes apart: the first of the homepage's examples.
const samplePlay = firstExample.play;
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

// The shell is the page a visitor with no script reads; a part streamed in later would follow it.
const STREAMED = '<div hidden id="S:';
const shell = (markup: string) => markup.split(STREAMED)[0];

/** The one block the vocabulary rule leaves out: the quotation of the playbook preface, by its mark. */
const prefaceQuote = new RegExp(`<blockquote data-verbatim="${PREFACE_MARK}"[^>]*>([\\s\\S]*?)</blockquote>`, "g");
const withoutPrefaceQuote = (markup: string) => markup.replace(prefaceQuote, "");

const bareAgent = /(?<!\bAI )\bagents?\b/i;
const timeFigure = /\d\s*(?:hours?|hrs?|minutes?|mins?)\b/i;
const emoji = /\p{Extended_Pictographic}/u;

const faq = async (over: { amounts?: typeof amounts; content?: Overlay } = {}) => shell(await pageMarkup(<V1FaqView version="v1" amounts={over.amounts ?? amounts} content={over.content} />));
const how = async (over: { amounts?: typeof amounts; idea?: typeof idea; preface?: string; files?: typeof files } = {}) =>
  shell(await pageMarkup(<V1HowItWorksView version="v1" amounts={over.amounts ?? amounts} idea={over.idea ?? idea} preface={over.preface ?? preface} files={over.files ?? files} />));
const about = async (over: { photo?: string; signature?: string } = {}) =>
  shell(await pageMarkup(<V1AboutView version="v1" amounts={amounts} photo={over.photo ?? ""} signature={over.signature ?? ""} />));

/** The three pages as each route serves them, and as each view renders with the test's own inputs. */
const pages = {
  faq: { served: (v: "v1" | "v2" | "v3" = "v1") => pageMarkup(<V1Faq version={v} />), view: faq, mark: "Zack and privacy" },
  "how-it-works": { served: (v: "v1" | "v2" | "v3" = "v1") => pageMarkup(<V1HowItWorks version={v} />), view: how, mark: copy.howItWorks.cora.title },
  about: { served: (v: "v1" | "v2" | "v3" = "v1") => pageMarkup(<V1About version={v} />), view: about, mark: letter.greeting },
};
const each = Object.entries(pages);

beforeEach(() => resetNextFakes());

describe("the page that is gone: /pricing (Peter, November 27, 2026)", () => {
  it("has no page component and no copy of its own: the price is the homepage's block, and “Pricing” links to it", async () => {
    for (const file of ["src/components/site/v1/pricing.tsx", "src/app/pricing/page.tsx"]) expect(existsSync(path.join(process.cwd(), file)), file).toBe(false);
    expect(Object.keys(copy)).not.toContain("pricing");
    // What the reading pages still say about the price, in place of the deleted page: /faq states the price, the
    // free Cora Curations, the higher rate and the refund rule.
    const seen = text(await faq());
    for (const fact of [
      "US$200 a month, plus tax where it applies. In Canada it is CA$280 a month, plus HST.",
      "A second miss makes that month US$400 (CA$560 in Canada).",
      "the price becomes US$400 a month (CA$560 in Canada).",
      "No. You get two free Cora Curations before any charge, and you can cancel any time.",
    ])
      expect(seen).toContain(fact);
  });

  it("takes every price a reading page prints from the amounts, never from the copy", async () => {
    const other = amountsFrom({ ...v3Defaults, priceUsd: 311, priceCad: 433, priceRunUsd: 322, priceRunCad: 444, priceHigherUsd: 655, priceHigherCad: 877, freeRuns: 3 });
    const seen = text(await faq({ amounts: other }));
    for (const line of ["US$311 a month", "CA$433 a month", "A second miss makes that month US$655 (CA$877 in Canada).", "You get three free Cora Curations before any charge"]) expect(seen).toContain(line);
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

  it("prints a question or an answer edited in the admin in place of the built-in one, as plain text, with its amounts filled in", async () => {
    const markup = await faq({
      // The edits as the page is handed them: one overlay on the code copy, each text under its field's id.
      content: {
        ...emptyOverlay,
        text: {
          "questions.price-and-billing.items.refund.a": "No. Your first {freeLists} Cora Curations are free, at {monthlyUsd} a month after that. <b>Cancel</b> any time.",
          "questions.zack-and-privacy.items.who-sees.q": "Who can see my plays?",
          // An edit naming an amount that does not exist is not printed: the built-in answer stays.
          "questions.price-and-billing.items.missed-week.a": "It costs {nothing}.",
          // An id that is no question's is ignored.
          "questions.price-and-billing.items.not-a-question.q": "Hello?",
          "questions.price-and-billing.items.not-a-question.a": "Hello.",
        },
      },
    });
    const seen = text(markup);
    expect(seen).toContain("Can I get a refund? No. Your first two Cora Curations are free, at US$200 a month after that. &lt;b&gt;Cancel&lt;/b&gt; any time.");
    // Text, never markup: the angle brackets are printed, not obeyed.
    expect(markup).toContain("&lt;b&gt;Cancel&lt;/b&gt;");
    expect(markup).not.toContain("<b>Cancel</b>");
    expect(seen).toContain("Who can see my plays? Other Roger users, without your name or anything that identifies you.");
    expect(seen).not.toContain("Who sees my plays?");
    expect(seen).toContain("What if Zack misses a week? The first miss each month is forgiven.");
    expect(seen).not.toMatch(/\{nothing\}|Hello/);
    expect(markup.match(/<details/g)).toHaveLength(18);
    // With no edits the page is the built-in copy, which is what a build with no database shows.
    expect(await faq({ content: emptyOverlay })).toBe(await faq());
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
    for (const line of ["Never post or schedule anything on social media. Finished files and drafts only.", "The requester has 3 Reels they like the look of, captions for each, and a plan for the rest."]) expect(seen).toContain(line);
    // It is the first of the homepage's examples, under its short title.
    expect(seen).toContain("On-demand video creation Phone camera roll to styled Reels");
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
    expect(annotate(samplePlay.playbookMd, notes)?.map((row) => row.part.split("\n")[0])).toEqual(["## 1. Play", "## 2. Trigger", "## 3. Setup first (answer once)", "## 4. Steps", "## 5. Guardrails", "## 6. Output", "## 7. Pitfalls seen", "## 8. Done when"]);
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

describe("the three reading pages together", () => {
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
    const withList = [await faq({ amounts: dearerList }), await how({ amounts: dearerList })].map(text).join(" ");
    expect(withList).not.toMatch(/322|444/);
  });

  it("give no start button a path in its server-rendered address, so a remembered audience carries through (AE11)", async () => {
    // The band alone, on each of the three.
    const counts = { faq: 1, "how-it-works": 1, about: 1 };
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

/**
 * The sections an admin has switched off or moved (plan U6, R7). Each page prints the sections that are on, in the
 * stored order; its title is not a section and always comes first. With nothing stored, the markup is unchanged.
 */
describe("the three reading pages with their sections switched off or moved (plan U6)", () => {
  const laid = (page: string, entry: { order?: string[]; off?: string[] }): Overlay => ({ ...emptyOverlay, sections: { [page]: { order: entry.order ?? [], off: entry.off ?? [] } } });
  const faqWith = (content: Overlay) => faq({ content });
  const howWith = async (content?: Overlay) => shell(await pageMarkup(<V1HowItWorksView version="v1" amounts={amounts} idea={idea} preface={preface} files={files} content={content} />));
  const aboutWith = async (content?: Overlay, photo = "") => shell(await pageMarkup(<V1AboutView version="v1" amounts={amounts} photo={photo} signature="" content={content} />));
  /** The page's sections and what stands between them, in order: "—" for a hairline, "band" for the start band. */
  const flow = (markup: string) => [...markup.matchAll(/<section\b[^>]*aria-labelledby="([\w-]+)-title"|data-hairline|data-seam|data-start-band/g)].map((m) => m[1] ?? (m[0] === "data-hairline" ? "—" : m[0] === "data-start-band" ? "band" : "="));
  const GROUPS = copy.questions.map((group) => group.id);
  const HOW = ["week", "zack", "cora", "anatomy", "firstWeeks", "noAgent", "startBand"];

  it("are the same pages, byte for byte, with no entry and with an entry that changes nothing", async () => {
    for (const content of [emptyOverlay, laid("faq", {}), laid("faq", { order: [...GROUPS, "startBand"] }), laid("howItWorks", { order: HOW }), laid("about", { order: ["letter", "startBand"] }), laid("about", { order: ["title"], off: ["title"] })]) {
      expect(await faqWith(content), JSON.stringify(content)).toBe(await faq());
      expect(await howWith(content), JSON.stringify(content)).toBe(await how());
      expect(await aboutWith(content), JSON.stringify(content)).toBe(await about());
      expect(await aboutWith(content, "/peter.jpg"), JSON.stringify(content)).toBe(await about({ photo: "/peter.jpg" }));
    }
  });

  it("has every section's anchor from the registry as that section's id on its page", async () => {
    const pagesMarkup: Record<string, string> = { faq: await faq(), howItWorks: await how(), about: await about() };
    for (const [pageId, markup] of Object.entries(pagesMarkup)) {
      for (const section of siteRegistry.pages.find((entry) => entry.id === pageId)!.sections) {
        if (section.anchor === null) continue;
        expect(markup, `${pageId}.${section.id}`).toMatch(new RegExp(`<section id="${section.anchor}" aria-labelledby="${section.anchor}-title"`));
        expect(section.ground, `${pageId}.${section.id}`).toBe("ground");
      }
    }
    // The six of /how-it-works and the four groups of /faq have one each. The start band and the letter have none.
    const anchors = (pageId: string) => siteRegistry.pages.find((entry) => entry.id === pageId)!.sections.map((section) => section.anchor);
    expect(anchors("howItWorks")).toEqual([null, "week", "zack", "cora", "anatomy", "first-weeks", "no-agent", null]);
    expect(anchors("faq")).toEqual([null, ...GROUPS, null]);
    expect(anchors("about")).toEqual([null, null, null]);
  });

  it("/faq with one group off shows the other three in order, under the page's one h1", async () => {
    const markup = await faqWith(laid("faq", { off: ["zack-and-privacy"] }));
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(sections(markup).map((s) => s.name)).toEqual(["page", ...GROUPS.filter((id) => id !== "zack-and-privacy")]);
    expect(markup).not.toContain('id="zack-and-privacy"');
    for (const item of copy.questions.find((group) => group.id === "zack-and-privacy")!.items) expect(text(markup)).not.toContain(item.a);
    // Still one block of ground around the groups, and one name for every question on the page.
    expect(markup.match(/<div class="bg-ground pb-10 pt-6 md:pb-14 md:pt-10">/g)).toHaveLength(1);
    expect(new Set([...markup.matchAll(/<details\b[^>]*\sname="([^"]+)"/g)].map((m) => m[1]))).toEqual(new Set(["faq-questions"]));
  });

  it("/faq follows a stored order, and gives each run of groups its own block when the start band is moved between them", async () => {
    const turned = await faqWith(laid("faq", { order: [...[...GROUPS].reverse(), "startBand"] }));
    expect(sections(turned).map((s) => s.name)).toEqual(["page", ...[...GROUPS].reverse()]);
    const split = await faqWith(laid("faq", { order: [GROUPS[0], "startBand", ...GROUPS.slice(1)] }));
    expect(flow(split)).toEqual(["page", GROUPS[0], "band", ...GROUPS.slice(1)]);
    expect(split.match(/<div class="bg-ground pb-10 pt-6 md:pb-14 md:pt-10">/g)).toHaveLength(2);
    // The band off: the page ends on the last group. Every group off: the title, with room under it, then the band.
    expect(flow(await faqWith(laid("faq", { off: ["startBand"] })))).toEqual(["page", ...GROUPS]);
    const bare = await faqWith(laid("faq", { off: GROUPS }));
    expect(flow(bare)).toEqual(["page", "band"]);
    expect(bare).toContain('<section aria-labelledby="page-title" class="bg-ground"><div class="wrap py-16 md:py-24">');
    expect(await faq()).toContain('<section aria-labelledby="page-title" class="bg-ground"><div class="wrap pt-16 md:pt-24">');
  });

  it("/how-it-works with Zack off has no element with the id zack, and keeps one hairline between each two reading sections that are left", async () => {
    const markup = await howWith(laid("howItWorks", { off: ["zack"] }));
    expect(markup).not.toMatch(/\sid="zack"/);
    expect(text(markup)).not.toContain(copy.howItWorks.zack.title);
    expect(flow(markup)).toEqual(["page", "week", "—", "cora", "—", "anatomy", "—", "first-weeks", "—", "no-agent", "band"]);
    expect(flow(await how())).toEqual(["page", "week", "—", "zack", "—", "cora", "—", "anatomy", "—", "first-weeks", "—", "no-agent", "band"]);
  });

  it("/how-it-works follows a stored order: no hairline beside the night band, wherever it is, and none after the title", async () => {
    const order = ["cora", "week", "startBand", "zack", "anatomy", "firstWeeks", "noAgent"];
    expect(flow(await howWith(laid("howItWorks", { order })))).toEqual(["page", "cora", "—", "week", "band", "zack", "—", "anatomy", "—", "first-weeks", "—", "no-agent"]);
    // The band first: the title gets the room a reading section would have given it.
    const first = await howWith(laid("howItWorks", { order: ["startBand", ...HOW.filter((id) => id !== "startBand")] }));
    expect(flow(first).slice(0, 3)).toEqual(["page", "band", "week"]);
    expect(first).toContain('<section aria-labelledby="page-title" class="bg-ground"><div class="wrap py-16 md:py-24">');
    // An id the page does not have is ignored. A section the stored order does not name follows the one it follows in code: the band, after the last section.
    expect(flow(await howWith(laid("howItWorks", { order: ["gone", "noAgent", "week"], off: ["nope"] }))).filter((mark) => mark !== "—")).toEqual(["page", "no-agent", "band", "week", "zack", "cora", "anatomy", "first-weeks"]);
  });

  it("/about with the letter off keeps its title and the start band, and with the band first prints the letter in a block of its own", async () => {
    const off = await aboutWith(laid("about", { off: ["letter"] }));
    expect(off.match(/<h1\b/g)).toHaveLength(1);
    expect(off).not.toContain("data-letter");
    expect(text(off)).not.toContain(letter.greeting);
    expect(flow(off)).toEqual(["about", "band"]);
    const turned = await aboutWith(laid("about", { order: ["startBand", "letter"] }));
    expect(flow(turned)).toEqual(["about", "band"]);
    expect(turned.indexOf("data-start-band")).toBeLessThan(turned.indexOf("data-letter-block"));
    expect(text(turned)).toContain(letterShown[0].shown);
    expect(turned.match(/data-claims="letter"/g)).toHaveLength(1);
    // Both off: the title alone.
    expect(flow(await aboutWith(laid("about", { off: ["letter", "startBand"] })))).toEqual(["about"]);
  });
});
