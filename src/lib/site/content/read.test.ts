/**
 * What a public page is handed of the stored content (plan U4, R18, AE7):
 * the release file with the site's published edits on it, and the release
 * file alone whenever those edits cannot be read.
 *
 * The release file is replaced here by one that holds a headline and a
 * sub-line, so that the three layers can be told apart. The real file is
 * empty on this branch. Everything else is real: the registry, the model, the
 * statements (on an in-process Postgres) and the reader.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { v1 } from "@/data/site/v1";
import type { Query } from "@/lib/db-query";
import { testDb } from "@/test-helpers/pglite-db";
import { amountsFrom } from "../amounts";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("@/data/site/released.json", () => ({
  default: { format: 1, text: { "home.hero.headline": "Released headline.", "home.hero.sub": "Released sub-line." }, sections: {}, lists: {} },
}));

let current: Query;
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));

const { getSiteContent, CONTENT_TAG } = await import("./read");
const { baseline, codeModel, composeOverlays, releasedOverlay, v1Copy } = await import("./model");
const { CONTENT_KEY, LEGACY_QUESTIONS_KEY, publish, readPublished, readStored, saveDraft } = await import("./store");
const { emptyOverlay, newOverlay } = await import("./format");

const amounts = amountsFrom(v3Defaults);
const ADMIN = "admin@example.com";
const HEADLINE = "home.hero.headline";
const SUB = "home.hero.sub";
const START = "buttons.start";
const REFUND_A = "questions.price-and-billing.items.refund.a";
const released = { [HEADLINE]: "Released headline.", [SUB]: "Released sub-line." };
const edits = (text: Record<string, string>) => ({ ...newOverlay(), text });
const put = (key: string, stored: unknown) => current("insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [key, JSON.stringify(stored)]);
/** Saves the wording into the draft and publishes that draft, as an admin's two steps. */
const publishText = async (text: Record<string, string | null>) => {
  const saved = await saveDraft(current, Object.entries(text).map(([field, value]) => ({ field, text: value })));
  if (!saved.ok) throw new Error(saved.reason);
  return publish(current, ADMIN, saved.content.draft);
};
const down: Query = async () => {
  throw new Error("fetch failed");
};

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  ({ query: current } = await testDb());
  process.env.DATABASE_URL = "postgres://test.invalid/none";
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.DATABASE_URL;
  errors.mockRestore();
});

describe("the layers, with a release file that holds a headline", () => {
  it("has the release file as the middle layer: the baseline is the code copy with it applied", () => {
    expect(releasedOverlay.text).toEqual(released);
    expect(baseline.home.hero).toMatchObject({ headline: "Released headline.", sub: "Released sub-line." });
    expect(codeModel.home.hero.headline).toBe(v1.home.hero.headline);
  });

  it("gives the release file alone with no row and no old questions row, so every page shows the baseline", async () => {
    const content = await getSiteContent();
    expect(content).toEqual(edits(released));
    const { copy } = v1Copy(amounts, content);
    expect(copy.home.hero).toMatchObject({ headline: "Released headline.", sub: "Released sub-line." });
    // Everything the release does not hold is the code copy's.
    expect({ ...copy, home: { ...copy.home, hero: v1Copy(amounts).copy.home.hero } }).toEqual(v1Copy(amounts).copy);
    expect(errors).not.toHaveBeenCalled();
  });

  it("gives the release file alone with no database, without asking for one", async () => {
    delete process.env.DATABASE_URL;
    current = down;
    expect(await getSiteContent()).toEqual(edits(released));
    expect(errors).not.toHaveBeenCalled();
  });

  it("puts the site's published edits on top: an edit to a field the release also holds wins over it", async () => {
    await publishText({ [SUB]: "The site's own sub-line.", [START]: "Start now" });
    expect(await getSiteContent()).toEqual(edits({ [HEADLINE]: "Released headline.", [SUB]: "The site's own sub-line.", [START]: "Start now" }));
    expect(v1Copy(amounts, await getSiteContent()).copy.home.hero).toMatchObject({ headline: "Released headline.", sub: "The site's own sub-line." });
  });

  it("drops a published entry that says what the release already says: it is no edit", async () => {
    // Written by hand, as a site holds it after a release made its own edit the built-in wording.
    await put(CONTENT_KEY, { draft: edits({ [HEADLINE]: "Released headline.", [START]: "Start now" }), published: edits({ [HEADLINE]: "Released headline.", [START]: "Start now" }), previous: null });
    expect((await readPublished(current)).text).toEqual({ [START]: "Start now" });
    expect((await readStored(current)).draft.text).toEqual({ [START]: "Start now" });
    // The page still shows the headline: it is the baseline's now.
    expect((await getSiteContent()).text).toEqual({ ...released, [START]: "Start now" });
  });

  it("lets a site put the code's own wording back over a released one", async () => {
    await publishText({ [HEADLINE]: v1.home.hero.headline });
    expect((await readPublished(current)).text).toEqual({ [HEADLINE]: v1.home.hero.headline });
    // Against the code copy that is no difference, so the one overlay a page gets does not name the field.
    expect((await getSiteContent()).text).toEqual({ [SUB]: "Released sub-line." });
    expect(v1Copy(amounts, await getSiteContent()).copy.home.hero.headline).toBe(v1.home.hero.headline);
  });

  it("writes two layers as one overlay on the code copy: sections merged by id, and list entries carried, the site's in place of the release's", () => {
    expect(composeOverlays(emptyOverlay, emptyOverlay)).toEqual(emptyOverlay);
    expect(composeOverlays(edits(released), emptyOverlay)).toEqual(edits(released));
    const swapped = ["hero", "problem", "examples", "compounds", "testimonials", "control", "questions", "price", "closing"];
    // The release has Questions above Price on Home, "It compounds" off, and one group of /faq off.
    const below = { ...edits(released), sections: { home: { order: swapped, off: ["compounds"] }, faq: { order: [], off: ["getting-started"] } }, lists: { "home.problem.statements": { order: [], removed: ["alone"], added: [] } } };
    // The site switches Price off on Home, and says nothing about the order or about /faq.
    const above = { ...edits({ [SUB]: "Own sub-line.", "no.such.field": "x", [START]: "{nope}" }), sections: { home: { order: [], off: ["price"] } }, lists: {} };
    expect(composeOverlays(below, above)).toEqual({
      format: 1,
      text: { [HEADLINE]: "Released headline.", [SUB]: "Own sub-line." },
      // Not the site's entry in place of the release's: the release's order and its switched-off section, with the site's on top.
      sections: { home: { order: swapped, off: ["compounds", "price"] }, faq: { order: [], off: ["getting-started"] } },
      lists: { "home.problem.statements": { order: [], removed: ["alone"], added: [] } },
    });
    // An entry that changes nothing is in no result.
    expect(composeOverlays({ ...emptyOverlay, sections: { home: { order: [], off: [] } } }, { ...emptyOverlay, sections: { faq: { order: [], off: [] } } }).sections).toEqual({});
  });
});

describe("a draft is not public (plan R13)", () => {
  it("does not change the reader's answer until it is published", async () => {
    await saveDraft(current, [{ field: START, text: "Start now" }]);
    expect(await getSiteContent()).toEqual(edits(released));
    const { draft } = await readStored(current);
    await publish(current, ADMIN, draft);
    expect((await getSiteContent()).text[START]).toBe("Start now");
  });
});

describe("the questions saved before the content row existed (plan R10)", () => {
  it("are given by the reader while there is no row, and the answer is the same after the first save stores them", async () => {
    await put(LEGACY_QUESTIONS_KEY, { refund: { a: "No. You can cancel any time." }, cost: { a: "{monthlyUsd} a month, plus tax." } });
    const before = await getSiteContent();
    expect(before.text).toEqual({ ...released, [REFUND_A]: "No. You can cancel any time.", "questions.price-and-billing.items.cost.a": "{monthlyUsd} a month, plus tax." });
    const answers = v1Copy(amounts, before).copy.questions[3].items;
    expect(answers.find((item) => item.id === "refund")!.a).toBe("No. You can cancel any time.");
    expect(answers.find((item) => item.id === "cost")!.a).toBe("US$200 a month, plus tax.");

    await saveDraft(current, [{ field: START, text: "Start now" }]);
    const row = await readStored(current);
    expect(row.stored).toBe(true);
    expect(row.published).toEqual(edits({ [REFUND_A]: "No. You can cancel any time.", "questions.price-and-billing.items.cost.a": "{monthlyUsd} a month, plus tax." }));
    expect(row.draft.text).toEqual({ ...row.published.text, [START]: "Start now" });
    expect(await getSiteContent()).toEqual(before);
  });
});

describe("when the stored content cannot be read (plan R18, AE7)", () => {
  it("gives the release file alone when the query throws, and the stored content again at the next call that succeeds", async () => {
    await publishText({ [START]: "Start now", [SUB]: "The site's own sub-line." });
    const working = current;
    const withEdits = await getSiteContent();
    expect(withEdits.text).toEqual({ [HEADLINE]: "Released headline.", [SUB]: "The site's own sub-line.", [START]: "Start now" });

    current = down;
    await expect(getSiteContent()).resolves.toEqual(edits(released));
    expect(v1Copy(amounts, await getSiteContent()).copy.buttons.start).toBe("Get two free Cora Curations");
    // The failure is said once for each read, with no text of the site's in it.
    expect(errors).toHaveBeenCalledTimes(2);
    expect(errors.mock.calls[0]).toEqual(["[site content] The published content could not be read. Pages show the built-in wording.", "fetch failed"]);

    current = working;
    expect(await getSiteContent()).toEqual(withEdits);
  });

  it("gives the baseline for a row that holds nonsense", async () => {
    for (const stored of ["text", 12, null, [], [{ published: {} }], { unknown: true }, { published: "x" }, { published: { format: 1, text: "x", sections: 3 } }, { published: { format: 7, text: { [START]: "x" } } }]) {
      await put(CONTENT_KEY, stored);
      expect(await getSiteContent(), JSON.stringify(stored)).toEqual(edits(released));
    }
    // And for entries no page can print, beside one that it can.
    // Through JSON.parse, as the row arrives: an object literal would set the prototype and hold no such key.
    await put(CONTENT_KEY, JSON.parse(`{"published":{"format":1,"text":{"${START}":"{nope}","no.such.field":"x","${SUB}":12,"footer.place":"Roger, Hamilton","__proto__":"x"}}}`));
    expect((await getSiteContent()).text).toEqual({ ...released, "footer.place": "Roger, Hamilton" });
    expect(errors).not.toHaveBeenCalled();
  });

  it("catches the failure outside the cached function, so a failed read is never what the cache keeps", () => {
    const code = readFileSync(path.join(process.cwd(), "src/lib/site/content/read.ts"), "utf8").replace(/\r\n/g, "\n");
    const cached = /\nasync function cachedPublished\(\)[^{]*\{([\s\S]*?)\n\}/.exec(code)![1];
    expect(cached).toContain('"use cache";');
    expect(cached).toContain("cacheTag(CONTENT_TAG);");
    // "No database" is a true answer and stays inside. A failure is thrown: nothing in here stands in for one.
    expect(cached).toContain("if (!hasDb()) return emptyOverlay;");
    expect(cached).toContain("return readPublished(query);");
    expect(cached).not.toMatch(/\bcatch\b|\btry\b/);
    // The one "use cache" of the file is that function's, and the function is not exported.
    expect(code.match(/"use cache";/g)).toHaveLength(1);
    expect(code).not.toMatch(/export async function cachedPublished/);
    const around = /\nexport async function getSiteContent\(\)[^{]*\{([\s\S]*?)\n\}/.exec(code)![1];
    expect(around).toMatch(/try \{\s*published = await cachedPublished\(\);\s*\} catch \(error\) \{/);
    // The module holds only the read (plan KTD8): one function, and the tag the writers expire.
    expect([...code.matchAll(/\nexport (?:async function|function|const) (\w+)/g)].map((m) => m[1])).toEqual(["CONTENT_TAG", "getSiteContent"]);
    expect(CONTENT_TAG).toBe("site-content");
  });

  it("has no catch in the statements it reads through either: the store throws when the database does", async () => {
    current = down;
    await expect(readPublished(current)).rejects.toThrow("fetch failed");
    await expect(readStored(current)).rejects.toThrow("fetch failed");
  });
});
