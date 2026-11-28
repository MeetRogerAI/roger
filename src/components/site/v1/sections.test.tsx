/**
 * Every way an admin can leave a page's sections (plan U6, R7), tried: every set of sections switched off, and
 * many orders, on the homepage and the three reading pages. Whatever is stored, a page must render, hold no id
 * twice, keep its headings in steps of one, have its one main heading wherever the section that holds it is on,
 * and keep the one rule for the line between two neighbours (InOrder in blocks/sections.tsx).
 *
 * home.test.tsx and pages.test.tsx say what each page prints for the cases an owner is likely to make. This file
 * is the sweep that says no case breaks a page.
 */
import { describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { emptyOverlay, type Overlay } from "@/lib/site/content/format";
import { codeLayout } from "@/lib/site/content/model";
import { siteRegistry } from "@/lib/site/content/registry";
import { amountsFrom } from "@/lib/site/amounts";
import type { Testimonial } from "@/lib/site/testimonials";
import { nextHeaders } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";

vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { V1HomeView } = await import("./home");
const { V1FaqView } = await import("./faq");
const { V1HowItWorksView } = await import("./how-it-works");
const { V1AboutView } = await import("./about");

const amounts = amountsFrom(v3Defaults);
const quotes: Testimonial[] = [{ id: "a", person: "Sample P.", attribution: "Made-up attribution", quote: "A made-up quote, to place the section.", saidOn: null, audience: "re", position: 0, cleared: true }];

/** The page a visitor with no script reads: what is streamed in afterwards follows it. */
const shell = (markup: string) => markup.split('<div hidden id="S:')[0];
const laid = (page: string, order: string[], off: string[]): Overlay => ({ ...emptyOverlay, sections: { [page]: { order, off } } });

/** A repeatable source of numbers between 0 and 1. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
const shuffled = (ids: readonly string[], next: () => number) => ids.map((id) => [next(), id] as const).sort((a, b) => a[0] - b[0]).map(([, id]) => id);
/** Every subset of the ids. */
const subsets = (ids: readonly string[]) => Array.from({ length: 2 ** ids.length }, (_, bits) => ids.filter((_id, i) => (bits >> i) & 1));
/** Every order of the ids. */
function orders(ids: readonly string[]): string[][] {
  if (ids.length <= 1) return [[...ids]];
  return ids.flatMap((id) => orders(ids.filter((other) => other !== id)).map((rest) => [id, ...rest]));
}

/** What must hold for any page, whatever its sections: no id twice, and no heading more than one step below the one before it. */
function sound(markup: string, label: string) {
  const ids = [...markup.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
  expect(ids.filter((id, i) => ids.indexOf(id) !== i), `${label}: an id twice`).toEqual([]);
  const levels = [...markup.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  for (const [i, level] of levels.entries()) if (i > 0) expect(level - levels[i - 1], `${label}: heading ${i + 1} skips a level (${levels.join(" ")})`).toBeLessThanOrEqual(1);
  // Every reference to a heading finds one.
  for (const [, id] of markup.matchAll(/aria-labelledby="([^"]*)"/g)) expect(ids, `${label}: aria-labelledby="${id}"`).toContain(id);
}

/**
 * The top of a page as marks: a section by its registry id, "—" for a hairline, "=" for the line between two
 * neighbours on night or on ground-2. `names` maps the id a section's heading has in the markup to its registry id.
 */
function marks(markup: string, names: Record<string, string>): string[] {
  return [...markup.matchAll(/<section\b[^>]*aria-labelledby="([\w-]+)-title"|data-hairline|data-seam="[\w-]+"|data-start-band/g)].flatMap((m) => {
    if (m[0] === "data-hairline") return ["—"];
    if (m[0].startsWith("data-seam")) return ["="];
    if (m[0] === "data-start-band") return ["startBand"];
    return Object.hasOwn(names, m[1]) ? [names[m[1]]] : [];
  });
}

/** The marks a page must have for the sections it prints: the one rule, from the registry's grounds. */
function ruled(pageId: string, printed: readonly string[]): string[] {
  const ground = (id: string) => siteRegistry.pages.find((page) => page.id === pageId)!.sections.find((section) => section.id === id)!.ground;
  const out: string[] = [];
  for (const [i, id] of printed.entries()) {
    if (i > 0 && ground(printed[i - 1]) === ground(id)) out.push(ground(id) === "ground" ? "—" : "=");
    out.push(id);
  }
  return out;
}

describe("the homepage, for every set of sections switched off and many orders (plan U6)", () => {
  const HOME = codeLayout("home").order;
  const names: Record<string, string> = { hero: "hero", problem: "problem", examples: "examples", compounds: "compounds", say: "testimonials", control: "control", price: "price", questions: "questions", closing: "closing" };
  const home = async (order: string[], off: string[], testimonials: Testimonial[]) => shell(await pageMarkup(<V1HomeView version="v1" amounts={amounts} preface={v3Defaults.playbookPreface} testimonials={testimonials} content={laid("home", order, off)} />));
  const held = (markup: string, order: readonly string[], off: readonly string[], testimonials: Testimonial[], label: string) => {
    sound(markup, label);
    const printed = order.filter((id) => !off.includes(id) && (id !== "testimonials" || testimonials.length > 0));
    expect(marks(markup, names), label).toEqual(ruled("home", printed));
    expect((markup.match(/<h1\b/g) ?? []).length, `${label}: the main heading`).toBe(off.includes("hero") ? 0 : 1);
  };

  it("renders all 512 sets of switched-off sections in the built-in order: sound, by the line rule, one h1 while the hero is on", async () => {
    expect(HOME).toHaveLength(9);
    for (const off of subsets(HOME)) held(await home([], off, quotes), HOME, off, quotes, `off ${off.join(",") || "nothing"}`);
  }, 240_000);

  it("renders 300 orders, each with some sections off, with and without a cleared testimonial", async () => {
    const next = seeded(20261127);
    let nightPairs = 0;
    for (let run = 0; run < 300; run++) {
      const order = shuffled(HOME, next);
      const off = HOME.filter(() => next() < 0.2);
      const testimonials = next() < 0.5 ? quotes : [];
      const markup = await home(order, off, testimonials);
      held(markup, order, off, testimonials, `order ${order.join(",")} off ${off.join(",")}`);
      nightPairs += marks(markup, names).filter((mark) => mark === "=").length;
    }
    // The sweep does meet the case the built-in order never has: two night chapters side by side.
    expect(nightPairs).toBeGreaterThan(50);
  }, 240_000);

  it("with every section off prints an empty page body, and does not throw", async () => {
    const markup = await home([], HOME, quotes);
    expect(marks(markup, names)).toEqual([]);
    expect(markup).toContain('data-site="v1"');
  });
});

describe("the reading pages, for every set of sections switched off in every order (plan U6)", () => {
  it("/faq: all 32 sets in 120 orders keep one h1, one ground block for each run of groups, and no line", async () => {
    const FAQ = codeLayout("faq").order;
    const names = Object.fromEntries(FAQ.map((id) => [id, id]));
    const next = seeded(5);
    const all = orders(FAQ);
    expect(all).toHaveLength(120);
    for (const order of all) {
      // Every order with nothing off, and with two sets picked for it: all 32 sets are met many times over.
      for (const off of [[], subsets(FAQ)[Math.floor(next() * 32)], subsets(FAQ)[Math.floor(next() * 32)]]) {
        const label = `order ${order.join(",")} off ${off.join(",")}`;
        const markup = shell(await pageMarkup(<V1FaqView version="v1" amounts={amounts} content={laid("faq", order, off)} />));
        sound(markup, label);
        expect(markup.match(/<h1\b/g), label).toHaveLength(1);
        const printed = order.filter((id) => !off.includes(id));
        expect(marks(markup, names), label).toEqual(printed);
        // One block of ground for each run of neighbouring groups.
        const runs = printed.filter((id, i) => id !== "startBand" && (i === 0 || printed[i - 1] === "startBand")).length;
        expect((markup.match(/<div class="bg-ground pb-10 pt-6 md:pb-14 md:pt-10">/g) ?? []).length, label).toBe(runs);
      }
    }
    for (const off of subsets(FAQ)) {
      const markup = shell(await pageMarkup(<V1FaqView version="v1" amounts={amounts} content={laid("faq", [], off)} />));
      sound(markup, `off ${off.join(",")}`);
      expect(marks(markup, names)).toEqual(FAQ.filter((id) => !off.includes(id)));
    }
  }, 240_000);

  it("/how-it-works: all 128 sets, and 200 orders, keep one h1 and a hairline only between two reading sections", async () => {
    const HOW = codeLayout("howItWorks").order;
    const names: Record<string, string> = { week: "week", zack: "zack", cora: "cora", anatomy: "anatomy", "first-weeks": "firstWeeks", "no-agent": "noAgent" };
    const how = async (order: string[], off: string[]) => shell(await pageMarkup(<V1HowItWorksView version="v1" amounts={amounts} preface={v3Defaults.playbookPreface} files={[]} content={laid("howItWorks", order, off)} />));
    const held = (markup: string, order: readonly string[], off: readonly string[], label: string) => {
      sound(markup, label);
      expect(markup.match(/<h1\b/g), label).toHaveLength(1);
      expect(marks(markup, names), label).toEqual(ruled("howItWorks", order.filter((id) => !off.includes(id))));
    };
    for (const off of subsets(HOW)) held(await how([], off), HOW, off, `off ${off.join(",")}`);
    const next = seeded(11);
    for (let run = 0; run < 200; run++) {
      const order = shuffled(HOW, next);
      const off = HOW.filter(() => next() < 0.2);
      held(await how(order, off), order, off, `order ${order.join(",")} off ${off.join(",")}`);
    }
  }, 240_000);

  it("/about: both orders and all four sets keep the title, print the letter once at most, and the band once at most", async () => {
    for (const order of [["letter", "startBand"], ["startBand", "letter"]]) {
      for (const off of subsets(order)) {
        for (const photo of ["", "/peter.jpg"]) {
          const label = `order ${order.join(",")} off ${off.join(",")} photo ${photo}`;
          const markup = shell(await pageMarkup(<V1AboutView version="v1" amounts={amounts} photo={photo} signature="" content={laid("about", order, off)} />));
          sound(markup, label);
          expect(markup.match(/<h1\b/g), label).toHaveLength(1);
          expect((markup.match(/data-claims="letter"/g) ?? []).length, label).toBe(off.includes("letter") ? 0 : 1);
          expect((markup.match(/data-start-band/g) ?? []).length, label).toBe(off.includes("startBand") ? 0 : 1);
          if (!off.includes("letter") && !off.includes("startBand")) expect(markup.indexOf("data-claims") < markup.indexOf("data-start-band"), label).toBe(order[0] === "letter");
        }
      }
    }
  });
});
