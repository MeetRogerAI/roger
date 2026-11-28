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

const { CONTENT_KEY, publish, readStored, saveDraft, saveSections } = await import("./store");

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

  it("with a label of the header saved before the links were lists (plan U8): every header and footer still shows it, and nothing else changes", async () => {
    const legacy = { format: 1, text: { "nav.faq": "FAQs", "nav.pricing": "Price" }, sections: {}, lists: {} };
    await put({ draft: legacy, published: legacy, previous: null });
    const noScripts = (markup: string) => markup.replace(/<script\b[\s\S]*?<\/script>/g, "");
    for (const p of await render()) {
      const before = noScripts(page(plain, p.path).markup);
      const swapped = before.replaceAll(">FAQ</a>", ">FAQs</a>").replaceAll(">Pricing</a>", ">Price</a>");
      expect(swapped, p.path).not.toBe(before);
      // Byte for byte the baseline, with the two labels changed in the header and the footer and nowhere else.
      // (Both still fit in one row at 1024: a longer one would move the row to 1280, src/lib/site/header-fit.ts.)
      expect(noScripts(p.markup), p.path).toBe(swapped);
    }
    // The next save stores the new names, and the words stay.
    expect(await saveDraft(current, [{ field: "home.hero.headline", text: "A draft headline." }])).toMatchObject({ ok: true });
    const raw = (await current("select value::text as raw from settings where key = $1", [CONTENT_KEY])) as { raw: string }[];
    const draft = JSON.parse(raw[0].raw).draft.text;
    expect(draft).toMatchObject({ "nav.faq.label": "FAQs", "footer.links.faq.label": "FAQs", "nav.pricing.label": "Price", "footer.links.pricing.label": "Price" });
    expect(Object.keys(draft)).not.toContain("nav.faq");
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
    "nav.faq.label": "Questions",
    "footer.links.faq.label": "Questions",
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

/**
 * The sections of each covered page, as published (plan U6, R7): every page prints the ones that are on, in the
 * stored order, through the route and the root layout. A draft changes no page.
 */
describe("the sections that are published", () => {
  const main = (list: RenderedPage[], at: string) => /<main\b[\s\S]*?<\/main>/.exec(page(list, at).markup)![0];
  /** A page's own sections by the id of each one's heading, in order. */
  const sectionsOf = (markup: string) => [...markup.matchAll(/<section\b[^>]*aria-labelledby="([\w-]+)-title"/g)].map((m) => m[1]);
  const presses = [
    { page: "home", op: "off", section: "compounds" },
    { page: "home", op: "up", section: "questions" },
    { page: "howItWorks", op: "off", section: "zack" },
    { page: "faq", op: "off", section: "price-and-billing" },
    { page: "about", op: "off", section: "startBand" },
    // /library: the watch form above the list.
    { page: "library", op: "up", section: "watch" },
  ] as const;
  const press = async () => {
    for (const change of presses) expect(await saveSections(current, change), JSON.stringify(change)).toMatchObject({ ok: true, changed: true });
  };

  it("are on no page while they are a draft", async () => {
    await press();
    sameAsPlain(await render(), "with section changes saved as a draft");
  });

  it("are followed by each page once published, and by no other page", async () => {
    await press();
    expect(await publish(current, ADMIN, (await readStored(current)).draft)).toMatchObject({ ok: true, changed: true });
    const pages = await render();
    expect(sectionsOf(main(plain, "/"))).toEqual(["hero", "problem", "examples", "compounds", "control", "price", "questions", "closing"]);
    expect(sectionsOf(main(pages, "/"))).toEqual(["hero", "problem", "examples", "control", "questions", "price", "closing"]);
    expect(sectionsOf(main(pages, "/how-it-works"))).toEqual(["page", "week", "cora", "anatomy", "first-weeks", "no-agent"]);
    expect(main(pages, "/how-it-works")).toContain("data-start-band");
    expect(sectionsOf(main(pages, "/faq"))).toEqual(["page", "getting-started", "zack-and-privacy", "cora-and-the-ideas"]);
    expect(main(plain, "/about")).toContain("data-start-band");
    expect(main(pages, "/about")).not.toContain("data-start-band");
    expect(main(pages, "/about")).toContain("data-letter");
    // /library: the watch form now comes before the list, with its search. The band still ends the page.
    const [before, after] = [main(plain, "/library"), main(pages, "/library")];
    expect(sectionsOf(before)).toEqual(["library", "watch", "library-band"]);
    expect(sectionsOf(after)).toEqual(["library", "watch", "library-band"]);
    expect(before.indexOf('id="library-search"')).toBeGreaterThan(-1);
    expect(before.indexOf('id="watch"')).toBeGreaterThan(before.indexOf('id="library-search"'));
    expect(after.indexOf('id="watch"')).toBeLessThan(after.indexOf('id="library-search"'));
    // The homepage's questions leave out the group that is off on /faq.
    expect(text(main(plain, "/"))).toContain("What does it cost?");
    expect(text(main(pages, "/"))).not.toContain("What does it cost?");
    // The header and the footer are not sections: they are what they were, on every page. And the pages Pages does not cover are untouched.
    for (const p of pages) {
      for (const part of [/<header\b[\s\S]*?<\/header>/, /<footer\b[\s\S]*?<\/footer>/]) expect(part.exec(p.markup)![0] === part.exec(page(plain, p.path).markup)![0], p.path).toBe(true);
      if (!["/", "/how-it-works", "/faq", "/about", "/library"].includes(p.path)) expect(p.markup === page(plain, p.path).markup, p.path).toBe(true);
    }
  });

  it("go back to the built-in order on every page when the database stops answering (plan R18)", async () => {
    await press();
    await publish(current, ADMIN, (await readStored(current)).draft);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      current = async () => {
        throw new Error("fetch failed");
      };
      sameAsPlain(await render(), "with the database down");
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
    expect(calls).toHaveLength(9);
  });

  it("is under a server component that reads the content, in every file that prints a covered page", () => {
    for (const file of ["src/app/library/page.tsx", "src/components/site/v1/about.tsx", "src/components/site/v1/faq.tsx", "src/components/site/v1/home.tsx", "src/components/site/v1/how-it-works.tsx", "src/components/site/v1/zack.tsx", "src/lib/site/chrome.ts"]) {
      const code = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(code, file).toMatch(/from "(@\/lib\/site|\.)\/content\/read"/);
      expect(code, file).toMatch(/getSiteContent\(\)/);
    }
  });
});
