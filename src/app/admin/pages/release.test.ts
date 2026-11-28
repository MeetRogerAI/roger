/**
 * "Differs from the release" and "Reset all to the release" on the Pages
 * screen (plan U10, R21, AE10), on a site whose release file brings its own
 * wording, list and removal: production after a release. On an in-process
 * Postgres.
 */
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { nextHeaders, nextNavigation, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";
import { testDb } from "@/test-helpers/pglite-db";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://test.invalid/none";
});

// The release this site runs: a new note under the price, the problem statements filled to the six they may be
// (one built-in taken out, four added), so there is no room left for an item of the site's own.
vi.mock("@/data/site/released.json", () => ({
  default: {
    format: 1,
    text: {
      "priceBlock.monthly.note": "The released note under the price.",
      "home.problem.statements.x-rel1.text": "Released statement one.",
      "home.problem.statements.x-rel2.text": "Released statement two.",
      "home.problem.statements.x-rel3.text": "Released statement three.",
      "home.problem.statements.x-rel4.text": "Released statement four.",
    },
    sections: {},
    lists: { "home.problem.statements": { order: [], removed: ["alone"], added: ["x-rel1", "x-rel2", "x-rel3", "x-rel4"] } },
  },
}));

const cache = vi.hoisted(() => ({ tags: [] as string[] }));
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {}, refresh: () => {}, updateTag: (tag: string) => void cache.tags.push(tag) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), ...nextNavigation }));
let current: Query;
let admin: string | null = null;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));
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

const { resetToReleaseAction, undoPublishAction } = await import("./actions");
const { default: PagesScreen } = await import("./page");
const { CONTENT_KEY, readStored } = await import("@/lib/site/content/store");
const { reviewKey } = await import("@/lib/site/content/check");
const { codeModel, layoutOn } = await import("@/lib/site/content/model");
const { emptyOverlay } = await import("@/lib/site/content/format");
const { V1Home } = await import("@/components/site/v1/home");

const NOTE = "priceBlock.monthly.note";
const OWN_NOTE = "Production's own note under the price.";
const OWNER = "owner@example.com";
const overlay = (o: Record<string, unknown> = {}) => ({ format: 1, text: {}, sections: {}, lists: {}, ...o });
const put = (value: unknown) => current("insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [CONTENT_KEY, JSON.stringify(value)]);
const words = (markup: string) => markup.replace(/<!--[^>]*-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const home = async () => words(await pageMarkup(createElement(V1Home, { version: "v1" })));
const screen = async () => pageMarkup(await PagesScreen());
const panel = (markup: string) => /<div data-release-panel[\s\S]*?(?=<div><h2 class="text-title">The pages)/.exec(markup)![0];
const seen = async () => {
  const fd = new FormData();
  fd.set("seen", reviewKey(await readStored(current), []));
  return fd;
};
const logged = () => current<{ admin_email: string; action: string }>("select admin_email, action from admin_actions order by id");

beforeEach(async () => {
  ({ query: current } = await testDb());
  admin = OWNER;
  cache.tags = [];
  resetNextFakes({}, { "x-vercel-ip-country": "US" });
});

describe("differs from the release (plan AE10)", () => {
  it("shows the site's note over the released one, lists that one field with both wordings, and resets and undoes", async () => {
    await put({ draft: overlay({ text: { [NOTE]: OWN_NOTE } }), published: overlay({ text: { [NOTE]: OWN_NOTE } }), previous: null });
    expect(await home()).toContain(OWN_NOTE);
    expect(await home()).not.toContain("The released note under the price.");

    let list = panel(await screen());
    expect(words(list)).toContain("1 difference from the release on this site.");
    expect(list.match(/data-release-text="/g)).toHaveLength(1);
    expect(list).toContain(`data-release-text="${NOTE}"`);
    expect(words(/<dd data-release-from[^>]*>[\s\S]*?<\/dd>/.exec(list)![0])).toContain("The released note under the price.");
    expect(words(/<dd data-release-to[^>]*>[\s\S]*?<\/dd>/.exec(list)![0])).toContain(OWN_NOTE);
    expect(list).toContain("data-reset-all");

    expect(await resetToReleaseAction(await seen())).toMatchObject({ status: "ok" });
    expect(cache.tags).toContain("site-content");
    expect(await home()).toContain("The released note under the price.");
    expect(await home()).not.toContain(OWN_NOTE);
    list = panel(await screen());
    expect(list).toContain("data-release-none");
    expect(list).not.toContain("data-release-text");

    expect(await undoPublishAction()).toMatchObject({ status: "ok" });
    expect(await home()).toContain(OWN_NOTE);
    expect(panel(await screen())).toContain(`data-release-text="${NOTE}"`);
    // Nothing is left waiting to publish after the undo: the draft came back with the edits.
    expect((await screen()).includes("saved as a draft")).toBe(false);
  });

  it("throws away the unpublished drafts, says how many first, and brings them back on undo", async () => {
    const draft = overlay({ text: { [NOTE]: OWN_NOTE, "home.hero.headline": "A drafted headline." } });
    await put({ draft, published: overlay({ text: { [NOTE]: OWN_NOTE } }), previous: null });
    expect(await screen()).toContain("1 change is"); // the Publish panel's count, which the confirmation repeats
    await resetToReleaseAction(await seen());
    const after = await readStored(current);
    expect(after.draft).toEqual(emptyOverlay);
    expect(after.published).toEqual(emptyOverlay);
    await undoPublishAction();
    const back = await readStored(current);
    expect(back.draft.text).toEqual({ [NOTE]: OWN_NOTE, "home.hero.headline": "A drafted headline." });
    expect(back.published.text).toEqual({ [NOTE]: OWN_NOTE });
  });

  it("refuses someone who is not an admin before reading anything, and logs who ran it", async () => {
    await put({ draft: overlay({ text: { [NOTE]: OWN_NOTE } }), published: overlay({ text: { [NOTE]: OWN_NOTE } }), previous: null });
    admin = null;
    const unread = new Proxy(new FormData(), {
      get(_target, name) {
        throw new Error(`the form was read (${String(name)}) before the admin check`);
      },
    });
    await expect(resetToReleaseAction(unread)).rejects.toThrow("Not signed in");
    expect((await readStored(current)).published.text).toEqual({ [NOTE]: OWN_NOTE });
    expect(cache.tags).toEqual([]);
    admin = OWNER;
    await resetToReleaseAction(await seen());
    expect(await logged()).toEqual([{ admin_email: OWNER, action: "site_content_reset_to_release" }]);
  });

  it("resets nothing when the site's words have changed since the list was read", async () => {
    await put({ draft: overlay({ text: { [NOTE]: OWN_NOTE } }), published: overlay({ text: { [NOTE]: OWN_NOTE } }), previous: null });
    const fd = await seen();
    await put({ draft: overlay({ text: { [NOTE]: "Saved in another tab." } }), published: overlay({ text: { [NOTE]: OWN_NOTE } }), previous: null });
    expect(await resetToReleaseAction(fd)).toMatchObject({ status: "error" });
    expect((await readStored(current)).published.text).toEqual({ [NOTE]: OWN_NOTE });
    expect(await logged()).toEqual([]);
  });

  it("says beside an edit, or a list change, in a section switched off on this site that no visitor sees it", async () => {
    // A heading edited in "It compounds", a question added to a group, and both sections switched off: the edits stay
    // listed (they still differ, and a reset takes them), and each says why the page does not show it.
    const own = overlay({
      text: { "home.compounds.title": "A heading nobody sees.", [NOTE]: OWN_NOTE, "questions.getting-started.items.x-q1.q": "An added question?", "questions.getting-started.items.x-q1.a": "An answer." },
      sections: { home: { order: [], off: ["compounds"] }, faq: { order: [], off: ["getting-started"] } },
      lists: { "questions.getting-started.items": { order: [], removed: [], added: ["x-q1"] } },
    });
    await put({ draft: own, published: own, previous: null });
    const list = panel(await screen());
    const item = (attribute: string) => {
      const at = list.indexOf(attribute);
      expect(at, attribute).toBeGreaterThan(-1);
      return list.slice(list.lastIndexOf("<li", at), list.indexOf("</li>", at) + 5);
    };
    expect(item('data-release-text="home.compounds.title"')).toContain("data-release-hidden");
    expect(words(item('data-release-text="home.compounds.title"'))).toContain("No visitor sees this: “It compounds” is switched off on this site.");
    expect(item('data-release-list-change="added"')).toContain("data-release-hidden");
    expect(item(`data-release-text="${NOTE}"`)).not.toContain("data-release-hidden");
  });

  it("is empty on a site with nothing of its own, and offers no reset", async () => {
    const list = panel(await screen());
    expect(list).toContain("data-release-none");
    expect(list).not.toContain("data-reset-all");
  });
});

describe("what a release did to the site's own changes", () => {
  it("reports an item the site added that the release's fuller list pushed out, with its wording, and the item the release took out", async () => {
    const own = overlay({ text: { "home.problem.statements.x-prod1.text": "Production's own statement." }, lists: { "home.problem.statements": { order: [], removed: [], added: ["x-prod1"] } } });
    await put({ draft: own, published: own, previous: null });
    const markup = await screen();
    const list = panel(markup);
    expect(list).toContain('data-release-pushed-out="home.problem.statements"');
    expect(words(list)).toContain("Production's own statement.");
    expect(words(list)).toContain("The next save on this site deletes it.");
    expect(list).toContain('data-release-removed="home.problem.statements"');
    expect(words(list)).toContain(`“${codeModel.home.problem.statements.find((item) => item.id === "alone")!.text.replace(/[.]$/, "")}”.`);
    expect(words(list)).toContain("No site can put it back from Pages");
    // It is not a difference: the site does not show it.
    expect(list).toContain("data-release-none");
  });

  it("says that a page whose sections the site has moved keeps a section on that a release switches off", async () => {
    const order = [...layoutOn(emptyOverlay, "home").order];
    [order[0], order[1]] = [order[1], order[0]];
    await put({ draft: overlay({ sections: { home: { order, off: [] } } }), published: overlay({ sections: { home: { order, off: [] } } }), previous: null });
    const list = panel(await screen());
    expect(list).toContain('data-release-whole-order="home"');
    expect(list).toContain('data-release-section="moved"');
  });
});
