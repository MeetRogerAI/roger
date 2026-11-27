/**
 * What the Pages screens work out before a save and before a publish (plan
 * U5, KTD10, KTD11): the tidy and the few refusals of a save, the list of
 * what a publish would change, the wording warnings on that list, and the
 * fingerprint a publish carries. Also the words the screens use for a field,
 * which never name an item by its id.
 *
 * The rule wording and its cases came with the rules from the Edit Questions
 * screen, which refused on them. Here they warn.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { v3Defaults } from "@/data/config";
import { v1 } from "@/data/site/v1";
import { PRICE_SECTION_HREF } from "../chrome";
import { amountsFrom } from "../amounts";
import { ruleIds } from "../claims";
import { captionNames } from "../compounding";
import { TYPED_MAX, draftChanges, linkWarnings, pageStatus, reviewKey, sectionChanges, ruleWords, saveRefusal, tidyFor, wordingOf, wordingWarnings, type Change } from "./check";
import { newOverlay, type Overlay } from "./format";
import { editorAddress, fieldAnchor, fieldLabel, fieldLabels, fieldPlace, pageBySlug, pageCovers, pageSlug, placeholderWords, wordsFor } from "./labels";
import { baseline, textAt } from "./model";
import { siteRegistry } from "./registry";
import { amountPlaceholderNames } from "./text";

const amounts = amountsFrom(v3Defaults);
const field = (id: string) => siteRegistry.fields.get(id)!;
const edits = (text: Record<string, string>): Overlay => ({ ...newOverlay(), text });
const original = (id: string) => textAt(baseline, id)!;

const HEADLINE = "home.hero.headline";
const HERO_SUB = "home.hero.sub";
const COMPOUNDS_LINE = "home.compounds.line";
const REFUND_A = "questions.price-and-billing.items.refund.a";
const COST_A = "questions.price-and-billing.items.cost.a";
const WEEK_A = "questions.getting-started.items.each-week.a";
const CAPTION = "bricks.caption.week";

/** The warnings a publish of these drafts would list, with `published` already on the site. */
const warned = (draft: Record<string, string>, published: Record<string, string> = {}) =>
  wordingWarnings(draftChanges({ draft: edits({ ...published, ...draft }), published: edits(published) }), amounts).map((warning) => ({
    field: warning.field.id,
    rule: warning.rule,
    words: warning.found.map((found) => found.words),
  }));

describe("what a save does to typed text", () => {
  it("makes a line one line of plain text, and removes characters that print nothing", () => {
    expect(tidyFor(field(REFUND_A), "  Yes.\r\n\r\nYou can\tcancel   any time. ")).toBe("Yes. You can cancel any time.");
    // Built from code points, so this file holds none of them: a zero-width space, a soft hyphen, a word joiner, a right-to-left override.
    for (const code of [0x200b, 0x00ad, 0x2060, 0x202e]) {
      expect(tidyFor(field(REFUND_A), `Paste each idea into your ag${String.fromCharCode(code)}ent on Monday.`), code.toString(16)).toBe("Paste each idea into your agent on Monday.");
    }
  });

  it("gives back the original wording unchanged for every field, so a field saved untouched is no edit", () => {
    for (const entry of siteRegistry.fields.values()) expect(tidyFor(entry, original(entry.id)), entry.id).toBe(original(entry.id));
  });
});

describe("what a save refuses: only what would break a page", () => {
  const refused = (id: string, typed: string) => saveRefusal(field(id), tidyFor(field(id), typed));

  it("text with no words", () => {
    expect(refused(HEADLINE, "")).toMatch(/^This cannot be left empty\./);
    expect(refused(HEADLINE, "   \n ")).toMatch(/^This cannot be left empty\./);
    expect(refused(HEADLINE, String.fromCharCode(0x200b))).toMatch(/^This cannot be left empty\./);
  });

  it("text over the field's limit, by its length and never by cutting it", () => {
    const long = "No refunds. ".repeat(200);
    expect(refused(REFUND_A, long)).toBe("This is 2399 characters long, and the most that fits here is 1500. Shorten it by 899.");
    expect(refused(HEADLINE, "x".repeat(201))).toBe("This is 201 characters long, and the most that fits here is 200. Shorten it by 1.");
    expect(refused(HEADLINE, "x".repeat(200))).toBeNull();
    // What a save reads is far over every limit, so nothing a field could hold is cut before it is measured.
    for (const entry of siteRegistry.fields.values()) expect(entry.max, entry.id).toBeLessThan(TYPED_MAX / 10);
  });

  it("a name in braces that does not exist, with the names that do", () => {
    expect(refused(COST_A, "It costs {monthlyUsd} a month.")).toBeNull();
    expect(refused(COST_A, "It costs {monthlyUsdd} a month.")).toMatch(/^\{monthlyUsdd\} is not a name this text can use, so it would show on the page as typed\. Check the spelling\. The names that work here: \{monthlyUsd\}, \{monthlyCad\}, /);
    // A brick-stack caption's two names are no amounts: an answer may not hold them, and a caption may hold nothing else.
    expect(refused(COST_A, "Open your ideas in {week}.")).toMatch(/^\{week\} is not a name this text can use/);
    expect(refused(CAPTION, "Week {week} of {bricks}")).toBeNull();
    expect(refused(CAPTION, "Week {monthlyUsd}")).toMatch(/The names that work here: \{week\}, \{bricks\}\.$/);
  });

  it("and nothing else: markup is printed as typed, and a wording rule is a warning at publish", () => {
    expect(refused(REFUND_A, "Open your <b>three</b> ideas on Monday.")).toBeNull();
    expect(refused(REFUND_A, "No, but your agent will earn it back!")).toBeNull();
    expect(refused(REFUND_A, original(REFUND_A))).toBeNull();
  });
});

describe("what a publish would change", () => {
  it("is every field whose draft wording is not the published wording, in the order the pages are listed", () => {
    const content = { draft: edits({ [REFUND_A]: "No. You can cancel any time.", [HEADLINE]: "A new headline" }), published: newOverlay() };
    expect(draftChanges(content).map((change) => [change.field.id, change.from, change.to, change.toOriginal])).toEqual([
      [HEADLINE, original(HEADLINE), "A new headline", false],
      [REFUND_A, original(REFUND_A), "No. You can cancel any time.", false],
    ]);
    expect(wordingOf(content.draft, HEADLINE)).toBe("A new headline");
    expect(wordingOf(content.published, HEADLINE)).toBe(original(HEADLINE));
  });

  it("is nothing when the draft is what is published, and a reset of a published edit goes back to the original", () => {
    const live = edits({ [HEADLINE]: "A new headline" });
    expect(draftChanges({ draft: edits({ [HEADLINE]: "A new headline" }), published: live })).toEqual([]);
    expect(draftChanges({ draft: newOverlay(), published: live }).map((change) => [change.field.id, change.from, change.to, change.toOriginal])).toEqual([[HEADLINE, "A new headline", original(HEADLINE), true]]);
  });

  it("is counted for each page, beside how many of the page's texts differ from the original", () => {
    const status = pageStatus({ draft: edits({ [HEADLINE]: "A new headline", [REFUND_A]: "No.", [COST_A]: "{monthlyUsd} a month." }), published: edits({ [COST_A]: "{monthlyUsd} a month.", [HERO_SUB]: "A published line." }) });
    expect(Object.fromEntries(status)).toEqual({
      // The headline is a new draft, and the line under it goes back to the original: two drafts, one text that differs.
      home: { drafts: 2, edits: 1, ticks: 0, rearranged: false, relisted: false },
      howItWorks: { drafts: 0, edits: 0, ticks: 0, rearranged: false, relisted: false },
      library: { drafts: 0, edits: 0, ticks: 0, rearranged: false, relisted: false },
      // One answer is drafted, one was published earlier: both differ from the original, one is waiting.
      faq: { drafts: 1, edits: 2, ticks: 0, rearranged: false, relisted: false },
      about: { drafts: 0, edits: 0, ticks: 0, rearranged: false, relisted: false },
      shared: { drafts: 0, edits: 0, ticks: 0, rearranged: false, relisted: false },
    });
  });
});

describe("what a publish would change about a page's sections (plan U6, R7)", () => {
  const sections = (entries: Overlay["sections"]): Overlay => ({ ...newOverlay(), sections: entries });
  const HOME = ["hero", "problem", "examples", "compounds", "testimonials", "control", "price", "questions", "closing"];
  const said = (draft: Overlay["sections"], published: Overlay["sections"] = {}) => sectionChanges({ draft: sections(draft), published: sections(published) }).map((change) => change.says);

  it("is nothing while no page's sections are drafted", () => {
    expect(said({})).toEqual([]);
    expect(said({ home: { order: [], off: ["price"] } }, { home: { order: [], off: ["price"] } })).toEqual([]);
  });

  it("says a section switched off, and one switched back on, in a plain sentence that names the page", () => {
    expect(said({ home: { order: [], off: ["compounds"] } })).toEqual(["Home: the “It compounds” section will be switched off."]);
    expect(said({}, { home: { order: [], off: ["compounds"] } })).toEqual(["Home: the “It compounds” section will be switched back on."]);
    expect(said({ faq: { order: [], off: ["price-and-billing"] }, howItWorks: { order: [], off: ["zack"] } })).toEqual([
      "How it works: the “Zack, in detail” section will be switched off.",
      "FAQ: the “Price and billing” section will be switched off.",
    ]);
  });

  it("says a move for the one section that moved, by its new neighbour, and not for the ones it passed", () => {
    const swapped = HOME.map((id) => (id === "price" ? "questions" : id === "questions" ? "price" : id));
    expect(said({ home: { order: swapped, off: [] } })).toEqual(["Home: “Questions” moves up, above “Price”."]);
    // Three places up: still one sentence.
    const up = ["hero", "problem", "examples", "compounds", "questions", "testimonials", "control", "price", "closing"];
    expect(said({ home: { order: up, off: [] } })).toEqual(["Home: “Questions” moves up, above “What people say”."]);
    // To the end: placed by the section it now follows.
    const last = [...HOME.filter((id) => id !== "problem"), "problem"];
    expect(said({ home: { order: last, off: [] } })).toEqual(["Home: “The problem” moves down, below “Closing band”."]);
    // And back: against what is published, not against the original.
    expect(said({}, { home: { order: swapped, off: [] } })).toEqual(["Home: “Price” moves up, above “Questions”."]);
  });

  it("lists a switch and a move on one page as two changes, the switches first", () => {
    const swapped = HOME.map((id) => (id === "price" ? "questions" : id === "questions" ? "price" : id));
    const changes = sectionChanges({ draft: sections({ home: { order: swapped, off: ["compounds"] } }), published: newOverlay() });
    expect(changes.map((change) => [change.page.id, change.section.id, change.kind])).toEqual([
      ["home", "compounds", "off"],
      ["home", "questions", "moved"],
    ]);
  });

  it("is counted on the page, and the page is marked as rearranged until its sections are the original's again", () => {
    const status = pageStatus({ draft: { ...edits({ [HEADLINE]: "A new headline" }), sections: { home: { order: [], off: ["compounds", "price"] } } }, published: newOverlay() });
    expect(status.get("home")).toEqual({ drafts: 3, edits: 1, ticks: 0, rearranged: true, relisted: false });
    expect(status.get("faq")).toEqual({ drafts: 0, edits: 0, ticks: 0, rearranged: false, relisted: false });
    // Published: nothing waits, and the page still differs from the original.
    const live = sections({ home: { order: [], off: ["price"] } });
    expect(pageStatus({ draft: live, published: live }).get("home")).toEqual({ drafts: 0, edits: 0, ticks: 0, rearranged: true, relisted: false });
  });

  it("is part of the fingerprint a publish carries: another order is another review", () => {
    const a = { draft: sections({ home: { order: [], off: ["price"] } }), published: newOverlay() };
    const b = { draft: sections({ home: { order: [], off: ["compounds"] } }), published: newOverlay() };
    expect(reviewKey(a, [])).not.toBe(reviewKey(b, []));
  });
});

describe("links that would point at a section that is switched off (plan R17, AE3)", () => {
  const off = (entries: Record<string, string[]>, text: Record<string, string> = {}): { draft: Overlay } => ({
    draft: { ...edits(text), sections: Object.fromEntries(Object.entries(entries).map(([page, ids]) => [page, { order: [], off: ids }])) },
  });

  it("is nothing while every section a link points at is on", () => {
    expect(linkWarnings({ draft: newOverlay() })).toEqual([]);
    expect(linkWarnings(off({ home: ["compounds", "questions"], howItWorks: ["cora"] }))).toEqual([]);
  });

  it("Covers AE3. names the “Pricing” link, in the header and in the footer, when Price is switched off on Home", () => {
    const [warning, ...rest] = linkWarnings(off({ home: ["price"] }));
    expect(rest).toEqual([]);
    expect(warning.href).toBe(PRICE_SECTION_HREF);
    expect(warning.says).toBe("The “Pricing” link in the header and in the footer of every page points at the “Price” section of Home, which is switched off. A visitor who presses it lands at the top of the homepage instead.");
    // The link is named by the words the draft gives it.
    expect(linkWarnings(off({ home: ["price"] }, { "nav.pricing": "What it costs" }))[0].says).toContain("The “What it costs” link in the header and in the footer");
  });

  it("names the control block's link when the Zack section is switched off on How it works, unless the control block is off too", () => {
    const [warning, ...rest] = linkWarnings(off({ howItWorks: ["zack"] }));
    expect(rest).toEqual([]);
    expect(warning.href).toBe(v1.control.link.href);
    expect(warning.says).toContain(`The “${v1.control.link.label}” link on the homepage, under “You decide what Zack shares” points at the “Zack, in detail” section of How it works`);
    expect(warning.says).toContain("lands at the top of the How it works page instead");
    expect(linkWarnings(off({ howItWorks: ["zack"], home: ["control"] }))).toEqual([]);
  });

  it("names the Use cases page's own link to its watch form when that section is switched off", () => {
    const [warning, ...rest] = linkWarnings(off({ library: ["watch"] }));
    expect(rest).toEqual([]);
    expect(warning.href).toBe("/library#watch");
    expect(warning.says).toContain(`The “${v1.library.watchLink}” link at the top of the Use cases page`);
    expect(linkWarnings(off({ library: ["watch", "intro"] }))).toEqual([]);
  });

  it("points every link it knows at an anchor the registry has, which is the address the page's code links to", () => {
    const anchor = (page: string, section: string) => siteRegistry.pages.find((entry) => entry.id === page)!.sections.find((entry) => entry.id === section)!.anchor;
    expect(`/#${anchor("home", "price")}`).toBe(PRICE_SECTION_HREF);
    expect(`/how-it-works#${anchor("howItWorks", "zack")}`).toBe(v1.control.link.href);
    expect(anchor("howItWorks", "zack")).toBe(v1.howItWorks.zack.id);
    expect(readFileSync(path.join(process.cwd(), "src/app/library/page.tsx"), "utf8")).toContain(`href="#${anchor("library", "watch")}"`);
  });
});

describe("the wording warnings", () => {
  it("have plain words for every rule", () => {
    expect(Object.keys(ruleWords).sort()).toEqual([...ruleIds].sort());
    for (const rule of ruleIds) expect(ruleWords[rule], rule).toMatch(/^it /);
  });

  it("list “agent” without “AI” in front, with the word (plan AE2)", () => {
    expect(warned({ [REFUND_A]: "No, but your agent will earn it back." })).toEqual([
      { field: REFUND_A, rule: "vocabulary", words: ["agent"] },
      { field: REFUND_A, rule: "income", words: ["earn"] },
    ]);
    const [first] = wordingWarnings(draftChanges({ draft: edits({ [WEEK_A]: "Paste each idea into your agent on Monday." }), published: newOverlay() }), amounts);
    expect(first).toMatchObject({ rule: "vocabulary", says: "it says “agent” without “AI” in front", found: [{ words: "agent", around: "Paste each idea into your agent on Monday." }] });
    expect(warned({ [WEEK_A]: "Paste each idea into your AI agent on Monday." })).toEqual([]);
    // In a long text the words around the find are shown, cut at whole words and marked where they are cut.
    const long = "Open your three ideas on Monday morning, then paste the ones you want into your agent and answer the questions it asks about your setup.";
    const [cut] = wordingWarnings(draftChanges({ draft: edits({ [WEEK_A]: long }), published: newOverlay() }), amounts);
    expect(cut.found).toEqual([{ words: "agent", around: "… paste the ones you want into your agent and answer the questions it asks …" }]);
  });

  it("list a claim about income, about time saved, or about how many people use Roger", () => {
    expect(warned({ [WEEK_A]: "Set up the ideas you want and earn more." })).toEqual([{ field: WEEK_A, rule: "income", words: ["earn"] }]);
    expect(warned({ [WEEK_A]: "Most people save 5 hours a week." })).toEqual([
      // Found four times over by the rule's patterns ("5 hours", "hours a week", "save"): listed once, by its longest wording.
      { field: WEEK_A, rule: "time-saved", words: ["save 5 hours a week"] },
      { field: WEEK_A, rule: "number", words: ["5"] },
    ]);
    expect(warned({ [WEEK_A]: "Join thousands of people who open their ideas on Monday." }).map((warning) => warning.rule)).toContain("user-count");
  });

  it("list a number that is not an amount from the settings, a bare dollar sign, an exclamation mark, a hype word", () => {
    expect(warned({ [WEEK_A]: "Open your 3 ideas on Monday." })).toEqual([{ field: WEEK_A, rule: "number", words: ["3"] }]);
    expect(warned({ [WEEK_A]: "It is $200 a month." }).map((warning) => warning.rule)).toContain("bare-dollar");
    expect(warned({ [WEEK_A]: "Open your three ideas on Monday!" })).toEqual([{ field: WEEK_A, rule: "exclamation-emoji", words: ["!"] }]);
    expect(warned({ [WEEK_A]: "Open your three ideas on Monday. It is effortless." })).toEqual([{ field: WEEK_A, rule: "hype", words: ["effortless"] }]);
  });

  it("put every place one text breaks one rule in one entry", () => {
    expect(warned({ [WEEK_A]: "Your agent reads it. Then your agents act." })).toEqual([{ field: WEEK_A, rule: "vocabulary", words: ["agent", "agents"] }]);
  });

  it("read the text with its amounts filled in: an amount by its name is no bare number", () => {
    expect(warned({ [COST_A]: "{monthlyUsd} a month, or {higherUsd} ({higherCad} in Canada) with sharing off. The trial closes after {trialCloseDays} days." })).toEqual([]);
  });

  it("are raised only for text that differs from what is published: a wording published over a warning is not listed again", () => {
    const published = { [REFUND_A]: "No, but your agent will thank you." };
    expect(warned({ [REFUND_A]: published[REFUND_A] })).toEqual([{ field: REFUND_A, rule: "vocabulary", words: ["agent"] }]);
    expect(warned({}, published)).toEqual([]);
    // Another field drafted later is checked by itself, and the published one stays out of the list.
    expect(warned({ [HEADLINE]: "A calmer headline" }, published)).toEqual([]);
    expect(warned({ [HEADLINE]: "The best agent" }, published)).toEqual([{ field: HEADLINE, rule: "vocabulary", words: ["agent"] }]);
    // Changed again, it is listed again.
    expect(warned({ [REFUND_A]: "No, but your agent will thank you twice." }, published)).toEqual([{ field: REFUND_A, rule: "vocabulary", words: ["agent"] }]);
  });

  it("check a field under the zone its section is printed in: the loop's week numbers pass in “It compounds” and not in the hero", () => {
    const words = "By week 26 you have 78 ideas set up.";
    expect(field(COMPOUNDS_LINE).claims.zones).toEqual(["compounding"]);
    expect(field(HERO_SUB).claims.zones).toEqual([]);
    expect(warned({ [COMPOUNDS_LINE]: words })).toEqual([]);
    expect(warned({ [HERO_SUB]: words })).toEqual([{ field: HERO_SUB, rule: "number", words: ["26", "78"] }]);
    // A caption's two names are filled with a stack's numbers before it is read.
    expect(warned({ [CAPTION]: "In week {week}" })).toEqual([]);
  });

  it("are not raised for a field that goes back to its original wording", () => {
    expect(warned({}, { [REFUND_A]: "No." })).toEqual([]);
    expect(draftChanges({ draft: newOverlay(), published: edits({ [REFUND_A]: "No." }) })).toHaveLength(1);
  });

  it("find nothing in the original wording of any field, read one field at a time", () => {
    const all: Change[] = [...siteRegistry.fields.values()].map((entry) => ({ field: entry, from: "", to: original(entry.id), toOriginal: false, fresh: false }));
    expect(wordingWarnings(all, amounts).map((warning) => `${warning.field.id} [${warning.rule}] ${warning.found.map((found) => found.words).join(", ")}`)).toEqual([]);
  });
});

describe("the fingerprint a publish carries", () => {
  const draft = edits({ [HEADLINE]: "A new headline", [REFUND_A]: "No, but your agent will thank you." });
  const warnings = wordingWarnings(draftChanges({ draft, published: newOverlay() }), amounts);

  const shown = { draft, published: newOverlay() };

  it("is the same for the same draft and warnings, whatever order the draft's entries were written in", () => {
    const again = edits({ [REFUND_A]: "No, but your agent will thank you.", [HEADLINE]: "A new headline" });
    expect(reviewKey(shown, warnings)).toMatch(/^[0-9a-f]{64}$/);
    expect(reviewKey({ draft: again, published: newOverlay() }, warnings)).toBe(reviewKey(shown, warnings));
  });

  it("changes when one character of the draft changes, and when the warnings do", () => {
    expect(reviewKey({ ...shown, draft: edits({ ...draft.text, [HEADLINE]: "A new headline." }) }, warnings)).not.toBe(reviewKey(shown, warnings));
    expect(reviewKey(shown, [])).not.toBe(reviewKey(shown, warnings));
    expect(warnings).toHaveLength(1);
  });

  it("changes when what is on the site changes under the same draft: the list of what will change is another one", () => {
    // An undo in another tab: the same draft would now change the headline as well.
    expect(reviewKey({ draft, published: edits({ [HEADLINE]: "A new headline" }) }, warnings)).not.toBe(reviewKey(shown, warnings));
    // A draft and a published overlay are not interchangeable.
    expect(reviewKey({ draft: newOverlay(), published: draft }, [])).not.toBe(reviewKey({ draft, published: newOverlay() }, []));
  });
});

describe("the words the Pages screens use", () => {
  it("name an item of a list by its place on the page, never by its id", () => {
    expect(fieldLabel(field("home.hero.graphic.steps.collect.title"))).toEqual({ group: "Step 2", name: "Headline", full: "Step 2: Headline" });
    expect(fieldLabel(field(COST_A))).toEqual({ group: "Question 1", name: "Answer", full: "Question 1: Answer" });
    expect(fieldLabel(field(HEADLINE))).toEqual({ group: null, name: "Headline", full: "Headline" });
    // A question group's heading belongs to no numbered item.
    expect(fieldLabel(field("questions.price-and-billing.title"))).toEqual({ group: null, name: "Heading", full: "Heading" });
    expect(fieldPlace(field(COST_A))).toEqual({ page: "FAQ", section: "Price and billing" });
    for (const [id, label] of fieldLabels()) {
      const entry = field(id);
      if (!entry.item?.noun) continue;
      expect(label.full, id).toMatch(/^[A-Z][a-z]+ \d+: \S/);
      // The registry's own label names the item by its id, in curly quotes. No screen prints that one.
      expect(label.full, id).not.toContain("“");
    }
  });

  it("number the items of each list from one, in the order the page shows them", () => {
    for (const list of siteRegistry.lists.values()) {
      const groups = [...new Set([...siteRegistry.fields.values()].filter((entry) => entry.item?.array === list.id).map((entry) => fieldLabel(entry).group))];
      expect(groups, list.id).toEqual(list.items.map((_, i) => `${list.item} ${i + 1}`));
    }
  });

  it("give every page an address without an id that reads badly, and find the page again from it", () => {
    expect(siteRegistry.pages.map((page) => editorAddress(page.id))).toEqual(["/admin/pages/home", "/admin/pages/how-it-works", "/admin/pages/use-cases", "/admin/pages/faq", "/admin/pages/about", "/admin/pages/shared"]);
    for (const page of siteRegistry.pages) {
      expect(pageBySlug(pageSlug(page.id))).toBe(page);
      expect(pageCovers(page.id), page.id).not.toBe("");
    }
    // The review has its own address under Pages, so no page may take it.
    for (const slug of ["review", "", "constructor", "__proto__", "howItWorks", "library"]) expect(pageBySlug(slug), slug).toBeNull();
    expect(fieldAnchor(HEADLINE)).toBe("field-home.hero.headline");
  });

  it("say what every name in braces stands for", () => {
    for (const name of [...amountPlaceholderNames, ...captionNames]) expect(wordsFor(name), name).toMatch(/^[a-z]/);
    expect(Object.keys(placeholderWords).sort()).toEqual([...amountPlaceholderNames, ...captionNames].sort());
    expect(wordsFor("monthlyUsd")).toBe("the monthly price in US dollars");
    for (const name of ["monthlyUsdd", "constructor", "__proto__"]) expect(wordsFor(name), name).toBeNull();
  });
});
