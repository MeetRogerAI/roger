/**
 * The lists an admin may add to, remove from and reorder (plan U7, R8, KTD2,
 * KTD3, KTD4): the merge of a list's items across layers, the fields of an
 * item added in the admin, what each press stores, and what the review says.
 *
 * model.test.ts sweeps whole generated overlays, lists among them. This file
 * says what each rule gives for the cases a reader would think of, and holds
 * the list rules on the ones nobody thought of:
 *
 *   round trip     the entry that turns one list into another, applied, gives that other list
 *   one writing    an entry is written one way: normalising twice changes nothing, and an entry that changes
 *                  nothing is never written
 *   a release      whatever a release does to the layer below (reorder, add, remove), a site's entry on it shows
 *                  every item the list now has exactly once, and none it has not
 *   presses        any run of presses (up, down, remove, back, add) in the store ends where the same presses
 *                  end on paper
 */
import { beforeEach, describe, expect, it } from "vitest";
import { v3Defaults } from "@/data/config";
import type { Query } from "@/lib/db-query";
import { fixtureCopy, fixtureSpec } from "@/test-helpers/content-fixture";
import { testDb } from "@/test-helpers/pglite-db";
import { amountsFrom } from "../amounts";
import { draftChanges, draftCount, listChanges, pageStatus, reviewKey, saveRefusal, tidyFor, wordingWarnings } from "./check";
import { emptyOverlay, newOverlay, parseOverlay, parseOverlayStrict, type ListEdit, type Overlay } from "./format";
import { fieldLabel, fieldLabelWith, captionField, listWords, placesIn } from "./labels";
import { applyListEdit, applyOverlay, baseline, codeModel, composeOverlays, diffListEdit, diffToOverlay, itemsOn, listItems, normaliseOverlay, readField, shownOverlay, textAt, v1Copy } from "./model";
import { buildRegistry, fieldsOfItem, isAddedId, resolveField, siteRegistry, siteSpec, usableValue } from "./registry";
import { CONTENT_KEY, publish, readStored, saveDraft, saveList, undoPublish } from "./store";

const amounts = amountsFrom(v3Defaults);
const STATEMENTS = "home.problem.statements";
const STEPS = "home.hero.graphic.steps";
const POINTS = "control.points";
const STARTED = "questions.getting-started.items";
const BILLING = "questions.price-and-billing.items";
const HEADLINE = "home.hero.headline";
const overlay = (parts: Partial<Overlay>): Overlay => ({ ...newOverlay(), ...parts });
const entry = (parts: Partial<ListEdit>): ListEdit => ({ order: [], removed: [], added: [], ...parts });
const fields = (map: Record<string, string>) => new Map(Object.entries(map));

/** A repeatable source of numbers between 0 and 1. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
const shuffled = (ids: readonly string[], next: () => number) => ids.map((id) => [next(), id] as const).sort((a, b) => a[0] - b[0]).map(([, id]) => id);
const some = (ids: readonly string[], next: () => number, share = 0.3) => ids.filter(() => next() < share);
const sorted = (ids: readonly string[]) => [...ids].sort();
/** Built-in ids, among them names a plain object would trip on, and ids of added items. */
const POOL = ["a", "b", "c", "d", "constructor", "toString", "__proto__"];
const ADDED = ["x-1", "x-2", "x-3"];

describe("the entry between two lists of items (applyListEdit, diffListEdit)", () => {
  it("round-trips: for any layer below and any list made of its items and added ones, the entry applied to the layer gives the list", () => {
    const next = seeded(1);
    for (let run = 0; run < 3000; run++) {
      const below = shuffled([...some(POOL, next, 0.7), ...some(ADDED, next, 0.3)], next);
      const items = shuffled([...some(below, next, 0.7), ...some(ADDED, next, 0.4).filter((id) => !below.includes(id))], next);
      const edit = diffListEdit(below, items);
      const label = `run ${run}: ${JSON.stringify({ below, items, edit })}`;
      if (edit === null) expect(items, label).toEqual(below);
      else {
        expect(edit.order.length + edit.removed.length + edit.added.length, label).toBeGreaterThan(0);
        expect(applyListEdit(below, edit), label).toEqual(items);
        // Written one way: the entry of the result is the entry.
        expect(diffListEdit(below, applyListEdit(below, edit)), label).toEqual(edit);
        // As little as says it: no order unless the order differs from "what is left, then what was added".
        const natural = [...below.filter((id) => items.includes(id)), ...items.filter((id) => !below.includes(id))];
        expect(edit.order, label).toEqual(natural.every((id, i) => id === items[i]) ? [] : items);
        expect(sorted(edit.removed), label).toEqual(sorted(below.filter((id) => !items.includes(id))));
      }
    }
  });

  it("gives a list of the layer's items and added ones, each once, for any entry at all: unknown ids, ids twice, an id both removed and ordered or added", () => {
    const next = seeded(2);
    for (let run = 0; run < 3000; run++) {
      const below = shuffled([...some(POOL, next, 0.7), ...some(ADDED, next, 0.3)], next);
      const wild = () => [...some([...POOL, ...ADDED], next, 0.4), ...some([...POOL, ...ADDED], next, 0.2), ...some(["gone", "x-", "x-9"], next, 0.3)].sort(() => next() - 0.5);
      const edit = { order: next() < 0.3 ? [] : wild(), removed: next() < 0.4 ? [] : wild(), added: next() < 0.4 ? [] : wild() };
      const out = applyListEdit(below, edit);
      const label = `run ${run}: ${JSON.stringify({ below, edit, out })}`;
      expect(new Set(out).size, label).toBe(out.length);
      for (const id of out) expect(below.includes(id) || (isAddedId(id) && edit.added.includes(id)), `${label} ${id}`).toBe(true);
      // What the entry removes is gone, whatever else it says about it.
      for (const id of edit.removed) expect(out, `${label} ${id}`).not.toContain(id);
      // An item of the layer below that the entry does not remove is there.
      for (const id of below) if (!edit.removed.includes(id)) expect(out, `${label} ${id}`).toContain(id);
      // The same answer every time, and what it amounts to, written the one way, gives it again.
      expect(applyListEdit(below, edit), label).toEqual(out);
      expect(applyListEdit(below, diffListEdit(below, out) ?? undefined), label).toEqual(out);
    }
  });

  it("keeps a list to what its page can draw: no more than the most, no fewer than the fewest, and a fixed list is only reordered", () => {
    expect(applyListEdit(["a", "b", "c"], entry({ added: ["x-1", "x-2", "x-3"] }), { min: 0, max: 4 })).toEqual(["a", "b", "c", "x-1"]);
    expect(applyListEdit(["a", "b", "c"], entry({ removed: ["a", "b", "c"] }), { min: 2, max: 5 })).toEqual(["a", "b"]);
    // Removing makes room for what is added.
    expect(applyListEdit(["a", "b", "c"], entry({ removed: ["a"], added: ["x-1", "x-2"], order: ["x-2", "b"] }), { min: 0, max: 4 })).toEqual(["x-2", "b", "c", "x-1"]);
    expect(applyListEdit(["a", "b", "c"], entry({ removed: ["a"], added: ["x-1"], order: ["c", "a", "b"] }), { min: 3, max: 3 })).toEqual(["c", "a", "b"]);
    const next = seeded(3);
    for (let run = 0; run < 2000; run++) {
      const below = shuffled(some(POOL, next, 0.7), next);
      const bounds = { min: Math.min(below.length, Math.floor(next() * 3)), max: below.length + Math.floor(next() * 3) };
      const out = applyListEdit(below, { order: shuffled(some([...POOL, ...ADDED], next, 0.5), next), removed: some(POOL, next, 0.5), added: some(ADDED, next, 0.7) }, bounds);
      expect(out.length, `run ${run}`).toBeGreaterThanOrEqual(bounds.min);
      expect(out.length, `run ${run}`).toBeLessThanOrEqual(bounds.max);
    }
  });

  it("places an added item last, a built-in item the entry does not name after the one it follows, and ignores an id the list no longer has", () => {
    expect(applyListEdit(["a", "b", "c"], entry({ added: ["x-1"] }))).toEqual(["a", "b", "c", "x-1"]);
    // The site moved "c" first and added one. A release then adds "n" after "a" and takes "b" out of the code.
    const site = diffListEdit(["a", "b", "c"], ["c", "x-1", "a", "b"])!;
    expect(site).toEqual({ order: ["c", "x-1", "a", "b"], removed: [], added: ["x-1"] });
    expect(applyListEdit(["a", "n", "c"], site)).toEqual(["c", "x-1", "a", "n"]);
    // A site that only removed one follows the release's order, and its removal still holds.
    expect(applyListEdit(["c", "n", "a", "b"], entry({ removed: ["a"] }))).toEqual(["c", "n", "b"]);
    // An item a lower layer removed is gone for the layers above: naming it brings nothing back.
    expect(applyListEdit(["a", "c"], entry({ order: ["b", "c", "a"], added: ["b"] }))).toEqual(["c", "a"]);
  });
});

describe("a release that changes the list under a site's entry", () => {
  /** A release: the items reordered, some gone, a built-in one new, one added in preview's admin. */
  const release = (below: string[], next: () => number): string[] => {
    let items = below.filter(() => next() > 0.2);
    if (next() < 0.5) items = shuffled(items, next);
    for (const id of ["new-1", "new-2", "x-released"]) if (next() < 0.4) items.splice(Math.floor(next() * (items.length + 1)), 0, id);
    return items;
  };

  it("shows every item the list now has exactly once unless the site removed it, none the list no longer has, and the site's added ones", () => {
    const next = seeded(4);
    for (let run = 0; run < 3000; run++) {
      const below = shuffled(some(POOL, next, 0.8), next);
      const mine = shuffled([...some(below, next, 0.7), ...some(ADDED, next, 0.4)], next);
      const edit = diffListEdit(below, mine);
      const later = release(below, next);
      const out = applyListEdit(later, edit ?? undefined);
      const label = `run ${run}: ${JSON.stringify({ below, mine, edit, later, out })}`;
      expect(new Set(out).size, label).toBe(out.length);
      const removed = edit?.removed ?? [];
      const added = edit?.added ?? [];
      expect(sorted(out), label).toEqual(sorted([...later.filter((id) => !removed.includes(id)), ...added.filter((id) => !later.includes(id))]));
      // The same result every time, and what it amounts to now is again an entry written the one way.
      expect(applyListEdit(later, edit ?? undefined), label).toEqual(out);
      expect(applyListEdit(later, diffListEdit(later, out) ?? undefined), label).toEqual(out);
      // The site's own order holds among the items it named.
      const named = (edit?.order ?? []).filter((id) => out.includes(id));
      expect(out.filter((id) => named.includes(id)), label).toEqual(named);
    }
  });

  it("is followed in its order by a site that only removed or added: the entry names no order, so the release's is the page's", () => {
    const next = seeded(5);
    let followed = 0;
    for (let run = 0; run < 2000; run++) {
      const below = shuffled(some(POOL, next, 0.8), next);
      const edit = diffListEdit(below, [...below.filter(() => next() > 0.3), ...some(ADDED, next, 0.4)]);
      if (!edit) continue;
      expect(edit.order, `run ${run}`).toEqual([]);
      const later = release(below, next);
      const out = applyListEdit(later, edit);
      expect(out.filter((id) => later.includes(id)), `run ${run}`).toEqual(later.filter((id) => !edit.removed.includes(id)));
      followed++;
    }
    expect(followed).toBeGreaterThan(1200);
  });
});

describe("the fields of an item added in the admin (resolveField)", () => {
  const Q = `${STARTED}.x-4f9a.q`;
  const A = `${STARTED}.x-4f9a.a`;

  it("have the limit, the kind, the names in braces and the claims zones a built-in item's field has, from the list's own item fields", () => {
    const builtIn = siteRegistry.fields.get(`${STARTED}.each-week.a`)!;
    const made = resolveField(A)!;
    expect(made).toMatchObject({ id: A, path: ["questions", "getting-started", "items", "x-4f9a", "a"], page: "faq", section: "getting-started", name: "Answer", kind: builtIn.kind, max: builtIn.max, placeholders: builtIn.placeholders, claims: builtIn.claims });
    expect(made.item).toEqual({ array: STARTED, id: "x-4f9a", noun: "Question" });
    // A list whose section has a zone of its own hands it down: the fixture's steps are checked as a sample.
    const registry = buildRegistry(fixtureCopy, fixtureSpec);
    expect(resolveField("steps.x-1.text", registry)).toMatchObject({ max: 50, claims: { path: "/page", zones: [] } });
    const zoned = buildRegistry(fixtureCopy, { ...fixtureSpec, pages: [{ ...fixtureSpec.pages[0], sections: fixtureSpec.pages[0].sections.map((section) => (section.id === "steps" ? { ...section, zones: ["sample" as const] } : section)) }] });
    expect(resolveField("steps.x-1.text", zoned)!.claims).toEqual({ path: "/page", zones: ["sample"] });
    // A built-in id resolves to the registry's own field.
    expect(resolveField(HEADLINE)).toBe(siteRegistry.fields.get(HEADLINE));
  });

  it("bound a hero step's label to what its button holds in a row of five on a phone, for a built-in step and an added one", () => {
    expect(siteRegistry.fields.get(`${STEPS}.use.label`)!.max).toBe(10);
    expect(resolveField(`${STEPS}.x-1.label`)!.max).toBe(10);
    expect(saveRefusal(resolveField(`${STEPS}.x-1.label`)!, "Personalise")).toBe("This is 11 characters long, and the most that fits here is 10. Shorten it by 1.");
    expect(saveRefusal(resolveField(`${STEPS}.x-1.label`)!, "Distribute")).toBeNull();
  });

  it("exist only for a list, a field the list's items have, and an id that starts with “x-”", () => {
    for (const id of [
      `${STARTED}.added.q`,
      `${STARTED}.x-.q`,
      `${STARTED}.x-4f9a.nope`,
      `${STARTED}.x-4f9a`,
      `${STARTED}.x-4f9a.q.more`,
      "howItWorks.zack.points.x-1.title",
      "questions.x-1.title",
      "nothing.x-1.q",
      "x-1.q",
      ".x-1.q",
      "constructor",
      "",
    ]) {
      expect(resolveField(id), id).toBeUndefined();
    }
    expect(fieldsOfItem(siteRegistry.lists.get(STARTED)!, "x-4f9a").map((field) => field.id)).toEqual([Q, A, `${STARTED}.x-4f9a.home`]);
    expect(fieldsOfItem(siteRegistry.lists.get(STARTED)!, "each-week").map((field) => field.id)).toEqual([`${STARTED}.each-week.q`, `${STARTED}.each-week.a`, `${STARTED}.each-week.home`]);
  });

  it("are kept by the lenient reading when the value can be printed, and dropped when it cannot", () => {
    const read = parseOverlay({ format: 1, text: { [Q]: "Is it new?", [A]: "Yes, for {monthlyUsd}.", [`${STARTED}.x-bad.a`]: "{nope}", [`${STARTED}.x-bad.q`]: "", [`${STARTED}.x-4f9a.home`]: "maybe", [`${STARTED}.x-4f9a.nope`]: "x" }, sections: {}, lists: {} });
    expect(read.text).toEqual({ [Q]: "Is it new?", [A]: "Yes, for {monthlyUsd}." });
  });

  it("are applied to the item its list's entry adds: an added question prints with its amount filled, on /faq and not on the homepage", () => {
    const stored = overlay({ text: { [Q]: "Is it new?", [A]: "Yes, for {monthlyUsd}." }, lists: { [STARTED]: entry({ added: ["x-4f9a"] }) } });
    const model = applyOverlay(codeModel, stored);
    expect(model.questions[0].items.at(-1)).toEqual({ id: "x-4f9a", q: "Is it new?", a: "Yes, for {monthlyUsd}.", on: [] });
    expect(textAt(model, A)).toBe("Yes, for {monthlyUsd}.");
    const { copy } = v1Copy(amounts, stored);
    expect(copy.questions[0].items.at(-1)).toMatchObject({ q: "Is it new?", a: "Yes, for US$200." });
    // The code model was not written to.
    expect(codeModel.questions[0].items.some((item) => item.id === "x-4f9a")).toBe(false);
  });

  it("do not show an item that lacks one of its texts, and a text for an item no list has is not kept", () => {
    const half = overlay({ text: { [Q]: "Only a question" }, lists: { [STARTED]: entry({ added: ["x-4f9a"] }) } });
    expect(listItems(applyOverlay(codeModel, half), STARTED)).toEqual(listItems(codeModel, STARTED));
    expect(normaliseOverlay(codeModel, half)).toEqual(emptyOverlay);
    // A text alone, with no entry that adds its item, is read by nothing: normalising drops it.
    const orphan = overlay({ text: { [Q]: "Is it new?", [A]: "Yes." } });
    expect(parseOverlay(orphan).text).toEqual(orphan.text);
    expect(applyOverlay(codeModel, orphan)).toBe(codeModel);
    expect(normaliseOverlay(codeModel, orphan)).toEqual(emptyOverlay);
  });

  it("round-trip through the differ: a new item's every text is written, and a switch only when it is on", () => {
    const stored = overlay({ text: { [Q]: "Is it new?", [A]: "Yes." }, lists: { [STARTED]: entry({ added: ["x-4f9a"] }) } });
    expect(diffToOverlay(codeModel, applyOverlay(codeModel, stored))).toEqual(stored);
    expect(normaliseOverlay(codeModel, { ...stored, text: { ...stored.text, [`${STARTED}.x-4f9a.home`]: "no" } })).toEqual(stored);
    const shownAtHome = { ...stored, text: { ...stored.text, [`${STARTED}.x-4f9a.home`]: "yes" } };
    expect(normaliseOverlay(codeModel, shownAtHome)).toEqual(shownAtHome);
    expect(applyOverlay(codeModel, shownAtHome).questions[0].items.at(-1)).toMatchObject({ on: ["home"] });
  });

  it("are held by the strict reading to an item its list's entry adds, with every text the item must have", () => {
    const good = overlay({ text: { [Q]: "Is it new?", [A]: "Yes." }, lists: { [STARTED]: entry({ added: ["x-4f9a"] }) } });
    expect(parseOverlayStrict(good)).toEqual({ ok: true, overlay: good });
    const problems = (value: Overlay) => {
      const result = parseOverlayStrict(value);
      return result.ok ? [] : result.problems;
    };
    expect(problems(overlay({ text: good.text }))).toEqual([`text.${Q}: no item "x-4f9a" is added to the list "${STARTED}"`, `text.${A}: no item "x-4f9a" is added to the list "${STARTED}"`]);
    expect(problems(overlay({ text: { [Q]: "Is it new?" }, lists: good.lists }))).toEqual([`lists.${STARTED}: the added item "x-4f9a" has no text for "${A}"`]);
    expect(problems(overlay({ text: { ...good.text, [A]: "x".repeat(1501) }, lists: good.lists }))).toEqual([`text.${A}: 1501 characters, and the most is 1500`]);
    expect(problems(overlay({ text: { ...good.text, [A]: "{nope}" }, lists: good.lists }))).toHaveLength(1);
    expect(problems(overlay({ text: { ...good.text, [`${STARTED}.x-4f9a.home`]: "maybe" }, lists: good.lists }))).toHaveLength(1);
  });
});

describe("what a list entry may say", () => {
  const problems = (lists: Overlay["lists"], text: Overlay["text"] = {}) => {
    const result = parseOverlayStrict(overlay({ lists, text }));
    return result.ok ? [] : result.problems;
  };

  it("is held, strictly, to the list's built-in items: an order of unknown items, an id both removed and ordered or added, a removal of nothing", () => {
    expect(problems({ [STATEMENTS]: entry({ order: ["alone", "told", "unposted"] }) })).toEqual([]);
    expect(problems({ [STATEMENTS]: entry({ order: ["alone", "nope"] }) })).toEqual([`lists.${STATEMENTS}: "nope" is given a place in the order and is not an item of this list`]);
    expect(problems({ [STATEMENTS]: entry({ order: ["alone"], removed: ["alone"] }) })).toEqual([`lists.${STATEMENTS}: "alone" is both removed and given a place in the order`]);
    expect(problems({ [STATEMENTS]: entry({ removed: ["nope"] }) })).toEqual([`lists.${STATEMENTS}: "nope" is removed and is not an item of this list`]);
    // An item added in the admin is no item of the code's list: the release file cannot remove one it does not add.
    expect(problems({ [STATEMENTS]: entry({ removed: ["x-1"] }) })).toEqual([`lists.${STATEMENTS}: "x-1" is removed and is not an item of this list`]);
    expect(problems({ [STATEMENTS]: entry({ removed: ["x-1"], added: ["x-1"] }) }, { [`${STATEMENTS}.x-1.text`]: "New." })).toEqual([`lists.${STATEMENTS}: "x-1" is both added and removed`]);
    expect(problems({ [STATEMENTS]: entry({ added: ["x-"] }) })).toEqual([`lists.${STATEMENTS}: the added item "x-" must have an id that starts with "x-"`]);
  });

  it("is held, strictly, to how many items the page can draw", () => {
    const four = ["x-1", "x-2", "x-3", "x-4"];
    const texts = Object.fromEntries(four.map((id) => [`${STATEMENTS}.${id}.text`, "New."]));
    expect(problems({ [STATEMENTS]: entry({ added: four.slice(0, 3) }) }, Object.fromEntries(Object.entries(texts).slice(0, 3)))).toEqual([]);
    expect(problems({ [STATEMENTS]: entry({ added: four }) }, texts)).toEqual([`lists.${STATEMENTS}: 7 items, and the most this list can show is 6`]);
    expect(problems({ [STEPS]: entry({ removed: ["use", "collect", "curate"] }) })).toEqual([`lists.${STEPS}: 1 items, and the fewest this list can show is 2`]);
    expect(problems({ [STEPS]: entry({ removed: ["use", "collect"] }) })).toEqual([]);
  });

  it("is read leniently as what it can mean: an id both added and removed is in neither, and `added` holds only ids that start with “x-”", () => {
    const read = parseOverlay(overlay({ lists: { [STATEMENTS]: { order: ["x-1", "alone"], removed: ["x-1", "told", "told"], added: ["x-1", "x-2", "mine", "x-"] } } }));
    expect(read.lists[STATEMENTS]).toEqual({ order: ["x-1", "alone"], removed: ["told"], added: ["x-2"] });
  });

  it("only reorders a list that always has the same number of items, in both readings and where it is applied", () => {
    const fixed = buildRegistry(fixtureCopy, { ...fixtureSpec, arrays: { steps: { item: "Step", list: "Steps", min: 3, max: 3 } } });
    const stored = { format: 1, text: { "steps.x-1.text": "New" }, sections: {}, lists: { steps: { order: ["three", "one"], removed: ["two"], added: ["x-1"] } } };
    expect(parseOverlay(stored, fixed).lists.steps).toEqual({ order: ["three", "one"], removed: [], added: [] });
    expect(listItems(applyOverlay(fixtureCopy, stored, fixed), "steps", fixed)).toEqual(["three", "one", "two"]);
    const strict = parseOverlayStrict(stored, fixed);
    expect(strict.ok ? [] : strict.problems).toContain("lists.steps: this list always has 3 items, so none can be added or removed");
    expect(listWords(fixed.lists.get("steps")!).limits).toBe("This list always has 3 steps. They can be moved, not added or removed.");
    // And a list's built-in items must be a number its page can draw.
    expect(() => buildRegistry(fixtureCopy, { ...fixtureSpec, arrays: { steps: { item: "Step", list: "Steps", max: 2 } } })).toThrow(/has 3 items and may hold 0 to 2/);
    expect(() => buildRegistry(fixtureCopy, { ...fixtureSpec, arrays: { steps: { item: "Step", list: "Steps", max: 31 } } })).toThrow(/never more than 30/);
  });

  it("never trips on an item called like a part of every object: “constructor”, “toString”, “__proto__” are ids like any other", () => {
    const copy = { ...fixtureCopy, steps: [{ id: "constructor", text: "One" }, { id: "toString", text: "Two" }, { id: "hasOwnProperty", text: "Three" }] };
    const registry = buildRegistry(copy, fixtureSpec);
    const stored = JSON.parse('{"format":1,"text":{"steps.x-1.text":"New","steps.constructor.text":"Edited","steps.__proto__.text":"x"},"sections":{},"lists":{"steps":{"order":["toString","__proto__","x-1","constructor"],"removed":["hasOwnProperty","valueOf"],"added":["x-1","constructor"]}}}') as unknown;
    const model = applyOverlay(copy, stored as Overlay, registry);
    expect(model.steps).toEqual([{ id: "toString", text: "Two" }, { id: "x-1", text: "New" }, { id: "constructor", text: "Edited" }]);
    const once = normaliseOverlay(copy, stored, registry);
    expect(once).toEqual({ format: 1, text: { "steps.x-1.text": "New", "steps.constructor.text": "Edited" }, sections: {}, lists: { steps: { order: ["toString", "x-1", "constructor"], removed: ["hasOwnProperty"], added: ["x-1"] } } });
    expect(normaliseOverlay(copy, once, registry)).toEqual(once);
    expect(Object.getPrototypeOf(once.lists)).toBe(Object.prototype);
  });
});

describe("the three layers, for a list (plan KTD4)", () => {
  const X = (id: string) => `${POINTS}.${id}`;

  it("merges by id: the code's items, less what the release removes and plus what it adds, then the same for the site, each item once", () => {
    const released = overlay({ text: { [`${X("x-rel")}.title`]: "From the release.", [`${X("x-rel")}.body`]: "Its text." }, lists: { [POINTS]: entry({ removed: ["rules"], added: ["x-rel"] }) } });
    const base = applyOverlay(codeModel, released);
    expect(listItems(base, POINTS)).toEqual(["read", "off", "x-rel"]);
    // The site moves the release's item first, edits its title, adds one of its own and removes "off".
    const own = overlay({
      text: { [`${X("x-rel")}.title`]: "Retitled on the site.", [`${X("x-own")}.title`]: "The site’s own.", [`${X("x-own")}.body`]: "Its text." },
      lists: { [POINTS]: entry({ order: ["x-rel", "read", "x-own"], removed: ["off"], added: ["x-own"] }) },
    });
    const one = composeOverlays(released, normaliseOverlay(base, own));
    const model = applyOverlay(codeModel, one);
    expect(model.control.points).toEqual([
      { id: "x-rel", title: "Retitled on the site.", body: "Its text." },
      codeModel.control.points[0],
      { id: "x-own", title: "The site’s own.", body: "Its text." },
    ]);
    // ONE overlay on the code model, with both layers' items and their texts, and nothing for what is not shown.
    expect(one.lists[POINTS]).toEqual({ order: ["x-rel", "read", "x-own"], removed: ["rules", "off"], added: ["x-rel", "x-own"] });
    expect(parseOverlayStrict(one)).toEqual({ ok: true, overlay: one });
    // The site cannot bring back what the release removed: naming it changes nothing.
    expect(listItems(applyOverlay(base, overlay({ lists: { [POINTS]: entry({ order: ["rules", "read"], added: ["rules"] }) } })), POINTS)).toEqual(["read", "off", "x-rel"]);
  });

  it("shows an item added to the code later after the item it follows, on a site whose stored order predates it, and ignores an id the code has since removed", () => {
    const stored = overlay({ lists: { [STATEMENTS]: entry({ order: ["alone", "told", "unposted"] }) } });
    const later = structuredClone(codeModel);
    later.home.problem.statements.splice(1, 0, { id: "later", text: "Added in code later." });
    later.home.problem.statements.pop();
    const registry = buildRegistry(later, siteSpec(later));
    expect(listItems(applyOverlay(later, stored, registry), STATEMENTS, registry)).toEqual(["told", "later", "unposted"]);
    expect(normaliseOverlay(later, stored, registry)).toEqual(emptyOverlay);
  });

  it("keeps, in a draft, the wording of an item the draft itself removes, and drops it from what is shown", () => {
    const TOLD = `${STATEMENTS}.told.text`;
    const draft = overlay({ text: { [TOLD]: "Edited, then removed.", [HEADLINE]: "A headline." }, lists: { [STATEMENTS]: entry({ removed: ["told"] }) } });
    expect(normaliseOverlay(baseline, draft)).toEqual(draft);
    expect(shownOverlay(baseline, draft)).toEqual({ ...draft, text: { [HEADLINE]: "A headline." } });
    expect(composeOverlays(emptyOverlay, draft).text).toEqual({ [HEADLINE]: "A headline." });
    // Put back, the item has its edited wording again.
    expect(textAt(applyOverlay(baseline, { ...draft, lists: {} }), TOLD)).toBe("Edited, then removed.");
    // A removed item's wording equal to the original is no edit, removed or not.
    expect(normaliseOverlay(baseline, { ...draft, text: { [TOLD]: textAt(baseline, TOLD)! } }).text).toEqual({});
  });
});

describe("a list as the Pages screens word it", () => {
  it("numbers an item by its place in the draft, names an added one by its wording, and a removed one by its noun alone", () => {
    const Q = `${STARTED}.x-1.q`;
    const draft = overlay({ text: { [Q]: "Is it new?", [`${STARTED}.x-1.a`]: "Yes." }, lists: { [STARTED]: entry({ order: ["x-1", "each-week", "no-agents-yet"], removed: ["which-agents"], added: ["x-1"] }) } });
    const model = applyOverlay(baseline, draft);
    const places = placesIn(model);
    const wording = (id: string) => textAt(model, id) ?? "";
    expect(fieldLabelWith(resolveField(`${STARTED}.x-1.a`)!, wording, siteRegistry, places)).toEqual({ group: "Question 1", name: "Answer", item: "Question 1 — “Is it new?”", full: "Question 1 — “Is it new?” · Answer" });
    expect(fieldLabel(siteRegistry.fields.get(`${STARTED}.no-agents-yet.q`)!, siteRegistry, places)).toEqual({ group: "Question 3", name: "Question", full: "Question 3: Question" });
    expect(fieldLabel(siteRegistry.fields.get(`${STARTED}.which-agents.q`)!, siteRegistry, places).group).toBe("Question");
    // Without an order, the built-in one, as before.
    expect(fieldLabel(siteRegistry.fields.get(`${STARTED}.no-agents-yet.q`)!).group).toBe("Question 1");
    expect(captionField(resolveField(`${STARTED}.x-1.home`)!)?.id).toBe(Q);
  });

  it("says how many items each list can hold, and why where the page limits it", () => {
    const limits = Object.fromEntries([...siteRegistry.lists.values()].map((list) => [list.id, `${list.min}-${list.max}`]));
    expect(limits).toMatchObject({ [STEPS]: "2-5", [STATEMENTS]: "0-6", [POINTS]: "0-6", "howItWorks.week.days": "0-7", "howItWorks.firstWeeks.steps": "0-12", [STARTED]: "0-20", [BILLING]: "0-20" });
    expect(listWords(siteRegistry.lists.get(STEPS)!)).toEqual({
      title: "The steps beside the headline",
      one: "step",
      many: "steps",
      limits: "It can hold 2 to 5 steps: the picture beside the headline shows one step at a time, with a button for each, and it has room for that many.",
    });
    expect(listWords(siteRegistry.lists.get(STARTED)!)).toMatchObject({ title: "The questions of this group", limits: "It can hold up to 20 questions." });
    for (const list of siteRegistry.lists.values()) expect(listWords(list).title, list.id).not.toMatch(/undefined/);
  });

  it("stores a question's “Show on the homepage” switch as yes or no, and nothing else", () => {
    const home = siteRegistry.fields.get(`${BILLING}.refund.home`)!;
    expect(home).toMatchObject({ kind: "toggle", name: "Show on the homepage", toggle: { key: "on", value: "home" } });
    expect(readField(codeModel, home)).toBe("no");
    expect(readField(codeModel, siteRegistry.fields.get(`${BILLING}.cost.home`)!)).toBe("yes");
    for (const [value, usable] of [["yes", true], ["no", true], ["", false], ["YES", false], ["true", false], [1, false]] as const) expect(usableValue(home, value), String(value)).toBe(usable);
    expect(tidyFor(home, " yes ")).toBe("yes");
    expect(saveRefusal(home, "yes")).toBeNull();
    expect(saveRefusal(home, "perhaps")).toMatch(/switched on or off/);
    const shown = applyOverlay(codeModel, overlay({ text: { [home.id]: "yes", [`${BILLING}.cost.home`]: "no" } }));
    expect(shown.questions[3].items.find((item) => item.id === "refund")!.on).toEqual(["home"]);
    expect(shown.questions[3].items.find((item) => item.id === "cost")!.on).toEqual([]);
    expect(codeModel.questions[3].items.find((item) => item.id === "refund")!.on).toEqual([]);
    expect(diffToOverlay(codeModel, shown).text).toEqual({ [home.id]: "yes", [`${BILLING}.cost.home`]: "no" });
  });
});

describe("what a publish would change about a list (listChanges, draftChanges)", () => {
  const Q = `${STARTED}.x-1.q`;
  const A = `${STARTED}.x-1.a`;
  const added = overlay({ text: { [Q]: "Is it new?", [A]: "Yes, a new agent for {monthlyUsd}." }, lists: { [STARTED]: entry({ added: ["x-1"] }) } });
  const says = (content: { draft: Overlay; published: Overlay }) => listChanges(content).map((change) => change.says);

  it("tells each item added, removed, put back or moved as one plain sentence, with the page and the section", () => {
    expect(says({ draft: added, published: newOverlay() })).toEqual(["FAQ, Getting started: a new question “Is it new?” is added, as number 4 of 4."]);
    expect(says({ draft: overlay({ lists: { [STATEMENTS]: entry({ removed: ["unposted"] }) } }), published: newOverlay() })).toEqual([
      "Home, The problem: statement 2 “The people getting real work out of AI agents rarely post…” is removed.",
    ]);
    expect(says({ draft: newOverlay(), published: overlay({ lists: { [STATEMENTS]: entry({ removed: ["unposted"] }) } }) })).toEqual([
      "Home, The problem: statement “The people getting real work out of AI agents rarely post…” is put back, as number 2 of 3.",
    ]);
    expect(says({ draft: overlay({ lists: { [STEPS]: entry({ order: ["collect", "use", "curate", "deploy"] }) } }), published: newOverlay() })).toEqual(["Home, Hero: step “Collect” moves up, above “Use”."]);
    expect(says({ draft: overlay({ lists: { [STEPS]: entry({ order: ["collect", "curate", "deploy", "use"] }) } }), published: newOverlay() })).toEqual(["Home, Hero: step “Use” moves down, below “Deploy”."]);
    // Removed and added on one list: the removals first. A move is told only among the items that stay.
    const both = overlay({ text: added.text, lists: { [STARTED]: entry({ order: ["x-1", "each-week", "no-agents-yet"], removed: ["which-agents"], added: ["x-1"] }) } });
    expect(says({ draft: both, published: newOverlay() })).toEqual([
      "FAQ, Getting started: question 2 “Which AI agents does Roger work with?” is removed.",
      "FAQ, Getting started: a new question “Is it new?” is added, as number 1 of 3.",
      "FAQ, Getting started: question “What do I have to do each week?” moves up, above “I don’t use AI agents yet. Can I start?”.",
    ]);
    expect(says({ draft: both, published: both })).toEqual([]);
  });

  it("names an item as a visitor reads it when it is handed the amounts, and never by its id", () => {
    const changes = listChanges({ draft: overlay({ text: { [Q]: "Is {monthlyUsd} a lot?", [A]: "No." }, lists: added.lists }), published: newOverlay() }, baseline, siteRegistry, (text) => text.replace("{monthlyUsd}", "US$200"));
    expect(changes[0].says).toBe("FAQ, Getting started: a new question “Is US$200 a lot?” is added, as number 4 of 4.");
    expect(changes[0].fields.map(({ field, text }) => [field.name, text])).toEqual([["Question", "Is {monthlyUsd} a lot?"], ["Answer", "No."], ["Show on the homepage", "no"]]);
    for (const change of listChanges({ draft: added, published: newOverlay() })) expect(change.says).not.toMatch(/x-1|undefined|“”/);
  });

  it("puts an added item's text through the wording rules, and counts the item as one change, not its texts", () => {
    const content = { draft: added, published: newOverlay() };
    const changes = draftChanges(content);
    expect(changes.map((change) => [change.field.id, change.fresh])).toEqual([[Q, true], [A, true]]);
    const warnings = wordingWarnings(changes, amounts);
    expect(warnings.map((warning) => [warning.field.id, warning.rule, warning.found.map((found) => found.words)])).toEqual([[A, "vocabulary", ["agent"]]]);
    expect(pageStatus(content).get("faq")).toEqual({ drafts: 1, edits: 0, ticks: 0, rearranged: false, relisted: true });
    expect(draftCount(content)).toBe(1);
    // Published, nothing waits, nothing is warned about again, and the page still differs from the original.
    const live = { draft: added, published: added };
    expect(draftChanges(live)).toEqual([]);
    expect(pageStatus(live).get("faq")).toEqual({ drafts: 0, edits: 0, ticks: 0, rearranged: false, relisted: true });
    // An edit to the published item's text is then a text that changes, like any other.
    const edited = { draft: overlay({ ...added, text: { ...added.text, [A]: "Yes." } }), published: added };
    expect(draftChanges(edited)).toMatchObject([{ field: { id: A }, from: "Yes, a new agent for {monthlyUsd}.", to: "Yes.", fresh: false, toOriginal: false }]);
    expect(pageStatus(edited).get("faq")).toMatchObject({ drafts: 1 });
    // Another list is another review.
    expect(reviewKey(content, [])).not.toBe(reviewKey({ draft: overlay({ ...added, lists: { [STARTED]: entry({ order: ["x-1", "no-agents-yet", "which-agents", "each-week"], added: ["x-1"] }) } }), published: newOverlay() }, []));
  });

  it("does not list or check the texts of an item the draft has removed, and checks an item that is put back with edited wording", () => {
    const TOLD = `${STATEMENTS}.told.text`;
    const removed = overlay({ text: { [TOLD]: "Our agent saves you 5 hours a week!" }, lists: { [STATEMENTS]: entry({ removed: ["told"] }) } });
    expect(draftChanges({ draft: removed, published: newOverlay() })).toEqual([]);
    // Its kept wording is on no page, so the Pages screen does not count it as a text changed from the original: the removal is the one change.
    expect(pageStatus({ draft: removed, published: newOverlay() }).get("home")).toMatchObject({ drafts: 1, edits: 0, relisted: true });
    // What is live has it removed. The draft puts it back, with the wording it had kept: new to the site, so it is read.
    const live = shownOverlay(baseline, removed);
    const back = overlay({ text: removed.text });
    const changes = draftChanges({ draft: back, published: live });
    expect(changes).toMatchObject([{ field: { id: TOLD }, fresh: true, toOriginal: false }]);
    expect(wordingWarnings(changes, amounts).map((warning) => warning.rule).sort()).toEqual(["exclamation-emoji", "number", "time-saved", "vocabulary"]);
    expect(listChanges({ draft: back, published: live }).map((change) => change.kind)).toEqual(["back"]);
    // Put back with its original wording, there is nothing for the rules to read.
    expect(wordingWarnings(draftChanges({ draft: newOverlay(), published: live }), amounts)).toEqual([]);
  });

  it("tells a switch as a text that changes from no to yes, never checks it as wording, and says nothing about a new item's switch left off", () => {
    const HOME = `${BILLING}.refund.home`;
    const changes = draftChanges({ draft: overlay({ text: { [HOME]: "yes" } }), published: newOverlay() });
    expect(changes).toMatchObject([{ field: { id: HOME, kind: "toggle" }, from: "no", to: "yes", fresh: false, toOriginal: false }]);
    expect(wordingWarnings(changes, amounts)).toEqual([]);
    // Counted on the Pages screen as a tick box, never as a text.
    expect(pageStatus({ draft: overlay({ text: { [HOME]: "yes", [`${BILLING}.cost.q`]: "What is the price?" } }), published: newOverlay() }).get("faq")).toEqual({ drafts: 2, edits: 1, ticks: 1, rearranged: false, relisted: false });
    expect(draftChanges({ draft: overlay({ text: { ...added.text, [`${STARTED}.x-1.home`]: "yes" }, lists: added.lists }), published: newOverlay() }).map((change) => change.field.name)).toEqual(["Question", "Answer", "Show on the homepage"]);
  });
});

describe("a list in the draft (saveList), on a database", () => {
  let query: Query;
  let ran: string[];
  beforeEach(async () => {
    const { query: db } = await testDb();
    ran = [];
    query = (async (text: string, params?: unknown[]) => {
      ran.push(text.trim().split(/\s+/).slice(0, 3).join(" "));
      return db(text, params);
    }) as Query;
  });
  const value = async () => (await query<{ value: { draft: Overlay; published: Overlay; previous: Overlay | null } }>("select value from settings where key = $1", [CONTENT_KEY]))[0]?.value;
  const writes = () => ran.filter((statement) => /^(insert into settings|update settings)/.test(statement));
  const NEW = { title: "Start small.", body: "Share an outline only." };

  it("adds an item with its texts as one draft entry, in one statement, and no visitor sees it", async () => {
    const saved = await saveList(query, { list: POINTS, op: "add", id: "x-new", fields: fields(NEW) });
    expect(saved).toMatchObject({ ok: true, changed: true, items: ["read", "rules", "off", "x-new"] });
    expect(writes()).toEqual(["insert into settings"]);
    expect(await value()).toEqual({
      draft: overlay({ text: { [`${POINTS}.x-new.title`]: NEW.title, [`${POINTS}.x-new.body`]: NEW.body }, lists: { [POINTS]: entry({ added: ["x-new"] }) } }),
      published: newOverlay(),
      previous: null,
    });
    // Moved up one, it is second to last, and the entry holds the whole order.
    expect(await saveList(query, { list: POINTS, op: "up", item: "x-new" })).toMatchObject({ ok: true, changed: true, items: ["read", "rules", "x-new", "off"] });
    expect((await value())!.draft.lists).toEqual({ [POINTS]: { order: ["read", "rules", "x-new", "off"], removed: [], added: ["x-new"] } });
    expect((await value())!.published).toEqual(newOverlay());
  });

  it("refuses a new item with a text missing, empty, unprintable or too long, and stores nothing", async () => {
    for (const [given, reason, field] of [
      [{ title: "Only a title" }, "missing-field", "body"],
      [{ title: "   ", body: "x" }, "missing-field", "title"],
      [{ title: "A title", body: "{nope}" }, "unusable", "body"],
      [{ title: "x".repeat(201), body: "x" }, "too-long", "title"],
    ] as const) {
      expect(await saveList(query, { list: POINTS, op: "add", id: "x-new", fields: fields(given) }), JSON.stringify(given)).toEqual({ ok: false, reason, field });
    }
    expect(await saveList(query, { list: POINTS, op: "add", id: "mine", fields: fields(NEW) })).toEqual({ ok: false, reason: "unknown-item" });
    expect(await saveList(query, { list: POINTS, op: "add", id: "read", fields: fields(NEW) })).toEqual({ ok: false, reason: "unknown-item" });
    expect(await saveList(query, { list: "howItWorks.zack.points", op: "add", id: "x-new", fields: fields(NEW) })).toEqual({ ok: false, reason: "unknown-list" });
    expect(await value()).toBeUndefined();
    expect(writes()).toEqual([]);
  });

  it("removes a built-in item by naming it, keeps its edited wording for “Put back”, and puts it back after the item it follows", async () => {
    const RULES = `${POINTS}.rules.title`;
    await saveDraft(query, [{ field: RULES, text: "Your rules." }]);
    expect(await saveList(query, { list: POINTS, op: "remove", item: "rules" })).toMatchObject({ ok: true, items: ["read", "off"] });
    expect((await value())!.draft).toEqual(overlay({ text: { [RULES]: "Your rules." }, lists: { [POINTS]: entry({ removed: ["rules"] }) } }));
    // Typing saved into a removed item's field is kept too.
    expect(await saveDraft(query, [{ field: `${POINTS}.rules.body`, text: "Kept while removed." }])).toMatchObject({ ok: true, changed: true });
    await saveList(query, { list: POINTS, op: "up", item: "off" });
    expect(await saveList(query, { list: POINTS, op: "back", item: "rules" })).toMatchObject({ ok: true, items: ["off", "read", "rules"] });
    const { draft } = await readStored(query);
    expect(textAt(applyOverlay(baseline, draft), RULES)).toBe("Your rules.");
    expect(draft.text).toEqual({ [RULES]: "Your rules.", [`${POINTS}.rules.body`]: "Kept while removed." });
    // Back in the baseline's order with one more press, there is no entry at all.
    await saveList(query, { list: POINTS, op: "down", item: "off" });
    await saveList(query, { list: POINTS, op: "down", item: "off" });
    expect((await value())!.draft.lists).toEqual({});
    // Only a removed built-in item can be put back.
    expect(await saveList(query, { list: POINTS, op: "back", item: "rules" })).toEqual({ ok: false, reason: "unknown-item" });
    expect(await saveList(query, { list: POINTS, op: "back", item: "x-gone" })).toEqual({ ok: false, reason: "unknown-item" });
  });

  it("removes an added item with its texts, so nothing of it is left in the draft", async () => {
    await saveList(query, { list: POINTS, op: "add", id: "x-new", fields: fields(NEW) });
    await saveDraft(query, [{ field: HEADLINE, text: "A headline." }]);
    expect(await saveList(query, { list: POINTS, op: "remove", item: "x-new" })).toMatchObject({ ok: true, changed: true, items: ["read", "rules", "off"] });
    expect((await value())!.draft).toEqual(overlay({ text: { [HEADLINE]: "A headline." } }));
    // Its text can no longer be saved: the item is in no list.
    expect(await saveDraft(query, [{ field: `${POINTS}.x-new.title`, text: "Late typing." }])).toEqual({ ok: false, reason: "unknown-field", field: `${POINTS}.x-new.title` });
    expect(await saveList(query, { list: POINTS, op: "up", item: "x-new" })).toEqual({ ok: false, reason: "unknown-item" });
  });

  it("saves typing into an added item's fields like any other, and refuses to leave one of its texts empty", async () => {
    await saveList(query, { list: STARTED, op: "add", id: "x-q", fields: fields({ q: "Is it new?", a: "Yes." }) });
    expect(await saveDraft(query, [{ field: `${STARTED}.x-q.a`, text: "Yes, since Monday." }, { field: `${STARTED}.x-q.home`, text: "yes" }])).toMatchObject({ ok: true, changed: true });
    expect((await readStored(query)).draft.text).toEqual({ [`${STARTED}.x-q.q`]: "Is it new?", [`${STARTED}.x-q.a`]: "Yes, since Monday.", [`${STARTED}.x-q.home`]: "yes" });
    expect(await saveDraft(query, [{ field: `${STARTED}.x-q.a`, text: "" }])).toMatchObject({ ok: false, reason: "unusable" });
    // Switched off again, the switch is no entry: off is what a new item has.
    await saveDraft(query, [{ field: `${STARTED}.x-q.home`, text: "no" }]);
    expect(Object.keys((await readStored(query)).draft.text)).toEqual([`${STARTED}.x-q.q`, `${STARTED}.x-q.a`]);
  });

  it("never holds more items than the page can draw, or fewer: the press that would do it is refused", async () => {
    for (const id of ["x-1", "x-2", "x-3"]) expect(await saveList(query, { list: POINTS, op: "add", id, fields: fields(NEW) })).toMatchObject({ ok: true });
    expect(await saveList(query, { list: POINTS, op: "add", id: "x-4", fields: fields(NEW) })).toEqual({ ok: false, reason: "full" });
    await saveList(query, { list: POINTS, op: "remove", item: "read" });
    await saveList(query, { list: POINTS, op: "add", id: "x-4", fields: fields(NEW) });
    // Full again: the removed built-in one cannot come back until there is room.
    expect(await saveList(query, { list: POINTS, op: "back", item: "read" })).toEqual({ ok: false, reason: "full" });
    // The hero's picture needs two steps.
    await saveList(query, { list: STEPS, op: "remove", item: "use" });
    await saveList(query, { list: STEPS, op: "remove", item: "collect" });
    expect(await saveList(query, { list: STEPS, op: "remove", item: "curate" })).toEqual({ ok: false, reason: "too-few" });
    expect(itemsOn((await readStored(query)).draft, STEPS)).toEqual(["curate", "deploy"]);
    for (const id of ["x-a", "x-b", "x-c"]) await saveList(query, { list: STEPS, op: "add", id, fields: fields({ label: "New", title: "A new step", body: "Its text." }) });
    expect(await saveList(query, { list: STEPS, op: "add", id: "x-d", fields: fields({ label: "New", title: "A new step", body: "Its text." }) })).toEqual({ ok: false, reason: "full" });
  });

  it("puts a list back to the original with one reset: the entry and the added items' texts go, edited wording of the original items stays", async () => {
    await saveDraft(query, [{ field: `${POINTS}.read.title`, text: "Read it all." }]);
    await saveList(query, { list: POINTS, op: "add", id: "x-new", fields: fields(NEW) });
    await saveList(query, { list: POINTS, op: "remove", item: "off" });
    await saveList(query, { list: STATEMENTS, op: "up", item: "alone" });
    expect(await saveList(query, { list: POINTS, op: "reset" })).toMatchObject({ ok: true, changed: true, items: ["read", "rules", "off"] });
    expect((await value())!.draft).toEqual(overlay({ text: { [`${POINTS}.read.title`]: "Read it all." }, lists: { [STATEMENTS]: entry({ order: ["told", "alone", "unposted"] }) } }));
    expect(await saveList(query, { list: POINTS, op: "reset" })).toMatchObject({ ok: true, changed: false });
  });

  it("changes nothing when the first item is moved up or the last one down", async () => {
    expect(await saveList(query, { list: POINTS, op: "up", item: "read" })).toMatchObject({ ok: true, changed: false });
    expect(await saveList(query, { list: POINTS, op: "down", item: "off" })).toMatchObject({ ok: true, changed: false });
    expect(await saveList(query, { list: POINTS, op: "up", item: "nope" })).toEqual({ ok: false, reason: "unknown-item" });
    expect(await value()).toBeUndefined();
  });

  it("keeps both of two presses that run together, each made to the list the other has left", async () => {
    const [a, b] = await Promise.all([saveList(query, { list: POINTS, op: "remove", item: "read" }), saveList(query, { list: POINTS, op: "add", id: "x-new", fields: fields(NEW) })]);
    expect([a.ok, b.ok]).toEqual([true, true]);
    expect(itemsOn((await readStored(query)).draft, POINTS)).toEqual(["rules", "off", "x-new"]);
  });

  it("is published and undone with everything else; a publish leaves the wording kept for a removed item off the site and in the draft", async () => {
    await saveDraft(query, [{ field: `${POINTS}.rules.title`, text: "Your rules." }, { field: HEADLINE, text: "A headline." }]);
    await saveList(query, { list: POINTS, op: "remove", item: "rules" });
    await saveList(query, { list: POINTS, op: "add", id: "x-new", fields: fields(NEW) });
    const before = await readStored(query);
    const done = await publish(query, "admin@example.com", before.draft, { over: before.published });
    expect(done).toMatchObject({ ok: true, changed: true });
    const live = overlay({ text: { [HEADLINE]: "A headline.", [`${POINTS}.x-new.title`]: NEW.title, [`${POINTS}.x-new.body`]: NEW.body }, lists: { [POINTS]: entry({ removed: ["rules"], added: ["x-new"] }) } });
    expect(await value()).toEqual({ draft: { ...live, text: { ...live.text, [`${POINTS}.rules.title`]: "Your rules." } }, published: live, previous: newOverlay() });
    expect(draftCount(await readStored(query))).toBe(0);
    expect((await query<{ detail: { changed: string[] } }>("select detail from admin_actions")).map((row) => row.detail.changed)).toEqual([[`${POINTS}.x-new.body`, `${POINTS}.x-new.title`, HEADLINE, `lists.${POINTS}`]]);
    // Nothing more to publish, though the same press is made again.
    expect(await publish(query, "admin@example.com", (await readStored(query)).draft)).toMatchObject({ ok: true, changed: false });
    // Undone: the site has its three points again, and the draft still holds the list as it was drafted.
    expect(await undoPublish(query, "admin@example.com")).toMatchObject({ ok: true, changed: true });
    const after = await readStored(query);
    expect(after.published).toEqual(newOverlay());
    expect(itemsOn(after.draft, POINTS)).toEqual(["read", "off", "x-new"]);
  });

  it("puts back an item, after its removal was published and undone, with the wording the site shows for it again", async () => {
    // The edit is live first; then the item is removed and that is published; then the publish is undone.
    const RULES = `${POINTS}.rules.title`;
    await saveDraft(query, [{ field: RULES, text: "Your rules." }]);
    await publish(query, "admin@example.com", (await readStored(query)).draft);
    await saveList(query, { list: POINTS, op: "remove", item: "rules" });
    await publish(query, "admin@example.com", (await readStored(query)).draft);
    expect((await readStored(query)).published.text).toEqual({});
    await undoPublish(query, "admin@example.com");
    expect(textAt(applyOverlay(baseline, (await readStored(query)).published), RULES)).toBe("Your rules.");
    await saveList(query, { list: POINTS, op: "back", item: "rules" });
    const now = await readStored(query);
    expect(textAt(applyOverlay(baseline, now.draft), RULES)).toBe("Your rules.");
    // So nothing is waiting: the draft is what the site shows again, and no wording would be taken off it.
    expect(draftChanges(now)).toEqual([]);
    expect(draftCount(now)).toBe(0);
  });

  it("publishes nothing when the draft differs from the site only by wording kept for a removed item", async () => {
    await saveList(query, { list: POINTS, op: "remove", item: "rules" });
    const first = await readStored(query);
    await publish(query, "admin@example.com", first.draft);
    await saveDraft(query, [{ field: `${POINTS}.rules.title`, text: "Typed while it is removed." }]);
    const now = await readStored(query);
    expect(now.draft.text).toEqual({ [`${POINTS}.rules.title`]: "Typed while it is removed." });
    expect(draftCount(now)).toBe(0);
    expect(await publish(query, "admin@example.com", now.draft)).toMatchObject({ ok: true, changed: false });
    expect((await readStored(query)).draft.text).toEqual({ [`${POINTS}.rules.title`]: "Typed while it is removed." });
  });

  it("ends where the same presses end on paper, and stores the list's one entry written the one way", async () => {
    const next = seeded(9);
    const original = listItems(baseline, STARTED);
    const list = siteRegistry.lists.get(STARTED)!;
    let paper = [...original];
    let made = 0;
    for (let run = 0; run < 90; run++) {
      const op = (["up", "down", "remove", "back", "add"] as const)[Math.floor(next() * 5)];
      const label = `press ${run}: ${op} on ${paper.join(",")}`;
      if (op === "add") {
        const id = `x-${++made}`;
        const saved = await saveList(query, { list: STARTED, op, id, fields: fields({ q: `Question ${made}?`, a: "Answer." }) });
        if (paper.length >= list.max) expect(saved, label).toEqual({ ok: false, reason: "full" });
        else {
          expect(saved, label).toMatchObject({ ok: true, changed: true });
          paper = [...paper, id];
        }
      } else if (op === "back") {
        const gone = original.filter((id) => !paper.includes(id));
        if (gone.length === 0) continue;
        const item = gone[Math.floor(next() * gone.length)];
        expect(await saveList(query, { list: STARTED, op, item }), label).toMatchObject({ ok: true, changed: true });
        const earlier = original.slice(0, original.indexOf(item)).reverse().find((id) => paper.includes(id));
        paper.splice(earlier === undefined ? 0 : paper.indexOf(earlier) + 1, 0, item);
      } else {
        if (paper.length === 0) continue;
        const item = paper[Math.floor(next() * paper.length)];
        const at = paper.indexOf(item);
        expect(await saveList(query, { list: STARTED, op, item }), label).toMatchObject({ ok: true });
        if (op === "remove") paper = paper.filter((id) => id !== item);
        else {
          const to = op === "up" ? at - 1 : at + 1;
          if (to >= 0 && to < paper.length) [paper[at], paper[to]] = [paper[to], paper[at]];
        }
      }
      const { draft, published } = await readStored(query);
      expect(itemsOn(draft, STARTED), label).toEqual(paper);
      expect(published, label).toEqual(newOverlay());
      const written = diffListEdit(original, paper);
      expect(draft.lists, label).toEqual(written ? { [STARTED]: written } : {});
      // Only the texts of the added items that are in the list are kept.
      expect(sorted(Object.keys(draft.text)), label).toEqual(sorted(paper.filter(isAddedId).flatMap((id) => [`${STARTED}.${id}.q`, `${STARTED}.${id}.a`])));
      expect(normaliseOverlay(baseline, draft), label).toEqual(draft);
    }
    expect(made).toBeGreaterThan(5);
    expect(await saveList(query, { list: STARTED, op: "reset" })).toMatchObject({ ok: true });
    expect((await readStored(query)).draft).toEqual(newOverlay());
  }, 90_000);
});
