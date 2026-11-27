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
import { Redirected, nextHeaders, nextNavigation, outcome, resetNextFakes } from "@/test-helpers/next-fakes";
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
  return { getV3SettingsForDisplay: async () => mergeV3([]) };
});
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => {
    if (!admin) throw new Error("Not signed in");
    return admin;
  },
  isAdmin: async () => Boolean(admin),
}));

const { publishAction, savePageAction, undoPublishAction } = await import("./actions");
const { default: PagesScreen } = await import("./page");
const { default: EditorScreen } = await import("./[page]/page");
const { default: ReviewScreen } = await import("./review/page");
const { default: QuestionsPage } = await import("../questions/page");
const { LAUNCH_LIST_URL } = await import("./launch-list");
const { CONTENT_TAG, getSiteContent } = await import("@/lib/site/content/read");
const { CONTENT_KEY, LEGACY_QUESTIONS_KEY, readStored } = await import("@/lib/site/content/store");
const { draftChanges, reviewKey, wordingWarnings } = await import("@/lib/site/content/check");
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
    expect(await faq()).toContain("No. You get two free Cora Curations before any charge, and you can cancel any time.");
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
    // One Save for the page.
    expect(markup.match(/<button type="submit"/g)).toHaveLength(1);
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
    expect(words(box(markup, REFUND_A))).toContain("Visitors read: No. You get two free Cora Curations before any charge, and you can cancel any time.");
    expect(box(markup, "questions.getting-started.items.each-week.a")).not.toContain("data-reads");
    // A caption's two names change with the picture: nothing is filled in, and no such line is shown.
    expect(box(await editorScreen("home"), "bricks.caption.week")).not.toContain("data-reads");
  });

  it("says in words what a name in braces shows, where the text holds one", async () => {
    const markup = await editorScreen("faq");
    expect(words(box(markup, COST_A))).toContain("{monthlyUsd} shows the monthly price in US dollars (US$200 today).");
    expect(words(box(markup, REFUND_A))).toContain("{freeLists} shows how many lists are free, as a word (two today).");
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
    expect(seen).toContain("On the site now No. You get two free Cora Curations before any charge, and you can cancel any time.");
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

    expect(await publishNow()).toMatchObject({ status: "ok", message: "Published. Visitors see the new wording from their next page view." });
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

  it("expires the cached copy when the publish landed and its log row could not be written", async () => {
    await savePageAction(typed("home", { [HEADLINE]: "Your AI agents, better every Monday" }));
    const key = await keyNow();
    const working = current;
    current = (async (statement: string, params?: unknown[]) => {
      if (statement.includes("insert into admin_actions")) throw new Error("fetch failed");
      return working(statement, params);
    }) as Query;
    await expect(publishAction(form({ review: key }))).rejects.toThrow("fetch failed");
    current = working;
    // It is live in the database, so the pages' cached copy must not outlive it.
    expect((await readStored(current)).published.text).toEqual({ [HEADLINE]: "Your AI agents, better every Monday" });
    expect(cache.tags).toEqual([CONTENT_TAG]);
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
});
