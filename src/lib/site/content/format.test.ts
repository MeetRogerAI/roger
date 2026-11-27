/**
 * The stored shape of site content (plan U3, KTD2): the lenient reading a
 * page uses, which keeps what it can print and never throws, and the strict
 * reading a release file is held to, which says what is wrong.
 */
import { describe, expect, it } from "vitest";
import releasedFile from "@/data/site/released.json";
import { fixtureRegistry } from "@/test-helpers/content-fixture";
import { LIST_MAX, OVERLAY_FORMAT, TEXT_MAX, emptyOverlay, isEmptyOverlay, newOverlay, overlaySchema, parseOverlay, parseOverlayStrict, type Overlay } from "./format";
import { siteRegistry } from "./registry";

const empty = { format: 1, text: {}, sections: {}, lists: {} };
const withText = (text: Record<string, unknown>) => ({ ...empty, text });
const problems = (value: unknown, registry = siteRegistry) => {
  const result = parseOverlayStrict(value, registry);
  return result.ok ? [] : result.problems;
};
const ids = (count: number, prefix = "i") => Array.from({ length: count }, (_, i) => `${prefix}${i}`);

describe("the empty overlay", () => {
  it("has the format's number and nothing else, and cannot be written to", () => {
    expect(OVERLAY_FORMAT).toBe(1);
    expect(emptyOverlay).toEqual(empty);
    expect(isEmptyOverlay(emptyOverlay)).toBe(true);
    expect(Object.isFrozen(emptyOverlay) && Object.isFrozen(emptyOverlay.text) && Object.isFrozen(emptyOverlay.sections) && Object.isFrozen(emptyOverlay.lists)).toBe(true);
    expect(() => void (emptyOverlay.text["buttons.start"] = "x")).toThrow(TypeError);
  });

  it("is made new each time for filling, so one caller's entries never reach another's", () => {
    const a = newOverlay();
    a.text["buttons.start"] = "Start";
    expect(newOverlay()).toEqual(empty);
    expect(isEmptyOverlay(a)).toBe(false);
    expect(isEmptyOverlay({ ...empty, sections: { home: { order: [], off: ["price"] } } })).toBe(false);
    expect(isEmptyOverlay({ ...empty, lists: { "control.points": { order: [], removed: ["off"], added: [] } } })).toBe(false);
  });

  it("is what the release file holds on this branch, and the file passes the strict reading", () => {
    expect(parseOverlayStrict(releasedFile)).toEqual({ ok: true, overlay: empty });
    expect(Object.keys(releasedFile).sort()).toEqual(["format", "lists", "sections", "text"]);
  });
});

describe("the lenient reading", () => {
  it("gives the empty overlay for anything that is not an overlay of this format, and never throws", () => {
    const circular: Record<string, unknown> = { format: 1 };
    circular.text = circular;
    const shapes: unknown[] = [
      undefined,
      null,
      "",
      "text",
      "{}",
      0,
      1,
      Number.NaN,
      true,
      [],
      [empty],
      {},
      { text: { "buttons.start": "Start" } },
      { format: "1", text: { "buttons.start": "Start" } },
      { format: 2, text: { "buttons.start": "Start" } },
      { format: 0, text: { "buttons.start": "Start" } },
      { format: null },
      { format: 1 },
      { format: 1, text: null, sections: null, lists: null },
      { format: 1, text: "text", sections: 7, lists: true },
      { format: 1, text: ["buttons.start"], sections: [["home"]], lists: [[]] },
      { format: 1, text: [["buttons.start", "Start"]] },
      { format: 1, sections: { home: null }, lists: { "control.points": null } },
      { format: 1, sections: { home: "off" }, lists: { "control.points": ["off"] } },
      { format: 1, sections: { home: { order: "hero", off: { price: true } } }, lists: { "control.points": { order: 3, removed: "off", added: null } } },
      circular,
      () => empty,
      Symbol("overlay"),
      new Map([["format", 1]]),
      new Date(0),
    ];
    for (const shape of shapes) {
      expect(() => parseOverlay(shape), String(shape)).not.toThrow();
      expect(parseOverlay(shape), String(shape)).toEqual(empty);
    }
  });

  it("always gives the whole shape, as new objects the caller may write to", () => {
    const read = parseOverlay(emptyOverlay);
    expect(read).toEqual(empty);
    expect(read).not.toBe(emptyOverlay);
    expect(Object.isFrozen(read.text)).toBe(false);
  });

  it("keeps a text entry a page can print, and drops one for an unknown field, a value that is not text, or a name in braces the field may not hold", () => {
    expect(
      parseOverlay(
        withText({
          "home.hero.headline": "Smarter every Monday.",
          "questions.price-and-billing.items.cost.a": "{monthlyUsd} a month.",
          "bricks.caption.week": "In week {week}",
          // Unknown: no such field, no such item, a field that is not editable, a place in a list, a name every object has.
          "home.hero.kicker": "x",
          "questions.price-and-billing.items.not-a-question.a": "x",
          "meta.title": "x",
          "control.link.href": "javascript:alert(1)",
          "home.problem.statements.0.text": "x",
          "home.problem.statements[0].text": "x",
          "home.problem.statements": "x",
          home: "x",
          "": "x",
          constructor: "x",
          toString: "x",
          // Not text.
          "home.hero.sub": 7,
          "buttons.signIn": null,
          "buttons.openApp": ["Open"],
          "nav.faq": { text: "FAQ" },
          "nav.about": true,
          // Text a page cannot print: empty, or naming what does not exist or what the field may not name.
          "footer.place": "",
          "footer.privacy": "   ",
          cardLine: "Charged with your {thirdList} list.",
          trialLine: "Week {week}",
          "bricks.caption.bricks": "{monthlyUsd} ideas",
        }),
      ),
    ).toEqual(withText({ "home.hero.headline": "Smarter every Monday.", "questions.price-and-billing.items.cost.a": "{monthlyUsd} a month.", "bricks.caption.week": "In week {week}" }));
  });

  it("is not fooled by a key that names the prototype", () => {
    const hostile = JSON.parse('{"format":1,"text":{"__proto__":"x","buttons.start":"Start"},"sections":{"__proto__":{"order":["hero"],"off":[]}},"lists":{"__proto__":{"order":["a"],"removed":[],"added":[]}},"__proto__":{"format":1}}');
    const read = parseOverlay(hostile);
    expect(read).toEqual(withText({ "buttons.start": "Start" }));
    expect(Object.getPrototypeOf(read.text)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).order).toBeUndefined();
  });

  it("keeps a text longer than its field's limit, which still prints, and drops one longer than any text may be", () => {
    const long = "a".repeat(500);
    expect(parseOverlay(withText({ "buttons.signIn": long })).text).toEqual({ "buttons.signIn": long });
    expect(parseOverlay(withText({ "buttons.signIn": "a".repeat(TEXT_MAX) })).text["buttons.signIn"]).toHaveLength(TEXT_MAX);
    expect(parseOverlay(withText({ "buttons.signIn": "a".repeat(TEXT_MAX + 1) })).text).toEqual({});
  });

  it("drops a link's address that a link may not point at, and keeps one it may", () => {
    const read = (href: unknown) => parseOverlay(withText({ "link.href": href }), fixtureRegistry).text;
    for (const ok of ["/about", "/#price", "https://x.test", "mailto:a@b.test"]) expect(read(ok), ok).toEqual({ "link.href": ok });
    for (const bad of ["javascript:alert(1)", "//evil.test", "http://x.test", "", 7]) expect(read(bad), String(bad)).toEqual({});
  });

  it("keeps a section entry for a covered page, with only the sections of that page an admin may move", () => {
    const read = parseOverlay({
      ...empty,
      sections: {
        home: { order: ["questions", "price", "nothing", "hero", "questions", 7, null, "a.b"], off: ["compounds", "week", "compounds"], extra: "dropped" },
        // A page's title is not a section to move or switch off, and nothing under Shared is.
        howItWorks: { order: ["title", "zack"], off: ["title"] },
        shared: { order: ["buttons"], off: ["nav"] },
        // Not a page, not an entry, or nothing usable in it.
        pricing: { order: ["hero"], off: [] },
        faq: ["getting-started"],
        about: { order: "letter", off: null },
        library: { order: [], off: [] },
      },
    });
    expect(read.sections).toEqual({ home: { order: ["questions", "price", "hero"], off: ["compounds"] }, howItWorks: { order: ["zack"], off: [] } });
  });

  it("keeps a list entry for a list that exists, with ids only, each once", () => {
    const read = parseOverlay({
      ...empty,
      lists: {
        "home.problem.statements": { order: ["alone", "x-9k", "told", "alone", 3, "a b", null], removed: ["unposted", "unposted", ""], added: ["x-9k", "mine", "x-9k", {}], extra: 1 },
        "control.points": { removed: ["off"] },
        // Not a list an admin may change: unknown, text only, a field, a name every object has.
        "home.problem.nothing": { order: ["a"], removed: [], added: [] },
        "howItWorks.zack.points": { order: ["change", "reads"], removed: [], added: [] },
        "home.hero.headline": { order: ["a"], removed: [], added: [] },
        constructor: { order: ["a"], removed: [], added: [] },
        "howItWorks.week.days": { order: [], removed: "monday", added: [] },
      },
    });
    expect(read.lists).toEqual({
      "home.problem.statements": { order: ["alone", "x-9k", "told"], removed: ["unposted"], added: ["x-9k"] },
      "control.points": { order: [], removed: ["off"], added: [] },
    });
  });

  it("does not judge a list's item ids against the built-in items: the layer below may have added them", () => {
    const entry = { order: ["x-from-the-release", "gone-from-code", "told"], removed: ["x-from-the-release"], added: [] };
    expect(parseOverlay({ ...empty, lists: { "home.problem.statements": entry } }).lists["home.problem.statements"]).toEqual(entry);
  });

  it("keeps no more ids than a list may hold", () => {
    const read = parseOverlay({ ...empty, lists: { "control.points": { order: ids(LIST_MAX + 5), removed: ids(LIST_MAX + 1), added: ids(LIST_MAX + 1, "x-") } } });
    expect(read.lists["control.points"].order).toEqual(ids(LIST_MAX));
    expect(read.lists["control.points"].removed).toHaveLength(LIST_MAX);
    expect(read.lists["control.points"].added).toHaveLength(LIST_MAX);
  });

  it("gives back unchanged everything the strict reading accepts", () => {
    const full: Overlay = {
      format: 1,
      text: { "home.hero.headline": "Smarter every Monday." },
      sections: { home: { order: ["questions", "price"], off: ["compounds"] } },
      lists: { "home.problem.statements": { order: ["alone", "told"], removed: ["unposted"], added: [] } },
    };
    expect(parseOverlayStrict(full)).toEqual({ ok: true, overlay: full });
    expect(parseOverlay(full)).toEqual(full);
  });
});

describe("the strict reading", () => {
  const good: Overlay = {
    format: 1,
    text: { "home.hero.headline": "Smarter every Monday.", "questions.price-and-billing.items.cost.a": "{monthlyUsd} a month, {monthlyCad} in Canada.", "bricks.caption.week": "Week {week}" },
    sections: { home: { order: ["hero", "questions", "price"], off: ["compounds"] }, faq: { order: [], off: ["cora-and-the-ideas"] } },
    lists: { "control.points": { order: ["off", "x-7c", "read"], removed: ["rules"], added: ["x-7c"] } },
  };

  it("accepts the empty overlay and one whose every part the registry knows", () => {
    expect(parseOverlayStrict(empty)).toEqual({ ok: true, overlay: empty });
    expect(parseOverlayStrict(good)).toEqual({ ok: true, overlay: good });
    expect(parseOverlayStrict(JSON.parse(JSON.stringify(good)))).toEqual({ ok: true, overlay: good });
  });

  it("rejects what is not the exact shape: an unknown key, a missing one, another format", () => {
    for (const bad of [undefined, null, "text", 7, [], {}, { format: 1 }, { ...empty, format: 2 }, { ...empty, format: "1" }, { format: 1, text: {}, sections: {} }, { ...empty, text: [] }, { ...empty, sections: null }]) {
      expect(problems(bad).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
    expect(problems({ ...empty, draft: {} })).toEqual([expect.stringMatching(/draft/)]);
    expect(problems({ ...empty, updatedBy: "admin@example.com" })).toEqual([expect.stringMatching(/updatedBy/)]);
    expect(problems({ ...empty, sections: { home: { order: [], off: [], hidden: [] } } })).toEqual([expect.stringMatching(/^sections\.home: .*hidden/)]);
    expect(problems({ ...empty, sections: { home: { order: [] } } })).toEqual([expect.stringMatching(/^sections\.home\.off/)]);
    expect(problems({ ...empty, lists: { "control.points": { order: [], removed: [], added: [], moved: [] } } })).toEqual([expect.stringMatching(/^lists\.control\.points: .*moved/)]);
    expect(problems({ ...empty, lists: { "control.points": { order: [], removed: [] } } })).toEqual([expect.stringMatching(/added/)]);
    expect(problems(withText({ "home.hero.headline": 7 }))).toEqual([expect.stringMatching(/^text\.home\.hero\.headline/)]);
  });

  it("rejects a text over its field's limit, by its length, and accepts one exactly at it", () => {
    const limit = siteRegistry.fields.get("buttons.signIn")!.max;
    expect(problems(withText({ "buttons.signIn": "a".repeat(limit) }))).toEqual([]);
    expect(problems(withText({ "buttons.signIn": "a".repeat(limit + 1) }))).toEqual([`text.buttons.signIn: ${limit + 1} characters, and the most is ${limit}`]);
    expect(problems(withText({ "buttons.signIn": "a".repeat(TEXT_MAX + 1) })).length).toBe(1);
  });

  it("rejects more than 30 items in a list, in a page's order, or an id written twice", () => {
    expect(LIST_MAX).toBe(30);
    const list = (entry: Partial<Record<"order" | "removed" | "added", string[]>>) => problems({ ...empty, lists: { "control.points": { order: [], removed: [], added: [], ...entry } } });
    expect(list({ order: ids(30) })).toEqual([]);
    expect(list({ order: ids(31) })).toEqual([expect.stringMatching(/^lists\.control\.points\.order/)]);
    expect(list({ removed: ids(31) })).toEqual([expect.stringMatching(/^lists\.control\.points\.removed/)]);
    expect(list({ added: ids(31, "x-") })).toEqual([expect.stringMatching(/^lists\.control\.points\.added/)]);
    expect(list({ order: ["read", "off", "read"] })).toEqual(["lists.control.points.order: holds an id twice"]);
    expect(problems({ ...empty, sections: { home: { order: ids(31), off: [] } } })[0]).toMatch(/^sections\.home\.order/);
    expect(problems({ ...empty, sections: { home: { order: [], off: ["price", "price"] } } })).toEqual(["sections.home.off: holds an id twice"]);
  });

  it("rejects an id that could not be one: a dot, a space, nothing", () => {
    for (const bad of ["a.b", "a b", "", "-a", 7]) {
      expect(problems({ ...empty, lists: { "control.points": { order: [bad], removed: [], added: [] } } }).length, String(bad)).toBeGreaterThan(0);
      expect(problems({ ...empty, sections: { home: { order: [], off: [bad] } } }).length, String(bad)).toBeGreaterThan(0);
    }
  });

  it("rejects every id the registry does not know, where the lenient reading would drop it without a word", () => {
    expect(problems(withText({ "home.hero.kicker": "x" }))).toEqual(["text.home.hero.kicker: no such field"]);
    expect(problems(withText({ "meta.title": "x" }))).toEqual(["text.meta.title: no such field"]);
    expect(problems(withText({ "home.problem.statements.0.text": "x" }))).toEqual(["text.home.problem.statements.0.text: no such field"]);
    expect(problems({ ...empty, sections: { pricing: { order: [], off: [] } } })).toEqual(["sections.pricing: no such page"]);
    expect(problems({ ...empty, sections: { home: { order: ["hero", "week"], off: ["nothing"] } } })).toEqual([
      'sections.home: "week" is not a section of this page that can be moved or switched off',
      'sections.home: "nothing" is not a section of this page that can be moved or switched off',
    ]);
    expect(problems({ ...empty, sections: { faq: { order: [], off: ["title"] } } })).toEqual(['sections.faq: "title" is not a section of this page that can be moved or switched off']);
    expect(problems({ ...empty, sections: { shared: { order: ["buttons"], off: [] } } })).toHaveLength(1);
    expect(problems({ ...empty, lists: { "home.problem.nothing": { order: [], removed: [], added: [] } } })).toEqual(["lists.home.problem.nothing: no such list"]);
    expect(problems({ ...empty, lists: { "howItWorks.zack.points": { order: [], removed: [], added: [] } } })).toEqual(["lists.howItWorks.zack.points: no such list"]);
    expect(problems({ ...empty, lists: { "control.points": { order: [], removed: [], added: ["mine"] } } })).toEqual(['lists.control.points: the added item "mine" must have an id that starts with "x-"']);
  });

  it("rejects a key that names the prototype, which the schema alone would leave out without a word", () => {
    // As a file is read: JSON.parse gives the key as the object's own.
    const read = (json: string) => problems(JSON.parse(json));
    expect(read('{"format":1,"text":{"__proto__":"x"},"sections":{},"lists":{}}')).toEqual(["text.__proto__: not a name anything can have"]);
    expect(read('{"format":1,"text":{},"sections":{"__proto__":{"order":[],"off":[]}},"lists":{}}')).toEqual(["sections.__proto__: not a name anything can have"]);
    expect(read('{"format":1,"text":{},"sections":{},"lists":{"__proto__":{"order":[],"removed":[],"added":[]}}}')).toEqual(["lists.__proto__: not a name anything can have"]);
    expect(read('{"format":1,"text":{},"sections":{},"lists":{},"__proto__":{}}')).toHaveLength(1);
    // The other names every object has are refused as unknown ids, like any other.
    expect(problems(withText({ constructor: "x", toString: "y" }))).toEqual(["text.constructor: no such field", "text.toString: no such field"]);
    expect(problems({ ...empty, sections: { constructor: { order: [], off: [] } }, lists: { hasOwnProperty: { order: [], removed: [], added: [] } } })).toEqual(["sections.constructor: no such page", "lists.hasOwnProperty: no such list"]);
    expect(({} as Record<string, unknown>).order).toBeUndefined();
  });

  it("rejects a text that is empty once tidied: only characters that print nothing", () => {
    const unseen = String.fromCodePoint(0x200b, 0xfeff, 0xe0041);
    expect(problems(withText({ "home.hero.headline": unseen }))).toEqual([expect.stringMatching(/not something this field can print/)]);
    expect(parseOverlay(withText({ "home.hero.headline": unseen, "buttons.start": "Start" })).text).toEqual({ "buttons.start": "Start" });
  });

  it("rejects a text its field cannot print: empty, a name in braces that does not exist, an address a link may not point at", () => {
    const cannot = /not something this field can print/;
    expect(problems(withText({ "home.hero.headline": "" }))).toEqual([expect.stringMatching(cannot)]);
    expect(problems(withText({ "home.hero.headline": "  " }))).toEqual([expect.stringMatching(cannot)]);
    expect(problems(withText({ cardLine: "Charged with your {thirdList} list." }))).toEqual([expect.stringMatching(cannot)]);
    expect(problems(withText({ "home.hero.headline": "Week {week}" }))).toEqual([expect.stringMatching(cannot)]);
    expect(problems(withText({ "link.href": "javascript:alert(1)" }), fixtureRegistry)).toEqual([expect.stringMatching(/^text\.link\.href: not something this field can print/)]);
    expect(problems(withText({ "link.href": "/about" }), fixtureRegistry)).toEqual([]);
  });

  it("names every problem, not only the first", () => {
    expect(problems({ ...empty, text: { "home.hero.kicker": "x", "buttons.start": "" }, sections: { pricing: { order: [], off: [] } }, lists: { nothing: { order: [], removed: [], added: [] } } })).toHaveLength(4);
  });

  it("holds the shape alone in one schema, bounds included", () => {
    expect(overlaySchema.safeParse(good).success).toBe(true);
    // The shape does not know the registry: an unknown field is the strict reading's to refuse.
    expect(overlaySchema.safeParse(withText({ "home.hero.kicker": "x" })).success).toBe(true);
    expect(overlaySchema.safeParse(withText({ "buttons.start": "a".repeat(TEXT_MAX + 1) })).success).toBe(false);
    expect(overlaySchema.safeParse(withText(Object.fromEntries(ids(2001).map((id) => [id, "x"])))).success).toBe(false);
  });
});
