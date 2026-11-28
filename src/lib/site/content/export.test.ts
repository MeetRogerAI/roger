/**
 * The release overlay (plan U10, KTD9, R19, AE5, AE6) and what a release does
 * to the sites' own content afterwards (KTD6).
 *
 * Every case hands the functions its own release file, so nothing here
 * depends on what src/data/site/released.json holds today.
 */
import { describe, expect, it } from "vitest";
import { testDb } from "@/test-helpers/pglite-db";
import type { Query } from "@/lib/db-query";
import { draftCount, pageStatus } from "./check";
import { releaseDifferences } from "./differs";
import { canonicalOverlay, releaseExport } from "./export";
import { emptyOverlay, newOverlay, parseOverlay, parseOverlayStrict, type Overlay } from "./format";
import { applyOverlay, codeModel, layoutOn, listItems, normaliseOverlay, readField, textAt } from "./model";
import { TOGGLE_OFF, TOGGLE_ON, resolveField, siteRegistry } from "./registry";
import { canonical, parseStored, publish, readPublished, readStored, saveDraft, saveList, saveSections } from "./store";

const ADMIN = "admin@example.com";
const HEADLINE = "home.hero.headline";
const SUB = "home.hero.sub";
const COMPOUNDS_TITLE = "home.compounds.title";
const STATEMENTS = "home.problem.statements";
const ALONE = `${STATEMENTS}.alone.text`;
const COST_A = "questions.price-and-billing.items.cost.a";
const NAV_PRICING = "nav.pricing.label";
const FOOTER_PRICING = "footer.links.pricing.label";

const overlay = (o: Partial<Overlay> = {}): Overlay => ({ ...newOverlay(), ...o });
const edits = (text: Record<string, string>) => overlay({ text });
/** The baseline a release file makes. */
const baseOf = (released: Overlay) => applyOverlay(codeModel, parseOverlay(released));
const exported = (published: Overlay, released: Overlay = emptyOverlay) => {
  const out = releaseExport(published, { released });
  if (!out.ok) throw new Error(`the export was refused: ${out.problems.join("; ")}`);
  return out.overlay;
};
const original = (id: string) => textAt(codeModel, id)!;

describe("the release overlay", () => {
  it("holds a published edit, and once it is the release file the same stored entry is no edit (plan AE5, KTD6)", () => {
    const published = edits({ [HEADLINE]: "Preview's headline." });
    const release = exported(published);
    expect(release.text).toEqual({ [HEADLINE]: "Preview's headline." });

    const base = baseOf(release);
    expect(base.home.hero.headline).toBe("Preview's headline.");
    const stored = parseStored({ draft: published, published, previous: null }, base);
    expect(stored.published).toEqual(newOverlay());
    expect(stored.draft).toEqual(newOverlay());
    expect(pageStatus(stored, base).get("home")).toMatchObject({ drafts: 0, edits: 0 });
    expect(releaseDifferences(stored.published, { base, released: release }).count).toBe(0);
  });

  it("is the site's release file, unchanged, when the site has published nothing of its own", () => {
    const released = canonicalOverlay(
      overlay({ text: { [HEADLINE]: "Released headline.", [ALONE]: "A released statement." }, sections: { home: { order: [], off: ["compounds"] } }, lists: { [STATEMENTS]: { order: [], removed: ["alone"], added: [] } } }),
    );
    expect(exported(emptyOverlay, released)).toEqual(released);
    expect(canonical(exported(emptyOverlay, released))).toBe(canonical(released));
    expect(exported(emptyOverlay)).toEqual(newOverlay());
  });

  it("carries the site's edit over the release file's, and the release file's where the site has none", () => {
    const released = edits({ [HEADLINE]: "Released headline.", [SUB]: "Released sub-line." });
    expect(exported(edits({ [HEADLINE]: "Preview's headline." }), released).text).toEqual({ [HEADLINE]: "Preview's headline.", [SUB]: "Released sub-line." });
    // A site that put the code's own wording back over a released one releases the code's wording: no entry.
    expect(exported(edits({ [SUB]: original(SUB) }), released).text).toEqual({ [HEADLINE]: "Released headline." });
  });

  it("leaves out an edit to a field of a section the site has switched off, and carries the switch (plan KTD9)", () => {
    const published = overlay({ text: { [COMPOUNDS_TITLE]: "Hidden wording, never seen." }, sections: { home: { order: [], off: ["compounds"] } } });
    const release = exported(published);
    expect(release.text).toEqual({});
    expect(release.sections).toEqual({ home: { order: [], off: ["compounds"] } });
  });

  it("keeps the release file's wording for a field whose section is now off, whatever the database holds", () => {
    const released = edits({ [COMPOUNDS_TITLE]: "Released compounds heading." });
    const published = overlay({ text: { [COMPOUNDS_TITLE]: "Hidden wording, never seen." }, sections: { home: { order: [], off: ["compounds"] } } });
    expect(exported(published, released).text).toEqual({ [COMPOUNDS_TITLE]: "Released compounds heading." });
  });

  it("leaves out an edit to an item the site has removed, and carries the removal, with the release file's wording for it", () => {
    const published = overlay({ text: { [ALONE]: "Edited, then removed." }, lists: { [STATEMENTS]: { order: [], removed: ["alone"], added: [] } } });
    const release = exported(published);
    expect(release.text).toEqual({});
    expect(release.lists).toEqual({ [STATEMENTS]: { order: [], removed: ["alone"], added: [] } });
    expect(exported(published, edits({ [ALONE]: "Released statement." })).text).toEqual({ [ALONE]: "Released statement." });
  });

  it("takes a list in a section that is off from the release file: an item added there is not carried", () => {
    const list = siteRegistry.lists.get(STATEMENTS)!;
    const published = overlay({ text: { [`${STATEMENTS}.x-hidden1.text`]: "Added where nobody sees it." }, sections: { home: { order: [], off: [list.section] } }, lists: { [STATEMENTS]: { order: [], removed: [], added: ["x-hidden1"] } } });
    const release = exported(published);
    expect(release.lists).toEqual({});
    expect(Object.keys(release.text)).toEqual([]);
    // And with the section on, the item and its text are carried, and pass the strict reading.
    const shown = exported({ ...published, sections: {} });
    expect(shown.lists).toEqual({ [STATEMENTS]: { order: [], removed: [], added: ["x-hidden1"] } });
    expect(shown.text).toEqual({ [`${STATEMENTS}.x-hidden1.text`]: "Added where nobody sees it." });
  });

  it("writes an edit stored under an old name under the names it has now (plan U8)", () => {
    const release = exported(parseOverlay({ format: 1, text: { "nav.pricing": "Plans" }, sections: {}, lists: {} }));
    expect(release.text).toEqual({ [FOOTER_PRICING]: "Plans", [NAV_PRICING]: "Plans" });
    expect(Object.keys(release.text)).not.toContain("nav.pricing");
  });

  it("refuses, with what to fix in plain words, a published wording longer than its field allows today", () => {
    const long = "A header label of thirty chars";
    const out = releaseExport(parseOverlay({ format: 1, text: { "nav.pricing": long }, sections: {}, lists: {} }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.problems).toHaveLength(2);
    expect(out.problems.join("\n")).toContain(`(${NAV_PRICING}): ${long.length} characters, and the most is 24.`);
    expect(out.problems.join("\n")).toContain("Shorten it in Pages on this site and publish, then take the snapshot again.");
  });

  it("is canonical and strict: keys in order, no empty entry, and the strict reading passes for a rich site", () => {
    const toggle = "questions.getting-started.items.no-agents-yet.home";
    const flipped = readField(codeModel, resolveField(toggle)!) === TOGGLE_ON ? TOGGLE_OFF : TOGGLE_ON;
    const order = [...layoutOn(emptyOverlay, "home", codeModel).order].reverse();
    const published = overlay({
      text: { [SUB]: "Sub.", [HEADLINE]: "Head.", [toggle]: flipped, [`${STATEMENTS}.x-abc123.text`]: "New statement." },
      sections: { home: { order, off: ["compounds"] } },
      lists: { [STATEMENTS]: { order: [], removed: ["alone"], added: ["x-abc123"] } },
    });
    const release = exported(published);
    expect(parseOverlayStrict(JSON.parse(JSON.stringify(release))).ok).toBe(true);
    expect(JSON.stringify(release)).toBe(canonical(release));
    expect(Object.keys(release.text)).toEqual([...Object.keys(release.text)].sort());
    for (const entry of Object.values(release.sections)) expect(entry.order.length + entry.off.length).toBeGreaterThan(0);
    for (const entry of Object.values(release.lists)) expect(entry.order.length + entry.removed.length + entry.added.length).toBeGreaterThan(0);
  });

  it("holds only the overlay: no draft, no previous content, nobody's name and no time", () => {
    const release = exported(edits({ [HEADLINE]: "Head." }));
    expect(Object.keys(release).sort()).toEqual(["format", "lists", "sections", "text"]);
  });
});

describe("a release, from preview's database to the repo and back (plan KTD6)", () => {
  /** Preview publishes edits of every kind, as the Pages screens store them. */
  async function previewPublishes(q: Query, base: unknown) {
    const toggle = "questions.getting-started.items.no-agents-yet.home";
    const flipped = readField(base, resolveField(toggle)!) === TOGGLE_ON ? TOGGLE_OFF : TOGGLE_ON;
    expect((await saveDraft(q, [{ field: HEADLINE, text: "Preview's headline." }, { field: COST_A, text: "{monthlyUsd} a month, all in." }, { field: NAV_PRICING, text: "Plans" }, { field: toggle, text: flipped }], base)).ok).toBe(true);
    expect((await saveSections(q, { page: "home", op: "off", section: "compounds" }, base)).ok).toBe(true);
    expect((await saveSections(q, { page: "home", op: "up", section: "questions" }, base)).ok).toBe(true);
    expect((await saveList(q, { list: STATEMENTS, op: "remove", item: "alone" }, base)).ok).toBe(true);
    expect((await saveList(q, { list: STATEMENTS, op: "add", id: "x-preview1", fields: new Map([["text", "A statement added on preview."]]) }, base)).ok).toBe(true);
    expect((await saveList(q, { list: STATEMENTS, op: "up", item: "x-preview1" }, base)).ok).toBe(true);
    const { draft } = await readStored(q, base);
    expect((await publish(q, ADMIN, draft, { base })).ok).toBe(true);
  }

  it("leaves nothing to clear on preview: after the snapshot, every stored edit equals the new baseline and Pages lists no difference", async () => {
    const { query: q } = await testDb();
    const before = baseOf(emptyOverlay);
    await previewPublishes(q, before);
    const published = await readPublished(q, before);
    const release = exported(published);
    // What the repo gets is what preview shows.
    const after = baseOf(release);
    const shown = applyOverlay(before, published);
    expect(after.home.hero.headline).toBe(shown.home.hero.headline);
    expect(listItems(after, STATEMENTS)).toEqual(listItems(shown, STATEMENTS));
    expect(layoutOn(emptyOverlay, "home", after)).toEqual(layoutOn(published, "home", before));

    // The next build reads the same row against the new baseline: nothing is an edit any more.
    const stored = await readStored(q, after);
    expect(stored.published).toEqual(newOverlay());
    expect(stored.draft).toEqual(newOverlay());
    expect(draftCount(stored, after)).toBe(0);
    for (const status of pageStatus(stored, after).values()) expect(status).toEqual({ drafts: 0, edits: 0, ticks: 0, rearranged: false, relisted: false });
    const differences = releaseDifferences(stored.published, { base: after, released: release, written: { draft: stored.draft, published: stored.published } });
    expect(differences).toMatchObject({ count: 0, pushedOut: [], wholeOrder: [] });
    // And preview's next export, with nothing new published, is the release file itself.
    expect(exported(stored.published, release)).toEqual(release);
  });

  it("leaves a hidden field's edit on preview as preview's own: it was never released (plan KTD9)", async () => {
    const { query: q } = await testDb();
    const before = baseOf(emptyOverlay);
    await saveDraft(q, [{ field: COMPOUNDS_TITLE, text: "Hidden wording." }], before);
    await saveSections(q, { page: "home", op: "off", section: "compounds" }, before);
    await publish(q, ADMIN, (await readStored(q, before)).draft, { base: before });
    const release = exported(await readPublished(q, before));
    const after = baseOf(release);
    const stored = await readStored(q, after);
    expect(stored.published.text).toEqual({ [COMPOUNDS_TITLE]: "Hidden wording." });
    expect(releaseDifferences(stored.published, { base: after, released: release }).texts.map((change) => change.field.id)).toEqual([COMPOUNDS_TITLE]);
  });

  it("covers AE6: a publish on one database changes that site's reader and nothing in what another site exports", async () => {
    const [{ query: preview }, { query: production }] = await Promise.all([testDb(), testDb()]);
    const released = edits({ [HEADLINE]: "Released headline." });
    const base = baseOf(released);
    await saveDraft(production, [{ field: COST_A, text: "Production's own answer, {monthlyUsd}." }], base);
    await publish(production, ADMIN, (await readStored(production, base)).draft, { base });
    expect((await readPublished(production, base)).text).toEqual({ [COST_A]: "Production's own answer, {monthlyUsd}." });
    expect(await readPublished(preview, base)).toEqual(newOverlay());
    expect(exported(await readPublished(preview, base), released)).toEqual(canonicalOverlay(released));
  });
});

describe("what the list of differences says beside a difference (plan U10, R21)", () => {
  const released = overlay({ sections: { home: { order: [], off: ["compounds"] } } });
  const base = baseOf(released);
  const differences = (published: Overlay) => releaseDifferences(normaliseOverlay(base, published), { base, released });

  it("calls a page's sections a whole order only when the site has moved one, not when it only switches one back on", () => {
    const on = differences(overlay({ sections: { home: { order: ["compounds"], off: [] } } }));
    expect(on.sections.map((change) => change.kind)).toEqual(["on"]);
    expect(on.wholeOrder).toEqual([]);
    const order = [...layoutOn(emptyOverlay, "home", base).order].reverse();
    const moved = differences(overlay({ sections: { home: { order, off: ["compounds"] } } }));
    expect(moved.wholeOrder.map((page) => page.id)).toEqual(["home"]);
  });

  it("marks as unseen a field whose section is off, whoever switched it off, and words printed elsewhere only when every place is off", () => {
    const hiddenByRelease = differences(edits({ [COMPOUNDS_TITLE]: "Under a section the release has off." }));
    expect(hiddenByRelease.hidden.fields).toEqual([COMPOUNDS_TITLE]);
    expect(hiddenByRelease.hidden.sections).toContain("home.compounds");
    // The examples' copy button is on How it works too: off on Home alone, it is still seen.
    const copy = "sample.install.copy";
    expect(differences(overlay({ text: { [copy]: "Copy it" }, sections: { home: { order: [], off: ["compounds", "examples"] } } })).hidden.fields).toEqual([]);
    expect(differences(overlay({ text: { [copy]: "Copy it" }, sections: { home: { order: [], off: ["compounds", "examples"] }, howItWorks: { order: [], off: ["anatomy"] } } })).hidden.fields).toEqual([copy]);
    expect(differences(edits({ [SUB]: "Seen." })).hidden.fields).toEqual([]);
  });
});
