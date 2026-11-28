/**
 * The Pages screens and their actions (plan U5), on an in-process Postgres:
 * a save is a draft no visitor sees, the review lists what a publish would
 * change and each wording rule the drafts break, a publish makes all of it
 * live and logs what was published over, and undo puts the site back.
 *
 * A server action is a public endpoint, so each one's admin check is its own
 * and comes before it reads what it was sent.
 */
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builtInQuestions } from "@/data/site/v1";
import type { Query } from "@/lib/db-query";
import { DRAFT_COOKIE, Redirected, jar, nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";
import { testDb } from "@/test-helpers/pglite-db";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://test.invalid/none";
});

const cache = vi.hoisted(() => ({ tags: [] as string[], refreshed: 0 }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  cacheLife: () => {},
  cacheTag: () => {},
  refresh: () => {
    cache.refreshed++;
  },
  updateTag: (tag: string) => {
    cache.tags.push(tag);
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), ...nextNavigation }));

let current: Query;
let admin: string | null = null;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
// The settings the amounts come from are not this test's subject: the defaults, whatever the database holds.
vi.mock("@/lib/v3-settings-display", async () => {
  const { mergeV3 } = await import("@/lib/v3-settings");
  return { getV3SettingsForDisplay: async () => mergeV3([]), cachedV3SettingsForDisplay: async () => mergeV3([]) };
});
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => {
    if (!admin) throw new Error("Not signed in");
    return admin;
  },
  isAdmin: async () => Boolean(admin),
}));

const { listAction, publishAction, savePageAction, sectionsAction, undoPublishAction } = await import("./actions");
const { NOT_LOGGED } = await import("@/lib/admin/log");
const { default: PagesScreen } = await import("./page");
const { default: EditorScreen } = await import("./[page]/page");
const { default: ReviewScreen } = await import("./review/page");
const { default: QuestionsPage } = await import("../questions/page");
const { LAUNCH_LIST_URL } = await import("./launch-list");
const { POST: previewRoute, GET: previewGet } = await import("./preview/route");
const { POST: exitRoute, GET: exitGet } = await import("./preview/exit/route");
const { signOutAction } = await import("../actions");
const { CONTENT_TAG, getSiteContent } = await import("@/lib/site/content/read");
const { CONTENT_KEY, LEGACY_QUESTIONS_KEY, readStored } = await import("@/lib/site/content/store");
const { DESTINATION_REFUSAL, draftChanges, reviewKey, wordingWarnings } = await import("@/lib/site/content/check");
const { baseline, textAt } = await import("@/lib/site/content/model");
const { newOverlay } = await import("@/lib/site/content/format");
const { getAmounts } = await import("@/lib/site/amounts");
const { V1Faq } = await import("@/components/site/v1/faq");
const { V1Home } = await import("@/components/site/v1/home");

const HEADLINE = "home.hero.headline";
const HERO_SUB = "home.hero.sub";
const REFUND_A = "questions.price-and-billing.items.refund.a";
const COST_A = "questions.price-and-billing.items.cost.a";
const OWNER = "owner@example.com";
const original = (id: string) => textAt(baseline, id)!;
const edits = (text: Record<string, string>) => ({ ...newOverlay(), text });

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};
/** The typed text of some fields of one page, as the editing screen sends it. */
const typed = (page: string, text: Record<string, string>) => form({ page, ...Object.fromEntries(Object.entries(text).map(([id, value]) => [`text:${id}`, value])) });
/** A form that fails the test if anything reads it. */
const unread = () =>
  new Proxy(new FormData(), {
    get(_target, name) {
      throw new Error(`the form was read (${String(name)}) before the admin check`);
    },
  });

const stored = async (key = CONTENT_KEY) => (await current<{ value: unknown }>("select value from settings where key = $1", [key]))[0]?.value;
const logged = () => current<{ admin_email: string; action: string; detail: Record<string, unknown> }>("select admin_email, action, detail from admin_actions order by id");
// React writes an empty comment between two pieces of text that sit side by side: it is no space.
const words = (markup: string) => markup.replace(/<!--[^>]*-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const faq = async () => words(await pageMarkup(createElement(V1Faq, { version: "v1" })));
const home = async () => words(await pageMarkup(createElement(V1Home, { version: "v1" })));
const pagesScreen = async () => pageMarkup(await PagesScreen());
const reviewScreen = async () => pageMarkup(await ReviewScreen());
const editorScreen = async (page: string) => pageMarkup(await EditorScreen({ params: Promise.resolve({ page }) } as never));
/** One page's row on the Pages screen. */
const row = (markup: string, page: string) => words(new RegExp(`<li data-page="${page}"[\\s\\S]*?</li>`).exec(markup)![0]);
/** One field's box on an editing screen: from its own start to the next field's. */
const box = (markup: string, id: string) => markup.split(`id="field-${id}"`)[1].split('id="field-')[0];
/** The fingerprint the review screen's button would carry now. */
const keyNow = async () => {
  const content = await readStored(current);
  return reviewKey(content, wordingWarnings(draftChanges(content), await getAmounts()));
};
const publishNow = async () => publishAction(form({ review: await keyNow() }));

beforeEach(async () => {
  ({ query: current } = await testDb());
  admin = null;
  cache.tags = [];
  cache.refreshed = 0;
  resetNextFakes({}, { "x-vercel-ip-country": "US" });
});

describe("someone who is not an admin", () => {
  it("is refused by every action before the form is read: nothing is stored, logged, expired or refreshed", async () => {
    await expect(savePageAction(unread())).rejects.toThrow("Not signed in");
    await expect(publishAction(unread())).rejects.toThrow("Not signed in");
    await expect(undoPublishAction()).rejects.toThrow("Not signed in");
    await expect(savePageAction(typed("home", { [HEADLINE]: "Mine now" }))).rejects.toThrow("Not signed in");
    expect(await stored()).toBeUndefined();
    expect(await logged()).toEqual([]);
    expect(cache).toEqual({ tags: [], refreshed: 0 });
  });

  it("sees none of the three screens", async () => {
    expect(await PagesScreen()).toBeNull();
    expect(await ReviewScreen()).toBeNull();
    expect(await EditorScreen({ params: Promise.resolve({ page: "home" }) } as never)).toBeNull();
  });
});

describe("saving", () => {
  beforeEach(() => {
    admin = OWNER;
  });

  it("stores a new hero headline as a draft: Home is marked, and no visitor sees it", async () => {
    const before = await home();
    expect(before).toContain(original(HEADLINE));
    const state = await savePageAction(typed("home", { [HEADLINE]: "  Your AI agents,\nbetter every Monday " }));
    expect(state).toMatchObject({ status: "ok", message: "Saved as a draft. Visitors do not see it until you publish.", saved: { [HEADLINE]: "Your AI agents, better every Monday" } });
    expect(await stored()).toEqual({ draft: edits({ [HEADLINE]: "Your AI agents, better every Monday" }), published: newOverlay(), previous: null });

    // The public reader's answer, and the page made from it, are what they were. Nothing public is expired; the admin's own screen is refreshed.
    expect((await getSiteContent()).text).toEqual({});
    expect(await home()).toBe(before);
    expect(cache).toEqual({ tags: [], refreshed: 1 });
    expect(await logged()).toEqual([]);

    const list = await pagesScreen();
    expect(row(list, "home")).toContain("1 draft not published");
    expect(row(list, "home")).toContain("1 text changed from the original");
    expect(row(list, "faq")).toContain("No drafts waiting");
    expect(row(list, "faq")).toContain("Original wording");
    expect(words(list)).toContain("1 change is saved as a draft and not on the site yet.");
    expect(list).toContain('href="/admin/pages/review"');
  });

  it("accepts an amount by its name, and refuses a name that does not exist with the names that do", async () => {
    expect(await savePageAction(typed("faq", { [COST_A]: "It is {monthlyUsd} a month." }))).toMatchObject({ status: "ok" });
    const state = await savePageAction(typed("faq", { [COST_A]: "It is {monthlyUsdd} a month." }));
    expect(state.status).toBe("error");
    expect(state.message).toBe("Not saved yet. One field needs fixing first. Nothing you typed is lost.");
    expect(state.errors?.[COST_A]).toMatch(/^\{monthlyUsdd\} is not a name this text can use.*The names that work here: \{monthlyUsd\}, \{monthlyCad\}, /);
    // The refused text is nowhere: the draft still holds the first save. (The screen keeps what was typed; see field-editor.tsx.)
    expect(state.saved).toBeUndefined();
    expect((await readStored(current)).draft.text).toEqual({ [COST_A]: "It is {monthlyUsd} a month." });
  });

  it("refuses a text over its limit by its length, never by cutting it, and empty text", async () => {
    const long = await savePageAction(typed("faq", { [REFUND_A]: "No refunds. ".repeat(200) }));
    expect(long.errors).toEqual({ [REFUND_A]: "This is 2399 characters long, and the most that fits here is 1500. Shorten it by 899." });
    const empty = await savePageAction(typed("home", { [HEADLINE]: "   " }));
    expect(empty.errors?.[HEADLINE]).toMatch(/^This cannot be left empty\./);
    expect(await stored()).toBeUndefined();
    expect(cache.refreshed).toBe(0);
  });

  it("saves all the fields it was sent or none: one refused field keeps the others out too, and each is named", async () => {
    const state = await savePageAction(typed("home", { [HEADLINE]: "A new headline", [HERO_SUB]: "Costs {nothing}" }));
    expect(state.status).toBe("error");
    expect(Object.keys(state.errors ?? {})).toEqual([HERO_SUB]);
    expect(await stored()).toBeUndefined();
    const two = await savePageAction(typed("home", { [HEADLINE]: "", [HERO_SUB]: "Costs {nothing}" }));
    expect(two.message).toBe("Not saved yet. 2 fields need fixing first. Nothing you typed is lost.");
    expect(Object.keys(two.errors ?? {}).sort()).toEqual([HEADLINE, HERO_SUB].sort());
  });

  it("writes only the fields it was sent, so a draft saved from another tab is kept", async () => {
    await savePageAction(typed("faq", { [REFUND_A]: "No. You can cancel any time." }));
    await savePageAction(typed("home", { [HEADLINE]: "A new headline" }));
    expect((await readStored(current)).draft.text).toEqual({ [REFUND_A]: "No. You can cancel any time.", [HEADLINE]: "A new headline" });
  });

  it("saves a wording that breaks a wording rule: that is a warning at publish, not a refusal", async () => {
    expect(await savePageAction(typed("faq", { [REFUND_A]: "No, but your agent will thank you!" }))).toMatchObject({ status: "ok" });
    expect((await readStored(current)).draft.text).toEqual({ [REFUND_A]: "No, but your agent will thank you!" });
  });

  it("stores nothing for the original wording saved back, and takes an edit out when it is typed back to the original", async () => {
    expect(await savePageAction(typed("home", { [HEADLINE]: original(HEADLINE) }))).toMatchObject({ status: "ok" });
    expect(await stored()).toBeUndefined();
    await savePageAction(typed("home", { [HEADLINE]: "A new headline" }));
    await savePageAction(typed("home", { [HEADLINE]: original(HEADLINE) }));
    expect((await readStored(current)).draft).toEqual(newOverlay());
  });

  it("refuses a field that is not on the page it was sent for, an unknown field and an unknown page, storing nothing", async () => {
    const stale = "This page has changed since you opened it, so nothing was saved. Reload the page and try again.";
    expect(await savePageAction(typed("home", { [REFUND_A]: "No." }))).toMatchObject({ status: "error", message: stale });
    expect(await savePageAction(typed("home", { "home.hero.nothing": "x", [HEADLINE]: "A new headline" }))).toMatchObject({ status: "error", message: stale });
    for (const page of ["nowhere", "", "constructor", "__proto__"]) expect(await savePageAction(typed(page, { [HEADLINE]: "A new headline" })), page).toMatchObject({ status: "error", message: stale });
    expect(await savePageAction(form({ page: "home", reset: REFUND_A }))).toMatchObject({ status: "error", message: stale });
    expect(await stored()).toBeUndefined();
  });

  it("takes a field's name only from the registry: a property every object has, and a field id with a tail, name no field", async () => {
    for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty", `${HEADLINE}.__proto__`, `${HEADLINE} `, ""]) {
      expect(await savePageAction(typed("home", { [name]: "Mine now" })), name).toMatchObject({ status: "error", message: expect.stringMatching(/^This page has changed since you opened it/) });
      expect(await savePageAction(form({ page: "home", reset: name || "x" })), name).toMatchObject({ status: "error" });
    }
    for (const page of ["__proto__", "constructor", "review", "/admin", "https://evil.test"]) {
      expect(await savePageAction(typed(page, { [HEADLINE]: "Mine now" })), page).toMatchObject({ status: "error", message: expect.stringMatching(/^This page has changed since you opened it/) });
    }
    expect(await stored()).toBeUndefined();
    expect(cache.refreshed).toBe(0);
  });

  it("stores what it tidied itself, whatever the form sent: one line, no character that prints nothing, markup as plain text", async () => {
    const zeroWidth = String.fromCharCode(0x200b);
    const override = String.fromCharCode(0x202e);
    const state = await savePageAction(typed("home", { [HEADLINE]: `\n\n  <script>alert(1)</script>\r\n Your AI ag${zeroWidth}ents ${override}\t smarter  \n` }));
    expect(state).toMatchObject({ status: "ok", saved: { [HEADLINE]: "<script>alert(1)</script> Your AI agents smarter" } });
    expect((await readStored(current)).draft.text[HEADLINE]).toBe("<script>alert(1)</script> Your AI agents smarter");
    // Right-to-left text and an emoji are text like any other (the emoji is a wording warning at publish, not a refusal).
    const mixed = "שלום Roger 🎉 مرحبا";
    expect(await savePageAction(typed("home", { [HEADLINE]: mixed }))).toMatchObject({ status: "ok", saved: { [HEADLINE]: mixed } });
    // The editing screen prints it as text: the markup is escaped, never markup.
    await savePageAction(typed("home", { [HEADLINE]: "<script>alert(1)</script>" }));
    const markup = await editorScreen("home");
    expect(markup).not.toContain("<script>alert(1)");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(await reviewScreen()).not.toContain("<script>alert(1)");
  });

  it("refuses a text far longer than a save reads without stating a length it did not measure, and stores nothing", async () => {
    const state = await savePageAction(typed("home", { [HEADLINE]: "x".repeat(100_000), [HERO_SUB]: "A fine line." }));
    expect(state).toMatchObject({ status: "error", errors: { [HEADLINE]: "This is far longer than fits here: the most is 200 characters. Shorten it and save again." } });
    expect(JSON.stringify(state)).not.toContain("50000");
    expect(await stored()).toBeUndefined();
  });

  it("says so when there was nothing to save", async () => {
    expect(await savePageAction(form({ page: "home" }))).toMatchObject({ status: "ok", message: "Nothing to save: no wording was changed." });
    expect(await stored()).toBeUndefined();
  });

  it("gives way with a plain message when other writes keep getting in first, and stores nothing", async () => {
    const working = current;
    // Every write finds the row changed since it was read.
    current = (async (statement: string, params?: unknown[]) => (/^\s*(insert into settings|update settings)/.test(statement) ? [] : working(statement, params))) as Query;
    const state = await savePageAction(typed("home", { [HEADLINE]: "A new headline" }));
    current = working;
    expect(state).toMatchObject({ status: "error", message: "Someone else saved at the same moment, so this was not saved. Nothing you typed is lost: press Save draft again." });
    expect(await stored()).toBeUndefined();
  });
});

describe("resetting a field", () => {
  beforeEach(() => {
    admin = OWNER;
  });

  it("takes the mark off and shows the original wording again, as a draft", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "A new headline", [HERO_SUB]: "A new line under it." }));
    const edited = box(await editorScreen("home"), HEADLINE);
    expect(edited).toContain("data-edited");
    expect(edited).toContain('value="A new headline"');
    expect(words(edited)).toContain("Changed from the original");
    expect(words(edited)).toContain("Reset to the original wording");
    expect(words(edited)).toContain(`Show the original wording ${original(HEADLINE)}`);

    expect(await savePageAction(form({ page: "home", reset: HEADLINE }))).toMatchObject({ status: "ok", reset: HEADLINE, message: "Back to the original wording, saved as a draft." });
    // The other field's draft is untouched.
    expect((await readStored(current)).draft.text).toEqual({ [HERO_SUB]: "A new line under it." });
    const after = box(await editorScreen("home"), HEADLINE);
    expect(after).not.toContain("data-edited");
    expect(after).toContain(`value="${original(HEADLINE)}"`);
    expect(words(after)).not.toContain("Changed from the original");
    expect(words(after)).not.toContain("Reset to the original wording");
    // Nothing public changed, so nothing public is expired.
    expect(cache.tags).toEqual([]);
  });

  it("of a published edit is a draft like any other: the site keeps the edit until the reset is published", async () => {
    await savePageAction(typed("faq", { [REFUND_A]: "No. You can cancel any time." }));
    await publishNow();
    await savePageAction(form({ page: "faq", reset: REFUND_A }));
    expect(await faq()).toContain("No. You can cancel any time.");
    const review = words(await reviewScreen());
    expect(review).toContain("After publishing (back to the original wording)");
    await publishNow();
    expect(await faq()).not.toContain("No. You can cancel any time.");
    expect(await faq()).toContain("No, unless we charge you by mistake: then tell us and we refund the mistaken charge in full to your card. You get two free Cora Curations before any charge, and you can cancel any time.");
  });
});

describe("the editing screen", () => {
  beforeEach(() => {
    admin = OWNER;
  });

  it("shows every text of the page under the page's sections, in the page's order, with its limit", async () => {
    const markup = await editorScreen("home");
    expect([...markup.matchAll(/<h2 id="section-[^"]*-h"[^>]*>([^<]*)</g)].map((m) => m[1])).toEqual([
      "Hero",
      "The problem",
      "Cora Curation examples",
      "It compounds",
      "What people say",
      "You decide what Zack shares",
      "Price",
      "Questions",
      "Closing band",
    ]);
    const headline = box(markup, HEADLINE);
    expect(headline).toContain(`value="${original(HEADLINE)}"`);
    expect(words(headline)).toContain(`${original(HEADLINE).length} of 200 characters`);
    expect(headline).not.toContain("data-edited");
    // A line gets a one-line box, a paragraph gets room.
    expect(headline).toMatch(/<input [^>]*type="text"/);
    expect(box(markup, HERO_SUB)).toContain("<textarea");
    // One Save for the page. The other button that submits is Preview's, in a form of its own (plan U9).
    expect(markup.match(/<button type="submit"/g)).toHaveLength(2);
    expect(markup.match(/<form[^>]*data-preview="home"[^>]*>(?:(?!<\/form>)[\s\S])*<button type="submit"/g)).toHaveLength(1);
    expect(words(markup)).toContain("Save draft");
  });

  it("names a list's items by their place and never prints an id", async () => {
    for (const page of ["home", "how-it-works", "use-cases", "faq", "about", "shared"]) {
      const markup = await editorScreen(page);
      const seen = words(markup.replace(/<script[\s\S]*?<\/script>/g, " "));
      // No field path ("home.hero.headline", "questions.cost.a") and no item named by its id in quotes, as the registry's own labels have it.
      expect(seen, page).not.toMatch(/\b[a-z][A-Za-z]*\.[a-z][A-Za-z-]*\.[a-z]/);
      expect(seen, page).not.toMatch(/(Step|Question|Statement|Point|Day|Note|Paragraph) “/);
    }
    const homeScreen = await editorScreen("home");
    // An item is headed by its place AND its wording, so nobody has to count which one "Step 2" is.
    expect(homeScreen).toMatch(/<legend[^>]*>Step 2 — “Collect”<\/legend>/);
    expect(await editorScreen("faq")).toMatch(/<legend[^>]*>Question 1 — “I don’t use AI agents yet\. Can I start\?”<\/legend>/);
  });

  it("heads an item by its draft wording, cut short when it is long, and names it whole for a screen reader", async () => {
    const EACH_WEEK_Q = "questions.getting-started.items.each-week.q";
    const long = "What do I have to do each week, and on which day, and what happens when I am away for a month or two";
    await savePageAction(typed("faq", { [EACH_WEEK_Q]: long }));
    const markup = await editorScreen("faq");
    const legend = /<legend[^>]*>(Question \d+ — “What do I have to do each week[^<]*)<\/legend>/.exec(markup)![1];
    expect(legend).toMatch(/^Question \d+ — “What do I have to do each week, and on which day, and what…”$/);
    // Reset is one of many buttons with the same words: a screen reader hears which field each is for.
    expect(words(box(markup, EACH_WEEK_Q))).toContain(`Reset to the original wording : ${legend} · Question`);
  });

  it("shows a text that names an amount as visitors read it today, under the box that holds the name", async () => {
    const markup = await editorScreen("faq");
    expect(words(box(markup, REFUND_A))).toContain("Visitors read: No, unless we charge you by mistake: then tell us and we refund the mistaken charge in full to your card. You get two free Cora Curations before any charge, and you can cancel any time.");
    expect(box(markup, "questions.getting-started.items.each-week.a")).not.toContain("data-reads");
    // A caption's two names change with the picture: nothing is filled in, and no such line is shown.
    expect(box(await editorScreen("home"), "bricks.caption.week")).not.toContain("data-reads");
  });

  it("says in words what a name in braces shows, where the text holds one", async () => {
    const markup = await editorScreen("faq");
    expect(words(box(markup, COST_A))).toContain("{monthlyUsd} shows the monthly price in US dollars (US$200 today).");
    expect(words(box(markup, REFUND_A))).toContain("{freeLists} shows how many Cora Curations are free, as a word (two today).");
    // A text that holds no name has no such line.
    expect(box(markup, "questions.getting-started.items.each-week.a")).not.toContain("data-names");
    // And once for the page, every amount a text may name.
    expect(words(markup)).toContain("{trialCloseDays} shows how many days an unused trial stays open (21 today).");
  });

  it("marks a saved draft as not published yet, and says how many are waiting", async () => {
    await savePageAction(typed("faq", { [REFUND_A]: "No. You can cancel any time." }));
    const markup = await editorScreen("faq");
    expect(words(box(markup, REFUND_A))).toContain("Draft, not published yet");
    expect(words(box(markup, COST_A))).not.toContain("Draft, not published yet");
    expect(words(markup)).toContain("1 change is saved as a draft and not published yet.");
    // Another page says where the waiting draft is not.
    expect(words(await editorScreen("home"))).toContain("1 change is saved as a draft and not published yet, 0 of them on this page.");
  });

  it("has no screen for an address that names no page", async () => {
    for (const page of ["nowhere", "howItWorks", "review"]) expect(words(await editorScreen(page)), page).toContain("There is no such page to edit.");
  });

  it("shows a plain message, and no form to save over what was not read, when the stored wording cannot be read", async () => {
    const working = current;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      current = (async () => {
        throw new Error("fetch failed");
      }) as Query;
      for (const markup of [await editorScreen("home"), await pagesScreen(), await reviewScreen()]) {
        expect(words(markup)).toContain("The site’s saved wording could not be read just now");
        expect(markup).not.toContain("<form");
        expect(markup).not.toContain("<button");
      }
    } finally {
      current = working;
      errors.mockRestore();
    }
  });
});

describe("the launch list (plan R25)", () => {
  it("is a note at the top of the Pages screen and a line on each page's editing screen, with a link that opens in a new tab", async () => {
    admin = OWNER;
    expect(LAUNCH_LIST_URL).toBe("https://claude.ai/artifact/3A2CqfXuFDnr7PDYq776Wj");
    const link = `<a href="${LAUNCH_LIST_URL}" target="_blank" rel="noopener noreferrer"`;
    const list = await pagesScreen();
    expect(list.split(link)).toHaveLength(2);
    expect(words(/<p data-launch-note[\s\S]*?<\/p>/.exec(list)![0])).toContain("Before a release, read each page and tick its checks on the launch list. Open the launch list (opens in a new tab)");
    // Above the list of pages and the publish panel.
    expect(list.indexOf("data-launch-note")).toBeLessThan(list.indexOf("data-publish-panel"));
    expect(list.indexOf("data-launch-note")).toBeLessThan(list.indexOf("data-page="));
    for (const page of ["home", "how-it-works", "use-cases", "faq", "about", "shared"]) {
      const screen = await editorScreen(page);
      expect(screen.split(link), page).toHaveLength(2);
      expect(words(/<p data-launch-line[\s\S]*?<\/p>/.exec(screen)![0]), page).toContain("tick its checks on the launch list.");
    }
  });
});

describe("review and publish", () => {
  beforeEach(() => {
    admin = OWNER;
  });

  it("covers AE2: a draft answer saying “agent” without “AI” saves, the review lists the rule with the word, and publishing anyway puts it on the page with one override row beside the publish row", async () => {
    const answer = "No refunds, but ask your agent to cancel for you.";
    await savePageAction(typed("faq", { [REFUND_A]: answer }));
    expect(await faq()).not.toContain(answer);

    const review = await reviewScreen();
    const seen = words(review);
    expect(seen).toContain("What will change: 1 text");
    // As a visitor reads it: the amount, never its name in braces.
    expect(original(REFUND_A)).toContain("{freeLists}");
    expect(seen).toContain("On the site now No, unless we charge you by mistake: then tell us and we refund the mistaken charge in full to your card. You get two free Cora Curations before any charge, and you can cancel any time.");
    expect(seen).toContain(`After publishing ${answer}`);
    expect(seen).not.toMatch(/\{\w+\}/);
    expect(seen).toContain("Wording warnings: 1");
    const warning = words(/<li data-warning="vocabulary"[\s\S]*?<\/li>/.exec(review)![0]);
    // Which question: its place and its wording, in the list of changes and in the warning.
    expect(warning).toMatch(/^ FAQ, Price and billing: Question \d+ — “Can I get a refund\?” · Answer /);
    expect(words(/<span data-label[\s\S]*?<\/span>/.exec(review)![0])).toMatch(/^ Price and billing: Question \d+ — “Can I get a refund\?” · Answer $/);
    expect(warning).toContain("The rule: It says “agent” without “AI” in front.");
    expect(warning).toContain(`The words: “agent”, in “${answer}”`);
    // Publishing is for the whole site, and the screen says so where the button is.
    expect(seen).toContain("Publishing is for the whole site, not one page. It puts the 1 change above on the site at once (FAQ)");
    expect(seen).toContain("Publish anyway: this 1 change");

    expect(await publishNow()).toMatchObject({ status: "ok", message: "Published. Visitors see the changes from their next page view." });
    expect(await faq()).toContain(answer);
    expect(await logged()).toEqual([
      { admin_email: OWNER, action: "site_content_published", detail: { from: "pages", publishedOverWarnings: 1, changed: [REFUND_A] } },
      { admin_email: OWNER, action: "site_content_wording_override", detail: { field: REFUND_A, where: expect.stringMatching(/^FAQ, Price and billing: Question \d+: Answer$/), rule: "vocabulary", says: "it says “agent” without “AI” in front", words: ["agent"] } },
    ]);
    // No log row holds the text itself.
    expect(JSON.stringify(await logged())).not.toContain("No refunds, but ask");
    expect(cache.tags).toEqual([CONTENT_TAG]);
  });

  it("shows every text as a visitor will read it: amounts filled in, with a line saying which name the editor holds there", async () => {
    await savePageAction(typed("faq", { [REFUND_A]: "No refunds. It is {monthlyUsd} a month, or {monthlyCad} in Canada." }));
    await savePageAction(typed("home", { "bricks.caption.week": "In week {week}" }));
    const review = await reviewScreen();
    const seen = words(review);
    expect(seen).toContain("After publishing No refunds. It is US$200 a month, or CA$280 in Canada.");
    expect(seen).toContain("“US$200” is today’s amount from Settings, typed in the text as {monthlyUsd} . “CA$280” is today’s amount from Settings, typed in the text as {monthlyCad} .");
    expect(seen).toContain("After publishing In week 26");
    expect(seen).toContain("“26” is the number of the last picture, typed in the text as {week} .");
    // The only names in braces on the screen are in those lines.
    expect(review.replace(/<dd data-filled[\s\S]*?<\/dd>/g, "")).not.toMatch(/\{\w+\}/);
    // The text itself is stored as typed: the amount still follows Settings.
    expect((await readStored(current)).draft.text[REFUND_A]).toBe("No refunds. It is {monthlyUsd} a month, or {monthlyCad} in Canada.");
  });

  it("publishes a draft that breaks no rule with no override row, and the button does not say “anyway”", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "Your AI agents, better every Monday" }));
    const seen = words(await reviewScreen());
    expect(seen).not.toContain("Wording warnings");
    expect(seen).toContain("Publish this 1 change");
    expect(seen).not.toContain("anyway");
    await publishNow();
    expect(await home()).toContain("Your AI agents, better every Monday");
    expect((await logged()).map((entry) => entry.action)).toEqual(["site_content_published"]);
    expect((await logged())[0].detail).toEqual({ from: "pages", changed: [HEADLINE] });
  });

  it("makes every draft on the site live at once, whatever page it is on, and names the pages", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "Your AI agents, better every Monday" }));
    await savePageAction(typed("faq", { [REFUND_A]: "No. You can cancel any time." }));
    const seen = words(await reviewScreen());
    expect(seen).toContain("It puts all 2 changes above on the site at once (Home, FAQ)");
    expect(seen).toContain("Publish all 2 changes");
    await publishNow();
    expect(await home()).toContain("Your AI agents, better every Monday");
    expect(await faq()).toContain("No. You can cancel any time.");
    // Nothing is waiting any more, on the review or on the list.
    expect(words(await reviewScreen())).toContain("Nothing is waiting to be published.");
    expect(row(await pagesScreen(), "home")).toContain("No drafts waiting");
    expect(row(await pagesScreen(), "home")).toContain("1 text changed from the original");
  });

  it("lists a warning only for text that differs from what is published: one published over is not listed, or logged, again", async () => {
    await savePageAction(typed("faq", { [REFUND_A]: "No refunds, but ask your agent to cancel for you." }));
    await publishNow();
    await savePageAction(typed("home", { [HEADLINE]: "Your AI agents, better every Monday" }));
    const seen = words(await reviewScreen());
    expect(seen).toContain("What will change: 1 text");
    expect(seen).not.toContain("Wording warnings");
    await publishNow();
    expect((await logged()).map((entry) => entry.action)).toEqual(["site_content_published", "site_content_wording_override", "site_content_published"]);
  });

  it("publishes only the review that was read: a save after the list was made changes nothing and sends the owner back to it (KTD11)", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "Your AI agents, better every Monday" }));
    const read = await keyNow();
    // Another tab saves a text that breaks a rule, after the list was made.
    await savePageAction(typed("faq", { [REFUND_A]: "No refunds, but ask your agent to cancel for you." }));
    cache.tags = [];
    cache.refreshed = 0;
    const state = await publishAction(form({ review: read }));
    expect(state).toMatchObject({ status: "error", message: expect.stringMatching(/^The drafts, the site or the warnings have changed since this list was made, so nothing was published\./) });
    expect((await readStored(current)).published).toEqual(newOverlay());
    expect(await home()).not.toContain("Your AI agents, better every Monday");
    expect(await logged()).toEqual([]);
    // A refused publish expires nothing public. The screen is refreshed, so the list it shows is the new one.
    expect(cache).toEqual({ tags: [], refreshed: 1 });
    // Without a fingerprint at all, nothing is published either.
    expect(await publishAction(form({}))).toMatchObject({ status: "error" });
    expect((await readStored(current)).published).toEqual(newOverlay());
  });

  it("says so when nothing was waiting, and still expires the cached copy: an earlier try may have published and then failed", async () => {
    expect(await publishNow()).toMatchObject({ status: "ok", message: "Nothing was waiting to be published. Everything you have saved is on the site." });
    expect(await logged()).toEqual([]);
    expect(cache.tags).toEqual([CONTENT_TAG]);
  });

  it("does not publish twice: a second press, or a press on a review the Back button brought back, finds nothing waiting and says so plainly", async () => {
    await savePageAction(typed("faq", { [REFUND_A]: "No refunds, but ask your agent to cancel for you." }));
    const read = await keyNow();
    expect(await publishAction(form({ review: read }))).toMatchObject({ status: "ok", message: expect.stringMatching(/^Published\./) });
    const after = await stored();
    cache.tags = [];
    // The same button again, with the fingerprint of the list that has just been published (its warning is gone, so it is stale).
    expect(await publishAction(form({ review: read }))).toMatchObject({ status: "ok", message: "Nothing was waiting to be published. Everything you have saved is on the site." });
    expect(await stored()).toEqual(after);
    // What undo goes back to is still the site before the one real publish, and nothing was logged twice.
    expect((await readStored(current)).previous).toEqual(newOverlay());
    expect((await logged()).map((entry) => entry.action)).toEqual(["site_content_published", "site_content_wording_override"]);
    expect(cache.tags).toEqual([CONTENT_TAG]);
  });

  it("publishes only against the site the list was made for: after an undo in another tab the same draft would change more than was read (KTD11)", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "The first headline" }));
    await publishNow();
    await savePageAction(typed("faq", { [REFUND_A]: "No. You can cancel any time." }));
    // The review lists one change, the answer.
    expect(words(await reviewScreen())).toContain("What will change: 1 text");
    const read = await keyNow();
    await undoPublishAction();
    cache.tags = [];
    expect(await publishAction(form({ review: read }))).toMatchObject({ status: "error", message: expect.stringMatching(/^The drafts, the site or the warnings have changed/) });
    expect(await home()).not.toContain("The first headline");
    expect(cache.tags).toEqual([]);
    // The new list has both, and publishing that one goes through.
    expect(words(await reviewScreen())).toContain("What will change: 2 texts");
    expect(await publishNow()).toMatchObject({ status: "ok" });
    expect(await home()).toContain("The first headline");
  });

  /** The query, with its admin log inserts failing the first `times` times. */
  const logFails = (times: number) => {
    const working = current;
    let left = times;
    current = (async (statement: string, params?: unknown[]) => {
      if (statement.includes("insert into admin_actions") && left-- > 0) throw new Error("fetch failed");
      return working(statement, params);
    }) as Query;
    return () => void (current = working);
  };

  it("says so when the publish landed and its log rows could not be written, and still expires the cached copy", async () => {
    await savePageAction(typed("faq", { [REFUND_A]: "No refunds, but ask your agent to cancel for you." }));
    const key = await keyNow();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const restore = logFails(Infinity);
    const state = await publishAction(form({ review: key }));
    restore();
    // Live, and the screen says the log is missing it, instead of an error page saying nothing happened.
    expect(state).toMatchObject({ status: "ok", message: `Published. Visitors see the changes from their next page view.${NOT_LOGGED}` });
    expect((await readStored(current)).published.text).toEqual({ [REFUND_A]: "No refunds, but ask your agent to cancel for you." });
    expect(cache.tags).toEqual([CONTENT_TAG]);
    // Neither the publish's row nor its override's is half there; the server's log has both.
    expect(await logged()).toEqual([]);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0].at(-1))).toMatch(/site_content_published[\s\S]*site_content_wording_override/);
    errors.mockRestore();
  });

  it("tries the log once more, and then has the publish's row and its override rows together", async () => {
    await savePageAction(typed("faq", { [REFUND_A]: "No refunds, but ask your agent to cancel for you." }));
    const key = await keyNow();
    const restore = logFails(1);
    const state = await publishAction(form({ review: key }));
    restore();
    expect(state).toMatchObject({ status: "ok", message: "Published. Visitors see the changes from their next page view." });
    expect((await logged()).map((entry) => entry.action)).toEqual(["site_content_published", "site_content_wording_override"]);
  });

  it("says so when an undo landed and its log row could not be written", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "Your AI agents, better every Monday" }));
    await publishNow();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const restore = logFails(Infinity);
    const state = await undoPublishAction();
    restore();
    errors.mockRestore();
    expect(state.message).toMatch(new RegExp(`^Undone\\. .*${NOT_LOGGED.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    expect((await readStored(current)).published).toEqual(newOverlay());
  });

  it("gives way with a plain message when another write keeps getting in first", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "Your AI agents, better every Monday" }));
    const key = await keyNow();
    const working = current;
    current = (async (statement: string, params?: unknown[]) => (/^\s*update settings/.test(statement) ? [] : working(statement, params))) as Query;
    const state = await publishAction(form({ review: key }));
    current = working;
    expect(state).toMatchObject({ status: "error", message: "Someone else changed the site’s words at the same moment, so nothing was published. Press the button again." });
    expect((await readStored(current)).published).toEqual(newOverlay());
    expect(cache.tags).toEqual([]);
  });
});

describe("undo last publish", () => {
  beforeEach(() => {
    admin = OWNER;
  });

  it("puts back what the site showed before, logs who, and leaves the drafts", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "The first headline" }));
    await publishNow();
    await savePageAction(typed("home", { [HEADLINE]: "The second headline" }));
    await publishNow();
    // A draft made after the publish, which must survive the undo.
    await savePageAction(typed("faq", { [REFUND_A]: "No. You can cancel any time." }));
    expect(await home()).toContain("The second headline");
    cache.tags = [];

    const list = words(await pagesScreen());
    expect(list).toContain("Undo last publish");
    expect(list).toContain(`Last publish: `);
    expect(list).toContain(`, by ${OWNER}.`);

    expect(await undoPublishAction()).toMatchObject({ status: "ok", message: "Undone. The site shows what it showed before the last publish. Your drafts are still here, to fix and publish again." });
    expect(await home()).toContain("The first headline");
    expect(await home()).not.toContain("The second headline");
    const content = await readStored(current);
    expect(content.draft.text).toEqual({ [HEADLINE]: "The second headline", [REFUND_A]: "No. You can cancel any time." });
    expect(content.previous).toBeNull();
    expect((await logged()).at(-1)).toEqual({ admin_email: OWNER, action: "site_content_publish_undone", detail: { changed: [HEADLINE] } });
    expect(cache.tags).toEqual([CONTENT_TAG]);
    // The undone publish is a draft again: both texts wait to be published.
    expect(words(await reviewScreen())).toContain("What will change: 2 texts");
    expect(words(await pagesScreen())).toContain("Last publish undone: ");

    // There is one step back, not two.
    expect(words(await pagesScreen())).not.toContain("Undo last publish");
    expect(await undoPublishAction()).toMatchObject({ status: "ok", message: "There is no publish to undo." });
    expect(await home()).toContain("The first headline");
  });

  it("is not offered before anything was published", async () => {
    expect(words(await pagesScreen())).not.toContain("Undo last publish");
    expect(words(await reviewScreen())).toContain("There is no publish to undo right now.");
  });
});

/**
 * A page's sections (plan U6, R7): each one switched off or on, or moved up or down, with one press that is saved
 * as a draft, listed in the review as a plain sentence, and published and undone with everything else.
 */
describe("a page's sections", () => {
  beforeEach(() => {
    admin = OWNER;
  });
  const press = (page: string, op: string, section?: string) => sectionsAction(form({ page, op, ...(section ? { section } : {}) }));
  const draftSections = async () => (await readStored(current)).draft.sections;
  /** The names of the sections in the editing screen's panel, in order, each with "off" when it is switched off. */
  const panel = (markup: string) => [...markup.matchAll(/<li data-section-row="([\w-]+)"( data-off="")?/g)].map((m) => (m[2] ? `${m[1]} off` : m[1]));
  const HOME = ["hero", "problem", "examples", "compounds", "testimonials", "control", "price", "questions", "closing"];
  const SWAPPED = HOME.map((id) => (id === "price" ? "questions" : id === "questions" ? "price" : id));
  const sectionsOf = (markup: string) => [...markup.matchAll(/<section\b[^>]*aria-labelledby="([\w-]+)-title"/g)].map((m) => m[1]);
  // The shell: the page a visitor with no script reads. The price block for the visitor's country is streamed in after it.
  const homeMarkup = async () => (await pageMarkup(createElement(V1Home, { version: "v1" }))).split('<div hidden id="S:')[0];

  it("is refused for someone who is not an admin, before the form is read", async () => {
    admin = null;
    await expect(sectionsAction(unread())).rejects.toThrow("Not signed in");
    await expect(press("home", "off", "price")).rejects.toThrow("Not signed in");
    expect(await stored()).toBeUndefined();
    expect(cache).toEqual({ tags: [], refreshed: 0 });
  });

  it("switches a section off as a draft: the page is marked, the review says it in a sentence, and no visitor sees it", async () => {
    const before = await homeMarkup();
    const state = await press("home", "off", "compounds");
    expect(state).toMatchObject({ status: "ok", message: "“It compounds” is switched off. Saved as a draft: visitors see no change until you publish." });
    expect(await draftSections()).toEqual({ home: { order: [], off: ["compounds"] } });
    // A draft: nothing public is expired, the admin's own screen is refreshed, and the page is what it was.
    expect(cache).toEqual({ tags: [], refreshed: 1 });
    expect(await homeMarkup()).toBe(before);
    expect(await logged()).toEqual([]);

    expect(row(await pagesScreen(), "home")).toContain("1 draft not published");
    expect(row(await pagesScreen(), "home")).toContain("Sections changed from the original");
    expect(row(await pagesScreen(), "faq")).not.toContain("Sections changed");
    expect(words(await pagesScreen())).toContain("1 change is saved as a draft");
    const review = await reviewScreen();
    expect(words(review)).toContain("What will change: 1 change to sections");
    expect(words(review)).toContain("Home: the “It compounds” section will be switched off.");
    expect(review).toContain('data-section-change="off"');
    expect(words(review)).toContain("Publish this 1 change");
  });

  it("moves a section up and down among the page's sections, and says where it now is", async () => {
    expect(await press("home", "up", "questions")).toMatchObject({ status: "ok", message: "“Questions” is now above “Price”. Saved as a draft: visitors see no change until you publish." });
    expect(await draftSections()).toEqual({ home: { order: SWAPPED, off: [] } });
    expect(words(await reviewScreen())).toContain("Home: “Questions” moves up, above “Price”.");
    expect(await press("home", "down", "hero")).toMatchObject({ status: "ok", message: expect.stringContaining("“Hero” is now below “The problem”.") });
    expect(words(await reviewScreen())).toContain("What will change: 2 changes to sections");
    // Back where it was: one change is left.
    await press("home", "up", "hero");
    expect(await draftSections()).toEqual({ home: { order: SWAPPED, off: [] } });
  });

  it("changes nothing, and says so, for the first section moved up, the last moved down and a switch already where it is", async () => {
    expect(await press("home", "up", "hero")).toMatchObject({ status: "ok", message: "“Hero” is already the first section." });
    expect(await press("home", "down", "closing")).toMatchObject({ status: "ok", message: "“Closing band” is already the last section." });
    expect(await press("home", "on", "price")).toMatchObject({ status: "ok", message: "“Price” is already switched on." });
    expect(await press("home", "reset")).toMatchObject({ status: "ok", message: "The sections of this page are already as they were originally." });
    expect(await stored()).toBeUndefined();
  });

  it("refuses a fixed section, a section of another page, an unknown page, a page with nothing to move and an unknown press, storing nothing", async () => {
    for (const [page, op, section] of [
      ["howItWorks", "off", "title"],
      ["faq", "up", "title"],
      ["about", "off", "title"],
      ["home", "off", "zack"],
      ["home", "off", "constructor"],
      ["nope", "off", "price"],
      ["shared", "off", "nav"],
      ["shared", "reset", ""],
      ["home", "delete", "price"],
      ["home", "", "price"],
      ["home", "off", ""],
    ]) {
      expect(await press(page, op, section), `${page} ${op} ${section}`).toMatchObject({ status: "error", message: "This page has changed since you opened it, so nothing was saved. Reload the page and try again." });
    }
    expect(await stored()).toBeUndefined();
    expect(cache.refreshed).toBe(0);
  });

  it("shows the panel on the editing screen: every section in the draft's order with its switch and its two buttons, and none for a fixed section", async () => {
    const plain = await editorScreen("home");
    expect(panel(plain)).toEqual(HOME);
    // Each row: a switch that says whether the section is shown, and Move up and Move down as buttons.
    expect(plain.match(/role="switch"/g)).toHaveLength(HOME.length);
    expect(plain).toMatch(/<button type="button" role="switch" aria-checked="true" aria-label="Show “Price” on the page"/);
    expect(plain.match(/data-control="up"/g)).toHaveLength(HOME.length);
    expect(plain.match(/data-control="down"/g)).toHaveLength(HOME.length);
    // The first cannot go up and the last cannot go down: said to a screen reader, and still a button that keeps the focus.
    expect(plain.match(/data-control="up" aria-disabled="true"/g)).toHaveLength(1);
    expect(plain.match(/data-control="down" aria-disabled="true"/g)).toHaveLength(1);
    expect(plain).not.toMatch(/<button[^>]*data-control[^>]*\sdisabled/);
    // Nothing to put back yet.
    expect(plain).not.toContain("data-sections-reset");
    expect(words(plain)).toContain("The “Pricing” link in the header and in the footer of every page lands here.");

    await press("home", "off", "price");
    await press("home", "up", "questions");
    const markup = await editorScreen("home");
    expect(panel(markup)).toEqual(SWAPPED.map((id) => (id === "price" ? "price off" : id)));
    expect(markup).toMatch(/aria-checked="false" aria-label="Show “Price” on the page"/);
    expect(words(markup)).toContain("2 changes to these sections are saved as a draft and not on the site yet.");
    expect(words(markup)).toContain("Put the sections back in their original order and switch all back on");
    // The words follow the same order, and the ones of the section that is off stay, marked.
    const order = [...markup.matchAll(/<section id="section-home-[\w-]+" data-section="([\w-]+)"( data-section-off="")?/g)].map((m) => (m[2] ? `${m[1]} off` : m[1]));
    expect(order).toEqual(SWAPPED.map((id) => (id === "price" ? "price off" : id)));
    expect(box(markup, "priceBlock.title")).toContain(`value="${original("priceBlock.title")}"`);
    expect(words(markup)).toContain("This section is switched off: once that is published, visitors do not see these words. You can still change them.");

    // A reading page: its title is no row, and has no control. Shared has no panel at all.
    const how = await editorScreen("how-it-works");
    expect(panel(how)).toEqual(["week", "zack", "cora", "anatomy", "firstWeeks", "noAgent", "startBand"]);
    expect(how).toContain('id="section-how-it-works-title"');
    const shared = await editorScreen("shared");
    expect(shared).not.toContain("data-sections");
    expect(shared).not.toContain('role="switch"');
    // /faq says, in the owner's words, what switching a group off does to the homepage.
    expect(words(await editorScreen("faq"))).toContain("Switched off, this group’s questions leave the FAQ page, and the homepage’s Questions section leaves them out too.");
  });

  it("gives no two editing screens an id in common: Next keeps the screen a click has left in the document, hidden, beside the one that is shown", async () => {
    const slugs = ["home", "how-it-works", "use-cases", "faq", "about", "shared"];
    const ids = new Map<string, string>();
    for (const slug of slugs) {
      const markup = await editorScreen(slug);
      const own = [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      expect(own.filter((id, i) => own.indexOf(id) !== i), `${slug}: an id twice on one screen`).toEqual([]);
      for (const id of own) {
        expect(ids.get(id), `"${id}" is on ${slug} and on ${ids.get(id)}`).toBeUndefined();
        ids.set(id, slug);
      }
      // Every link within the screen, and every label, finds its target on this screen.
      for (const [, target] of markup.matchAll(/\shref="#([^"]+)"/g)) expect(own, `${slug}: href="#${target}"`).toContain(target);
      for (const [, target] of markup.matchAll(/\saria-labelledby="([^"]+)"/g)) for (const id of target.split(" ")) expect(own, `${slug}: aria-labelledby="${id}"`).toContain(id);
    }
    // The panel's heading is the page's own, and it is where the review's links to a page's sections land.
    expect(await editorScreen("home")).toContain('<h2 id="sections-home" tabindex="-1"');
    expect(await editorScreen("faq")).toContain('<h2 id="sections-faq" tabindex="-1"');
    await press("faq", "off", "startBand");
    await press("home", "off", "price");
    const review = await reviewScreen();
    expect(review).toContain('href="/admin/pages/faq#sections-faq"');
    expect(review).toContain('href="/admin/pages/home#sections-home"');
  });

  it("covers AE3: with Price switched off, the review names the “Pricing” link of the header and the footer, does not block, and logs no override", async () => {
    await press("home", "off", "price");
    const review = await reviewScreen();
    expect(review).toContain('data-link-warning="/#price"');
    expect(words(review)).toContain("Link warnings: 1");
    expect(words(review)).toContain("The “Pricing” link in the header and in the footer of every page points at the “Price” section of Home, which is switched off.");
    expect(words(review)).toContain("Publish anyway: this 1 change");
    expect(await publishNow()).toMatchObject({ status: "ok", message: "Published. Visitors see the changes from their next page view." });
    expect((await logged()).map((entry) => entry.action)).toEqual(["site_content_published"]);
    expect((await logged())[0].detail).toMatchObject({ changed: ["sections.home"] });
    expect(await homeMarkup()).not.toMatch(/\sid="price"/);
    // Still true after the publish, so still said: the link is on the site and the section is not.
    expect(words(await reviewScreen())).toContain("Link warnings: 1");
    expect(words(await reviewScreen())).toContain("Nothing is waiting to be published.");
  });

  it("is published with the texts in one publish, undone with them, and put back by the page's reset", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "A new headline" }));
    await press("home", "off", "compounds");
    await press("home", "up", "questions");
    await press("faq", "off", "zack-and-privacy");
    const review = words(await reviewScreen());
    expect(review).toContain("What will change: 1 text and 3 changes to sections");
    expect(review).toContain("Publish all 4 changes");
    expect(sectionsOf(await homeMarkup())).toEqual(["hero", "problem", "examples", "compounds", "control", "price", "questions", "closing"]);

    expect(await publishNow()).toMatchObject({ status: "ok" });
    expect(cache.tags).toEqual([CONTENT_TAG]);
    expect(sectionsOf(await homeMarkup())).toEqual(["hero", "problem", "examples", "control", "questions", "price", "closing"]);
    expect(await home()).toContain("A new headline");
    expect(sectionsOf(await pageMarkup(createElement(V1Faq, { version: "v1" })))).toEqual(["page", "getting-started", "cora-and-the-ideas", "price-and-billing"]);
    expect(row(await pagesScreen(), "home")).toContain("No drafts waiting");
    expect(row(await pagesScreen(), "home")).toContain("Sections changed from the original");

    // Undo: the site is what it was, and the drafts are still there.
    expect(await undoPublishAction()).toMatchObject({ status: "ok" });
    expect(sectionsOf(await homeMarkup())).toEqual(["hero", "problem", "examples", "compounds", "control", "price", "questions", "closing"]);
    expect(await draftSections()).toEqual({ home: { order: SWAPPED, off: ["compounds"] }, faq: { order: [], off: ["zack-and-privacy"] } });

    // The page's reset: Home's sections only. The text and the other page's sections stay.
    expect(await press("home", "reset")).toMatchObject({ status: "ok", message: "The sections of this page are back as they were originally. Saved as a draft: visitors see no change until you publish." });
    expect(await readStored(current)).toMatchObject({ draft: { text: { [HEADLINE]: "A new headline" }, sections: { faq: { order: [], off: ["zack-and-privacy"] } } } });
    expect(panel(await editorScreen("home"))).toEqual(HOME);
    expect(await editorScreen("home")).not.toContain("data-sections-reset");
  });

  it("publishes only the review that was read: a section switched after the list was made changes nothing (KTD11)", async () => {
    await press("home", "off", "compounds");
    const key = await keyNow();
    await press("home", "off", "price");
    expect(await publishAction(form({ review: key }))).toMatchObject({ status: "error" });
    expect((await readStored(current)).published.sections).toEqual({});
    expect(cache.tags).toEqual([]);
  });
});

describe("the questions the old Edit Questions screen edited (plan R10)", () => {
  const legacy = { refund: { q: "Do you give refunds?", a: "No. You can cancel any time." } };
  const REFUND_Q = "questions.price-and-billing.items.refund.q";

  it("sends its old address on to the FAQ page's editing screen, for an admin and nobody else", async () => {
    expect(await QuestionsPage()).toBeNull();
    admin = OWNER;
    await expect(QuestionsPage()).rejects.toEqual(new Redirected("/admin/pages/faq"));
    expect(await outcome(() => QuestionsPage())).toEqual({ redirect: "/admin/pages/faq" });
  });

  it("are in Pages: every question and answer is a field of the FAQ screen, under its group", async () => {
    admin = OWNER;
    const markup = await editorScreen("faq");
    for (const item of builtInQuestions()) {
      expect(markup, item.id).toContain(`value="${item.q.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;")}"`);
    }
    expect(markup.match(/<legend[^>]*>Question \d+ — “[^<]+”<\/legend>/g)).toHaveLength(builtInQuestions().length);
  });

  it("keep the edits saved there: they are live, shown as changed from the original, and a first draft save does not disturb them", async () => {
    admin = OWNER;
    await current("insert into settings (key, value) values ($1, $2::jsonb)", [LEGACY_QUESTIONS_KEY, JSON.stringify(legacy)]);
    expect(await faq()).toContain("Do you give refunds? No. You can cancel any time.");
    const markup = await editorScreen("faq");
    expect(box(markup, REFUND_Q)).toContain('value="Do you give refunds?"');
    expect(box(markup, REFUND_Q)).toContain("data-edited");
    // Live already, so not a draft that is waiting.
    expect(words(box(markup, REFUND_Q))).not.toContain("Draft, not published yet");
    expect(row(await pagesScreen(), "faq")).toContain("No drafts waiting");
    expect(row(await pagesScreen(), "faq")).toContain("2 texts changed from the original");

    await savePageAction(typed("home", { [HEADLINE]: "A new headline" }));
    expect(await faq()).toContain("Do you give refunds? No. You can cancel any time.");
    expect(await home()).not.toContain("A new headline");
    expect(await stored(LEGACY_QUESTIONS_KEY)).toEqual(legacy);
    expect(words(await reviewScreen())).toContain("What will change: 1 text");
  });

  it("says on the Pages screen when the old screen saved an answer after Pages took over, with its words, and not otherwise", async () => {
    admin = OWNER;
    await current("insert into settings (key, value) values ($1, $2::jsonb)", [LEGACY_QUESTIONS_KEY, JSON.stringify(legacy)]);
    await savePageAction(typed("home", { [HEADLINE]: "A new headline" }));
    expect(await pagesScreen()).not.toContain("data-old-questions");
    // The previous release, still serving during the deploy, saves an answer where nothing reads it now.
    await current("update settings set value = $2::jsonb, updated_at = now() + interval '1 minute' where key = $1", [LEGACY_QUESTIONS_KEY, JSON.stringify({ ...legacy, cost: { a: "It is {monthlyUsd} a month." } })]);
    const note = words(/<div data-old-questions[\s\S]*?<\/div>/.exec(await pagesScreen())![0]);
    expect(note).toContain("Saved on the old questions screen, and not on the site");
    expect(note).toContain("type it again in FAQ and publish");
    expect(note).toMatch(/Price and billing: Question \d+: Answer : “It is US\$200 a month\.”/);
    expect(await faq()).not.toContain("It is US$200 a month.");
  });
});

describe("a page's lists (plan U7, R8)", () => {
  beforeEach(() => {
    admin = OWNER;
  });
  const STARTED = "questions.getting-started.items";
  const BILLING = "questions.price-and-billing.items";
  const STATEMENTS = "home.problem.statements";
  const STEPS = "home.hero.graphic.steps";
  const POINTS = "control.points";
  const press = (page: string, list: string, op: string, more: Record<string, string> = {}) => listAction(form({ page, list, op, ...more }));
  const add = (page: string, list: string, texts: Record<string, string>) => press(page, list, "add", Object.fromEntries(Object.entries(texts).map(([key, value]) => [`new:${key}`, value])));
  const draft = async () => (await readStored(current)).draft;
  /** The items of a list on its editing screen, in order: each by its legend. */
  const legends = (markup: string, list: string) => {
    const block = markup.split(`data-list="${list}"`)[1].split("data-list=")[0];
    return [...block.matchAll(/<li data-item-row="[^"]+"><fieldset[^>]*><legend[^>]*>(.*?)<\/legend>/g)].map((m) => words(m[1]).trim());
  };
  const listBlock = (markup: string, list: string) => markup.split(`data-list="${list}"`)[1].split("data-list=")[0];
  const DRAFT = "Saved as a draft: visitors see no change until you publish.";
  const STALE = "This page has changed since you opened it, so nothing was saved. Reload the page and try again.";

  it("is refused for someone who is not an admin, before the form is read", async () => {
    admin = null;
    await expect(listAction(unread())).rejects.toThrow("Not signed in");
    await expect(press("home", STATEMENTS, "remove", { item: "told" })).rejects.toThrow("Not signed in");
    expect(await stored()).toBeUndefined();
    expect(cache).toEqual({ tags: [], refreshed: 0 });
  });

  it("adds a question with its question and its answer as a draft: the id is made here, the page is marked, and no visitor sees it", async () => {
    const before = await faq();
    const state = await add("faq", STARTED, { q: "  Is there a\nyearly price? ", a: "Not yet. It is {monthlyUsd} a month.", id: "x-chosen-by-the-form" });
    expect(state).toMatchObject({ status: "ok", message: `Added: question “Is there a yearly price?” is number 4 of 4. ${DRAFT}` });
    const id = state.added!;
    expect(id).toMatch(/^x-[0-9a-f]{12}$/);
    expect(await draft()).toEqual({ ...newOverlay(), text: { [`${STARTED}.${id}.q`]: "Is there a yearly price?", [`${STARTED}.${id}.a`]: "Not yet. It is {monthlyUsd} a month." }, lists: { [STARTED]: { order: [], removed: [], added: [id] } } });
    expect(cache).toEqual({ tags: [], refreshed: 1 });
    expect(await faq()).toBe(before);
    expect(await logged()).toEqual([]);
    // A second one gets another id.
    expect((await add("faq", STARTED, { q: "Another?", a: "Yes." })).added).not.toBe(id);

    expect(row(await pagesScreen(), "faq")).toContain("2 drafts not published");
    expect(row(await pagesScreen(), "faq")).toContain("Lists changed from the original");
    expect(row(await pagesScreen(), "faq")).toContain("Original wording");
    expect(row(await pagesScreen(), "home")).not.toContain("Lists changed");
  });

  it("refuses a new item with a required field empty, over its limit or naming an amount that does not exist, says which, and stores nothing", async () => {
    const state = await add("faq", STARTED, { q: "   ", a: "It is {monthlyUsdd}." });
    expect(state).toMatchObject({ status: "error", message: "Not added yet. 2 fields need filling in or fixing first. Nothing you typed is lost.", errors: { q: "This cannot be left empty.", a: expect.stringContaining("{monthlyUsdd} is not a name this text can use") } });
    expect(await add("faq", STARTED, { q: "A question?" })).toMatchObject({ status: "error", errors: { a: "This cannot be left empty." } });
    expect(await add("home", POINTS, { title: "x".repeat(201), body: "Text." })).toMatchObject({ status: "error", errors: { title: "This is 201 characters long, and the most that fits here is 200. Shorten it by 1." } });
    expect(await stored()).toBeUndefined();
    expect(cache.refreshed).toBe(0);
  });

  it("moves an item, removes one and puts it back, and says each in the owner's words", async () => {
    const [first, second, third] = builtInQuestions().slice(0, 3).map((item) => item.q);
    expect(await press("faq", STARTED, "up", { item: "each-week" })).toMatchObject({ status: "ok", message: `Question “${third}” is now number 2 of 3, above “${second}”. ${DRAFT}` });
    expect(await press("faq", STARTED, "down", { item: "no-agents-yet" })).toMatchObject({ status: "ok", message: `Question “${first}” is now number 2 of 3, below “${third}”. ${DRAFT}` });
    expect(await press("faq", STARTED, "up", { item: "each-week" })).toMatchObject({ status: "ok", message: `Question “${third}” is already the first one.` });
    expect(await press("faq", STARTED, "remove", { item: "which-agents" })).toMatchObject({ status: "ok", message: `Question “${second}” is removed from the list. ${DRAFT} “Put back” under the list brings it back.` });
    expect((await draft()).lists).toEqual({ [STARTED]: { order: ["each-week", "no-agents-yet"], removed: ["which-agents"], added: [] } });
    expect(await press("faq", STARTED, "back", { item: "which-agents" })).toMatchObject({ status: "ok", message: `Question “${second}” is back in the list, as number 3 of 3. ${DRAFT}` });
    expect(await press("faq", STARTED, "reset")).toMatchObject({ status: "ok", message: `This list is back to the original questions, in the original order. ${DRAFT}` });
    expect(await press("faq", STARTED, "reset")).toMatchObject({ status: "ok", message: "This list is already the original one." });
    expect((await draft()).lists).toEqual({});
  });

  it("refuses a list of another page, an unknown list, page, item or press, and an id that is no id, storing nothing", async () => {
    for (const [page, list, op, item] of [
      ["home", STARTED, "remove", "each-week"],
      ["faq", STATEMENTS, "remove", "told"],
      ["faq", "questions", "up", "getting-started"],
      ["howItWorks", "howItWorks.zack.points", "remove", "reads"],
      ["nope", STARTED, "up", "each-week"],
      ["faq", "constructor", "up", "each-week"],
      ["faq", STARTED, "up", "cost"],
      ["faq", STARTED, "remove", "constructor"],
      ["faq", STARTED, "back", "each-week"],
      ["faq", STARTED, "up", "../x"],
      ["faq", STARTED, "delete", "each-week"],
      ["faq", STARTED, "", "each-week"],
      ["faq", STARTED, "remove", ""],
    ]) {
      expect(await press(page, list, op, item ? { item } : {}), `${page} ${list} ${op} ${item}`).toMatchObject({ status: "error", message: STALE });
    }
    expect(await add("home", STARTED, { q: "A question?", a: "An answer." })).toMatchObject({ status: "error", message: STALE });
    expect(await stored()).toBeUndefined();
    expect(cache.refreshed).toBe(0);
  });

  it("keeps a list to what its page can draw, and says why: the hero needs two steps and holds five", async () => {
    await press("home", STEPS, "remove", { item: "use" });
    await press("home", STEPS, "remove", { item: "collect" });
    expect(await press("home", STEPS, "remove", { item: "curate" })).toMatchObject({
      status: "error",
      message: "Not removed: this list needs at least 2 steps. It can hold 2 to 5 steps: the picture beside the headline shows one step at a time, with a button for each, and it has room for that many.",
    });
    const step = { label: "New", title: "A new step", body: "Its text." };
    for (let i = 0; i < 3; i++) expect(await add("home", STEPS, step)).toMatchObject({ status: "ok" });
    expect(await add("home", STEPS, step)).toMatchObject({ status: "error", message: expect.stringContaining("Not added: this list already has 5 steps, which is the most it can hold.") });
    expect(await press("home", STEPS, "back", { item: "use" })).toMatchObject({ status: "error", message: expect.stringContaining("Not added: this list already has 5 steps") });
    // The screen says the same before anything is pressed, and marks the buttons that have nothing to do.
    const markup = await editorScreen("home");
    const block = listBlock(markup, STEPS);
    expect(words(block)).toContain("It can hold 2 to 5 steps: the picture beside the headline shows one step at a time, with a button for each, and it has room for that many.");
    expect(words(block)).toContain("This list is full. Remove one to add another.");
    expect(block).toMatch(/data-list-control="add" aria-disabled="true"/);
    expect(block.match(/data-list-control="back" aria-disabled="true"/g)).toHaveLength(2);
    expect(block).not.toMatch(/<button[^>]*data-list-control[^>]*\sdisabled/);
  });

  it("shows each list on its editing screen in the draft's order: items numbered by their place, an added one among them, a removed one under the list with Put back", async () => {
    const plain = await editorScreen("faq");
    const [first, second, third] = builtInQuestions().slice(0, 3).map((item) => item.q);
    expect(legends(plain, STARTED)).toEqual([`Question 1 — “${first}”`, `Question 2 — “${second}”`, `Question 3 — “${third}”`]);
    expect(plain.match(/data-list="/g)).toHaveLength(4);
    expect(words(listBlock(plain, STARTED))).toContain("The questions of this group");
    expect(words(listBlock(plain, STARTED))).toContain("It can hold up to 20 questions.");
    expect(listBlock(plain, STARTED)).not.toContain("data-removed");
    expect(listBlock(plain, STARTED)).not.toContain("data-list-reset");
    // Each item: Move up, Move down and Remove, as buttons that keep the focus. The first cannot go up, the last cannot go down.
    for (const control of ["up", "down", "remove"]) expect(listBlock(plain, STARTED).match(new RegExp(`data-list-control="${control}"`, "g"))).toHaveLength(3);
    expect(listBlock(plain, STARTED).match(/data-list-control="up" aria-disabled="true"/g)).toHaveLength(1);
    expect(listBlock(plain, STARTED).match(/data-list-control="down" aria-disabled="true"/g)).toHaveLength(1);
    // A question's switch for the homepage, as the copy has it.
    expect(box(plain, `${STARTED}.no-agents-yet.home`)).toMatch(/<input type="checkbox"[^>]*checked=""/);
    expect(box(plain, `${BILLING}.refund.home`)).not.toMatch(/checked=""/);
    expect(words(box(plain, `${BILLING}.refund.home`))).toContain("Show on the homepage Ticked, the homepage’s Questions section shows this question too");

    const { added: id } = await add("faq", STARTED, { q: "Is there a yearly price?", a: "Not yet." });
    await press("faq", STARTED, "up", { item: id! });
    await press("faq", STARTED, "up", { item: id! });
    await press("faq", STARTED, "remove", { item: "which-agents" });
    await savePageAction(typed("faq", { [`${STARTED}.${id}.a`]: "Not yet. It is {monthlyUsd} a month." }));
    const markup = await editorScreen("faq");
    expect(legends(markup, STARTED)).toEqual([`Question 1 — “${first}”`, "Question 2 — “Is there a yearly price?”", `Question 3 — “${third}”`]);
    const block = listBlock(markup, STARTED);
    expect(words(block)).toContain("New: a draft, not published yet");
    expect(words(block.split('data-removed-item="which-agents"')[1].split("</li>")[0])).toContain(`“${second}” (still on the site until you publish) Put back : ${second}`);
    expect(block).toContain("data-list-reset");
    expect(words(block)).toContain("2 changes to this list are saved as a draft and not on the site yet.");
    // The added item's own boxes: its saved wording, no original to reset to, and marked as a draft.
    expect(box(markup, `${STARTED}.${id}.a`)).toContain("Not yet. It is {monthlyUsd} a month.");
    expect(box(markup, `${STARTED}.${id}.a`)).not.toContain("data-reset");
    expect(box(markup, `${STARTED}.${id}.a`)).not.toContain("Changed from the original");
    expect(words(box(markup, `${STARTED}.${id}.q`))).toContain("Draft, not published yet");
    expect(words(markup)).toContain("2 changes are saved as a draft and not published yet");
    // The removed question's boxes are not on screen.
    expect(markup).not.toContain(`id="field-${STARTED}.which-agents.q"`);
    // Home's lists are Home's.
    const homeScreen = await editorScreen("home");
    expect([...homeScreen.matchAll(/data-list="([^"]+)"/g)].map((m) => m[1])).toEqual([STEPS, STATEMENTS, "examples", POINTS]);
    expect(words(listBlock(homeScreen, STATEMENTS))).toContain("It can hold up to 6 statements: the page sets them three in a row, in up to two rows.");
  });

  it("cannot reset or empty a text of an item that was added here, and saves a switch like a text", async () => {
    const { added: id } = await add("faq", STARTED, { q: "Is there a yearly price?", a: "Not yet." });
    expect(await savePageAction(form({ page: "faq", reset: `${STARTED}.${id}.a` }))).toMatchObject({ status: "error", message: STALE });
    expect(await savePageAction(typed("faq", { [`${STARTED}.${id}.a`]: "  " }))).toMatchObject({ status: "error", errors: { [`${STARTED}.${id}.a`]: "This cannot be left empty." } });
    expect(await savePageAction(typed("faq", { [`${STARTED}.${id}.home`]: "yes", [`${BILLING}.refund.home`]: "yes" }))).toMatchObject({ status: "ok", saved: { [`${STARTED}.${id}.home`]: "yes", [`${BILLING}.refund.home`]: "yes" } });
    // Ticked, a built-in question's box differs from the original; a new question's has no original to differ from.
    const screen = await editorScreen("faq");
    expect(box(screen, `${BILLING}.refund.home`)).toContain("Changed from the original");
    expect(box(screen, `${STARTED}.${id}.home`)).toContain('checked=""');
    expect(box(screen, `${STARTED}.${id}.home`)).not.toContain("Changed from the original");
    expect(box(screen, `${STARTED}.${id}.home`)).not.toContain("data-reset");
    expect(await savePageAction(typed("faq", { [`${BILLING}.refund.home`]: "perhaps" }))).toMatchObject({ status: "error", errors: { [`${BILLING}.refund.home`]: expect.stringContaining("switched on or off") } });
    // A text typed into an item another tab has removed is not stored, and says so.
    await press("faq", STARTED, "remove", { item: id! });
    expect(await savePageAction(typed("faq", { [`${STARTED}.${id}.a`]: "Late typing." }))).toMatchObject({ status: "error", message: STALE });
    expect((await draft()).text).toEqual({ [`${BILLING}.refund.home`]: "yes" });
    // A switch goes back to the original with its reset.
    expect(await savePageAction(form({ page: "faq", reset: `${BILLING}.refund.home` }))).toMatchObject({ status: "ok" });
    expect(await draft()).toEqual(newOverlay());
  });

  it("covers AE8 (questions): the review tells each list change in a plain sentence, a publish puts them on /faq and the homepage, undo takes them back, and the drafts stay", async () => {
    const [, second, third] = builtInQuestions().slice(0, 3).map((item) => item.q);
    const { added: id } = await add("faq", STARTED, { q: "Is there a yearly price?", a: "Our agent says not yet. It is {monthlyUsd} a month.", home: "yes" });
    await press("faq", STARTED, "up", { item: id! });
    await press("faq", STARTED, "remove", { item: "which-agents" });
    await press("home", STEPS, "up", { item: "collect" });
    await savePageAction(typed("faq", { [`${BILLING}.cost.home`]: "no" }));
    const beforeFaq = await faq();
    const beforeHome = await home();

    const review = await reviewScreen();
    const read = words(review);
    // The one change outside the lists is a question's tick box, which is counted as what it is, not as a text.
    expect(read).toContain("What will change: 1 tick box and 3 changes to lists");
    expect(read).toContain("Home, Hero: step “Collect” moves up, above “Use”.");
    expect(read).toContain(`FAQ, Getting started: question 2 “${second}” is removed.`);
    expect(read).toContain("FAQ, Getting started: a new question “Is there a yearly price?” is added, as number 2 of 3.");
    // The new item's texts, as a visitor will read them, and its switch.
    expect(read).toContain("Question Is there a yearly price? Answer Our agent says not yet. It is US$200 a month. Show on the homepage On");
    expect([...review.matchAll(/data-list-change="(\w+)"/g)].map((m) => m[1])).toEqual(["moved", "removed", "added"]);
    expect(review).toContain(`href="/admin/pages/faq#list-${STARTED}"`);
    expect(review).toContain(`href="/admin/pages/home#list-${STEPS}"`);
    // The switch of a built-in question is a change of its own, told as on and off.
    expect(read).toContain("Price and billing: Question 1 — “What does it cost?” · Show on the homepage Edit : Question 1 — “What does it cost?” · Show on the homepage On the site now On After publishing Off");
    // The added answer is read by the wording rules, and named by its place in the draft.
    expect(review).toContain('data-warning="vocabulary"');
    expect(read).toContain("FAQ, Getting started: Question 2 — “Is there a yearly price?” · Answer The rule: It says “agent” without “AI” in front.");
    expect(read).toContain("Publish anyway");
    expect(read).toContain("Publishing is for the whole site, not one page. It puts all 4 changes above on the site at once (Home, FAQ)");
    expect(words(await pagesScreen())).toContain("4 changes are saved as a draft");
    // The Pages screen counts the built-in question's tick box as a tick box; the new question has no original to differ from.
    expect(row(await pagesScreen(), "faq")).toContain("1 tick box changed from the original");
    expect(row(await pagesScreen(), "faq")).toContain("Original wording");

    expect(await publishNow()).toMatchObject({ status: "ok", message: "Published. Visitors see the changes from their next page view." });
    expect(cache.tags).toEqual([CONTENT_TAG]);
    const afterFaq = await faq();
    expect(afterFaq).toContain("Is there a yearly price? Our agent says not yet. It is US$200 a month.");
    expect(afterFaq).not.toContain(second);
    expect(afterFaq.indexOf("Is there a yearly price?")).toBeLessThan(afterFaq.indexOf(third));
    const afterHome = await home();
    expect(afterHome).toContain("Is there a yearly price?");
    expect(afterHome).not.toContain("What does it cost?");
    expect(afterHome.indexOf("Zack reviews your week")).toBeLessThan(afterHome.indexOf("Set up your AI agents. If you"));
    // One publish row, and one override row that names the added answer by its place.
    expect((await logged()).map((entry) => [entry.action, entry.detail.where ?? null])).toEqual([
      ["site_content_published", null],
      ["site_content_wording_override", "FAQ, Getting started: Question 2: Answer"],
    ]);
    expect(words(await reviewScreen())).toContain("Nothing is waiting to be published.");
    expect(row(await pagesScreen(), "faq")).toContain("No drafts waiting");
    expect(row(await pagesScreen(), "faq")).toContain("Lists changed from the original");

    expect(await undoPublishAction()).toMatchObject({ status: "ok" });
    expect(await faq()).toBe(beforeFaq);
    expect(await home()).toBe(beforeHome);
    expect(words(await pagesScreen())).toContain("4 changes are saved as a draft");
    // Put back and reset in the draft, published again: the pages are the original ones.
    await press("faq", STARTED, "back", { item: "which-agents" });
    expect(await press("faq", STARTED, "reset")).toMatchObject({ status: "ok" });
    await press("home", STEPS, "reset");
    await savePageAction(form({ page: "faq", reset: `${BILLING}.cost.home` }));
    expect(await draft()).toEqual(newOverlay());
    expect(words(await reviewScreen())).toContain("Nothing is waiting to be published.");
  });

  it("is not published when a list has changed since the draft was checked", async () => {
    await press("home", STATEMENTS, "remove", { item: "told" });
    const key = await keyNow();
    await press("home", STATEMENTS, "up", { item: "alone" });
    expect(await publishAction(form({ review: key }))).toMatchObject({ status: "error" });
    expect((await readStored(current)).published.lists).toEqual({});
    expect(cache.tags).toEqual([]);
  });

  it("has nothing to publish when the draft differs from the site only by wording kept for a removed item", async () => {
    await press("home", STATEMENTS, "remove", { item: "told" });
    await publishNow();
    cache.tags = [];
    await savePageAction(typed("home", { [`${STATEMENTS}.told.text`]: "Typed while it is removed." }));
    expect(words(await reviewScreen())).toContain("Nothing is waiting to be published.");
    expect(row(await pagesScreen(), "home")).toContain("No drafts waiting");
    expect(await publishNow()).toMatchObject({ status: "ok", message: "Nothing was waiting to be published. Everything you have saved is on the site." });
    // Put back, the item returns with that wording, as a change to review.
    await press("home", STATEMENTS, "back", { item: "told" });
    expect(words(await reviewScreen())).toContain("Home, The problem: statement “Typed while it is removed.” is put back, as number 1 of 3.");
  });
});

describe("the header's and the footer's links, and the examples (plan U8)", () => {
  beforeEach(() => {
    admin = OWNER;
  });
  const press = (page: string, list: string, op: string, more: Record<string, string> = {}) => listAction(form({ page, list, op, ...more }));
  const add = (page: string, list: string, texts: Record<string, string>) => press(page, list, "add", Object.fromEntries(Object.entries(texts).map(([key, value]) => [`new:${key}`, value])));
  const draft = async () => (await readStored(current)).draft;
  const chrome = async () => (await import("@/lib/site/chrome")).getSiteChrome("v1");
  const play = { label: "Weekly invoice chaser", category: "Getting paid", title: "Chase unpaid invoices", summary: "Each Friday the AI agent drafts a reminder for each unpaid invoice.", install: "Save this as a skill called Invoice chaser.", playbook: "## What it does\nDrafts reminders.\n\n## Steps\n1. Read the ledger.\n2. Draft." };

  it("adds a link to the header that points at a page by its address, publishes it, and the header shows it last and the footer does not", async () => {
    const state = await add("shared", "nav", { label: " Run Zack ", href: " /zack " });
    expect(state).toMatchObject({ status: "ok" });
    const id = state.added!;
    expect((await draft()).text).toEqual({ [`nav.${id}.label`]: "Run Zack", [`nav.${id}.href`]: "/zack" });
    // A draft: the header is as it was.
    expect((await chrome()).links.map((link) => link.label)).toEqual(["How it works", "Pricing", "Use cases", "FAQ", "About"]);
    expect(await publishNow()).toMatchObject({ status: "ok" });
    const after = await chrome();
    expect(after.links.at(-1)).toEqual({ id, label: "Run Zack", href: "/zack" });
    expect(after.footer.map((link) => link.label)).toEqual(["Pricing", "How it works", "FAQ", "About", "Use cases"]);
    // Six links: the header shows them in a row from 1280 pixels, in its menu below that.
    expect(after.navRow).toBe("xl");
  });

  it("refuses a link with no words or nowhere to go, and an address a link may not point at, beside the field, and stores nothing", async () => {
    for (const bad of ["javascript:alert(1)", "//evil.test", "http://x.test", "data:text/html,x", " https://user:pw@x.test", "faq"]) {
      expect(await add("shared", "nav", { label: "Bad", href: bad }), bad).toMatchObject({ status: "error", errors: { href: DESTINATION_REFUSAL } });
    }
    expect(await add("shared", "nav", { label: "  ", href: "/faq" })).toMatchObject({ status: "error", errors: { label: "This cannot be left empty." } });
    expect(await add("shared", "footer.links", { label: "Help" })).toMatchObject({ status: "error", errors: { href: "This cannot be left empty." } });
    expect(await stored()).toBeUndefined();
    // A built-in link's address saved with Save draft is held to the same rule.
    expect(await savePageAction(typed("shared", { "nav.faq.href": "javascript:alert(1)" }))).toMatchObject({ status: "error", errors: { "nav.faq.href": DESTINATION_REFUSAL } });
    expect(await savePageAction(typed("shared", { "nav.faq.label": "" }))).toMatchObject({ status: "error", errors: { "nav.faq.label": expect.stringContaining("cannot be left empty") } });
    expect(await stored()).toBeUndefined();
    for (const ok of ["/#price", "https://x.test", "mailto:a@b.test", "/faq"]) expect(await savePageAction(typed("shared", { "nav.faq.href": ok })), ok).toMatchObject({ status: "ok" });
  });

  it("holds the header to six links and one at least, and the footer to eight, on the server", async () => {
    expect(await add("shared", "nav", { label: "Six", href: "/zack" })).toMatchObject({ status: "ok" });
    expect(await add("shared", "nav", { label: "Seven", href: "/zack" })).toMatchObject({ status: "error", message: expect.stringContaining("already has 6 links") });
    for (const item of ["howItWorks", "pricing", "library", "faq", "about"]) expect(await press("shared", "nav", "remove", { item }), item).toMatchObject({ status: "ok" });
    expect((await chrome()).links).toHaveLength(5);
    const left = (await readStored(current)).draft;
    expect(Object.keys(left.lists)).toEqual(["nav"]);
    // The last link of the header stays: the menu needs one.
    const [last] = (await import("@/lib/site/content/model")).itemsOn(left, "nav");
    expect(await press("shared", "nav", "remove", { item: last })).toMatchObject({ status: "error", message: expect.stringContaining("at least 1 link") });
    for (let i = 0; i < 3; i++) expect(await add("shared", "footer.links", { label: `Link ${i}`, href: "/zack" }), String(i)).toMatchObject({ status: "ok" });
    expect(await add("shared", "footer.links", { label: "Ninth", href: "/zack" })).toMatchObject({ status: "error", message: expect.stringContaining("already has 8 links") });
    // A list of another page is refused whatever the form says.
    expect(await press("home", "nav", "up", { item: "faq" })).toMatchObject({ status: "error" });
  });

  it("reorders the footer's links and puts one back, the small print staying where it is", async () => {
    await press("shared", "footer.links", "down", { item: "pricing" });
    await press("shared", "footer.links", "remove", { item: "about" });
    await publishNow();
    let after = await chrome();
    expect(after.footer.map((link) => link.id)).toEqual(["howItWorks", "pricing", "faq", "library"]);
    expect(after.legal.map((link) => link.href)).toEqual(["/privacy", "/terms"]);
    await press("shared", "footer.links", "back", { item: "about" });
    await publishNow();
    after = await chrome();
    expect(after.footer.map((link) => link.id)).toEqual(["howItWorks", "pricing", "faq", "about", "library"]);
    await press("shared", "footer.links", "reset");
    await publishNow();
    expect((await chrome()).footer.map((link) => link.id)).toEqual(["pricing", "howItWorks", "faq", "about", "library"]);
  });

  it("offers each covered page and each section with an anchor by name on the editing screen, and says where a link goes in the review", async () => {
    const screen = await editorScreen("shared");
    const select = screen.split('id="input-nav.pricing.href-pick"')[1].split("</select>")[0];
    for (const option of ["Home", "Home — Price section", "How it works", "How it works — Zack, in detail section", "FAQ", "FAQ — Price and billing section", "Use cases", "Use cases — Not in the library yet? section", "About", "Another address (type it below)"]) expect(words(select), option).toContain(option);
    expect(select).toMatch(/<option value="\/#price" selected="">Home — Price section<\/option>/);
    // An address that is none of them shows in its own box.
    await savePageAction(typed("shared", { "nav.faq.href": "https://help.example.test/faq" }));
    const typedScreen = await editorScreen("shared");
    expect(typedScreen).toMatch(/<input id="input-nav\.faq\.href" type="text"[^>]*value="https:\/\/help\.example\.test\/faq"/);
    await savePageAction(typed("shared", { "nav.pricing.href": "/faq" }));
    const review = words(await reviewScreen());
    expect(review).toContain("On the site now Home — Price section (/#price) After publishing FAQ (/faq)");
    expect(review).toContain("After publishing https://help.example.test/faq");
    // The header's list says where the two buttons are.
    expect(words(screen)).toContain("Sign in and the start button are not in this list");
  });

  it("adds an example, holds the list to four, and shows it on the homepage after publishing, a removed first example's tab gone (AE8)", async () => {
    const state = await add("home", "examples", play);
    expect(state).toMatchObject({ status: "ok", message: expect.stringContaining("Added: example “Weekly invoice chaser” is number 4 of 4.") });
    expect(await add("home", "examples", { ...play, label: "Fifth" })).toMatchObject({ status: "error", message: expect.stringContaining("already has 4 examples") });
    await press("home", "examples", "remove", { item: "video" });
    expect(await home()).toContain("On-demand video creation");
    const review = words(await reviewScreen());
    expect(review).toContain("Home, Cora Curation examples: a new example “Weekly invoice chaser” is added, as number 3 of 3.");
    expect(review).toContain("Home, Cora Curation examples: example 1 “On-demand video creation” is removed.");
    await publishNow();
    const page = await home();
    expect(page).not.toContain("On-demand video creation");
    expect(page).toContain("Weekly invoice chaser");
    expect(page.indexOf("20 new prospects every day")).toBeLessThan(page.indexOf("Weekly invoice chaser"));
  });

  it("refuses an example with a text missing, or a name in braces in its playbook, and keeps a playbook's lines", async () => {
    expect(await add("home", "examples", { ...play, playbook: "" })).toMatchObject({ status: "error", errors: { playbook: "This cannot be left empty." } });
    expect(await add("home", "examples", { ...play, playbook: "## One\nOn {date}." })).toMatchObject({ status: "error", errors: { playbook: expect.stringContaining("{date} is not something this text can hold") } });
    expect(await stored()).toBeUndefined();
    await savePageAction(typed("home", { "examples.video.playbook": "## 1. Play\r\nOne line.\r\n\r\n\r\n## 2. Trigger\r\nAnother." }));
    expect((await draft()).text["examples.video.playbook"]).toBe("## 1. Play\nOne line.\n\n## 2. Trigger\nAnother.");
  });

  it("says under each playbook what the card makes of it, and for the first example whether How it works can pair its notes", async () => {
    const screen = await editorScreen("home");
    const video = box(screen, "examples.video.playbook");
    expect(video).toContain('data-playbook-check="ok"');
    expect(words(video)).toContain("The card finds 8 parts");
    expect(words(video)).toContain("How it works takes this first example apart, with a note beside each of its parts.");
    // The paper's seventh part is "Pitfalls to watch for": not first, nothing is said about How it works.
    expect(words(box(screen, "examples.paper.playbook"))).not.toContain("How it works");
    // A box as tall as a playbook.
    expect(video).toMatch(/<textarea[^>]*rows="28"/);
    // The examples' note names the reset and the first example.
    expect(words(screen)).toContain("The plays are approved text");
    await savePageAction(typed("home", { "examples.video.playbook": "#1. Play\nText." }));
    const broken = words(box(await editorScreen("home"), "examples.video.playbook"));
    expect(broken).toContain("The card cannot find this playbook’s parts.");
    expect(broken).toContain("This playbook does not have them, so that page shows the notes in a list beside the whole playbook.");
  });
});

/**
 * Preview (plan U9, R14, AE1, KTD7): the Preview buttons post a page's id to a route that checks the admin, switches
 * on Draft Mode and sends the browser to the page's public address; the pages then show the drafts to that admin,
 * and to nobody else. Exit and sign-out switch it off.
 */
describe("preview (plan U9, R14, AE1)", () => {
  beforeEach(() => {
    admin = OWNER;
  });
  const SITE = "https://meetroger.ai";
  const post = (path: string, body?: FormData | string, headers: Record<string, string> = { origin: SITE, host: "meetroger.ai" }) => new Request(`${SITE}${path}`, { method: "POST", headers, ...(body === undefined ? {} : { body }) });
  const enter = (page: string | null, headers?: Record<string, string>) => previewRoute(post("/admin/pages/preview", page === null ? undefined : form({ page }), headers));
  const exit = (from: string | null, headers: Record<string, string> = { origin: SITE, host: "meetroger.ai" }) => exitRoute(post("/admin/pages/preview/exit", undefined, from === null ? headers : { ...headers, referer: `${SITE}${from}` }));
  const inPreview = () => jar.has(DRAFT_COOKIE);

  it("refuses someone who is not an admin before the form is read, and switches nothing on", async () => {
    admin = null;
    const req = new Request(`${SITE}/admin/pages/preview`, { method: "POST", headers: { origin: SITE, host: "meetroger.ai" } });
    Object.defineProperty(req, "formData", {
      value: () => {
        throw new Error("the form was read before the admin check");
      },
    });
    const res = await previewRoute(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin");
    expect(inPreview()).toBe(false);
  });

  it("sends an admin to the page's own address with Draft Mode on, for each covered page; Shared opens the homepage", async () => {
    for (const [page, address] of [["home", "/"], ["howItWorks", "/how-it-works"], ["library", "/library"], ["faq", "/faq"], ["about", "/about"], ["shared", "/"]]) {
      resetNextFakes();
      const res = await enter(page);
      expect(res.status, page).toBe(303);
      expect(res.headers.get("location"), page).toBe(address);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(inPreview(), page).toBe(true);
    }
  });

  it("takes a page id only: an unknown id, an address, or no form enables nothing and stays in the admin", async () => {
    for (const page of ["nope", "/", "https://evil.test", "//evil.test", "/admin", "javascript:alert(1)", "", null]) {
      resetNextFakes();
      const res = await enter(page);
      expect(res.status, String(page)).toBe(303);
      expect(res.headers.get("location"), String(page)).toBe("/admin/pages");
      expect(inPreview(), String(page)).toBe(false);
    }
    // Not a form at all.
    resetNextFakes();
    const res = await previewRoute(post("/admin/pages/preview", "page=home", { origin: SITE, host: "meetroger.ai", "content-type": "text/plain" }));
    expect(res.headers.get("location")).toBe("/admin/pages");
    expect(inPreview()).toBe(false);
  });

  it("answers only a POST from a page of this site", async () => {
    const res = await enter("home", { origin: "https://evil.test", host: "meetroger.ai" });
    expect(res.status).toBe(403);
    expect(inPreview()).toBe(false);
    expect(previewGet().status).toBe(405);
    expect(exitGet().status).toBe(405);
  });

  it("covers AE1: a draft headline is on the homepage for the admin in preview, and the published one for a visitor, for the cookie alone, and after the preview ends", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "The drafted headline" }));
    const published = original(HEADLINE);
    expect(await home()).toContain(published);
    expect(await home()).not.toContain("The drafted headline");

    await enter("home");
    expect(await home()).toContain("The drafted headline");
    expect(await home()).not.toContain(published);
    // The header and the footer take the drafts too, in the same render.
    await savePageAction(typed("shared", { "nav.faq.label": "Questions asked" }));
    expect((await (await import("@/lib/site/chrome")).getSiteChrome("v1")).links.map((link) => link.label)).toContain("Questions asked");

    // The cookie on its own: a copied cookie, or an admin whose session has ended.
    admin = null;
    expect(await home()).toContain(published);
    expect(await home()).not.toContain("The drafted headline");
    admin = OWNER;

    const res = await exit("/faq");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/faq");
    expect(inPreview()).toBe(false);
    expect(await home()).toContain(published);
    // Publishing is still a separate step: nothing was published by previewing.
    expect(await logged()).toEqual([]);
    expect((await readStored(current)).published).toEqual(newOverlay());
  });

  it("lands Exit on the page it was pressed on when that is a covered page, and on the homepage for anything else", async () => {
    for (const [from, to] of [["/how-it-works", "/how-it-works"], ["/library", "/library"], ["/about", "/about"], ["/", "/"], ["/zack", "/"], ["/admin/pages", "/"], ["/faq?x=1", "/faq"], [null, "/"]] as const) {
      resetNextFakes();
      jar.set(DRAFT_COOKIE, "bypass");
      const res = await exit(from);
      expect(res.headers.get("location"), String(from)).toBe(to);
      expect(inPreview()).toBe(false);
    }
    // Another site's address in the header is only compared, never sent back.
    resetNextFakes();
    const res = await exitRoute(post("/admin/pages/preview/exit", undefined, { origin: SITE, host: "meetroger.ai", referer: "https://evil.test/faq" }));
    expect(res.headers.get("location")).toBe("/faq");
    expect((await exit("/faq", { origin: "https://evil.test", host: "meetroger.ai" })).status).toBe(403);
  });

  it("ends when the admin signs out of the admin", async () => {
    jar.set(DRAFT_COOKIE, "bypass");
    expect(await outcome(() => signOutAction())).toEqual({ redirect: "/admin" });
    expect(inPreview()).toBe(false);
  });

  it("puts a Preview button on each page's editing screen and in the review's publish panel, each a form that sends the page's id and opens a new tab", async () => {
    for (const page of ["home", "faq", "shared"]) {
      const screen = await editorScreen(page);
      const button = /<form[^>]*data-preview="([^"]+)"[\s\S]*?<\/form>/.exec(screen)!;
      expect(button[1]).toBe(page === "faq" ? "faq" : page);
      expect(button[0]).toContain('method="post"');
      expect(button[0]).toContain('action="/admin/pages/preview"');
      expect(button[0]).toContain('target="_blank"');
      expect(button[0]).toContain(`<input type="hidden" name="page" value="${page}"/>`);
    }
    // Nothing waiting: nothing to preview from the review.
    expect(await reviewScreen()).not.toContain("data-preview=");
    await savePageAction(typed("home", { [HEADLINE]: "The drafted headline" }));
    await sectionsAction(form({ page: "faq", op: "off", section: "startBand" }));
    const panel = /<div data-publish-panel[\s\S]*?<\/div>\s*<div class="space-y-3">/.exec(await reviewScreen())![0];
    expect([...panel.matchAll(/data-preview="([^"]+)"/g)].map((m) => m[1])).toEqual(["home", "faq"]);
    expect(words(panel)).toContain("Preview Home");
    expect(words(panel)).toContain("Preview FAQ");
  });
});

/** The link and page warnings of the review (plan U9, R17, AE3): what the drafts would take off a page that a link of the site still points at. */
describe("the review's link and page warnings (plan U9, R17)", () => {
  beforeEach(() => {
    admin = OWNER;
  });
  const sections = (page: string, op: string, section: string) => sectionsAction(form({ page, op, section }));
  const lists = (page: string, list: string, op: string, more: Record<string, string> = {}) => listAction(form({ page, list, op, ...more }));

  it("warns that Home has no main heading with its Hero off, and the Use cases page with its introduction off, each with a way to the sections", async () => {
    await sections("home", "off", "hero");
    let review = await reviewScreen();
    expect(review).toContain('data-heading-warning="home"');
    expect(words(review)).toContain("Page warnings: 1");
    expect(words(review)).toContain("The homepage would have no main heading: its “Hero” section, which holds the page’s headline, is switched off.");
    expect(review).toMatch(/data-heading-warning="home"[\s\S]*?href="\/admin\/pages\/home#sections-home"/);
    expect(words(review)).toContain("Publish anyway: this 1 change");

    await sections("library", "off", "intro");
    review = await reviewScreen();
    expect(words(review)).toContain("Page warnings: 2");
    expect(words(review)).toContain("The Use cases page would have no main heading: its “Introduction” section");
    // Not an override of a wording rule: published, it logs the publish only.
    expect(await publishNow()).toMatchObject({ status: "ok" });
    expect((await logged()).map((entry) => entry.action)).toEqual(["site_content_published"]);
  });

  it("covers AE3 for a typed address: a header link typed as /#price with Price off is named, with a way to the sections and to the link", async () => {
    const added = await lists("shared", "nav", "add", { "new:label": "Our price", "new:href": "/#price" });
    expect(added).toMatchObject({ status: "ok" });
    await sections("home", "off", "price");
    const review = await reviewScreen();
    expect(words(review)).toContain("Link warnings: 2");
    expect(words(review)).toContain("The “Our price” link in the header of every page points at the “Price” section of Home, which is switched off.");
    const item = /<li[^>]*data-link-warning="\/#price"[^>]*>(?:(?!<\/li>)[\s\S])*Our price[\s\S]*?<\/li>/.exec(review)![0];
    expect(item).toContain('href="/admin/pages/home#sections-home"');
    expect(item).toContain(`href="/admin/pages/shared#field-nav.${added.added}.href"`);
    expect(await publishNow()).toMatchObject({ status: "ok" });
    expect((await logged()).map((entry) => entry.action)).toEqual(["site_content_published"]);
  });

  it("names a link to an example that the drafts remove, and says nothing of a link to a page or to another site", async () => {
    await savePageAction(typed("shared", { "footer.links.faq.href": "/#examples-paper", "footer.links.about.href": "https://example.test/about" }));
    expect(await reviewScreen()).not.toContain("data-link-warnings");
    await lists("home", "examples", "remove", { item: "paper" });
    const review = await reviewScreen();
    expect(review).toContain('data-link-kind="removed"');
    expect(words(review)).toContain("Link warnings: 1");
    expect(words(review)).toMatch(/The “FAQ” link in the footer of every page points at the example “[^”]+” on Home, which is removed from the list\./);
    expect(review).toMatch(/data-link-kind="removed"[\s\S]*?href="\/admin\/pages\/home#list-examples"/);
  });
});
