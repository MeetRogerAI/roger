/**
 * The public pages with stored content under them (plan U4): every page of
 * site version 1, rendered through the root layout, so the header and the
 * footer are on each one.
 *
 * - With no database, a database with nothing stored, a database that does
 *   not answer, or a row that holds nonsense, every page is the baseline,
 *   byte for byte (plan R18, AE7).
 * - What is published shows on the page it belongs to, and the shared words
 *   show everywhere they are printed.
 * - A draft shows nowhere (plan R13).
 * - Every caller of v1Copy hands it the published content.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/db-query";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { testDb } from "@/test-helpers/pglite-db";
import { at, renderSitePages, type RenderedPage } from "@/test-helpers/site-pages";

const db = vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  return { on: true };
});
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => at.path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/font/google", () => ({ Mona_Sans: () => ({ variable: "font-mona-test" }) }));
vi.mock("@/lib/watches", () => ({ confirmWatch: async () => null, stopWatch: async () => null }));

let current: Query;
// The one switch every reader asks, and the one query the content goes through. The settings and the library read
// through the driver's own tag, which gives nothing here: they are not this test's subject, and stay at their defaults.
vi.mock("@/lib/db", () => ({ hasDb: () => db.on, sql: Object.assign(async () => [], { query: async () => [] }) }));
vi.mock("@/lib/db-query", () => ({ query: (t: string, p?: unknown[]) => current(t, p) }));

const { CONTENT_KEY, publish, saveDraft } = await import("./store");

const ADMIN = "admin@example.com";
const put = (stored: unknown) => current("insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value", [CONTENT_KEY, JSON.stringify(stored)]);
const render = async () => {
  resetNextFakes({}, { "x-vercel-ip-country": "US" });
  return renderSitePages("v1");
};
const text = (markup: string) => markup.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const page = (pages: RenderedPage[], at: string) => pages.find((p) => p.path === at)!;
const NOT_FOUND = "/a-page-that-is-not-there";

/**
 * Every page with no database at all, and every page with a database that has nothing stored. The two are the
 * baseline. They are the same markup except on the three pages that read something else from a database when
 * there is one, whatever the content (the free Zack run's two look a run up, the library lists its use cases):
 * so each case below is held to the one it is.
 */
let noDatabase: RenderedPage[];
let plain: RenderedPage[];
beforeAll(async () => {
  db.on = false;
  current = async () => {
    throw new Error("no database is asked for anything");
  };
  noDatabase = await render();
  expect(noDatabase.length).toBe(13);
  db.on = true;
  ({ query: current } = await testDb());
  plain = await render();
}, 120_000);

beforeEach(async () => {
  ({ query: current } = await testDb());
  db.on = true;
});

const sameAsPlain = (pages: RenderedPage[], why: string) => {
  for (const p of pages) expect(p.markup === page(plain, p.path).markup, `${p.path} ${why}`).toBe(true);
};

describe("every public page shows the baseline", () => {
  it("with no database, and with a database that has nothing stored: the same page", () => {
    const readMore = ["/zack/claude", "/zack/other", "/library"];
    for (const p of plain) expect(p.markup === page(noDatabase, p.path).markup, p.path).toBe(!readMore.includes(p.path));
    // Those three differ in what else they read, not in the site's words: the header, the footer and the heading are the same.
    const chrome = (markup: string) => [/<header\b[\s\S]*?<\/header>/.exec(markup)![0], /<footer\b[\s\S]*?<\/footer>/.exec(markup)![0], /<h1\b[\s\S]*?<\/h1>/.exec(markup)![0]];
    for (const at of readMore) expect(chrome(page(plain, at).markup), at).toEqual(chrome(page(noDatabase, at).markup));
    // And the baseline is the code copy: the built-in button is in every header.
    for (const p of plain) expect(p.markup, p.path).toContain("Get two free Cora Curations");
  });

  it("with a database that has nothing stored, every time", async () => {
    sameAsPlain(await render(), "with nothing stored");
  });

  it("with a database that does not answer (plan AE7), and says so in the log", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      current = async () => {
        throw new Error("fetch failed");
      };
      sameAsPlain(await render(), "with the database down");
      expect(errors).toHaveBeenCalled();
      expect(errors.mock.calls.every((call) => String(call[0]).startsWith("[site content]"))).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  it("with a content row that holds nonsense", async () => {
    for (const stored of ["text", [1, 2], { published: "x", draft: 3 }, { published: { format: 1, text: { "buttons.start": "{nope}", "nav.faq": "", "home.hero.headline": 12, "no.such.field": "x" } } }]) {
      await put(stored);
      sameAsPlain(await render(), `with ${JSON.stringify(stored)} stored`);
    }
  });

  it("with a draft and nothing published: a draft is on no page", async () => {
    expect(await saveDraft(current, [{ field: "home.hero.headline", text: "A draft headline." }, { field: "buttons.start", text: "A draft button" }])).toMatchObject({ ok: true, changed: true });
    sameAsPlain(await render(), "with a draft saved");
  });
});

describe("what is published", () => {
  const published = {
    "buttons.start": "Start with {freeLists} free Cora Curations",
    "buttons.signIn": "Log in",
    "nav.faq": "Questions",
    "footer.place": "Roger, Hamilton",
    cardLine: "No card needed for your first {freeLists}.",
    "notFound.title": "Nothing lives at this address",
    "home.hero.headline": "Smarter every Monday.",
    "questions.price-and-billing.items.refund.a": "No. You can cancel any time, and it costs {monthlyUsd} a month until you do.",
    "faq.title": "Every question",
    "howItWorks.title": "The whole week",
    "howItWorks.week.days.sunday.body": "On Sunday Zack reads the week.",
    "about.leadIn": "Roger is one person: Peter Kuperman.",
    "letter.greeting": "Hello there,",
    "letter.paragraphs.who.text": "I am Peter, and I run Roger by myself.",
    "library.title.first": "What AI agents",
    "library.intro": "[count] things people did with an AI agent, each linked to the post it came from.",
    "library.band": "See what your own week could hold.",
  };
  let pages: RenderedPage[];
  beforeEach(async () => {
    const saved = await saveDraft(current, Object.entries(published).map(([field, text]) => ({ field, text })));
    if (!saved.ok) throw new Error(`${saved.reason} ${saved.field}`);
    expect(await publish(current, ADMIN, saved.content.draft)).toMatchObject({ ok: true, changed: true });
    pages = await render();
  });

  it("shows the shared words wherever they are printed: the header and the footer of every page, and each page's start band", () => {
    for (const p of pages) {
      const header = /<header\b[\s\S]*?<\/header>/.exec(p.markup)![0];
      const footer = /<footer\b[\s\S]*?<\/footer>/.exec(p.markup)![0];
      // The amount an edited label names is filled in, as in the built-in one.
      expect(text(header), p.path).toContain("Start with two free Cora Curations");
      expect(text(header), p.path).not.toContain("Get two free Cora Curations");
      expect(text(header), p.path).toContain("Log in");
      expect(text(header), p.path).toContain("Questions");
      expect(text(footer), p.path).toContain("Roger, Hamilton");
      expect(text(footer), p.path).toContain("Questions");
      expect(p.markup, p.path).not.toMatch(/\{\w+\}/);
    }
    for (const at of ["/faq", "/how-it-works", "/about"]) {
      const main = /<main\b[\s\S]*?<\/main>/.exec(page(pages, at).markup)![0];
      expect(text(main), at).toContain("Start with two free Cora Curations");
      expect(text(main), at).toContain("No card needed for your first two.");
    }
    // The homepage's hero and the library's band print the same button.
    expect(text(/<main\b[\s\S]*?<\/main>/.exec(page(pages, "/").markup)![0])).toContain("Start with two free Cora Curations");
    expect(text(/<main\b[\s\S]*?<\/main>/.exec(page(pages, "/library").markup)![0])).toContain("Start with two free Cora Curations");
  });

  it("shows each page's own words on that page", () => {
    const shown = (at: string) => text(/<main\b[\s\S]*?<\/main>/.exec(page(pages, at).markup)![0]);
    expect(shown("/")).toContain("Smarter every Monday.");
    expect(shown("/faq")).toContain("Every question");
    expect(shown("/faq")).toContain("No. You can cancel any time, and it costs US$200 a month until you do.");
    expect(shown("/how-it-works")).toContain("The whole week");
    expect(shown("/how-it-works")).toContain("On Sunday Zack reads the week.");
    expect(shown("/about")).toContain("Roger is one person: Peter Kuperman. Hello there, I am Peter, and I run Roger by myself.");
    expect(shown("/library")).toContain("What AI agents");
    expect(shown("/library")).toMatch(/\d[\d,]* things people did with an AI agent, each linked to the post it came from\./);
    expect(shown("/library")).toContain("See what your own week could hold.");
    expect(shown(NOT_FOUND)).toContain("Nothing lives at this address");
    expect(shown(NOT_FOUND)).toContain("Start with two free Cora Curations");
  });

  it("leaves alone what Pages does not cover: Privacy, Terms, and every page's title and description", () => {
    const main = (list: RenderedPage[], at: string) => /<main\b[\s\S]*?<\/main>/.exec(page(list, at).markup)![0];
    for (const at of ["/privacy", "/terms"]) expect(main(pages, at) === main(plain, at), at).toBe(true);
    for (const p of pages) expect(p.meta, p.path).toEqual(page(plain, p.path).meta);
  });

  it("goes back to the baseline on every page when the database stops answering, and comes back with it", async () => {
    const working = current;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      current = async () => {
        throw new Error("fetch failed");
      };
      sameAsPlain(await render(), "with the database down");
      current = working;
      const again = await render();
      for (const p of again) expect(p.markup === page(pages, p.path).markup, p.path).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });
});

describe("every caller of v1Copy", () => {
  /** Every source file under a directory that is not a test. */
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sources(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
  /** The builder's block preview shows the blocks as the code holds them, on purpose. */
  const codeCopyOnPurpose = ["src/app/site-preview/blocks/page.tsx"];

  it("hands it the published content: a call with the amounts alone would ignore the release file and the site's edits", () => {
    const root = process.cwd();
    const calls: { file: string; call: string }[] = [];
    for (const file of sources(path.join(root, "src"))) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      if (rel === "src/lib/site/content/model.ts" || rel.startsWith("src/test-helpers/")) continue;
      const code = readFileSync(file, "utf8");
      for (const m of code.matchAll(/\bv1Copy\(([^;\n]*)/g)) calls.push({ file: rel, call: m[1] });
    }
    // The six files that print a site version's copy, and the builder's preview.
    expect([...new Set(calls.map((c) => c.file))].sort()).toEqual([
      "src/app/library/page.tsx",
      "src/app/site-preview/blocks/page.tsx",
      "src/app/site-preview/hero/[n]/page.tsx",
      "src/components/site/v1/about.tsx",
      "src/components/site/v1/faq.tsx",
      "src/components/site/v1/home.tsx",
      "src/components/site/v1/how-it-works.tsx",
      "src/components/site/v1/zack.tsx",
    ]);
    for (const { file, call } of calls) {
      const passes = /^amounts, content\)/.test(call) || /getSiteContent\(\)/.test(call);
      expect(passes, `${file}: v1Copy(${call}`).toBe(!codeCopyOnPurpose.includes(file));
    }
    expect(calls).toHaveLength(10);
  });

  it("is under a server component that reads the content, in every file that prints a covered page", () => {
    for (const file of ["src/app/library/page.tsx", "src/components/site/v1/about.tsx", "src/components/site/v1/faq.tsx", "src/components/site/v1/home.tsx", "src/components/site/v1/how-it-works.tsx", "src/components/site/v1/zack.tsx", "src/lib/site/chrome.ts"]) {
      const code = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(code, file).toMatch(/from "(@\/lib\/site|\.)\/content\/read"/);
      expect(code, file).toMatch(/getSiteContent\(\)/);
    }
  });
});
