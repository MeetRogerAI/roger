/**
 * The release export against the real pages (plan U10, KTD9, R19), on
 * generated sites: whatever a site has published, the release taken from it
 * makes a fresh site with no edits of its own print EXACTLY what the site
 * prints, on every covered page and in the header and footer. Hidden text
 * plays no part in that, so this is also where a hidden-section rule that
 * hides too much (a release that loses wording a page shows) fails.
 *
 * And the release is a fixed point: rebuilt with it, the same site (its
 * stored edits read against the new baseline) exports the same file, and so
 * does a site with nothing of its own.
 *
 * The pages render as their views do on a request (V1HomeView and the rest,
 * handed the one overlay read.ts composes), so nothing here re-states which
 * section shows what.
 */
import { describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { closingBandCopy } from "@/data/site/v1";
import { amountsFrom } from "@/lib/site/amounts";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";

vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { V1HomeView } = await import("@/components/site/v1/home");
const { V1HowItWorksView } = await import("@/components/site/v1/how-it-works");
const { V1FaqView } = await import("@/components/site/v1/faq");
const { V1AboutView } = await import("@/components/site/v1/about");
const { siteChrome } = await import("@/lib/site/chrome");
const { releaseExport } = await import("./export");
const { emptyOverlay, newOverlay, parseOverlay } = await import("./format");
const { applyOverlay, codeModel, composeOverlays, layoutOn, listItems, normaliseOverlay, readField, sectionsShown, shownOverlay, v1Copy } = await import("./model");
const { TOGGLE_OFF, TOGGLE_ON, fieldsOfItem, siteRegistry } = await import("./registry");
const { canonical } = await import("./store");
type Overlay = import("./format").Overlay;

const amounts = amountsFrom(v3Defaults);
const preface = v3Defaults.playbookPreface;
// One cleared quote, so the homepage's testimonials section and its words are on the page.
const quotes = [{ id: "q", person: "Sample P.", attribution: "Made up", quote: "A made-up quote.", saidOn: null, audience: "re" as const, position: 0, cleared: true }];

/** Everything a visitor reads, for one overlay on the code copy (what getSiteContent hands a page). */
async function site(content: Overlay): Promise<Record<string, string>> {
  const model = applyOverlay(codeModel, content);
  // Use cases is a route, not a view: its words are the fields of its sections that are on, in its order, and its band
  // is printed from closingBandCopy, as src/app/library/page.tsx prints it.
  const { copy } = v1Copy(amounts, content);
  const library = sectionsShown("library", content).flatMap((section) => [
    ...[...siteRegistry.fields.values()].filter((field) => field.page === "library" && field.section === section).map((field) => `${field.id}=${readField(model, field)}`),
    ...(section === "band" ? [JSON.stringify(closingBandCopy(copy, copy.library.band))] : []),
  ]);
  return {
    home: await pageMarkup(<V1HomeView version="v1" amounts={amounts} preface={preface} testimonials={quotes} content={content} />),
    howItWorks: await pageMarkup(<V1HowItWorksView version="v1" amounts={amounts} preface={preface} files={[{ name: "Claude", href: "/zack/zack-the-collector-claude.md" }]} content={content} />),
    faq: await pageMarkup(<V1FaqView version="v1" amounts={amounts} content={content} />),
    about: await pageMarkup(<V1AboutView version="v1" amounts={amounts} photo="" signature="" content={content} />),
    library: library.join("\n"),
    chrome: JSON.stringify(siteChrome("v1", amounts, content)),
  };
}

/** mulberry32: the same numbers on every run. */
const generator = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * What a site might have published on `base`, as Pages stores it: edited wording, tick boxes and links; sections
 * switched off and moved (Home's examples and How it works' anatomy among them, often); list items removed, added and
 * moved. Every value is one the editor would accept.
 */
function published(next: () => number, base: unknown, tag: string): Overlay {
  const pick = <T,>(from: readonly T[]): T => from[Math.floor(next() * from.length)];
  const shuffle = <T,>(from: readonly T[]) => from.map((item) => [next(), item] as const).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
  const value = (kind: string | undefined, max: number, i: number) => {
    if (kind === "toggle") return pick([TOGGLE_ON, TOGGLE_OFF]);
    if (kind === "destination") return pick(["/faq", "/#price", "/how-it-works#zack", "https://example.test/page", "mailto:hello@example.test"]);
    // Unique, and no one of them inside another: "s1~" is not in "s12~".
    return `${tag}${i}~`.slice(0, max);
  };
  const out = newOverlay();
  const fields = [...siteRegistry.fields.values()];
  for (let i = 0; i < 4 + Math.floor(next() * 30); i++) {
    const field = pick(fields);
    out.text[field.id] = value(field.kind, field.max, i);
  }
  for (const page of siteRegistry.pages) {
    const movable = page.sections.filter((section) => !section.fixed).map((section) => section.id);
    if (movable.length === 0 || next() < 0.4) continue;
    const off = movable.filter((id) => next() < 0.25 || (id === "examples" && next() < 0.5) || (id === "anatomy" && next() < 0.3));
    out.sections[page.id] = { order: next() < 0.4 ? shuffle(movable) : [], off };
  }
  let n = 0;
  for (const list of siteRegistry.lists.values()) {
    if (next() < (list.id === "examples" ? 0.2 : 0.5)) continue;
    const below = listItems(base, list.id);
    const removable = list.min === list.max ? [] : below.filter(() => next() < 0.35);
    const removed = removable.slice(0, Math.max(0, below.length - list.min));
    const room = list.min === list.max ? 0 : list.max - (below.length - removed.length);
    const added = Array.from({ length: Math.min(room, Math.floor(next() * 3)) }, () => `x-${tag}${n++}`);
    for (const item of added) for (const field of fieldsOfItem(list, item)) out.text[field.id] = value(field.kind, field.max, n++);
    const items = [...below.filter((item) => !removed.includes(item)), ...added];
    out.lists[list.id] = { order: next() < 0.5 ? shuffle(items) : [], removed, added };
  }
  // As a publish stores it: what the overlay shows on the base, and nothing else.
  return shownOverlay(base, out);
}

const exported = (own: Overlay, released: Overlay) => {
  const out = releaseExport(own, { released });
  if (!out.ok) throw new Error(`the export was refused: ${out.problems.join("; ")}`);
  return out.overlay;
};

/**
 * Texts that are not in a page's first markup and still show: what a control says once pressed (a loop's "Play"),
 * the card's row for a playbook with no numbered parts, and an example's short title, which travels with the first
 * example when only How it works shows it (shownElsewhere in ./export.ts). `priceBlock.sub` is printed by no page
 * today (an editable field the price block does not show).
 */
const later = [/^examples\.[^.]+\.label$/, /^home\.(compounds\.loop|hero\.graphic)\.play$/, /^sample\.playbook\.(whole|steps)$/, /^priceBlock\.sub$/];

/**
 * The release of `own` on `released`: (1) a fresh site on it prints what this site prints, page for page; (2) it
 * holds no wording of the site's (the generator's "s<n>~") that no page prints; (3) rebuilt with it, the same stored
 * edits, and no edits at all, export it again.
 */
async function check(released: Overlay, own: Overlay, name: string): Promise<Overlay> {
  const release = exported(own, released);
  const before = await site(composeOverlays(released, own));
  const after = await site(composeOverlays(release, emptyOverlay));
  for (const page of Object.keys(before)) {
    if (after[page] === before[page]) continue;
    let i = 0;
    while (after[page][i] === before[page][i]) i++;
    expect(after[page].slice(i - 200, i + 200), `${name}, ${page}`).toBe(before[page].slice(i - 200, i + 200));
  }
  const printed = Object.values(before).join("\n");
  for (const [id, text] of Object.entries(release.text)) {
    if (/^s\d+~$/.test(text) && !later.some((pattern) => pattern.test(id))) expect(printed, `${name}: ${id} = ${text} is released and on no page`).toContain(text);
  }
  const rebuilt = applyOverlay(codeModel, parseOverlay(release));
  expect(canonical(exported(normaliseOverlay(rebuilt, own), release)), name).toBe(canonical(release));
  expect(canonical(exported(emptyOverlay, release)), name).toBe(canonical(release));
  expect(JSON.stringify(release)).toBe(canonical(release));
  return release;
}

describe("a release taken from a site with every field edited", () => {
  resetNextFakes({}, { "x-vercel-ip-country": "US" });
  /** Every built-in field with a wording of its own: unique for texts, the other value for a tick box, another page for a link. */
  const everything = () => {
    const out = newOverlay();
    let i = 0;
    for (const field of siteRegistry.fields.values()) {
      const now = readField(codeModel, field);
      out.text[field.id] = field.kind === "toggle" ? (now === TOGGLE_ON ? TOGGLE_OFF : TOGGLE_ON) : field.kind === "destination" ? (now === "/faq" ? "/about" : "/faq") : `s${i++}~`.slice(0, field.max);
    }
    return shownOverlay(codeModel, out);
  };

  it("with nothing switched off, and with each section switched off alone, and with the examples and the anatomy off together", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const all = everything();
    await check(newOverlay(), all, "nothing off");
    for (const page of siteRegistry.pages) {
      for (const section of page.sections.filter((entry) => !entry.fixed)) {
        await check(newOverlay(), shownOverlay(codeModel, { ...all, sections: { [page.id]: { order: [], off: [section.id] } } }), `${page.id}.${section.id} off`);
      }
    }
    await check(newOverlay(), shownOverlay(codeModel, { ...all, sections: { home: { order: [], off: ["examples"] }, howItWorks: { order: [], off: ["anatomy"] } } }), "examples and anatomy off");
    errors.mockRestore();
  }, 240_000);
});

describe("a release taken from a generated site", () => {
  resetNextFakes({}, { "x-vercel-ip-country": "US" });
  const RUNS = 40;

  it(`prints what the site prints, on every page, and is a fixed point (${RUNS} sites)`, async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let hidingSomething = 0;
    let examplesOffAnatomyOn = 0;
    for (let run = 0; run < RUNS; run++) {
      const next = generator(1000 + run);
      // The release the site runs: itself taken from a generated preview, so it is a release file the snapshot could write.
      const released = run % 3 === 0 ? newOverlay() : exported(published(next, codeModel, "r"), newOverlay());
      const base = applyOverlay(codeModel, parseOverlay(released));
      const own = published(next, base, "s");
      await check(released, own, `run ${run}`);

      const off = (page: string, section: string) => layoutOn(own, page, base).off.includes(section);
      if (siteRegistry.pages.some((page) => layoutOn(own, page.id, base).off.length > 0)) hidingSomething++;
      if (off("home", "examples") && !off("howItWorks", "anatomy")) examplesOffAnatomyOn++;
    }
    // The generator reached the cases this is about.
    expect(hidingSomething).toBeGreaterThan(RUNS / 2);
    expect(examplesOffAnatomyOn).toBeGreaterThan(1);
    errors.mockRestore();
  }, 240_000);
});

describe("the homepage's examples switched off (How it works still takes the first one apart)", () => {
  it("releases the first example as the site shows it, and none of the hidden ones' wording", () => {
    const [one, first, three] = listItems(codeModel, "examples");
    const title = `examples.${first}.title`;
    const hiddenTitle = `examples.${three}.title`;
    const own = shownOverlay(codeModel, {
      ...newOverlay(),
      text: { [title]: "The site's first example, retitled.", [hiddenTitle]: "Hidden on every page." },
      sections: { home: { order: [], off: ["examples"] } },
      lists: { examples: { order: [first, one, three], removed: [], added: [] } },
    });
    const release = exported(own, newOverlay());
    const shown = applyOverlay(codeModel, parseOverlay(release));
    expect(listItems(shown, "examples")[0]).toBe(first);
    expect(release.text[title]).toBe("The site's first example, retitled.");
    expect(JSON.stringify(release)).not.toContain("Hidden on every page.");
    // With How it works' anatomy off too, the list is on no page, and the release keeps its own.
    const both = exported({ ...own, sections: { home: { order: [], off: ["examples"] }, howItWorks: { order: [], off: ["anatomy"] } } }, newOverlay());
    expect(both.lists).toEqual({});
    expect(JSON.stringify(both)).not.toContain("retitled");
  });

  it("releases an empty list when the site has removed every example, as How it works then shows the code's own", () => {
    const all = listItems(codeModel, "examples");
    const own = shownOverlay(codeModel, { ...newOverlay(), sections: { home: { order: [], off: ["examples"] } }, lists: { examples: { order: [], removed: all, added: [] } } });
    const release = exported(own, newOverlay());
    expect(listItems(applyOverlay(codeModel, parseOverlay(release)), "examples")).toEqual([]);
  });
});
