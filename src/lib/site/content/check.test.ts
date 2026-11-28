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
import { BODY_LINK_ADDRESSES, DESTINATION_REFUSAL, MAIN_HEADINGS, TYPED_MAX, draftChanges, headingWarnings, linkWarnings, linksInto, pageStatus, reviewKey, sectionChanges, ruleWords, saveRefusal, tidyFor, wordingOf, wordingWarnings, type Change } from "./check";
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
    // (An example's playbook is the longest, at 8,000: the built-in ones are about 3,300.)
    for (const entry of siteRegistry.fields.values()) expect(entry.max, entry.id).toBeLessThan(TYPED_MAX / 5);
  });

  it("a link with no words or nowhere to go, or an address a link may not point at (plan R9, KTD12)", () => {
    const LABEL = "nav.faq.label";
    const HREF = "nav.faq.href";
    expect(refused(LABEL, "   ")).toMatch(/^This cannot be left empty/);
    expect(refused(HREF, "")).toMatch(/^This cannot be left empty/);
    for (const bad of ["javascript:alert(1)", "//evil.test", "http://x.test", "data:text/html,x", "faq", "https://a@evil.test", "/faq{x}"]) expect(refused(HREF, bad), bad).toBe(DESTINATION_REFUSAL);
    for (const ok of ["/faq", "/#price", "https://x.test", "mailto:a@b.test"]) expect(refused(HREF, ok), ok).toBeNull();
    // An address is kept as typed, without the spaces around it: " /faq " is "/faq", never "/ faq".
    expect(tidyFor(field(HREF), "  /faq ")).toBe("/faq");
    // A header label is capped so the menu reads well; its fit in the header's row is the header's own (header-fit.ts).
    expect(refused(LABEL, "x".repeat(25))).toMatch(/most that fits here is 24/);
  });

  it("an example's playbook keeps its lines, and refuses a name in braces, since a play holds no amounts (plan U8)", () => {
    const PLAYBOOK = "examples.video.playbook";
    expect(field(PLAYBOOK).kind).toBe("block");
    expect(tidyFor(field(PLAYBOOK), "## 1. Play\r\nA line.  \r\n\r\n\r\n\r\n## 2. Trigger\r\n  - indented")).toBe("## 1. Play\nA line.\n\n## 2. Trigger\n  - indented");
    expect(refused(PLAYBOOK, "## One\nUse {date} here.")).toMatch(/^\{date\} is not something this text can hold/);
    // Counted once tidied: a CRLF the browser sends is one character, as the box counts it.
    expect(refused(PLAYBOOK, "a\r\n".repeat(2666) + "a")).toBeNull();
    expect(refused(PLAYBOOK, "a".repeat(8001))).toMatch(/most that fits here is 8000/);
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

describe("the wording rules on the examples (plan U8)", () => {
  it("reads an added example's texts under the sample zone, and lists a claim about time saved, which may be published anyway", () => {
    const added = {
      "examples.x-1.label": "Inbox zero",
      "examples.x-1.category": "Email",
      "examples.x-1.title": "Clear the inbox",
      "examples.x-1.summary": "Your AI agent sorts the inbox. It can save 5 hours a week.",
      "examples.x-1.install": "Save this as a skill called Inbox zero.",
      "examples.x-1.playbook": "## One\nSort.\n\n## Two\nReply.",
    };
    const draft: Overlay = { ...edits(added), lists: { examples: { order: [], removed: [], added: ["x-1"] } } };
    const changes = draftChanges({ draft, published: newOverlay() });
    expect(changes.filter((change) => change.fresh).map((change) => change.field.id)).toEqual(Object.keys(added));
    const warnings = wordingWarnings(changes, amounts);
    expect(warnings.map((warning) => [warning.field.id, warning.rule])).toEqual([["examples.x-1.summary", "time-saved"]]);
    expect(warnings[0].field.claims).toEqual({ path: "/", zones: ["sample"] });
    // A built-in example's text edited the same way is read the same way.
    expect(warned({ "examples.paper.summary": "It saves 2 hours every morning." }).map((warning) => warning.rule)).toContain("time-saved");
    // And the built-in plays, as written, raise nothing in their zone.
    expect(warned(Object.fromEntries([...siteRegistry.fields.values()].filter((entry) => entry.id.startsWith("examples.")).map((entry) => [entry.id, original(entry.id) + " "])))).toEqual([]);
  });

  it("reads a short title as the row of tabs prints it, outside the card's zone: a figure there is listed, as the page's own check would", () => {
    expect(siteRegistry.fields.get("examples.video.label")!.claims).toEqual({ path: "/", zones: [] });
    // The card allows every figure of a play; the row above it does not.
    expect(warned({ "examples.video.label": "100 Reels a week" }).map((warning) => warning.rule)).toContain("number");
    expect(warned({ "examples.video.summary": "Makes 100 Reels a week from your camera roll." })).toEqual([]);
    // The built-in short title with a figure in it is allowed by its own entry, wherever it is printed.
    expect(warned({ "examples.prospects.label": "20 new prospects every day " })).toEqual([]);
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

  it("follows the header's and the footer's links as the draft has them, now that they are lists (plan U8)", () => {
    const withLists = (lists: Overlay["lists"], text: Record<string, string> = {}, sections: Record<string, string[]> = { home: ["price"] }) => {
      const base = off(sections, text);
      return linkWarnings({ draft: { ...base.draft, lists } });
    };
    // Worded apart: one warning for each, each saying where it is.
    const apart = linkWarnings(off({ home: ["price"] }, { "nav.pricing.label": "Price" }));
    expect(apart.map((warning) => warning.says.split(" points at")[0])).toEqual(["The “Price” link in the header of every page", "The “Pricing” link in the footer of every page"]);
    // Taken out of the header: the footer's alone.
    expect(withLists({ nav: { order: [], removed: ["pricing"], added: [] } }).map((warning) => warning.says.split(" points at")[0])).toEqual(["The “Pricing” link in the footer of every page"]);
    // Pointed somewhere else in both: nothing to warn about.
    expect(withLists({}, { "nav.pricing.href": "/faq", "footer.links.pricing.href": "https://x.test" })).toEqual([]);
    // A link added to the header, typed or picked, that lands on a section that is off.
    const zack = withLists({ nav: { order: [], removed: [], added: ["x-zack"] } }, { "nav.x-zack.label": "Zack's files", "nav.x-zack.href": "/how-it-works#zack" }, { howItWorks: ["zack"] });
    expect(zack.map((warning) => warning.says.split(" points at")[0])).toEqual(["The “Zack's files” link in the header of every page", `The “${v1.control.link.label}” link on the homepage, under “You decide what Zack shares”`]);
    // Beside the section's switch, the same links are named.
    expect(linksInto({ draft: { ...edits({ "nav.pricing.label": "Price" }) } }, "home", "price")).toEqual(["“Price” link in the header of every page", "“Pricing” link in the footer of every page"]);
    expect(linksInto({ draft: newOverlay() }, "home", "price")).toEqual(["“Pricing” link in the header and in the footer of every page"]);
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

describe("every link the draft would draw, typed or built in, and the places it lands on (plan U9, R17)", () => {
  type Draft = { draft: Overlay };
  const draftOf = (o: { off?: Record<string, string[]>; text?: Record<string, string>; lists?: Overlay["lists"] }): Draft => ({
    draft: { ...edits(o.text ?? {}), sections: Object.fromEntries(Object.entries(o.off ?? {}).map(([page, ids]) => [page, { order: [], off: ids }])), lists: o.lists ?? {} },
  });
  /** The footer's FAQ link pointed at `href`, and whatever else the draft does. */
  const footerTo = (href: string, more: Parameters<typeof draftOf>[0] = {}) => draftOf({ ...more, text: { "footer.links.faq.href": href, ...more.text } });
  const removed = (list: string, ...items: string[]) => ({ [list]: { order: [], removed: items, added: [] } });
  const said = (content: Draft) => linkWarnings(content).map((warning) => ({ kind: warning.kind, href: warning.href, link: warning.link, item: warning.item?.id ?? null }));

  it("covers AE3 for a typed address: a link typed as /#price, in a link added to the header, is named when Price is off", () => {
    const content = draftOf({ off: { home: ["price"] }, text: { "nav.x-price.label": "Our price", "nav.x-price.href": "/#price" }, lists: { nav: { order: [], removed: [], added: ["x-price"] } } });
    expect(said(content)).toEqual([
      { kind: "off", href: "/#price", link: "Pricing", item: null },
      { kind: "off", href: "/#price", link: "Our price", item: null },
    ]);
    expect(linkWarnings(content)[1].says).toBe("The “Our price” link in the header of every page points at the “Price” section of Home, which is switched off. A visitor who presses it lands at the top of the homepage instead.");
    // Each warning knows the field the owner changes the link in: here, the address of the added link.
    expect(linkWarnings(content)[1].field?.id).toBe("nav.x-price.href");
    // Written the other ways a browser reads the same place.
    for (const href of ["/?x=1#price", "/#pr%69ce"]) expect(said(footerTo(href, { off: { home: ["price"] } })).map((entry) => entry.link), href).toContain("FAQ");
  });

  it("names a link to an example's place when the example is removed, its tab's and its card's too, by the example's words", () => {
    const paper = siteRegistry.fields.get("examples.paper.label")!;
    for (const href of ["/#examples-paper", "/#examples-tab-paper", "/#examples-paper-card"]) {
      expect(said(footerTo(href)), href).toEqual([]);
      const [warning, ...rest] = linkWarnings(footerTo(href, { lists: removed("examples", "paper") }));
      expect(rest, href).toEqual([]);
      expect(warning).toMatchObject({ kind: "removed", href, link: "FAQ", item: { id: "paper" } });
      expect(warning.says).toBe(`The “FAQ” link in the footer of every page points at the example “${original(paper.id)}” on Home, which is removed from the list. A visitor who presses it lands at the top of the homepage instead.`);
    }
    // An example added in the admin and removed again has no words left: it is named for what it was.
    const gone = linkWarnings(footerTo("/#examples-x-gone"))[0];
    expect(gone).toMatchObject({ kind: "removed", item: { id: "x-gone" } });
    expect(gone.says).toContain("points at an example that is no longer in the list on Home");
  });

  it("names a link into a section the drafts leave with nothing to show, or switch off, with the example it was for", () => {
    const all = removed("examples", "video", "prospects", "paper");
    expect(said(footerTo("/#examples", { lists: all }))).toEqual([{ kind: "empty", href: "/#examples", link: "FAQ", item: null }]);
    expect(said(footerTo("/#examples", { off: { home: ["examples"] } }))).toEqual([{ kind: "off", href: "/#examples", link: "FAQ", item: null }]);
    expect(linkWarnings(footerTo("/#examples-paper", { off: { home: ["examples"] } }))[0]).toMatchObject({ kind: "off", item: { id: "paper" } });
    expect(linkWarnings(footerTo("/#examples-paper", { off: { home: ["examples"] } }))[0].says).toContain("which is in the “Cora Curation examples” section, and that section is switched off");
    // The homepage's questions with every group of /faq switched off: /faq's groups are the homepage's too.
    const groups = v1.questions.map((group) => group.id);
    expect(said(footerTo("/#questions", { off: { faq: groups } }))).toEqual([{ kind: "empty", href: "/#questions", link: "FAQ", item: null }]);
    // And a group of /faq that is switched off, or has no question left.
    expect(said(footerTo(`/faq#${groups[0]}`, { off: { faq: [groups[0]] } }))).toEqual([{ kind: "off", href: `/faq#${groups[0]}`, link: "FAQ", item: null }]);
    const emptied = removed(`questions.${groups[0]}.items`, ...v1.questions[0].items.map((item) => item.id));
    expect(said(footerTo(`/faq#${groups[0]}`, { lists: emptied }))).toEqual([{ kind: "empty", href: `/faq#${groups[0]}`, link: "FAQ", item: null }]);
  });

  it("says nothing of a link to a page, to another site, to a place no section or item has, or to a page Pages does not cover", () => {
    const all = { off: { home: ["price", "examples", "questions"], howItWorks: ["zack"], library: ["watch"] }, lists: removed("examples", "paper") };
    for (const href of ["/faq", "/", "/library", "https://example.test/#price", "mailto:a@b.test", "/#examples-title", "/#hero-title", "/#nothing", "/zack#price", "/privacy"]) {
      expect(
        said(footerTo(href, all)).filter((entry) => entry.link === "FAQ"),
        href,
      ).toEqual([]);
    }
  });

  it("says nothing when the place is only moved: sections reordered, examples reordered, the questions moved", () => {
    const home = siteRegistry.pages.find((entry) => entry.id === "home")!.sections.map((section) => section.id);
    const moved = { draft: { ...newOverlay(), sections: { home: { order: [...home].reverse(), off: [] } }, lists: { examples: { order: ["paper", "prospects", "video"], removed: [], added: [] } } } };
    expect(said(moved)).toEqual([]);
    for (const href of ["/#price", "/#examples-paper", "/#examples-tab-paper", "/#questions"]) {
      expect(said({ draft: { ...moved.draft, text: { "footer.links.faq.href": href } } }), href).toEqual([]);
    }
  });

  it("reads the same place however the address is written: trailing slash, query, the site's own full address", () => {
    const off = { off: { home: ["price"] } };
    for (const href of ["/?ref=nav#price", "/#price", "https://meetroger.ai/#price", "https://www.meetroger.ai/?x=1#price", "https://preview.meetroger.ai/#price"]) {
      expect(said(footerTo(href, off)).filter((entry) => entry.link === "FAQ"), href).toEqual([{ kind: "off", href: "/#price", link: "FAQ", item: null }]);
    }
    const group = v1.questions[0].id;
    for (const href of [`/faq/#${group}`, `/faq?x=1#${group}`, `https://meetroger.ai/faq/#${group}`]) {
      expect(said(footerTo(href, { off: { faq: [group] } })).filter((entry) => entry.link === "FAQ"), href).toEqual([{ kind: "off", href: `/faq#${group}`, link: "FAQ", item: null }]);
    }
    // Another site with the same path, a look-alike name, and a place written in other letters (a browser matches a
    // place's name exactly, so "#Price" never lands on the price, whatever the drafts do) are not this warning's.
    for (const href of ["https://meetroger.ai.example.test/#price", "https://notmeetroger.ai/#price", "/#Price", "/FAQ#" + group]) {
      expect(said(footerTo(href, { off: { home: ["price"], faq: [group] } })).filter((entry) => entry.link === "FAQ"), href).toEqual([]);
    }
  });

  it("does not warn about the homepage's own links to /faq, or a link drawn in a section that is off", () => {
    expect(said(draftOf({ off: { faq: v1.questions.map((group) => group.id) } }))).toEqual([]);
    expect(said(draftOf({ off: { home: ["control"], howItWorks: ["zack"] } }))).toEqual([]);
  });

  it("reads every built-in link the page bodies draw from the copy: a new address in the copy must be added to the list", () => {
    const found: string[] = [];
    const walk = (value: unknown, at: string[]) => {
      if (Array.isArray(value)) return;
      if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) walk(inner, [...at, key]);
      else if (at.at(-1) === "href" && typeof value === "string") found.push(at.join("."));
    };
    walk(baseline, []);
    // The header's and the footer's are lists, read item by item.
    expect(found.sort()).toEqual([...BODY_LINK_ADDRESSES].sort());
  });
});

describe("a page left without its main heading (plan U9)", () => {
  const off = (entries: Record<string, string[]>): { draft: Overlay } => ({ draft: { ...newOverlay(), sections: Object.fromEntries(Object.entries(entries).map(([page, ids]) => [page, { order: [], off: ids }])) } });

  it("warns for the homepage with its Hero off and the Use cases page with its introduction off, and for nothing else", () => {
    expect(headingWarnings(off({}))).toEqual([]);
    expect(headingWarnings(off({ home: ["price", "problem"], library: ["watch", "band"], faq: ["getting-started"] }))).toEqual([]);
    const [home, library, ...rest] = headingWarnings(off({ home: ["hero"], library: ["intro"] }));
    expect(rest).toEqual([]);
    expect(home).toMatchObject({ page: { id: "home" }, section: { id: "hero" } });
    expect(home.says).toBe("The homepage would have no main heading: its “Hero” section, which holds the page’s headline, is switched off. Visitors still see the rest of the page, but search engines and screen readers use that headline to tell what the page is about.");
    expect(library.says).toContain("The Use cases page would have no main heading: its “Introduction” section");
  });

  it("knows the sections that hold a page's only h1, and every other covered page's title is fixed", () => {
    const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source("src/components/site/v1/home.tsx")).toMatch(/hero: \([\s\S]*?<h1 id="hero-title"/);
    expect(source("src/app/library/page.tsx")).toContain('<h1 id="library-title"');
    expect(MAIN_HEADINGS).toEqual([
      { page: "home", section: "hero" },
      { page: "library", section: "intro" },
    ]);
    for (const page of siteRegistry.pages) {
      if (page.id === "shared" || MAIN_HEADINGS.some((spot) => spot.page === page.id)) continue;
      expect(page.sections.some((section) => section.fixed && section.id === "title"), page.id).toBe(true);
    }
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
