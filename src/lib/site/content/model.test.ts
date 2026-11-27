/**
 * The layers of site content (plan U3, KTD1, KTD4, KTD6): putting an overlay
 * on a model, reading an overlay back from two models, what counts as an edit,
 * and the one rule lists and sections are ordered by. Text only in this unit.
 */
import { describe, expect, it } from "vitest";
import { v3Defaults } from "@/data/config";
import { letterShown } from "@/data/site/letter";
import { questionsOn, v1, v1Zack } from "@/data/site/v1";
import { fixtureCopy, fixtureRegistry, fixtureSpec, type FixtureCopy } from "@/test-helpers/content-fixture";
import { amountsFrom, fillCopy } from "../amounts";
import { emptyOverlay, isEmptyOverlay, parseOverlay, parseOverlayStrict, type Overlay } from "./format";
import { applyOverlay, baseline, codeModel, diffToOverlay, mergeOrder, normaliseOverlay, releasedOverlay, textAt, v1Copy } from "./model";
import { buildRegistry, siteRegistry, siteSpec } from "./registry";

const amounts = amountsFrom(v3Defaults);
const edits = (text: Record<string, string>): Overlay => ({ ...emptyOverlay, text });
/** The code model changed the way a later code change would change it. */
const withCode = (change: (copy: typeof codeModel) => void) => {
  const copy = structuredClone(codeModel);
  change(copy);
  return copy;
};
const registryOf = (copy: typeof codeModel) => buildRegistry(copy, siteSpec(copy));

const HEADLINE = "home.hero.headline";
const SUB = "home.hero.sub";
const COST = "questions.price-and-billing.items.cost.a";
const ALONE = "home.problem.statements.alone.text";

describe("the layers", () => {
  it("has the code model as the copy file with Peter's letter beside it, as /about prints it", () => {
    const { letter, ...copy } = codeModel;
    expect(copy).toEqual(v1);
    expect(letter.paragraphs).toEqual(letterShown.map((p) => ({ id: p.id, text: p.shown })));
    expect(letter.greeting).toBe("Hey there,");
  });

  it("has the code model as its baseline while the release file is empty", () => {
    expect(isEmptyOverlay(releasedOverlay)).toBe(true);
    expect(baseline).toBe(codeModel);
  });

  it("reads a field's wording from a model by the field's id", () => {
    expect(textAt(codeModel, HEADLINE)).toBe(v1.home.hero.headline);
    expect(textAt(codeModel, ALONE)).toBe(v1.home.problem.statements[2].text);
    expect(textAt(codeModel, COST)).toBe(v1.questions[3].items[0].a);
    expect(textAt(codeModel, "home.hero.kicker")).toBeUndefined();
    expect(textAt(codeModel, "meta.title")).toBeUndefined();
    expect(textAt({}, HEADLINE)).toBeUndefined();
    expect(textAt(null, HEADLINE)).toBeUndefined();
  });
});

describe("applyOverlay", () => {
  it("returns the model itself for the empty overlay", () => {
    expect(applyOverlay(baseline, emptyOverlay)).toBe(baseline);
    expect(applyOverlay(codeModel, edits({}))).toBe(codeModel);
  });

  it("puts each text where its field is, and leaves every other word as it was", () => {
    const out = applyOverlay(codeModel, edits({ [HEADLINE]: "Smarter every Monday.", [COST]: "{monthlyUsd} a month.", "buttons.start": "Start now", "letter.paragraphs.noticed.text": "Rewritten." }));
    expect(out.home.hero.headline).toBe("Smarter every Monday.");
    expect(out.questions[3].items[0]).toEqual({ ...v1.questions[3].items[0], a: "{monthlyUsd} a month." });
    expect(out.buttons.start).toBe("Start now");
    expect(out.letter.paragraphs[1]).toEqual({ id: "noticed", text: "Rewritten." });
    // Everything else, word for word.
    const back = structuredClone(out);
    back.home.hero.headline = v1.home.hero.headline;
    back.questions[3].items[0].a = v1.questions[3].items[0].a;
    back.buttons.start = v1.buttons.start;
    back.letter.paragraphs[1].text = letterShown[1].shown;
    expect(back).toEqual(codeModel);
  });

  it("does not change the model it was given, and shares what it did not touch", () => {
    const before = JSON.stringify(codeModel);
    const out = applyOverlay(codeModel, edits({ [HEADLINE]: "Smarter every Monday." }));
    expect(JSON.stringify(codeModel)).toBe(before);
    expect(out).not.toBe(codeModel);
    expect(out.home.hero).not.toBe(codeModel.home.hero);
    expect(out.home.problem).toBe(codeModel.home.problem);
    expect(out.questions).toBe(codeModel.questions);
  });

  it("finds an item of a list by its id, wherever the item now is in the list", () => {
    const reversed = withCode((copy) => void copy.home.problem.statements.reverse());
    const out = applyOverlay(reversed, edits({ [ALONE]: "Alone, edited." }));
    expect(out.home.problem.statements.map((statement) => statement.id)).toEqual(["alone", "unposted", "told"]);
    expect(out.home.problem.statements[0].text).toBe("Alone, edited.");
    expect(out.home.problem.statements[2].text).toBe(v1.home.problem.statements[0].text);
  });

  it("Covers AE4. keeps an edit when the code's wording changes under it, and shows the new code wording once the edit is removed", () => {
    const stored = edits({ [SUB]: "Peter's own sub-line." });
    const released = withCode((copy) => void (copy.home.hero.sub = "A sub-line a later release brought."));
    expect(applyOverlay(codeModel, stored).home.hero.sub).toBe("Peter's own sub-line.");
    expect(applyOverlay(released, stored).home.hero.sub).toBe("Peter's own sub-line.");
    // Reset is removing the entry.
    expect(applyOverlay(released, edits({})).home.hero.sub).toBe("A sub-line a later release brought.");
    // And the edit is still an edit against the new wording, so it is kept when stored again.
    expect(normaliseOverlay(released, stored).text).toEqual({ [SUB]: "Peter's own sub-line." });
  });

  it("ignores an entry for a field the registry does not have, and applies the rest", () => {
    const out = applyOverlay(
      codeModel,
      edits({
        "home.hero.kicker": "x",
        "meta.title": "x",
        "control.link.href": "/elsewhere",
        "home.problem.statements.2.text": "x",
        "home.problem.statements.not-an-item.text": "x",
        "home.problem.statements": "x",
        home: "x",
        constructor: "x",
        __proto__: "x",
        [HEADLINE]: "Applied.",
      } as Record<string, string>),
    );
    expect(out).toEqual({ ...codeModel, home: { ...codeModel.home, hero: { ...codeModel.home.hero, headline: "Applied." } } });
  });

  it("ignores a value its field cannot print, so the wording below shows through", () => {
    const out = applyOverlay(codeModel, edits({ [HEADLINE]: "", [SUB]: "   ", [COST]: "It costs {nothing}.", cardLine: "Week {week}", "buttons.start": 7, "buttons.signIn": null, "nav.faq": ["FAQ"] } as never));
    expect(out).toBe(codeModel);
  });

  it("never throws, whatever it is handed as an overlay", () => {
    for (const bad of [undefined, null, "text", 7, [], {}, { format: 2, text: { [HEADLINE]: "x" } }, { text: { [HEADLINE]: "x" } }, { format: 1, text: [HEADLINE] }]) {
      expect(applyOverlay(codeModel, bad as never), JSON.stringify(bad)).toBe(codeModel);
    }
  });

  it("ignores an entry for an item the code has since removed, and keeps the others", () => {
    const without = withCode((copy) => void copy.home.problem.statements.pop());
    const stored = edits({ [ALONE]: "Edited before it was removed.", "home.problem.statements.told.text": "Told, edited." });
    // With the registry of the code as it now is, the entry is for no field at all.
    const fresh = applyOverlay(without, stored, registryOf(without));
    expect(fresh.home.problem.statements).toEqual([{ id: "told", text: "Told, edited." }, v1.home.problem.statements[1]]);
    // And a model that lacks the item is left alone even by a registry that still has the field.
    expect(applyOverlay(without, stored).home.problem.statements).toEqual(fresh.home.problem.statements);
  });

  it("shows an item added in code later with its built-in wording, beside the edits stored before it existed", () => {
    const later = withCode((copy) => void copy.home.problem.statements.splice(1, 0, { id: "later", text: "Added in code later." }));
    const out = applyOverlay(later, edits({ [ALONE]: "Alone, edited." }), registryOf(later));
    expect(out.home.problem.statements).toEqual([v1.home.problem.statements[0], { id: "later", text: "Added in code later." }, v1.home.problem.statements[1], { id: "alone", text: "Alone, edited." }]);
    // The new item is editable under its own id from then on.
    expect(applyOverlay(later, edits({ "home.problem.statements.later.text": "Later, edited." }), registryOf(later)).home.problem.statements[1].text).toBe("Later, edited.");
  });

  it("replaces text only: where the code now holds something else at a field's path, nothing is written", () => {
    const reshaped = withCode((copy) => void ((copy.home.hero as Record<string, unknown>).headline = { first: "Your AI agents,", second: "smarter every Monday." }));
    expect(applyOverlay(reshaped, edits({ [HEADLINE]: "One line." }))).toBe(reshaped);
    const gone = withCode((copy) => void delete (copy.home as Partial<typeof copy.home>).hero);
    expect(applyOverlay(gone, edits({ [HEADLINE]: "One line.", [SUB]: "x" }))).toBe(gone);
  });

  it("carries a line break in a field that keeps its lines, and an address in a link's", () => {
    const stored = edits({ "note.body": "One.\n\nTwo.", "link.href": "/about", "link.label": "About" });
    expect(applyOverlay(fixtureCopy, stored, fixtureRegistry)).toEqual({ ...fixtureCopy, note: { body: "One.\n\nTwo." }, link: { label: "About", href: "/about" } });
    // An address a link may not point at is never written into the model.
    const hostile = applyOverlay(fixtureCopy, edits({ "link.href": "javascript:alert(1)", "link.label": "About" }), fixtureRegistry);
    expect(hostile.link).toEqual({ label: "About", href: "/faq" });
  });

  it("does not yet apply sections or lists: an overlay that holds them changes text only", () => {
    const stored: Overlay = { ...edits({ [HEADLINE]: "Applied." }), sections: { home: { order: ["questions", "price"], off: ["compounds"] } }, lists: { "home.problem.statements": { order: ["alone", "told"], removed: ["unposted"], added: [] } } };
    const out = applyOverlay(codeModel, stored);
    expect(out.home.hero.headline).toBe("Applied.");
    expect(out.home.problem).toBe(codeModel.home.problem);
  });
});

describe("diffToOverlay", () => {
  it("is empty for a model and itself", () => {
    expect(diffToOverlay(codeModel, codeModel)).toEqual(emptyOverlay);
    expect(diffToOverlay(baseline, applyOverlay(baseline, emptyOverlay))).toEqual(emptyOverlay);
  });

  it("gives back the overlay that was applied, without the entries that say what the base already says", () => {
    const cases: Record<string, string>[] = [
      {},
      { [HEADLINE]: "Smarter every Monday." },
      { [HEADLINE]: "Smarter every Monday.", [COST]: "{monthlyUsd} a month.", [ALONE]: "Alone, edited.", "letter.signOff": "Yours,", "bricks.caption.week": "In week {week}" },
      // Equal to the base: not an edit.
      { [HEADLINE]: v1.home.hero.headline, [SUB]: "A new sub-line." },
      { [HEADLINE]: v1.home.hero.headline, "buttons.start": v1.buttons.start },
      // Unusable: never applied, so never read back.
      { [HEADLINE]: "", [SUB]: "It costs {nothing}.", "home.hero.kicker": "x", "nav.faq": "Questions" },
    ];
    for (const text of cases) {
      const stored = edits(text);
      expect(diffToOverlay(codeModel, applyOverlay(codeModel, stored)), JSON.stringify(text)).toEqual(normaliseOverlay(codeModel, stored));
    }
    expect(diffToOverlay(codeModel, applyOverlay(codeModel, edits(cases[3]))).text).toEqual({ [SUB]: "A new sub-line." });
    expect(diffToOverlay(codeModel, applyOverlay(codeModel, edits(cases[5]))).text).toEqual({ "nav.faq": "Questions" });
  });

  it("applied to the base again, gives the model's wording", () => {
    const model = applyOverlay(codeModel, edits({ [HEADLINE]: "Smarter every Monday.", [ALONE]: "Alone, edited.", "footer.place": "Roger, Hamilton" }));
    expect(applyOverlay(codeModel, diffToOverlay(codeModel, model))).toEqual(model);
  });

  it("writes two layers as one overlay on the code model, the upper one winning", () => {
    const released = edits({ [HEADLINE]: "Released headline.", [SUB]: "Released sub-line." });
    const published = edits({ [SUB]: "The site's own sub-line.", [COST]: "{monthlyUsd} a month." });
    const base = applyOverlay(codeModel, released);
    const one = diffToOverlay(codeModel, applyOverlay(base, normaliseOverlay(base, published)));
    expect(one).toEqual(edits({ [HEADLINE]: "Released headline.", [SUB]: "The site's own sub-line.", [COST]: "{monthlyUsd} a month." }));
    expect(v1Copy(amounts, one).copy.home.hero).toMatchObject({ headline: "Released headline.", sub: "The site's own sub-line." });
    // A site edit that puts the code's own wording back over a released one is an edit against the baseline, and none against the code.
    const backToCode = applyOverlay(base, edits({ [HEADLINE]: v1.home.hero.headline }));
    expect(diffToOverlay(base, backToCode).text).toEqual({ [HEADLINE]: v1.home.hero.headline });
    expect(diffToOverlay(codeModel, backToCode).text).toEqual({ [SUB]: "Released sub-line." });
  });

  it("reads only registered fields: a difference in a word Pages does not edit is no entry", () => {
    const other = withCode((copy) => {
      copy.meta.title = "Another title";
      copy.control.link.href = "/elsewhere";
      copy.zackWarning = "Another warning.";
    });
    expect(diffToOverlay(codeModel, other)).toEqual(emptyOverlay);
  });

  it("skips an item one of the two models does not have", () => {
    const without = withCode((copy) => void copy.home.problem.statements.pop());
    expect(diffToOverlay(codeModel, without)).toEqual(emptyOverlay);
    // An item only the model has is all new wording.
    expect(diffToOverlay(without, codeModel).text).toEqual({ [ALONE]: v1.home.problem.statements[2].text });
  });
});

describe("normaliseOverlay (KTD6)", () => {
  it("drops an entry equal to the baseline, and keeps one that differs by a single character", () => {
    const same = v1.home.hero.headline;
    expect(normaliseOverlay(codeModel, edits({ [HEADLINE]: same }))).toEqual(emptyOverlay);
    expect(normaliseOverlay(codeModel, edits({ [HEADLINE]: `${same} ` })).text).toEqual({ [HEADLINE]: `${same} ` });
    expect(normaliseOverlay(codeModel, edits({ [HEADLINE]: same.slice(0, -1) })).text).toEqual({ [HEADLINE]: same.slice(0, -1) });
    expect(normaliseOverlay(codeModel, edits({ [HEADLINE]: same.toLowerCase() })).text).toEqual({ [HEADLINE]: same.toLowerCase() });
    expect(normaliseOverlay(codeModel, edits({ [ALONE]: v1.home.problem.statements[2].text, [COST]: "Changed." })).text).toEqual({ [COST]: "Changed." });
  });

  it("Covers AE5 (the model's part). stops counting a site's edit once a release has made it the built-in wording", () => {
    const stored = edits({ [HEADLINE]: "Edited on preview.", [SUB]: "Still the site's own." });
    expect(normaliseOverlay(codeModel, stored).text).toEqual(stored.text);
    // The snapshot wrote the headline into the release file: against the new baseline only the sub-line is an edit.
    const afterRelease = applyOverlay(codeModel, edits({ [HEADLINE]: "Edited on preview." }));
    expect(normaliseOverlay(afterRelease, stored).text).toEqual({ [SUB]: "Still the site's own." });
    expect(applyOverlay(afterRelease, normaliseOverlay(afterRelease, stored)).home.hero).toMatchObject({ headline: "Edited on preview.", sub: "Still the site's own." });
  });

  it("reads leniently first: what a page could not print is not stored again", () => {
    expect(normaliseOverlay(codeModel, { format: 1, text: { [HEADLINE]: "Kept.", [SUB]: "", "home.hero.kicker": "x", [COST]: "{nothing}" }, extra: true })).toEqual(edits({ [HEADLINE]: "Kept." }));
    for (const bad of [undefined, null, "text", [], { format: 2, text: { [HEADLINE]: "x" } }]) expect(normaliseOverlay(codeModel, bad), JSON.stringify(bad)).toEqual(emptyOverlay);
  });

  it("gives a new overlay each time, and is the same after a second pass", () => {
    const once = normaliseOverlay(codeModel, edits({ [HEADLINE]: "Kept.", [SUB]: v1.home.hero.sub }));
    expect(normaliseOverlay(codeModel, once)).toEqual(once);
    expect(normaliseOverlay(codeModel, emptyOverlay)).not.toBe(emptyOverlay);
    expect(Object.isFrozen(normaliseOverlay(codeModel, emptyOverlay).text)).toBe(false);
  });

  it("carries section and list entries as read, until the units that apply them compare them too", () => {
    const stored: Overlay = { ...edits({ [HEADLINE]: v1.home.hero.headline }), sections: { home: { order: ["questions", "price"], off: [] } }, lists: { "control.points": { order: [], removed: ["off"], added: [] } } };
    expect(normaliseOverlay(codeModel, stored)).toEqual({ ...stored, text: {} });
  });

  it("works on any copy and its registry", () => {
    const changed: FixtureCopy = { ...fixtureCopy, title: "A new title" };
    expect(normaliseOverlay(changed, edits({ title: "A new title", "steps.two.text": "Second" }), fixtureRegistry).text).toEqual({ "steps.two.text": "Second" });
    expect(buildRegistry(changed, fixtureSpec).fields.size).toBe(fixtureRegistry.fields.size);
  });
});

describe("mergeOrder (KTD4)", () => {
  const base = ["a", "b", "c", "d"];

  it("gives the base's order when nothing is stored", () => {
    expect(mergeOrder(base, [])).toEqual(base);
    expect(mergeOrder([], [])).toEqual([]);
    expect(mergeOrder(base, [])).not.toBe(base);
  });

  it("keeps the stored order for the ids it names", () => {
    expect(mergeOrder(base, ["d", "c", "b", "a"])).toEqual(["d", "c", "b", "a"]);
    expect(mergeOrder(base, ["c", "a", "d", "b"])).toEqual(["c", "a", "d", "b"]);
    expect(mergeOrder(base, base)).toEqual(base);
  });

  it("drops an id the base no longer has, and an id written twice", () => {
    expect(mergeOrder(base, ["d", "gone", "c", "b", "also-gone", "a"])).toEqual(["d", "c", "b", "a"]);
    expect(mergeOrder(base, ["d", "c", "d", "b", "a", "c"])).toEqual(["d", "c", "b", "a"]);
    expect(mergeOrder([], ["a", "b"])).toEqual([]);
    expect(mergeOrder(["a"], ["gone"])).toEqual(["a"]);
  });

  it("places a base item the stored order does not name directly after its predecessor in the base", () => {
    // "c" was added in code between "b" and "d", after the order was stored.
    expect(mergeOrder(base, ["d", "b", "a"])).toEqual(["d", "b", "c", "a"]);
    // Its predecessor was moved to the end: it follows it there.
    expect(mergeOrder(base, ["a", "d", "b"])).toEqual(["a", "d", "b", "c"]);
    // Added at the end of the base.
    expect(mergeOrder(base, ["c", "b", "a"])).toEqual(["c", "d", "b", "a"]);
  });

  it("places a new first item first", () => {
    expect(mergeOrder(base, ["d", "c", "b"])).toEqual(["a", "d", "c", "b"]);
    expect(mergeOrder(["new", ...base], ["d", "c", "b", "a"])).toEqual(["new", "d", "c", "b", "a"]);
  });

  it("keeps several new neighbours together, in the base's order, after the item they followed", () => {
    expect(mergeOrder(["a", "n1", "n2", "b", "c"], ["c", "b", "a"])).toEqual(["c", "b", "a", "n1", "n2"]);
    expect(mergeOrder(["n1", "n2", "a", "b"], ["b", "a"])).toEqual(["n1", "n2", "b", "a"]);
    expect(mergeOrder(["a", "n1", "b", "n2"], ["b", "a"])).toEqual(["b", "n2", "a", "n1"]);
  });

  it("handles a removal and an addition in code at once", () => {
    // Stored when the list was a, b, c. Since then the code dropped "b" and added "e" after "a".
    expect(mergeOrder(["a", "e", "c"], ["c", "b", "a"])).toEqual(["c", "a", "e"]);
  });

  it("names every base id exactly once, whatever is stored", () => {
    for (const order of [[], ["z"], ["d", "a"], ["b", "b", "b"], ["c", "x", "a", "y", "d", "b", "a"], [...base].reverse()]) {
      expect([...mergeOrder(base, order)].sort(), JSON.stringify(order)).toEqual(base);
    }
  });

  it("does not change what it is given", () => {
    const order = ["d", "gone", "a"];
    mergeOrder(base, order);
    expect(base).toEqual(["a", "b", "c", "d"]);
    expect(order).toEqual(["d", "gone", "a"]);
  });
});

describe("v1Copy, the copy a page prints", () => {
  it("is the code copy with its amounts filled in when no overlay is given", () => {
    const { copy, letter, zack } = v1Copy(amounts);
    expect(copy).toEqual(fillCopy(v1, amounts));
    expect(v1Copy(amounts, emptyOverlay).copy).toEqual(copy);
    expect(zack).toEqual(fillCopy(v1Zack, amounts));
    expect(letter).toEqual(codeModel.letter);
    // Peter's letter is handed over beside the copy, not inside it.
    expect(copy).not.toHaveProperty("letter");
    expect(copy.buttons.start).toBe("Get two free Cora Curations");
  });

  it("fills the amounts an edit names, like any other line, and follows the settings", () => {
    const stored = edits({ [COST]: "{monthlyUsd} a month ({monthlyCad} in Canada). Your first {freeLists} Cora Curations are free.", "buttons.start": "Try {freeLists} Cora Curations" });
    expect(v1Copy(amounts, stored).copy.questions[3].items[0].a).toBe("US$200 a month (CA$280 in Canada). Your first two Cora Curations are free.");
    expect(v1Copy(amounts, stored).copy.buttons.start).toBe("Try two Cora Curations");
    const dearer = amountsFrom({ ...v3Defaults, priceUsd: 230, priceCad: 310, freeRuns: 3 });
    expect(v1Copy(dearer, stored).copy.questions[3].items[0].a).toBe("US$230 a month (CA$310 in Canada). Your first three Cora Curations are free.");
  });

  it("prints a question edit on both pages that show the question: /faq's group and the homepage's subset", () => {
    const { copy } = v1Copy(amounts, edits({ [COST]: "It is {monthlyUsd} a month.", "questions.getting-started.items.each-week.q": "What is my part each week?" }));
    expect(copy.questions[3].items[0]).toMatchObject({ id: "cost", q: "What does it cost?", a: "It is US$200 a month." });
    const home = questionsOn(copy, "home");
    expect(home).toHaveLength(7);
    expect(home.find((item) => item.q === "What does it cost?")?.a).toBe("It is US$200 a month.");
    expect(home.map((item) => item.q)).toContain("What is my part each week?");
  });

  it("never throws for an edit it cannot fill: the entry is dropped and the built-in line is printed", () => {
    expect(() => v1Copy(amounts, edits({ [COST]: "It costs {nothing}.", "buttons.start": "{nope}" }))).not.toThrow();
    expect(v1Copy(amounts, edits({ [COST]: "It costs {nothing}.", "buttons.start": "{nope}" })).copy).toEqual(v1Copy(amounts).copy);
  });

  it("leaves a caption's two names for the stack to fill, in an edit as in the code copy", () => {
    expect(v1Copy(amounts, edits({ "bricks.caption.week": "In week {week}" })).copy.bricks.caption.week).toBe("In week {week}");
  });

  it("applies an edit to the letter, and none to the free Zack run's copy", () => {
    const out = v1Copy(amounts, edits({ "letter.greeting": "Hello," }));
    expect(out.letter.greeting).toBe("Hello,");
    expect(out.zack).toEqual(v1Copy(amounts).zack);
    expect(siteRegistry.fields.has("zackWarning")).toBe(false);
  });
});

/**
 * The laws the three layers rest on (plan KTD1, KTD4, KTD6), held on many overlays made by a seeded generator, so a
 * failure can be run again. The units that add sections and lists to applyOverlay and diffToOverlay extend the
 * generator, and these laws must still hold.
 */
describe("the laws of the layers, on generated overlays", () => {
  /** mulberry32: the same numbers on every run. */
  const generator = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const fieldIds = [...siteRegistry.fields.keys()];
  const HIDDEN = String.fromCodePoint(0x200b);

  /** An overlay as a database might hold it: mostly usable edits, among them entries equal to the base, entries no field can print, and entries for no field. */
  const generated = (next: () => number, base: unknown): Overlay => {
    const pick = <T,>(from: readonly T[]): T => from[Math.floor(next() * from.length)];
    const text: Record<string, unknown> = {};
    const count = Math.floor(next() * 14);
    for (let i = 0; i < count; i++) {
      const id = next() < 0.1 ? pick(["home.hero.kicker", "meta.title", "constructor", "home", "home.problem.statements.0.text", "questions.price-and-billing.items.x-added.a"]) : pick(fieldIds);
      const same = textAt(base, id) ?? "x";
      text[id] = pick<unknown>([`Edit ${i}`, `Edit ${i} at {monthlyUsd}`, same, same, `${same} `, same.toLowerCase(), "", "   ", HIDDEN, "{nope}", "Week {week}", "Two\nlines", "<b>bold</b>", 7, null, ["x"]]);
    }
    return { ...emptyOverlay, text } as Overlay;
  };
  const RUNS = 400;
  const each = (law: (next: () => number, run: number) => void) => {
    for (let run = 0; run < RUNS; run++) law(generator(run + 1), run);
  };

  it("apply(base, diff(base, x)) is x, and diff(base, apply(base, o)) is o without what the base already says", () => {
    const before = JSON.stringify(codeModel);
    each((next, run) => {
      const stored = generated(next, codeModel);
      const x = applyOverlay(codeModel, stored);
      expect(applyOverlay(codeModel, diffToOverlay(codeModel, x)), `run ${run}`).toEqual(x);
      expect(diffToOverlay(codeModel, x), `run ${run}`).toEqual(normaliseOverlay(codeModel, stored));
    });
    expect(JSON.stringify(codeModel)).toBe(before);
  });

  it("normalising changes nothing a page shows, and nothing at all the second time", () => {
    let kept = 0;
    let dropped = 0;
    each((next, run) => {
      const stored = generated(next, codeModel);
      const once = normaliseOverlay(codeModel, stored);
      expect(normaliseOverlay(codeModel, once), `run ${run}`).toEqual(once);
      expect(applyOverlay(codeModel, once), `run ${run}`).toEqual(applyOverlay(codeModel, stored));
      // No entry is left that says what the base says, and every entry left is one the strict reading accepts.
      for (const [id, text] of Object.entries(once.text)) expect(text, `run ${run} ${id}`).not.toBe(textAt(codeModel, id));
      expect(parseOverlayStrict(once), `run ${run}`).toEqual({ ok: true, overlay: once });
      expect(parseOverlay(once), `run ${run}`).toEqual(once);
      kept += Object.keys(once.text).length;
      dropped += Object.keys(stored.text).length - Object.keys(once.text).length;
    });
    // The generator does make both kinds: edits that stay, and entries that are dropped.
    expect(kept).toBeGreaterThan(RUNS);
    expect(dropped).toBeGreaterThan(RUNS);
  });

  it("three layers are one overlay on the code model: the release file, then the site's edits, in that order", () => {
    each((next, run) => {
      const released = generated(next, codeModel);
      const base = applyOverlay(codeModel, released);
      const published = generated(next, base);
      const shown = applyOverlay(base, published);
      // Normalising the site's edits against the baseline first (KTD6) shows the same page.
      expect(applyOverlay(base, normaliseOverlay(base, published)), `run ${run}`).toEqual(shown);
      // The one overlay a page's view is handed.
      const one = diffToOverlay(codeModel, shown);
      expect(applyOverlay(codeModel, one), `run ${run}`).toEqual(shown);
      // The site's edit wins where both layers have the field; the release's shows where the site has none.
      const site = normaliseOverlay(base, published).text;
      const release = normaliseOverlay(codeModel, released).text;
      expect(fieldIds.filter((id) => textAt(shown, id) !== (site[id] ?? release[id] ?? textAt(codeModel, id))), `run ${run}`).toEqual([]);
      // And it can be filled and printed: nothing a layer holds can make a page throw. (Filling is the slow part, so one run in twenty.)
      if (run % 20 === 0) expect(() => v1Copy(amounts, one), `run ${run}`).not.toThrow();
    });
  });

  it("a third layer on top composes the same way whichever two are joined first", () => {
    each((next, run) => {
      const [a, b, c] = [generated(next, codeModel), generated(next, codeModel), generated(next, codeModel)];
      const stacked = applyOverlay(applyOverlay(applyOverlay(codeModel, a), b), c);
      const lowerTwo = diffToOverlay(codeModel, applyOverlay(applyOverlay(codeModel, a), b));
      expect(applyOverlay(applyOverlay(codeModel, lowerTwo), c), `run ${run}`).toEqual(stacked);
      const afterA = applyOverlay(codeModel, a);
      const upperTwo = diffToOverlay(afterA, applyOverlay(applyOverlay(afterA, b), c));
      expect(applyOverlay(afterA, upperTwo), `run ${run}`).toEqual(stacked);
    });
  });

  it("mergeOrder names every base id once, keeps the stored order, and puts each unnamed id directly after its predecessor in the base", () => {
    each((next, run) => {
      const pool = ["a", "b", "c", "d", "e", "f", "g", "h", "constructor", "toString"];
      const shuffled = (ids: string[]) => ids.map((id) => [next(), id] as const).sort((x, y) => x[0] - y[0]).map(([, id]) => id);
      const base = shuffled(pool).slice(0, Math.floor(next() * (pool.length + 1)));
      // The stored order: some base ids, some the base no longer has, some written twice.
      const order = shuffled([...pool, ...pool, "gone", "x-added"]).slice(0, Math.floor(next() * 16));
      const merged = mergeOrder(base, order);
      const label = `run ${run}: base ${base.join(",")} order ${order.join(",")}`;
      expect([...merged].sort(), label).toEqual([...base].sort());
      const named = [...new Set(order)].filter((id) => base.includes(id));
      expect(merged.filter((id) => named.includes(id)), label).toEqual(named);
      base.forEach((id, i) => {
        if (named.includes(id)) return;
        expect(merged.indexOf(id), `${label}: ${id}`).toBe(i === 0 ? 0 : merged.indexOf(base[i - 1]) + 1);
      });
      // What it gives is a whole order: merging it again changes nothing.
      expect(mergeOrder(base, merged), label).toEqual(merged);
    });
  });
});
