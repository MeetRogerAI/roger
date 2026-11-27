/**
 * The merge of a page's sections across layers (plan KTD4, U6), swept: many layouts, many entries, and many
 * releases that change the layer under an entry a site already holds. model.test.ts says what each rule gives for
 * the cases a reader would think of. This file says the rules hold for the ones nobody thought of.
 *
 * What is held:
 *
 *   round trip     the entry that turns one layout into another, applied, gives that other layout
 *   one writing    an entry is written one way: normalising twice changes nothing, and an entry that changes
 *                  nothing is never written
 *   a release      whatever a release does to the layer below (reorder, add, remove, rename, switch off), a
 *                  site's entry on it shows every section the page now has exactly once, and none it has not
 *   presses        any run of presses (off, on, up, down) in the store ends where the same presses end on paper
 *   the review     any two layouts are told as one sentence for each switch and as few moves as explain the order
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { linkWarnings, sectionChanges } from "./check";
import { emptyOverlay, parseOverlay, parseOverlayStrict, type Overlay } from "./format";
import { applySectionEdit, baseline, codeLayout, diffSectionEdit, layoutOn, mergeOrder, normaliseOverlay, sameLayout, sectionLayout, sectionsShown, type Layout } from "./model";
import { readStored, saveSections } from "./store";

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
const POOL = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
/** A layout of some of the pool's ids, in some order, some of them off. */
const anyLayout = (next: () => number, ids: readonly string[] = some(POOL, next, 0.7)): Layout => {
  const order = shuffled(ids, next);
  return { order, off: order.filter(() => next() < 0.3) };
};
const sorted = (ids: readonly string[]) => [...ids].sort();

describe("the entry between two layouts of a page's sections", () => {
  it("round-trips: for any layer below and any layout of the same sections, the entry applied to the layer gives the layout", () => {
    const next = seeded(1);
    for (let run = 0; run < 3000; run++) {
      const below = anyLayout(next);
      const layout = anyLayout(next, below.order);
      const entry = diffSectionEdit(below, layout);
      const label = `run ${run}: ${JSON.stringify({ below, layout, entry })}`;
      if (entry === null) expect(sameLayout(below, layout), label).toBe(true);
      else {
        expect(entry.order.length + entry.off.length, label).toBeGreaterThan(0);
        expect(applySectionEdit(below, entry), label).toEqual(layout);
        // Written one way: the entry of the result is the entry.
        expect(diffSectionEdit(below, applySectionEdit(below, entry)), label).toEqual(entry);
      }
      // Only a switch: the order is left to the layer below, so nothing is named that was not switched back on.
      if (entry && layout.order.every((id, i) => id === below.order[i])) expect(entry.order.every((id) => below.off.includes(id) && !layout.off.includes(id)), label).toBe(true);
    }
  });

  it("gives a layout of exactly the layer's sections for any entry at all: unknown ids, ids twice, an id both ordered and off", () => {
    const next = seeded(2);
    for (let run = 0; run < 3000; run++) {
      const below = anyLayout(next);
      const wild = () => [...some(POOL, next, 0.5), ...some(POOL, next, 0.2), ...some(["gone", "__proto__", "constructor", "toString"], next, 0.3)].sort(() => next() - 0.5);
      const entry = { order: next() < 0.3 ? [] : wild(), off: next() < 0.3 ? [] : wild() };
      const out = applySectionEdit(below, entry);
      const label = `run ${run}: ${JSON.stringify({ below, entry, out })}`;
      expect(sorted(out.order), label).toEqual(sorted(below.order));
      expect(new Set(out.off).size, label).toBe(out.off.length);
      for (const id of out.off) expect(out.order, label).toContain(id);
      // A section the entry names is off exactly when the entry says so. One it does not name is as the layer below has it.
      for (const id of out.order) {
        const named = entry.order.includes(id) || entry.off.includes(id);
        expect(out.off.includes(id), `${label} ${id}`).toBe(named ? entry.off.includes(id) : below.off.includes(id));
      }
      // The same answer every time, and applying what it amounts to again changes nothing.
      expect(applySectionEdit(below, entry), label).toEqual(out);
      const written = diffSectionEdit(below, out);
      expect(applySectionEdit(below, written ?? undefined), label).toEqual(out);
    }
  });

  it("names an id that is in both `order` and `off` as off, in its ordered place", () => {
    const below = { order: ["a", "b", "c"], off: [] };
    expect(applySectionEdit(below, { order: ["c", "a", "b"], off: ["c"] })).toEqual({ order: ["c", "a", "b"], off: ["c"] });
    expect(applySectionEdit(below, { order: ["c", "c", "a"], off: ["c", "c"] })).toEqual({ order: ["c", "a", "b"], off: ["c"] });
  });
});

describe("a release that changes the layer under a site's entry", () => {
  /** A release: the sections reordered, some gone, some new, one renamed, some switched off. */
  const release = (below: Layout, next: () => number): Layout => {
    let order = below.order.filter(() => next() > 0.15);
    if (next() < 0.5) order = shuffled(order, next);
    if (next() < 0.3 && order.length > 0) order[Math.floor(next() * order.length)] = "renamed";
    for (const id of ["new-1", "new-2"]) if (next() < 0.4) order.splice(Math.floor(next() * (order.length + 1)), 0, id);
    return { order, off: order.filter((id) => (below.off.includes(id) ? next() < 0.7 : next() < 0.15)) };
  };

  it("shows every section the page now has exactly once, none it no longer has, and the same result every time", () => {
    const next = seeded(3);
    for (let run = 0; run < 3000; run++) {
      const below = anyLayout(next);
      const entry = diffSectionEdit(below, anyLayout(next, below.order));
      const later = release(below, next);
      const out = applySectionEdit(later, entry ?? undefined);
      const label = `run ${run}: ${JSON.stringify({ below, entry, later, out })}`;
      expect(sorted(out.order), label).toEqual(sorted(later.order));
      for (const id of out.off) expect(later.order, label).toContain(id);
      expect(applySectionEdit(later, entry ?? undefined), label).toEqual(out);
      // What the site's entry now amounts to is again an entry written the one way, and it gives the same page.
      const kept = diffSectionEdit(later, out);
      expect(applySectionEdit(later, kept ?? undefined), label).toEqual(out);
      if (kept) expect(kept.order.length + kept.off.length, label).toBeGreaterThan(0);
      // A section the release added, which the entry cannot name, is as the release has it: on or off.
      for (const id of ["new-1", "new-2", "renamed"]) if (later.order.includes(id)) expect(out.off.includes(id), `${label} ${id}`).toBe(later.off.includes(id));
    }
  });

  it("is followed in its order by a site that only switched sections off: the entry names no order, so the release's is the page's", () => {
    const next = seeded(4);
    let followed = 0;
    for (let run = 0; run < 3000; run++) {
      const below = { ...anyLayout(next), off: [] };
      // The site switches some off, and moves nothing.
      const entry = diffSectionEdit(below, { order: below.order, off: some(below.order, next) });
      if (!entry) continue;
      expect(entry.order, `run ${run}`).toEqual([]);
      const later = release(below, next);
      const out = applySectionEdit(later, entry);
      expect(out.order, `run ${run}: ${JSON.stringify({ below, entry, later })}`).toEqual(later.order);
      // Off: what the site switched off and the page still has, and what the release itself has off.
      expect(sorted(out.off), `run ${run}`).toEqual(sorted(later.order.filter((id) => entry.off.includes(id) || later.off.includes(id))));
      followed++;
    }
    expect(followed).toBeGreaterThan(2000);
  });

  it("keeps a site's own order where the site moved a section, and puts what the release added after the section it follows in the release", () => {
    // The site moved "c" to the top. The release then adds "n" after "b", removes "d", and moves "a" to the end.
    const below = { order: ["a", "b", "c", "d"], off: [] };
    const entry = diffSectionEdit(below, { order: ["c", "a", "b", "d"], off: [] })!;
    expect(applySectionEdit({ order: ["b", "n", "c", "a"], off: [] }, entry)).toEqual({ order: ["c", "a", "b", "n"], off: [] });
    // A whole order names every section, so it also says each is on: a section the release switches off LATER stays
    // on at a site that has moved anything. Known, and the Pages screen shows such a page as differing from the release.
    expect(applySectionEdit({ order: ["a", "b", "c", "d"], off: ["d"] }, entry)).toEqual({ order: ["c", "a", "b", "d"], off: [] });
    // Where the site only switched one off, the release's later switch is followed.
    expect(applySectionEdit({ order: ["a", "b", "c", "d"], off: ["d"] }, { order: [], off: ["a"] })).toEqual({ order: ["a", "b", "c", "d"], off: ["a", "d"] });
  });
});

describe("mergeOrder", () => {
  it("is a permutation of the base for any stored order, keeps the stored order of the ids it names, and is the base for an order in the base's own order", () => {
    const next = seeded(6);
    for (let run = 0; run < 3000; run++) {
      const base = shuffled(some(POOL, next, 0.7), next);
      const stored = [...shuffled(some(POOL, next, 0.5), next), ...some(["gone", "a", "b"], next, 0.4)];
      const out = mergeOrder(base, stored);
      const label = `run ${run}: ${JSON.stringify({ base, stored, out })}`;
      expect(sorted(out), label).toEqual(sorted(base));
      const named = [...new Set(stored)].filter((id) => base.includes(id));
      expect(out.filter((id) => named.includes(id)), label).toEqual(named);
      // Naming some of the base's ids in the base's own order moves nothing.
      expect(mergeOrder(base, some(base, next, 0.5)), label).toEqual(base);
      expect(mergeOrder(base, out), label).toEqual(out);
    }
  });
});

describe("what is stored for the real pages", () => {
  it("reads names no page or section can have as nothing: a prototype's key, a fixed section, an id twice", () => {
    const stored = JSON.parse(
      '{"format":1,"text":{},"lists":{},"sections":{"__proto__":{"order":["hero"],"off":["hero"]},"constructor":{"order":["hero"],"off":[]},"home":{"order":["__proto__","constructor","price","price","hero","title","nope"],"off":["hasOwnProperty","price","price","toString"]},"howItWorks":{"order":["title"],"off":["title"]},"shared":{"order":["nav"],"off":["nav"]}}}',
    );
    const read = parseOverlay(stored);
    expect(Object.keys(read.sections)).toEqual(["home"]);
    expect(read.sections.home).toEqual({ order: ["price", "hero"], off: ["price"] });
    expect(Object.getPrototypeOf(read.sections)).toBe(Object.prototype);
    const home = layoutOn(read, "home");
    expect(sorted(home.order)).toEqual(sorted(codeLayout("home").order));
    // The two it names, in its order: Price before Hero. A section it does not name still follows the one it follows
    // in code (KTD4): Questions and Closing after Price, The problem after Hero.
    expect(home.order).toEqual(["price", "questions", "closing", "hero", "problem", "examples", "compounds", "testimonials", "control"]);
    expect(home.off).toEqual(["price"]);
    expect(sectionsShown("howItWorks", read)).toEqual(codeLayout("howItWorks").order);
    // The strict reading, for the release file, refuses the whole of it and says why.
    const strict = parseOverlayStrict(stored);
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.problems.join(" ")).toContain("holds an id twice");
    // And with the shape made right, it names the section that cannot be moved and the page that is none.
    const shaped = parseOverlayStrict({ ...emptyOverlay, sections: { howItWorks: { order: ["title"], off: [] }, nope: { order: [], off: [] } } });
    expect(shaped.ok).toBe(false);
    if (!shaped.ok) expect(shaped.problems).toEqual(['sections.howItWorks: "title" is not a section of this page that can be moved or switched off', "sections.nope: no such page"]);
  });

  it("normalises any stored entry of a real page to one that says the same, once and for all", () => {
    const next = seeded(8);
    for (const pageId of ["home", "howItWorks", "faq", "about", "library"]) {
      const ids = codeLayout(pageId).order;
      for (let run = 0; run < 300; run++) {
        const stored = { ...emptyOverlay, sections: { [pageId]: { order: next() < 0.3 ? [] : shuffled(some(ids, next, 0.7), next), off: some(ids, next) } } };
        const once = normaliseOverlay(baseline, stored);
        expect(normaliseOverlay(baseline, once), `${pageId} run ${run}`).toEqual(once);
        expect(layoutOn(once, pageId), `${pageId} run ${run}`).toEqual(layoutOn(stored, pageId));
        for (const entry of Object.values(once.sections)) expect(entry.order.length + entry.off.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("any run of presses on a page's section controls, in the store", () => {
  let query: Query;
  beforeEach(async () => {
    ({ query } = await testDb());
  });

  /** One press, on paper. */
  const pressed = (layout: Layout, op: "off" | "on" | "up" | "down", section: string): Layout => {
    if (op === "off") return { order: layout.order, off: layout.order.filter((id) => id === section || layout.off.includes(id)) };
    if (op === "on") return { order: layout.order, off: layout.off.filter((id) => id !== section) };
    const at = layout.order.indexOf(section);
    const to = op === "up" ? at - 1 : at + 1;
    if (to < 0 || to >= layout.order.length) return layout;
    const order = [...layout.order];
    [order[at], order[to]] = [order[to], order[at]];
    return { order, off: order.filter((id) => layout.off.includes(id)) };
  };

  it("ends where the same presses end on paper, stores the page's one entry written the one way, and no entry once the page is the original again", async () => {
    const next = seeded(9);
    const original = sectionLayout(baseline, "home");
    let paper = original;
    for (let run = 0; run < 120; run++) {
      const op = (["off", "on", "up", "down"] as const)[Math.floor(next() * 4)];
      const section = original.order[Math.floor(next() * original.order.length)];
      const before = paper;
      paper = pressed(paper, op, section);
      const saved = await saveSections(query, { page: "home", op, section });
      const label = `press ${run}: ${op} ${section}`;
      expect(saved, label).toMatchObject({ ok: true, changed: !sameLayout(before, paper) });
      const { draft, published } = await readStored(query);
      expect(layoutOn(draft, "home"), label).toEqual(paper);
      expect(published.sections, label).toEqual({});
      const entry = diffSectionEdit(original, paper);
      expect(draft.sections, label).toEqual(entry ? { home: entry } : {});
    }
    // And every press undone in turn, or the reset, leaves no entry at all.
    expect(await saveSections(query, { page: "home", op: "reset" })).toMatchObject({ ok: true });
    expect((await readStored(query)).draft.sections).toEqual({});
  }, 60_000);

  it("never lets a press on one page touch another page's sections, and refuses a section of another page", async () => {
    await saveSections(query, { page: "faq", op: "off", section: "startBand" });
    expect(await saveSections(query, { page: "home", op: "off", section: "startBand" })).toEqual({ ok: false, reason: "unknown-section" });
    expect(await saveSections(query, { page: "home", op: "up", section: "getting-started" })).toEqual({ ok: false, reason: "unknown-section" });
    await saveSections(query, { page: "home", op: "up", section: "closing" });
    await saveSections(query, { page: "home", op: "reset" });
    expect((await readStored(query)).draft.sections).toEqual({ faq: { order: [], off: ["startBand"] } });
  });
});

describe("what the review says about any two layouts of a page (sectionChanges, linkWarnings)", () => {
  const HOME = codeLayout("home").order;
  const entryFor = (layout: Layout): Overlay => {
    const entry = diffSectionEdit(sectionLayout(baseline, "home"), layout);
    return { ...emptyOverlay, sections: entry ? { home: entry } : {} };
  };
  /** The length of the longest run of ids in both orders, in the same order. */
  const longest = (a: readonly string[], b: readonly string[]) => {
    const run = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) run[i][j] = a[i] === b[j] ? run[i + 1][j + 1] + 1 : Math.max(run[i + 1][j], run[i][j + 1]);
    return run[0][0];
  };

  it("says one sentence for each switch and for as few moves as explain the order, never names a section that is not there, and nothing when nothing nets", () => {
    const next = seeded(12);
    for (let run = 0; run < 1500; run++) {
      const from = next() < 0.2 ? sectionLayout(baseline, "home") : anyLayout(next, HOME);
      const to = next() < 0.1 ? from : anyLayout(next, HOME);
      const changes = sectionChanges({ published: entryFor(from), draft: entryFor(to) });
      const label = `run ${run}: ${JSON.stringify({ from, to, says: changes.map((change) => change.says) })}`;
      for (const change of changes) {
        expect(change.says, label).not.toMatch(/undefined|“”/);
        expect(change.says.startsWith("Home: "), label).toBe(true);
      }
      expect(changes.filter((change) => change.kind === "off").map((change) => change.section.id), label).toEqual(to.order.filter((id) => to.off.includes(id) && !from.off.includes(id)));
      expect(changes.filter((change) => change.kind === "on").map((change) => change.section.id), label).toEqual(to.order.filter((id) => !to.off.includes(id) && from.off.includes(id)));
      expect(changes.filter((change) => change.kind === "moved"), label).toHaveLength(HOME.length - longest(from.order, to.order));
      expect(changes.length === 0, label).toBe(sameLayout(from, to));
      // One key for each row of the review's list.
      const keys = changes.map((change) => `${change.kind}:${change.section.id}`);
      expect(new Set(keys).size, label).toBe(keys.length);
    }
  });

  it("reads a section moved down three and then up one as the one move it nets to, and a move taken back as no change", () => {
    const original = sectionLayout(baseline, "home");
    const moved = (order: string[], id: string, by: number) => {
      const at = order.indexOf(id);
      const out = order.filter((other) => other !== id);
      out.splice(at + by, 0, id);
      return out;
    };
    const net = moved(moved(original.order, "problem", 3), "problem", -1);
    expect(sectionChanges({ published: emptyOverlay, draft: entryFor({ order: net, off: [] }) }).map((change) => change.says)).toEqual(["Home: “The problem” moves down, below “It compounds”."]);
    expect(sectionChanges({ published: emptyOverlay, draft: entryFor({ order: moved(net, "problem", -2), off: [] }) })).toEqual([]);
    expect(entryFor({ order: moved(net, "problem", -2), off: [] }).sections).toEqual({});
  });

  it("warns about a link only when the section it lands on is off, never because the section moved", () => {
    const next = seeded(13);
    for (let run = 0; run < 500; run++) {
      const to = anyLayout(next, HOME);
      const warnings = linkWarnings({ draft: entryFor(to) });
      const label = `run ${run}: ${JSON.stringify(to)}`;
      expect(warnings.map((warning) => warning.href), label).toEqual(to.off.includes("price") ? ["/#price"] : []);
      expect(linkWarnings({ draft: entryFor({ order: to.order, off: [] }) }), label).toEqual([]);
    }
  });
});
