/**
 * The registry of what Pages may edit (plan U3, KTD3): built from the copy, so
 * a field cannot exist in one and not the other; every list item under an id
 * that never changes; and every field with what the editor and the wording
 * check need to know about it.
 */
import { describe, expect, it } from "vitest";
import { letterShown } from "@/data/site/letter";
import { v1 } from "@/data/site/v1";
import { fixtureCopy, fixtureRegistry, fixtureSpec } from "@/test-helpers/content-fixture";
import { v3Defaults } from "@/data/config";
import { amountsFrom, fillAmounts } from "../amounts";
import { captionNames } from "../compounding";
import { textAt } from "./model";
import { ADDED_PREFIX, buildRegistry, codeModel, isId, siteRegistry, siteSpec, usableValue, type Field } from "./registry";
import { amountPlaceholderNames, plainBlock, plainLine } from "./text";

const fields = [...siteRegistry.fields.values()];
const field = (id: string): Field => {
  const found = siteRegistry.fields.get(id);
  if (!found) throw new Error(`No field "${id}"`);
  return found;
};
const page = (id: string) => siteRegistry.pages.find((entry) => entry.id === id)!;
const sectionIds = (id: string) => page(id).sections.map((section) => section.id);

/** A copy changed the way a later code change would change it. */
const withCopy = (change: (copy: typeof codeModel) => void) => {
  const copy = structuredClone(codeModel);
  change(copy);
  return copy;
};
const build = (copy: typeof codeModel) => buildRegistry(copy, siteSpec(copy));

describe("the ids of the built-in copy (KTD3)", () => {
  // These ids are what stored edits are kept under. Changing one orphans every edit saved under it, on both sites:
  // an id is added here when an item is added to the copy, and is never renamed or given to another item.
  it("gives every item of every list a page prints the id it had when it went live", () => {
    expect(Object.fromEntries([...siteRegistry.lists.values()].map((list) => [list.id, list.items]))).toEqual({
      "home.hero.graphic.steps": ["use", "collect", "curate", "deploy"],
      "home.problem.statements": ["told", "unposted", "alone"],
      "control.points": ["read", "rules", "off"],
      "howItWorks.week.days": ["sunday", "monday", "tuesday", "wednesday"],
      "howItWorks.firstWeeks.steps": ["start", "zack-runs", "arrive", "email", "charged", "closes"],
      "questions.getting-started.items": ["no-agents-yet", "which-agents", "each-week"],
      "questions.zack-and-privacy.items": ["zack-reads", "what-leaves", "see-and-change", "who-sees", "competitors", "delete-sent"],
      "questions.cora-and-the-ideas.items": ["what-is-a-curation", "how-chosen", "does-not-fit", "other-agent"],
      "questions.price-and-billing.items": ["cost", "card-charged", "why-a-card", "missed-week", "refund"],
      // The header's and the footer's links (plan U8): named by the keys their labels had before they were lists, so
      // the edits saved under those keys are read under these (format.ts, legacyText).
      nav: ["howItWorks", "pricing", "library", "faq", "about"],
      "footer.links": ["pricing", "howItWorks", "faq", "about", "library"],
      examples: ["video", "prospects", "paper"],
    });
  });

  it("and every item that is edited as text only: the Zack points, the anatomy notes, the question groups and the letter's paragraphs", () => {
    const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);
    expect(ids(v1.howItWorks.zack.points)).toEqual(["reads", "never-reads", "removes", "change"]);
    expect(ids(v1.howItWorks.anatomy.notes)).toEqual(["play", "trigger", "setup-first", "steps", "guardrails", "output", "pitfalls", "done-when", "paste"]);
    expect(ids(v1.questions)).toEqual(["getting-started", "zack-and-privacy", "cora-and-the-ideas", "price-and-billing"]);
    expect(ids(codeModel.letter.paragraphs)).toEqual(letterShown.map((p) => p.id));
    expect(ids(codeModel.letter.paragraphs)).toEqual(["who", "noticed", "background"]);
  });

  it("walks the whole copy: every array of objects in it has items with unique ids that can be part of a field id", () => {
    let arrays = 0;
    const walk = (node: unknown, at: string): void => {
      if (Array.isArray(node)) {
        if (node.every((item) => typeof item === "string")) return expect(at, "the one array that is not a list of items").toMatch(/\.on$/);
        arrays++;
        const ids = node.map((item: { id?: unknown }) => item.id);
        for (const id of ids) {
          expect(isId(id), `${at}: ${String(id)}`).toBe(true);
          expect(String(id).startsWith(ADDED_PREFIX), `${at}: ${String(id)}`).toBe(false);
        }
        expect(new Set(ids).size, at).toBe(ids.length);
        node.forEach((item, i) => walk(item, `${at}[${i}]`));
      } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) walk(value, at ? `${at}.${key}` : key);
      }
    };
    walk(codeModel, "");
    // The five lists of Home and How it works, the groups and their four lists of questions, the three that are text
    // only, the header's and the footer's links, and the examples.
    expect(arrays).toBe(16);
  });

  it("fails the walk on a list whose items have no ids, share one, or have one that cannot be used", () => {
    const withSteps = (steps: unknown) => () => buildRegistry({ ...fixtureCopy, steps }, fixtureSpec);
    expect(withSteps(["Step one", "Step two"])).toThrow(/every item of "steps" needs its own id/);
    expect(withSteps([{ text: "Step one" }])).toThrow(/every item of "steps" needs its own id/);
    expect(withSteps([{ id: "one", text: "a" }, { id: "one", text: "b" }])).toThrow(/every item of "steps" needs its own id.*"one"/);
    expect(withSteps([{ id: 1, text: "a" }])).toThrow(/needs its own id/);
    expect(withSteps([{ id: "", text: "a" }])).toThrow(/needs its own id/);
    // A dot would split the field id in the wrong place, and "x-" is kept for items added in the admin.
    expect(withSteps([{ id: "a.b", text: "a" }])).toThrow(/needs its own id/);
    expect(withSteps([{ id: "x-mine", text: "a" }])).toThrow(/not starting with "x-"/);
    expect(withSteps([{ id: "one two", text: "a" }])).toThrow(/needs its own id/);
    // A key with a dot would give two strings one field id, in an item as anywhere else in the copy.
    expect(withSteps([{ id: "one", "text.more": "a" }])).toThrow(/the key "text.more" under "steps.one" cannot be part of a field id/);
    expect(withSteps([{ id: "one", text: "a", "*": "b" }])).toThrow(/cannot be part of a field id/);
    expect(() => buildRegistry({ ...fixtureCopy, "note.body": "x" }, fixtureSpec)).toThrow(/the key "note.body" under "" cannot be part of a field id/);
    // The same on the real copy.
    expect(() => build(withCopy((copy) => void (copy.home.problem.statements = ["A statement with no id"] as never)))).toThrow(/every item of "home.problem.statements" needs its own id/);
    expect(() => build(withCopy((copy) => void (copy.control.points[1].id = "read")))).toThrow(/every item of "control.points" needs its own id/);
  });

  it("says what an id may be", () => {
    for (const ok of ["a", "who-sees", "howItWorks", "x-4f9a", "7"]) expect(isId(ok), ok).toBe(true);
    for (const bad of ["", "-a", "a.b", "a b", "a_b", "a/b", "é", "a".repeat(81), 7, null, undefined, ["a"]]) expect(isId(bad), String(bad)).toBe(false);
  });
});

describe("the registry and the copy cannot disagree", () => {
  it("has every field's id resolve to a string in the code model, and no two fields share an id", () => {
    expect(fields.length).toBeGreaterThan(150);
    for (const entry of fields) {
      expect(typeof textAt(codeModel, entry.id), entry.id).toBe("string");
      expect(entry.id, entry.id).toBe(entry.path.join("."));
    }
    const listed = siteRegistry.pages.flatMap((entry) => entry.sections.flatMap((section) => section.fields.map((f) => f.id)));
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(fields.map((f) => f.id).sort());
  });

  it("refuses a string added to the copy until someone decides whether Pages may edit it", () => {
    expect(() => build(withCopy((copy) => void ((copy.home.hero as Record<string, unknown>).kicker = "New here")))).toThrow(/the copy has "home\.hero\.kicker" and the registry has no decision for it/);
    expect(() => build(withCopy((copy) => void ((copy.control.points[0] as Record<string, unknown>).aside = "More")))).toThrow(/"control\.points\.read\.aside"/);
    expect(() => buildRegistry({ ...fixtureCopy, extra: "x" }, fixtureSpec)).toThrow(/the copy has "extra"/);
    // A list nobody has decided about, and a list of plain strings that is not said to be left alone.
    expect(() => buildRegistry({ ...fixtureCopy, more: [{ id: "a", text: "x" }] }, fixtureSpec)).toThrow(/the copy has the list "more"/);
    expect(() => buildRegistry({ ...fixtureCopy, words: ["a"] }, fixtureSpec)).toThrow(/the copy has the list "words"/);
  });

  it("refuses a spec that names what the copy does not have, or that decides twice about one string", () => {
    expect(() => build(withCopy((copy) => void delete (copy.home.hero as Partial<typeof copy.home.hero>).sub))).toThrow(/names what the copy does not have: home\.hero\.sub/);
    const without = (key: keyof typeof fixtureCopy) => Object.fromEntries(Object.entries(fixtureCopy).filter(([name]) => name !== key));
    expect(() => buildRegistry(without("heard"), fixtureSpec)).toThrow(/names what the copy does not have: heard/);
    expect(() => buildRegistry(without("steps"), fixtureSpec)).toThrow(/names what the copy does not have: steps\.\*\.text, steps/);
    expect(() => buildRegistry(fixtureCopy, { ...fixtureSpec, notEditable: { ...fixtureSpec.notEditable, title: "Twice." } })).toThrow(/more than one pattern of the registry matches "title"/);
    // A key that could not be told from a pattern or from two parts of an id.
    expect(() => buildRegistry({ ...fixtureCopy, "a.b": "x" }, fixtureSpec)).toThrow(/cannot be part of a field id/);
  });

  it("refuses a list whose items' fields are spread over two sections, and two sections or pages with one id", () => {
    // Moved whole to another section, the list follows.
    const moved: typeof fixtureSpec = structuredClone(fixtureSpec);
    moved.pages[0].sections[1].fields!["steps.*.text"] = moved.pages[0].sections[2].fields!["steps.*.text"];
    delete moved.pages[0].sections[2].fields!["steps.*.text"];
    expect(buildRegistry(fixtureCopy, moved).lists.get("steps")).toMatchObject({ section: "body" });
    const split = { ...fixtureCopy, steps: fixtureCopy.steps.map((step) => ({ ...step, more: "x" })) };
    const splitSpec: typeof fixtureSpec = structuredClone(fixtureSpec);
    splitSpec.pages[0].sections[1].fields!["steps.*.more"] = { label: "More", max: 10 };
    expect(() => buildRegistry(split, splitSpec)).toThrow(/the fields of the list "steps" must all be in one section/);
    const repeated: typeof fixtureSpec = structuredClone(fixtureSpec);
    repeated.pages[0].sections[3].id = "body";
    expect(() => buildRegistry(fixtureCopy, repeated)).toThrow(/unusable or repeated section id "body"/);
    expect(() => buildRegistry(fixtureCopy, { ...fixtureSpec, pages: [...fixtureSpec.pages, fixtureSpec.pages[0]] })).toThrow(/two pages share an id/);
  });

  it("follows the copy when the code changes later: an item added to a list has its fields, and a removed one has none", () => {
    const added = build(withCopy((copy) => void copy.home.problem.statements.splice(1, 0, { id: "later", text: "Added in code later." })));
    expect(added.lists.get("home.problem.statements")!.items).toEqual(["told", "later", "unposted", "alone"]);
    expect(added.fields.get("home.problem.statements.later.text")).toMatchObject({ page: "home", section: "problem", label: "Statement “later”: Text" });
    const removed = build(withCopy((copy) => void copy.home.problem.statements.pop()));
    expect(removed.fields.has("home.problem.statements.alone.text")).toBe(false);
    expect(removed.fields.size).toBe(fields.length - 1);
    // A list the code has emptied is still a list, with no items.
    const emptied = build(withCopy((copy) => void (copy.home.problem.statements = [])));
    expect(emptied.lists.get("home.problem.statements")).toMatchObject({ items: [], page: "home", section: "problem" });
    // A question group added in code is a section of /faq with its own list.
    const group = build(withCopy((copy) => void copy.questions.push({ id: "new-group", title: "New group", items: [{ id: "new-q", q: "New?", a: "Yes.", on: [] }] })));
    expect(group.pages.find((entry) => entry.id === "faq")!.sections.map((section) => section.id)).toContain("new-group");
    expect(group.lists.get("questions.new-group.items")).toMatchObject({ items: ["new-q"], section: "new-group" });
  });
});

describe("the covered pages and their sections (R5)", () => {
  it("lists Home, How it works, Use cases, FAQ, About and Shared, in the order Pages shows them", () => {
    expect(siteRegistry.pages.map((entry) => [entry.id, entry.label, entry.path])).toEqual([
      ["home", "Home", "/"],
      ["howItWorks", "How it works", "/how-it-works"],
      ["library", "Use cases", "/library"],
      ["faq", "FAQ", "/faq"],
      ["about", "About", "/about"],
      ["shared", "Shared", "/"],
    ]);
  });

  it("has each page's sections in the page's own order, the title of a reading page apart from them", () => {
    expect(sectionIds("home")).toEqual(["hero", "problem", "examples", "compounds", "testimonials", "control", "price", "questions", "closing"]);
    expect(sectionIds("howItWorks")).toEqual(["title", "week", "zack", "cora", "anatomy", "firstWeeks", "noAgent", "startBand"]);
    expect(sectionIds("library")).toEqual(["intro", "rows", "watch", "band"]);
    expect(sectionIds("faq")).toEqual(["title", "getting-started", "zack-and-privacy", "cora-and-the-ideas", "price-and-billing", "startBand"]);
    expect(sectionIds("about")).toEqual(["title", "letter", "startBand"]);
    expect(sectionIds("shared")).toEqual(["buttons", "nav", "footer", "price", "notFound"]);
    // A page's title, and everything under Shared, is not a section an admin can switch off or move.
    const fixed = siteRegistry.pages.flatMap((entry) => entry.sections.filter((section) => section.fixed).map((section) => `${entry.id}.${section.id}`));
    expect(fixed).toEqual(["howItWorks.title", "faq.title", "about.title", "shared.buttons", "shared.nav", "shared.footer", "shared.price", "shared.notFound"]);
    // /faq's sections are the copy's groups, under the groups' own titles.
    expect(page("faq").sections.slice(1, 5).map((section) => section.label)).toEqual(v1.questions.map((group) => group.title));
  });

  it("says which background each movable section is painted on, and which id a link can land on (plan U6)", () => {
    const grounds = (id: string) => page(id).sections.map((section) => section.ground);
    // Home: no two night chapters are neighbours in the built-in order, and it opens and closes on night.
    expect(grounds("home")).toEqual(["night", "ground", "ground", "ground-2", "ground", "ground", "night", "ground", "night"]);
    expect(grounds("howItWorks")).toEqual([null, "ground", "ground", "ground", "ground", "ground", "ground", "night"]);
    expect(grounds("faq")).toEqual([null, "ground", "ground", "ground", "ground", "night"]);
    expect(grounds("about")).toEqual([null, "ground", "night"]);
    // /library draws no line between its sections, so none of them has a ground. A fixed section never has one.
    expect(grounds("library")).toEqual([null, null, null, null]);
    expect(grounds("shared")).toEqual([null, null, null, null, null]);
    for (const entry of siteRegistry.pages) for (const section of entry.sections) if (section.fixed) expect(section.ground, `${entry.id}.${section.id}`).toBeNull();
    // The anchors: the ids the pages' markup has, which the page tests hold them to.
    const anchors = Object.fromEntries(siteRegistry.pages.map((entry) => [entry.id, entry.sections.filter((section) => section.anchor !== null).map((section) => `${section.id}:${section.anchor}`)]));
    expect(anchors).toEqual({
      home: ["problem:problem", "examples:examples", "compounds:compounds", "testimonials:say", "control:control", "price:price", "questions:questions"],
      howItWorks: ["week:week", "zack:zack", "cora:cora", "anatomy:anatomy", "firstWeeks:first-weeks", "noAgent:no-agent"],
      library: ["watch:watch"],
      faq: v1.questions.map((group) => `${group.id}:${group.id}`),
      about: [],
      shared: [],
    });
    // A section's anchor is unique on its page, so a link lands on one place.
    for (const entry of siteRegistry.pages) {
      const ids = entry.sections.flatMap((section) => (section.anchor === null ? [] : [section.anchor]));
      expect(new Set(ids).size, entry.id).toBe(ids.length);
    }
  });

  it("puts every list in the section its items are edited under", () => {
    expect([...siteRegistry.lists.values()].map((list) => `${list.page}.${list.section}: ${list.label} (${list.item})`).sort()).toEqual([
      "faq.cora-and-the-ideas: Questions (Question)",
      "faq.getting-started: Questions (Question)",
      "faq.price-and-billing: Questions (Question)",
      "faq.zack-and-privacy: Questions (Question)",
      "home.control: Control points (Point)",
      "home.examples: Cora Curation examples (Example)",
      "home.hero: Hero steps (Step)",
      "home.problem: Problem statements (Statement)",
      "howItWorks.firstWeeks: First-weeks steps (Step)",
      "howItWorks.week: Days of the week (Day)",
      "shared.footer: Footer links (Link)",
      "shared.nav: Header links (Link)",
    ]);
  });

  it("shows a section's fields in reading order, an item's fields together", () => {
    expect(page("home").sections[0].fields.map((f) => f.id)).toEqual([
      "home.hero.headline",
      "home.hero.sub",
      ...["use", "collect", "curate", "deploy"].flatMap((id) => ["label", "title", "body"].map((part) => `home.hero.graphic.steps.${id}.${part}`)),
      "home.hero.graphic.pause",
      "home.hero.graphic.play",
    ]);
    expect(page("faq").sections[1].fields.slice(0, 3).map((f) => f.id)).toEqual(["questions.getting-started.title", "questions.getting-started.items.no-agents-yet.q", "questions.getting-started.items.no-agents-yet.a"]);
    expect(page("shared").sections[3].fields.map((f) => f.id)).toEqual(["cardLine", "trialLine", "price.perMonth", "price.tax.USD", "price.tax.CAD"]);
  });
});

describe("what the registry says about a field", () => {
  it("addresses a field by its path, and an item of a list by the item's id, never its place", () => {
    expect(field("buttons.start")).toMatchObject({ path: ["buttons", "start"], page: "shared", section: "buttons", kind: "line", max: 80 });
    expect(field("buttons.start").item).toBeUndefined();
    expect(field("home.hero.headline")).toMatchObject({ page: "home", section: "hero", label: "Headline", max: 200, claims: { path: "/", zones: [] } });
    expect(field("home.problem.statements.alone.text")).toMatchObject({ path: ["home", "problem", "statements", "alone", "text"], label: "Statement “alone”: Text", item: { array: "home.problem.statements", id: "alone" } });
    expect(field("questions.price-and-billing.items.cost.a")).toMatchObject({ page: "faq", section: "price-and-billing", label: "Question “cost”: Answer", max: 1500, item: { array: "questions.price-and-billing.items", id: "cost" }, claims: { path: "/faq", zones: [] } });
    // A group's heading is a field of the group's section, named plainly.
    expect(field("questions.price-and-billing.title")).toMatchObject({ section: "price-and-billing", label: "Heading" });
    for (const id of fields.map((f) => f.id)) expect(id, id).not.toMatch(/\.\d+(\.|$)|\[/);
  });

  it("covers the Use cases page's own lines, the count written as [count]", () => {
    expect(page("library").sections.flatMap((section) => section.fields.map((f) => f.id))).toEqual([
      "library.title.first",
      "library.title.second",
      "library.intro",
      "library.watchLink",
      "library.watch.title",
      "library.watch.note",
      "library.band",
      "closingSub",
    ]);
    expect(v1.library.intro.startsWith("[count] real things")).toBe(true);
    // Names in braces are amounts, so the count is not one.
    expect(JSON.stringify(v1.library)).not.toMatch(/\{count\}/);
  });

  it("covers Peter's letter as /about prints it: the paragraphs that are still true, in the zone his words are checked in", () => {
    expect(page("about").sections[1].fields.map((f) => f.id)).toEqual(["about.leadIn", "letter.greeting", "letter.paragraphs.who.text", "letter.paragraphs.noticed.text", "letter.paragraphs.background.text", "letter.signOff", "letter.signature"]);
    expect(field("letter.paragraphs.noticed.text").claims).toEqual({ path: "/about", zones: ["letter"] });
    expect(field("about.leadIn").claims.zones).toEqual([]);
    expect(textAt(codeModel, "letter.paragraphs.noticed.text")).toBe(letterShown[1].shown);
  });

  it("checks the “It compounds” section in its own zone, and lets only its captions hold the caption's two names", () => {
    for (const entry of page("home").sections[3].fields) expect(entry.claims, entry.id).toEqual({ path: "/", zones: ["compounding"] });
    expect(field("bricks.caption.week").placeholders).toEqual(captionNames);
    expect(field("bricks.caption.bricks").placeholders).toEqual(captionNames);
    // A switch holds no words, so no name in braces either. Nor does a play: it holds no amounts (plan U8).
    const others = fields.filter((f) => !f.id.startsWith("bricks.caption.") && !f.id.startsWith("examples.") && f.kind !== "toggle");
    for (const entry of fields.filter((f) => f.id.startsWith("examples."))) expect(entry.placeholders, entry.id).toEqual([]);
    for (const entry of others) expect(entry.placeholders, entry.id).toEqual(amountPlaceholderNames);
    for (const entry of fields.filter((f) => f.kind === "toggle")) expect(entry.placeholders, entry.id).toEqual([]);
  });

  it("leaves out what Pages does not edit: titles and descriptions, names only a screen reader hears, addresses, /zack's warning", () => {
    for (const id of ["meta.title", "meta.description", "howItWorks.meta.title", "faq.meta.description", "about.meta.headline", "price.switchLabel", "home.hero.graphic.name", "sample.nav", "bricks.week", "about.photoAlt", "sample.scores.title", "sample.scores.names.hours", "control.link.href", "questionsBlock.more.href", "howItWorks.noAgent.link.href", "howItWorks.zack.id", "zackWarning"]) {
      expect(siteRegistry.fields.has(id), id).toBe(false);
    }
    // Every reason is written down.
    for (const [pattern, why] of Object.entries(siteSpec(codeModel).notEditable)) expect(why.length, pattern).toBeGreaterThan(10);
    // The free Zack run's copy is no part of the model.
    expect(fields.some((f) => f.id.startsWith("zack.") || f.id.startsWith("picker."))).toBe(false);
  });

  it("holds every built-in wording to its own field: within the limit, and something the field can print", () => {
    for (const entry of fields) {
      const text = textAt(codeModel, entry.id)!;
      expect(text.length, entry.id).toBeLessThanOrEqual(entry.max);
      expect(usableValue(entry, text), entry.id).toBe(true);
    }
    // Every field of the site is one line of text, a question's "Show on the homepage" switch (plan U7), a link's
    // address, or an example's playbook, the one text that keeps its lines (plan U8).
    expect(new Set(fields.map((f) => f.kind))).toEqual(new Set(["line", "toggle", "destination", "block"]));
    expect(fields.filter((f) => f.kind === "block").map((f) => f.id)).toEqual(["examples.video.playbook", "examples.prospects.playbook", "examples.paper.playbook"]);
    expect(fields.filter((f) => f.kind === "destination").map((f) => f.id)).toEqual([...codeModel.nav.map((l) => `nav.${l.id}.href`), ...codeModel.footer.links.map((l) => `footer.links.${l.id}.href`)]);
    expect(fields.filter((f) => f.kind === "toggle").map((f) => f.id)).toEqual(codeModel.questions.flatMap((group) => group.items.map((item) => `questions.${group.id}.items.${item.id}.home`)));
  });

  it("has every built-in wording already tidy, so a field saved without a change equals its baseline and is no edit (KTD6)", () => {
    for (const entry of fields) {
      const text = textAt(codeModel, entry.id)!;
      const tidy = entry.kind === "block" ? plainBlock(text) : entry.kind === "line" ? plainLine(text) : text;
      expect(tidy, entry.id).toBe(text);
    }
    // The fixture's field that keeps its lines, too.
    expect(plainBlock(fixtureCopy.note.body)).toBe(fixtureCopy.note.body);
  });

  it("lets a field name in braces only what a page can fill: an amount, or one of a caption's two names", () => {
    // fillCopy throws for any other name, and a page fills every string of the copy: a name allowed here and unknown there would take the page down.
    const amounts = amountsFrom(v3Defaults);
    for (const entry of fields) {
      for (const name of entry.placeholders) expect(() => fillAmounts(`{${name}}`, amounts), `${entry.id} {${name}}`).not.toThrow();
    }
  });
});

describe("what a field can hold", () => {
  const fx = (id: string) => fixtureRegistry.fields.get(id)!;

  it("is text, not empty, naming in braces only what the field may name", () => {
    const headline = field("home.hero.headline");
    expect(usableValue(headline, "Smarter every Monday, from {monthlyUsd}.")).toBe(true);
    for (const bad of ["", "   ", "\n", "{monthlyUsdd} a month", "Week {week}", "{constructor}", 7, null, undefined, true, ["text"], { text: "x" }]) expect(usableValue(headline, bad), JSON.stringify(bad)).toBe(false);
    // Nothing a reader could see: spaces of any kind, and characters that print nothing.
    for (const code of [0xa0, 0x3000, 0x200b, 0xfeff, 0x3164, 0xe0041]) expect(usableValue(headline, String.fromCodePoint(code, code)), code.toString(16)).toBe(false);
    expect(usableValue(headline, `${String.fromCodePoint(0x200b)}A`)).toBe(true);
    expect(usableValue(field("bricks.caption.week"), "Week {week}")).toBe(true);
    expect(usableValue(field("bricks.caption.week"), "{monthlyUsd}")).toBe(false);
    // A field that may name nothing.
    expect(usableValue(fx("link.label"), "Questions")).toBe(true);
    expect(usableValue(fx("link.label"), "{monthlyUsd}")).toBe(false);
  });

  it("does not judge length: a text over the field's limit still prints", () => {
    expect(usableValue(field("buttons.signIn"), "a".repeat(500))).toBe(true);
  });

  it("is, for a link's address, only an address a link may point at", () => {
    expect(fx("link.href")).toMatchObject({ kind: "destination", claims: { path: "/page", zones: ["sample"] } });
    for (const ok of ["/faq", "/#price", "https://x.test", "mailto:a@b.test"]) expect(usableValue(fx("link.href"), ok), ok).toBe(true);
    for (const bad of ["", "javascript:alert(1)", "//evil.test", "http://x.test", "faq"]) expect(usableValue(fx("link.href"), bad), bad).toBe(false);
  });

  it("is, for a field that keeps its lines, text with its line breaks", () => {
    expect(fx("note.body").kind).toBe("block");
    expect(usableValue(fx("note.body"), "One.\n\nTwo, at {monthlyUsd}.")).toBe(true);
    expect(usableValue(fx("note.body"), "One.\n{nope}")).toBe(false);
  });
});
