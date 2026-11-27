/**
 * The "site.content" row (plan U4, KTD5): what each write stores, and that
 * each is one statement that cannot undo another. Everything runs against an
 * in-process Postgres, because the guarantees are the statements' own
 * (docs/solutions/best-practices/test-claim-sql-on-pglite-…).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { builtInQuestions, v1 } from "@/data/site/v1";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { emptyOverlay, newOverlay, type Overlay } from "./format";
import { applyOverlay, baseline, codeModel } from "./model";
import { siteRegistry } from "./registry";
import { CONTENT_KEY, LEGACY_QUESTIONS_KEY, changedBetween, legacyQuestionOverlay, parseStored, publish, readPublished, readStored, sameOverlay, saveDraft, saveSections, undoPublish } from "./store";

const ADMIN = "admin@example.com";
const HEADLINE = "home.hero.headline";
const SUB = "home.hero.sub";
const START = "buttons.start";
const COST_A = "questions.price-and-billing.items.cost.a";
const REFUND_Q = "questions.price-and-billing.items.refund.q";
const REFUND_A = "questions.price-and-billing.items.refund.a";

const edits = (text: Record<string, string>): Overlay => ({ ...newOverlay(), text });
const none = edits({});

let query: Query;
/** Every statement the code under test ran, in order. */
let ran: string[];
beforeEach(async () => {
  const { query: db } = await testDb();
  ran = [];
  query = (async (text: string, params?: unknown[]) => {
    ran.push(text.trim().split(/\s+/).slice(0, 3).join(" "));
    return db(text, params);
  }) as Query;
});

const value = async (key = CONTENT_KEY) => (await query<{ value: unknown }>("select value from settings where key = $1", [key]))[0]?.value;
const put = (key: string, stored: unknown) =>
  query("insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [key, JSON.stringify(stored)]);
const log = () => query<{ admin_email: string; action: string; detail: Record<string, unknown> }>("select admin_email, action, detail from admin_actions order by id");
/** The statements that wrote to the settings table since `ran` was last emptied. */
const writes = () => ran.filter((statement) => /^(insert into settings|update settings)/.test(statement));

describe("before anything is stored", () => {
  it("has no row, no draft and nothing published, so every page shows the baseline", async () => {
    expect(await readStored(query)).toEqual({ draft: none, published: none, previous: null, stored: false });
    expect(await readPublished(query)).toEqual(none);
    expect(await value()).toBeUndefined();
  });

  it("reads with one statement", async () => {
    await readPublished(query);
    expect(ran).toEqual(["select key, value::text"]);
  });
});

describe("saving into the draft", () => {
  it("stores the wording in the draft only: what is published does not change until it is published", async () => {
    const saved = await saveDraft(query, [{ field: HEADLINE, text: "Smarter every Monday." }]);
    expect(saved).toMatchObject({ ok: true, changed: true });
    expect(await value()).toEqual({ draft: edits({ [HEADLINE]: "Smarter every Monday." }), published: none, previous: null });
    expect(await readPublished(query)).toEqual(none);
    expect((await readStored(query)).stored).toBe(true);
    // A save is not live, so it is not in the admin log. Publishing is.
    expect(await log()).toEqual([]);
  });

  it("is one statement on the one row, and leaves every other setting alone", async () => {
    await put("v3.signupOpen", true);
    ran = [];
    await saveDraft(query, [{ field: HEADLINE, text: "Smarter every Monday." }]);
    expect(writes()).toEqual(["insert into settings"]);
    ran = [];
    await saveDraft(query, [{ field: SUB, text: "A new sub-line." }]);
    expect(writes()).toEqual(["update settings set"]);
    expect(await query("select key from settings order by key")).toEqual([{ key: CONTENT_KEY }, { key: "v3.signupOpen" }]);
    expect(await value("v3.signupOpen")).toBe(true);
  });

  it("keeps both of two saves of different fields that run together", async () => {
    await saveDraft(query, [{ field: START, text: "Start now" }]);
    const both = await Promise.all([saveDraft(query, [{ field: HEADLINE, text: "Smarter every Monday." }]), saveDraft(query, [{ field: SUB, text: "A new sub-line." }])]);
    expect(both.map((r) => r.ok)).toEqual([true, true]);
    expect((await readStored(query)).draft.text).toEqual({ [START]: "Start now", [HEADLINE]: "Smarter every Monday.", [SUB]: "A new sub-line." });
  });

  it("keeps both of two first-ever writes that run together, in one row", async () => {
    await put(LEGACY_QUESTIONS_KEY, { refund: { a: "No. You can cancel any time." } });
    const both = await Promise.all([saveDraft(query, [{ field: HEADLINE, text: "Smarter every Monday." }]), saveDraft(query, [{ field: SUB, text: "A new sub-line." }])]);
    expect(both.map((r) => r.ok)).toEqual([true, true]);
    expect(await query("select key from settings where key = $1", [CONTENT_KEY])).toHaveLength(1);
    const stored = await readStored(query);
    // Both changes, on top of the questions that were saved before the row existed.
    expect(stored.draft.text).toEqual({ [REFUND_A]: "No. You can cancel any time.", [HEADLINE]: "Smarter every Monday.", [SUB]: "A new sub-line." });
    expect(stored.published.text).toEqual({ [REFUND_A]: "No. You can cancel any time." });
  });

  it("removes the entry when the value saved is the baseline's, and when the text is null", async () => {
    await saveDraft(query, [
      { field: HEADLINE, text: "Smarter every Monday." },
      { field: SUB, text: "A new sub-line." },
    ]);
    expect(await saveDraft(query, [{ field: HEADLINE, text: v1.home.hero.headline }])).toMatchObject({ ok: true, changed: true });
    expect((await readStored(query)).draft.text).toEqual({ [SUB]: "A new sub-line." });
    await saveDraft(query, [{ field: SUB, text: null }]);
    expect(await value()).toEqual({ draft: none, published: none, previous: null });
  });

  it("writes nothing when nothing would change", async () => {
    // The built-in wording saved on a site with no row: no row is made for it.
    expect(await saveDraft(query, [{ field: HEADLINE, text: v1.home.hero.headline }])).toMatchObject({ ok: true, changed: false });
    expect(await value()).toBeUndefined();
    await saveDraft(query, [{ field: HEADLINE, text: "Smarter every Monday." }]);
    ran = [];
    expect(await saveDraft(query, [{ field: HEADLINE, text: "Smarter every Monday." }])).toMatchObject({ ok: true, changed: false });
    expect(writes()).toEqual([]);
  });

  it("refuses what could not be stored truthfully, all of the changes or none", async () => {
    const good = { field: HEADLINE, text: "Smarter every Monday." };
    expect(await saveDraft(query, [good, { field: "home.hero.nothing", text: "x" }])).toEqual({ ok: false, reason: "unknown-field", field: "home.hero.nothing" });
    expect(await saveDraft(query, [good, { field: "__proto__", text: "x" }])).toMatchObject({ ok: false, reason: "unknown-field" });
    expect(await saveDraft(query, [good, { field: COST_A, text: "It costs {monthlyUsdd} a month." }])).toEqual({ ok: false, reason: "unusable", field: COST_A });
    expect(await saveDraft(query, [good, { field: SUB, text: "   " }])).toEqual({ ok: false, reason: "unusable", field: SUB });
    const max = siteRegistry.fields.get(START)!.max;
    expect(await saveDraft(query, [good, { field: START, text: "x".repeat(max + 1) }])).toEqual({ ok: false, reason: "too-long", field: START });
    expect(await saveDraft(query, [{ field: START, text: "x".repeat(max) }])).toMatchObject({ ok: true });
    // Nothing of the refused saves is there.
    expect((await readStored(query)).draft.text).toEqual({ [START]: "x".repeat(max) });
  });

  it("gives way, storing nothing, when other writes keep getting in first", async () => {
    await saveDraft(query, [{ field: START, text: "Start now" }]);
    const real = query;
    let n = 0;
    // Someone else's write lands between every read and the statement that follows it.
    const contested = (async (text: string, params?: unknown[]) => {
      if (text.startsWith("update settings")) await real("update settings set value = jsonb_set(value, '{draft,text,home.hero.sub}', to_jsonb($2::text)) where key = $1", [CONTENT_KEY, `Sub-line ${++n}`]);
      return real(text, params);
    }) as Query;
    expect(await saveDraft(contested, [{ field: HEADLINE, text: "Smarter every Monday." }])).toEqual({ ok: false, reason: "busy" });
    expect(n).toBeGreaterThan(1);
    const { draft } = await readStored(query);
    expect(draft.text[HEADLINE]).toBeUndefined();
    expect(draft.text[START]).toBe("Start now");
  });
});

describe("publishing", () => {
  it("makes published the checked draft and previous the old published content, in one statement, and logs who", async () => {
    await saveDraft(query, [{ field: HEADLINE, text: "First headline." }]);
    const first = (await readStored(query)).draft;
    expect(await publish(query, ADMIN, first)).toMatchObject({ ok: true, changed: true });
    await saveDraft(query, [
      { field: HEADLINE, text: "Second headline." },
      { field: SUB, text: "A new sub-line." },
    ]);
    const second = (await readStored(query)).draft;
    ran = [];
    expect(await publish(query, "second@example.com", second, { note: { from: "test" } })).toMatchObject({ ok: true, changed: true });
    // One read, the one statement that publishes, and then the log row.
    expect(ran).toEqual(["select key, value::text", "update settings set", "insert into admin_actions"]);
    expect(await value()).toEqual({ draft: second, published: second, previous: first });
    expect(await readPublished(query)).toEqual(edits({ [HEADLINE]: "Second headline.", [SUB]: "A new sub-line." }));
    // The log names what changed, not the text.
    expect(await log()).toEqual([
      { admin_email: ADMIN, action: "site_content_published", detail: { changed: [HEADLINE] } },
      { admin_email: "second@example.com", action: "site_content_published", detail: { from: "test", changed: [HEADLINE, SUB] } },
    ]);
  });

  it("changes nothing, and says so, when the stored draft is no longer the one that was checked", async () => {
    await saveDraft(query, [{ field: HEADLINE, text: "Checked headline." }]);
    const checked = (await readStored(query)).draft;
    // A save from another tab, between the review and the publish.
    await saveDraft(query, [{ field: SUB, text: "Unread sub-line." }]);
    const before = await value();
    ran = [];
    expect(await publish(query, ADMIN, checked)).toEqual({ ok: false, reason: "draft-changed" });
    expect(writes()).toEqual([]);
    expect(await value()).toEqual(before);
    expect(await readPublished(query)).toEqual(none);
    expect(await log()).toEqual([]);
  });

  it("changes nothing, and says so, when what is live is no longer what the list of changes was made against", async () => {
    await saveDraft(query, [{ field: HEADLINE, text: "First headline." }]);
    await publish(query, ADMIN, (await readStored(query)).draft);
    await saveDraft(query, [{ field: SUB, text: "A sub-line." }]);
    // The review lists one change, the sub-line, against a site that shows the first headline.
    const read = await readStored(query);
    // Another tab undoes the last publish: the same draft would now change the headline as well.
    await undoPublish(query, ADMIN);
    const before = await value();
    ran = [];
    expect(await publish(query, ADMIN, read.draft, { over: read.published })).toEqual({ ok: false, reason: "draft-changed" });
    expect(writes()).toEqual([]);
    expect(await value()).toEqual(before);
    expect(await readPublished(query)).toEqual(none);
    // Against what is live now, it goes through. Without `over` only the draft is compared, as before.
    expect(await publish(query, ADMIN, read.draft, { over: none })).toMatchObject({ ok: true, changed: true });
    expect((await readPublished(query)).text).toEqual({ [HEADLINE]: "First headline.", [SUB]: "A sub-line." });
  });

  it("has nothing to publish, and does not call it a change, when another tab has already made the same draft live", async () => {
    await saveDraft(query, [{ field: HEADLINE, text: "First headline." }]);
    const read = await readStored(query);
    await publish(query, ADMIN, read.draft);
    const before = await value();
    expect(await publish(query, ADMIN, read.draft, { over: read.published })).toMatchObject({ ok: true, changed: false });
    expect(await value()).toEqual(before);
  });

  it("compares the drafts by what they say, not by how they were written down", async () => {
    await saveDraft(query, [
      { field: HEADLINE, text: "A headline." },
      { field: SUB, text: "A sub-line." },
    ]);
    // The same entries in another order, with one that says what the baseline says.
    const checked = edits({ [SUB]: "A sub-line.", [START]: v1.buttons.start, [HEADLINE]: "A headline." });
    expect(await publish(query, ADMIN, checked)).toMatchObject({ ok: true, changed: true });
  });

  it("publishes nothing when the draft is what is live already, and keeps what undo would go back to", async () => {
    expect(await publish(query, ADMIN, emptyOverlay)).toMatchObject({ ok: true, changed: false });
    expect(await value()).toBeUndefined();
    await saveDraft(query, [{ field: HEADLINE, text: "A headline." }]);
    const draft = (await readStored(query)).draft;
    await publish(query, ADMIN, draft);
    ran = [];
    expect(await publish(query, ADMIN, draft)).toMatchObject({ ok: true, changed: false });
    expect(writes()).toEqual([]);
    expect((await readStored(query)).previous).toEqual(none);
    expect(await log()).toHaveLength(1);
  });
});

describe("undoing the last publish", () => {
  it("makes published what it was before, clears previous, and leaves the draft as it was", async () => {
    await saveDraft(query, [{ field: HEADLINE, text: "First headline." }]);
    await publish(query, ADMIN, (await readStored(query)).draft);
    await saveDraft(query, [{ field: HEADLINE, text: "Second headline." }]);
    await publish(query, ADMIN, (await readStored(query)).draft);
    await saveDraft(query, [{ field: SUB, text: "Still a draft." }]);
    const draft = (await readStored(query)).draft;

    ran = [];
    expect(await undoPublish(query, "second@example.com")).toMatchObject({ ok: true, changed: true });
    expect(writes()).toEqual(["update settings set"]);
    expect(await value()).toEqual({ draft, published: edits({ [HEADLINE]: "First headline." }), previous: null });
    expect((await log()).at(-1)).toEqual({ admin_email: "second@example.com", action: "site_content_publish_undone", detail: { changed: [HEADLINE] } });

    // A second undo has nothing to go back to.
    const before = await value();
    ran = [];
    expect(await undoPublish(query, ADMIN)).toMatchObject({ ok: true, changed: false });
    expect(writes()).toEqual([]);
    expect(await value()).toEqual(before);
    expect(await log()).toHaveLength(3);
  });

  it("goes back to no edits when that is what was published before, and does nothing on a site that never published", async () => {
    expect(await undoPublish(query, ADMIN)).toMatchObject({ ok: true, changed: false });
    expect(await value()).toBeUndefined();
    await saveDraft(query, [{ field: HEADLINE, text: "First headline." }]);
    await publish(query, ADMIN, (await readStored(query)).draft);
    expect(await undoPublish(query, ADMIN)).toMatchObject({ ok: true, changed: true });
    expect(await readPublished(query)).toEqual(none);
  });
});

describe("the questions saved before the row existed (plan R10)", () => {
  const legacy = { refund: { q: "Do you give refunds?", a: "No. You can cancel any time." }, cost: { a: "{monthlyUsd} a month, plus tax." } };
  const asOverlay = edits({ [REFUND_Q]: "Do you give refunds?", [REFUND_A]: "No. You can cancel any time.", [COST_A]: "{monthlyUsd} a month, plus tax." });

  it("are what the site has published while there is no content row, and nothing is written by reading them", async () => {
    await put(LEGACY_QUESTIONS_KEY, legacy);
    ran = [];
    expect(await readPublished(query)).toEqual(asOverlay);
    expect(await readStored(query)).toEqual({ draft: asOverlay, published: asOverlay, previous: null, stored: false });
    expect(writes()).toEqual([]);
    expect(await value()).toBeUndefined();
  });

  it("are stored as both draft and published by the first write, and the reader's answer does not change", async () => {
    await put(LEGACY_QUESTIONS_KEY, legacy);
    const before = await readPublished(query);
    await saveDraft(query, [{ field: HEADLINE, text: "Smarter every Monday." }]);
    expect(await value()).toEqual({ draft: edits({ ...asOverlay.text, [HEADLINE]: "Smarter every Monday." }), published: asOverlay, previous: null });
    expect(await readPublished(query)).toEqual(before);
    // The old row is left as it was, for a release that still reads it.
    expect(await value(LEGACY_QUESTIONS_KEY)).toEqual(legacy);
  });

  it("are carried over once: after the row exists the old row is not read for anything, so nothing comes back", async () => {
    await put(LEGACY_QUESTIONS_KEY, legacy);
    // The first write resets one of the old edits, and publishes.
    await saveDraft(query, [
      { field: REFUND_Q, text: null },
      { field: REFUND_A, text: null },
    ]);
    await publish(query, ADMIN, (await readStored(query)).draft);
    expect(await readPublished(query)).toEqual(edits({ [COST_A]: "{monthlyUsd} a month, plus tax." }));
    // The old row still has the edit that was reset, and a later write to it changes nothing either.
    await put(LEGACY_QUESTIONS_KEY, { ...legacy, "who-sees": { q: "Who can see my plays?" } });
    await saveDraft(query, [{ field: HEADLINE, text: "Smarter every Monday." }]);
    expect(await readPublished(query)).toEqual(edits({ [COST_A]: "{monthlyUsd} a month, plus tax." }));
    expect((await readStored(query)).draft.text).toEqual({ [COST_A]: "{monthlyUsd} a month, plus tax.", [HEADLINE]: "Smarter every Monday." });
    // Undo goes back to what the old row had published.
    await undoPublish(query, ADMIN);
    expect(await readPublished(query)).toEqual(asOverlay);
  });

  it("keeps what a page can use from an old row that is partly wrong, and reads a row that is wholly wrong as no edits", async () => {
    expect(legacyQuestionOverlay({ cost: { a: "It is {monthlyUsd} a month.", extra: "dropped" }, refund: { q: "  ", a: 12 }, "not-a-question": { q: "Hello?" }, "who-sees": "text", constructor: { q: "x" } })).toEqual(
      edits({ [COST_A]: "It is {monthlyUsd} a month.", [REFUND_Q]: "  " }),
    );
    await put(LEGACY_QUESTIONS_KEY, {
      cost: { a: "It is {monthlyUsd} a month.", extra: "dropped" },
      // Blank, not text, an amount that does not exist, and the built-in wording saved back: none of them is an edit.
      refund: { q: "  ", a: 12 },
      "each-week": { q: builtInQuestions().find((item) => item.id === "each-week")!.q, a: "It costs {nothing}." },
      "not-a-question": { q: "Hello?" },
      "who-sees": "text",
    });
    expect(await readPublished(query)).toEqual(edits({ [COST_A]: "It is {monthlyUsd} a month." }));
    for (const wrong of ["text", 12, null, [{ q: "x" }], { cost: "text" }]) {
      await put(LEGACY_QUESTIONS_KEY, wrong);
      expect(await readPublished(query), JSON.stringify(wrong)).toEqual(none);
      // A first write on top of it stores its own change and no more.
      expect(legacyQuestionOverlay(wrong)).toEqual(none);
    }
    await saveDraft(query, [{ field: HEADLINE, text: "Smarter every Monday." }]);
    expect(await value()).toEqual({ draft: edits({ [HEADLINE]: "Smarter every Monday." }), published: none, previous: null });
  });
});

describe("a row that holds something the code did not write (plan R18)", () => {
  const nonsense: unknown[] = ["text", 12, true, null, [], [{ draft: {} }], {}, { unknown: 1 }, { draft: "x", published: 7, previous: [] }, { draft: { format: 99, text: { [HEADLINE]: "From the future." } }, published: { format: 99, text: { [HEADLINE]: "From the future." } }, previous: null }];

  it("is read as no edits, and never throws", async () => {
    for (const stored of nonsense) {
      await put(CONTENT_KEY, stored);
      expect(await readStored(query), JSON.stringify(stored)).toEqual({ draft: none, published: none, previous: null, stored: true });
    }
  });

  it("is not seeded from the old questions row: the row exists, and what it holds is what the site has", async () => {
    await put(LEGACY_QUESTIONS_KEY, { refund: { a: "No. You can cancel any time." } });
    await put(CONTENT_KEY, "text");
    expect(await readPublished(query)).toEqual(none);
  });

  it("keeps the entries a page can use and drops the rest, part by part", () => {
    const stored = parseStored({
      draft: { format: 1, text: { [HEADLINE]: "A headline.", "home.hero.nothing": "x", [COST_A]: "{nope}", [SUB]: 4 }, sections: "x", lists: null },
      published: { format: 1, text: { [START]: "Start now", [SUB]: v1.home.hero.sub } },
      previous: {},
      extra: 1,
    });
    expect(stored).toEqual({ draft: edits({ [HEADLINE]: "A headline." }), published: edits({ [START]: "Start now" }), previous: null });
    // Only an overlay of this format is something to go back to. An empty one is: the site had no edits before.
    expect(parseStored({ previous: { format: 1, text: {}, sections: {}, lists: {} } }).previous).toEqual(none);
    expect(parseStored({ previous: { format: 2, text: { [HEADLINE]: "x" } } }).previous).toBeNull();
    expect(parseStored({ previous: "text" }).previous).toBeNull();
  });

  it("is replaced by a clean row at the next save, and undo does not go back to nonsense", async () => {
    await put(CONTENT_KEY, { draft: "x", published: { format: 1, text: { [START]: "Start now", "no.such.field": "x" } }, previous: {}, extra: 1 });
    expect(await undoPublish(query, ADMIN)).toMatchObject({ ok: true, changed: false });
    await saveDraft(query, [{ field: HEADLINE, text: "A headline." }]);
    expect(await value()).toEqual({ draft: edits({ [HEADLINE]: "A headline." }), published: edits({ [START]: "Start now" }), previous: null });
  });
});

describe("an entry that says what the baseline says is not an edit (plan KTD6)", () => {
  // A release that made "Released headline." the built-in wording.
  const released = applyOverlay(codeModel, edits({ [HEADLINE]: "Released headline." }));

  it("stops counting when a release makes it the built-in wording, and is gone at the next save", async () => {
    await saveDraft(query, [
      { field: HEADLINE, text: "Released headline." },
      { field: SUB, text: "The site's own sub-line." },
    ]);
    await publish(query, ADMIN, (await readStored(query)).draft);
    expect((await readPublished(query)).text).toEqual({ [HEADLINE]: "Released headline.", [SUB]: "The site's own sub-line." });
    // The same row, read by the code of the release.
    expect((await readPublished(query, released)).text).toEqual({ [SUB]: "The site's own sub-line." });
    await saveDraft(query, [{ field: START, text: "Start now" }], released);
    expect(await value()).toEqual({ draft: edits({ [SUB]: "The site's own sub-line.", [START]: "Start now" }), published: edits({ [SUB]: "The site's own sub-line." }), previous: none });
  });

  it("is judged against the release, not the code: the code's own wording over a released one is an edit", async () => {
    expect(await saveDraft(query, [{ field: HEADLINE, text: "Released headline." }], released)).toMatchObject({ ok: true, changed: false });
    expect(await saveDraft(query, [{ field: HEADLINE, text: v1.home.hero.headline }], released)).toMatchObject({ ok: true, changed: true });
    expect((await readStored(query, released)).draft.text).toEqual({ [HEADLINE]: v1.home.hero.headline });
    // On this branch the release file is empty, so the baseline is the code copy.
    expect(baseline).toEqual(codeModel);
  });
});

describe("comparing two overlays", () => {
  it("is by what they say: the order of entries does not matter, the order of a list does", () => {
    const a: Overlay = { format: 1, text: { [HEADLINE]: "A", [SUB]: "B" }, sections: { home: { order: ["price", "questions"], off: [] } }, lists: {} };
    const b: Overlay = { lists: {}, sections: { home: { off: [], order: ["price", "questions"] } }, text: { [SUB]: "B", [HEADLINE]: "A" }, format: 1 };
    expect(sameOverlay(a, b)).toBe(true);
    expect(sameOverlay(a, { ...b, sections: { home: { off: [], order: ["questions", "price"] } } })).toBe(false);
    expect(sameOverlay(a, { ...b, text: { ...b.text, [SUB]: "b" } })).toBe(false);
  });

  it("names what differs, for the admin log", () => {
    const a: Overlay = { format: 1, text: { [HEADLINE]: "A", [SUB]: "B" }, sections: { home: { order: ["price"], off: [] } }, lists: {} };
    const b: Overlay = { format: 1, text: { [HEADLINE]: "A", [START]: "C" }, sections: { home: { order: ["questions"], off: [] } }, lists: { "home.problem.statements": { order: [], removed: ["alone"], added: [] } } };
    expect(changedBetween(a, b)).toEqual([START, SUB, "sections.home", "lists.home.problem.statements"]);
    expect(changedBetween(a, a)).toEqual([]);
  });
});

describe("the statement that replaces the row applies when the row is what was read, however it was written down", () => {
  // The comparison is jsonb with jsonb, so it is by what the value says. The row is read as text, and that text is
  // the database's own writing of the value: cast back, it is the value again, whatever was first typed in.
  const updates = () => ran.filter((statement) => statement.startsWith("update settings"));

  it("replaces at the first try a row written by hand: another key order, spaces, escapes, numbers in other forms, keys the code does not know", async () => {
    // Built with the backslash by its code, so that this file's own escapes play no part in what the database is given.
    const B = String.fromCharCode(92);
    const shown = `Café 😀 "now" ${B} ok`;
    const written = `"Caf${B}u00e9 ${B}ud83d${B}ude00 ${B}"now${B}" ${B}${B} ok"`;
    const byHand = `  { "previous" : null ,
      "published": {"text": {"${START}": ${written}}, "format": 1.0, "lists": {}, "sections": {}},
      "extra": [1.50, 1e2, -0, 12345678901234567890.123456789, true, null, {"b": 1, "a": 2, "a": 3}],
      "draft": {"format": 1, "sections": {}, "text": {"${START}": ${written}}, "lists": {}} }`;
    await query("insert into settings (key, value) values ($1, $2::jsonb)", [CONTENT_KEY, byHand]);
    expect((await readStored(query)).published.text).toEqual({ [START]: shown });
    ran = [];
    expect(await saveDraft(query, [{ field: HEADLINE, text: "Smarter every Monday." }])).toMatchObject({ ok: true, changed: true });
    expect(updates()).toHaveLength(1);
    ran = [];
    expect(await publish(query, ADMIN, (await readStored(query)).draft)).toMatchObject({ ok: true, changed: true });
    expect(updates()).toHaveLength(1);
    // What the code did not write is gone, and what it kept is as it was.
    expect(await value()).toEqual({
      draft: edits({ [START]: shown, [HEADLINE]: "Smarter every Monday." }),
      published: edits({ [START]: shown, [HEADLINE]: "Smarter every Monday." }),
      previous: edits({ [START]: shown }),
    });
  });

  it("replaces at the first try, every time, a row with every kind of text a field can hold", async () => {
    const B = String.fromCharCode(92);
    const answer = `Line with "quotes", a back${B}slash, a tab-free dash — and “curly” ones. Ünïcödé, 日本語, 😀, {monthlyUsd} and {monthlyCad}. ${"Long. ".repeat(150)}`.trim();
    const wording: Record<string, string> = { [COST_A]: answer, [REFUND_A]: `e${String.fromCharCode(0x301)} as two characters is kept as it was given`, [HEADLINE]: "A </script> <b>headline</b> & more", [SUB]: "'; drop table settings; --" };
    for (const [field, text] of Object.entries(wording)) {
      ran = [];
      expect(await saveDraft(query, [{ field, text }]), field).toMatchObject({ ok: true, changed: true });
      expect(ran.filter((statement) => /^(insert into|update) settings/.test(statement)), field).toHaveLength(1);
      ran = [];
      expect(await publish(query, ADMIN, (await readStored(query)).draft), field).toMatchObject({ ok: true, changed: true });
      expect(updates(), field).toHaveLength(1);
    }
    expect((await readPublished(query)).text).toEqual(wording);
    ran = [];
    expect(await undoPublish(query, ADMIN)).toMatchObject({ ok: true, changed: true });
    expect(updates()).toHaveLength(1);
  });
});

describe("writes that meet", () => {
  it("a save and a publish: the publish makes live the draft it checked or nothing, and the save is in the draft either way", async () => {
    await saveDraft(query, [{ field: HEADLINE, text: "Checked headline." }]);
    const checked = (await readStored(query)).draft;
    const [saved, published] = await Promise.all([saveDraft(query, [{ field: SUB, text: "Unread sub-line." }]), publish(query, ADMIN, checked)]);
    expect(saved).toMatchObject({ ok: true, changed: true });
    const stored = await readStored(query);
    expect(stored.draft.text).toEqual({ [HEADLINE]: "Checked headline.", [SUB]: "Unread sub-line." });
    // Never the unread sub-line: either the checked draft went live before the save landed, or nothing did.
    if (published.ok) expect(stored.published.text).toEqual({ [HEADLINE]: "Checked headline." });
    else {
      expect(published).toEqual({ ok: false, reason: "draft-changed" });
      expect(stored.published).toEqual(none);
      expect(await log()).toEqual([]);
    }
  });

  it("a publish and an undo: whichever lands second sees what the first did, so what undo goes back to is never lost or made up", async () => {
    await saveDraft(query, [{ field: HEADLINE, text: "First headline." }]);
    await publish(query, ADMIN, (await readStored(query)).draft);
    await saveDraft(query, [{ field: HEADLINE, text: "Second headline." }]);
    const second = (await readStored(query)).draft;
    const first = edits({ [HEADLINE]: "First headline." });
    const [published, undone] = await Promise.all([publish(query, ADMIN, second), undoPublish(query, ADMIN)]);
    expect(published).toMatchObject({ ok: true, changed: true });
    expect(undone).toMatchObject({ ok: true, changed: true });
    const stored = await readStored(query);
    expect(stored.draft).toEqual(second);
    // Publish then undo: the first headline is live again. Undo then publish: the second is live, and undo would go back to no edits.
    const outcomes = [
      { published: first, previous: null },
      { published: second, previous: none },
    ];
    expect(outcomes).toContainEqual({ published: stored.published, previous: stored.previous });
    expect(await log()).toHaveLength(3);
  });

  it("two publishes of the same draft: one makes it live, the other finds it live, and what undo goes back to is the content before both", async () => {
    await saveDraft(query, [{ field: START, text: "Start now" }]);
    await publish(query, ADMIN, (await readStored(query)).draft);
    await saveDraft(query, [{ field: HEADLINE, text: "A headline." }]);
    const draft = (await readStored(query)).draft;
    const both = await Promise.all([publish(query, ADMIN, draft), publish(query, ADMIN, draft)]);
    expect(both.map((r) => r.ok && r.changed).sort()).toEqual([false, true]);
    expect((await readStored(query)).previous).toEqual(edits({ [START]: "Start now" }));
    expect(await log()).toHaveLength(2);
  });
});

describe("a very large row (plan R18)", () => {
  it("is read without throwing, keeps no more than an overlay may hold, and is replaced by a small one at the next save", async () => {
    const big = "x".repeat(20_000);
    const text: Record<string, string> = { [START]: "Start now", [HEADLINE]: big.repeat(3) };
    for (let i = 0; i < 250; i++) text[`no.such.field.${i}`] = big;
    await put(CONTENT_KEY, { draft: { format: 1, text, sections: {}, lists: {} }, published: { format: 1, text, sections: {}, lists: {} }, previous: null, junk: big.repeat(5) });
    const [{ size }] = await query<{ size: number }>("select length(value::text) as size from settings where key = $1", [CONTENT_KEY]);
    expect(Number(size)).toBeGreaterThan(5_000_000);
    expect(await readPublished(query)).toEqual(edits({ [START]: "Start now" }));
    await saveDraft(query, [{ field: SUB, text: "A new sub-line." }]);
    expect(await value()).toEqual({ draft: edits({ [START]: "Start now", [SUB]: "A new sub-line." }), published: edits({ [START]: "Start now" }), previous: null });
  });
});

/**
 * A page's sections in the draft (plan U6, R7): each press of a section control is one write to the page's one
 * entry, made to the sections as the draft has them when the write lands.
 */
describe("a page's sections in the draft", () => {
  const HOME = ["hero", "problem", "examples", "compounds", "testimonials", "control", "price", "questions", "closing"];
  const SWAPPED = HOME.map((id) => (id === "price" ? "questions" : id === "questions" ? "price" : id));
  const sections = (entries: Overlay["sections"]): Overlay => ({ ...newOverlay(), sections: entries });
  const draft = async () => (await readStored(query)).draft;

  it("switches a section off in the draft only, as the page's one entry, in one statement", async () => {
    ran = [];
    const saved = await saveSections(query, { page: "home", op: "off", section: "compounds" });
    expect(saved).toMatchObject({ ok: true, changed: true, layout: { order: HOME, off: ["compounds"] } });
    expect(writes()).toEqual(["insert into settings"]);
    expect(await value()).toEqual({ draft: sections({ home: { order: [], off: ["compounds"] } }), published: none, previous: null });
    // A draft: nothing a visitor sees has changed, and nothing is logged.
    expect(await readPublished(query)).toEqual(none);
    expect(await log()).toEqual([]);
  });

  it("moves a section one place up or down among the page's sections, and writes the whole order", async () => {
    expect(await saveSections(query, { page: "home", op: "up", section: "questions" })).toMatchObject({ ok: true, changed: true, layout: { order: SWAPPED } });
    expect((await draft()).sections).toEqual({ home: { order: SWAPPED, off: [] } });
    // And down again: the page is as the baseline has it, so it has no entry at all. An empty one is never written.
    expect(await saveSections(query, { page: "home", op: "down", section: "questions" })).toMatchObject({ ok: true, changed: true, layout: { order: HOME, off: [] } });
    expect(await value()).toEqual({ draft: none, published: none, previous: null });
  });

  it("changes nothing when the first section is moved up, the last one down, or a switch is already where it is asked to be", async () => {
    await saveSections(query, { page: "home", op: "off", section: "price" });
    ran = [];
    expect(await saveSections(query, { page: "home", op: "up", section: "hero" })).toMatchObject({ ok: true, changed: false });
    expect(await saveSections(query, { page: "home", op: "down", section: "closing" })).toMatchObject({ ok: true, changed: false });
    expect(await saveSections(query, { page: "home", op: "off", section: "price" })).toMatchObject({ ok: true, changed: false });
    expect(await saveSections(query, { page: "home", op: "on", section: "hero" })).toMatchObject({ ok: true, changed: false });
    expect(await saveSections(query, { page: "faq", op: "reset" })).toMatchObject({ ok: true, changed: false });
    expect(writes()).toEqual([]);
    expect((await draft()).sections).toEqual({ home: { order: [], off: ["price"] } });
  });

  it("puts a page's sections back as the baseline has them with one reset, and leaves the other pages and the texts alone", async () => {
    await saveDraft(query, [{ field: HEADLINE, text: "A new headline." }]);
    await saveSections(query, { page: "home", op: "off", section: "compounds" });
    await saveSections(query, { page: "home", op: "up", section: "questions" });
    await saveSections(query, { page: "faq", op: "off", section: "price-and-billing" });
    expect((await draft()).sections).toEqual({ home: { order: SWAPPED, off: ["compounds"] }, faq: { order: [], off: ["price-and-billing"] } });
    expect(await saveSections(query, { page: "home", op: "reset" })).toMatchObject({ ok: true, changed: true, layout: { order: HOME, off: [] } });
    expect(await draft()).toEqual({ ...edits({ [HEADLINE]: "A new headline." }), sections: { faq: { order: [], off: ["price-and-billing"] } } });
  });

  it("refuses a page with no sections to move, a fixed section and an id the page does not have, and stores nothing", async () => {
    ran = [];
    for (const change of [
      { page: "shared", op: "off", section: "nav" },
      { page: "shared", op: "reset" },
      { page: "nope", op: "off", section: "price" },
      { page: "howItWorks", op: "off", section: "title" },
      { page: "faq", op: "up", section: "title" },
      { page: "home", op: "off", section: "zack" },
      { page: "home", op: "off", section: "constructor" },
    ] as const) {
      expect(await saveSections(query, change), JSON.stringify(change)).toEqual({ ok: false, reason: "unknown-section" });
    }
    expect(ran).toEqual([]);
    expect(await value()).toBeUndefined();
  });

  it("keeps both of two presses that run together, each made to the sections the other has left", async () => {
    const [a, b] = await Promise.all([saveSections(query, { page: "home", op: "off", section: "compounds" }), saveSections(query, { page: "home", op: "up", section: "questions" })]);
    expect(a).toMatchObject({ ok: true, changed: true });
    expect(b).toMatchObject({ ok: true, changed: true });
    expect((await draft()).sections).toEqual({ home: { order: SWAPPED, off: ["compounds"] } });
    // The same press from two tabs moves the section twice: it is never the order one tab last saw that is written.
    await Promise.all([saveSections(query, { page: "home", op: "up", section: "questions" }), saveSections(query, { page: "home", op: "up", section: "questions" })]);
    expect((await draft()).sections.home.order.indexOf("questions")).toBe(4);
  });

  it("is published and undone with everything else, and logged by name without the order", async () => {
    await saveDraft(query, [{ field: HEADLINE, text: "A new headline." }]);
    await saveSections(query, { page: "home", op: "off", section: "price" });
    const checked = await draft();
    expect(await publish(query, ADMIN, checked)).toMatchObject({ ok: true, changed: true });
    expect(await readPublished(query)).toEqual({ ...edits({ [HEADLINE]: "A new headline." }), sections: { home: { order: [], off: ["price"] } } });
    expect((await log()).map((row) => [row.action, row.detail.changed])).toEqual([["site_content_published", [HEADLINE, "sections.home"]]]);
    expect(await undoPublish(query, ADMIN)).toMatchObject({ ok: true, changed: true });
    expect(await readPublished(query)).toEqual(none);
    // The draft is still there, to fix and publish again.
    expect(await draft()).toEqual(checked);
  });

  it("is not published when the sections have changed since the draft was checked", async () => {
    await saveSections(query, { page: "home", op: "off", section: "price" });
    const checked = await draft();
    await saveSections(query, { page: "home", op: "off", section: "compounds" });
    expect(await publish(query, ADMIN, checked)).toEqual({ ok: false, reason: "draft-changed" });
    expect(await readPublished(query)).toEqual(none);
  });

  it("stops counting once a release has the same sections, and a stored entry that changes nothing is gone at the next save (KTD6)", async () => {
    await saveSections(query, { page: "home", op: "off", section: "compounds" });
    await saveSections(query, { page: "home", op: "off", section: "price" });
    await publish(query, ADMIN, await draft());
    // The same row, read by the code of a release that has "It compounds" off: only Price is the site's own.
    const released = applyOverlay(codeModel, sections({ home: { order: [], off: ["compounds"] } }));
    expect((await readPublished(query, released)).sections).toEqual({ home: { order: [], off: ["price"] } });
    // On that release, switching "It compounds" back on is an edit, written by naming the section.
    await saveSections(query, { page: "home", op: "on", section: "compounds" }, released);
    expect((await readStored(query, released)).draft.sections).toEqual({ home: { order: ["compounds"], off: ["price"] } });
    // A row written by hand with entries that change nothing: read as no entry, and not stored again.
    await put(CONTENT_KEY, { draft: sections({ home: { order: [], off: [] }, faq: { order: ["getting-started"], off: [] } }), published: sections({ home: { order: HOME, off: [] } }), previous: null });
    expect(await readStored(query)).toMatchObject({ draft: none, published: none });
    await saveDraft(query, [{ field: SUB, text: "A new sub-line." }]);
    expect(await value()).toEqual({ draft: edits({ [SUB]: "A new sub-line." }), published: none, previous: null });
  });
});
