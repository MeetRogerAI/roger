/**
 * The five v2 hero sketches and their index (plan U11, R15, R19).
 *
 * - The preview addresses are served only where the environment is known not
 *   to be live, and fail closed.
 * - Each sketch prints the v1 words, unchanged: one h1 with the headline, the
 *   sub-line, a start link for the audience "re", the secondary link, and the
 *   card line after the buttons.
 * - Each sketch's rendered text passes the claims check.
 * - Every placeholder has an accessible label and a fixed shape.
 * - No sketch imports another, and none reaches into the v1 look.
 * - The site's header and footer are left off the sketch pages and nowhere else.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { compoundingSteps } from "@/data/site/compounding";
import { v1Copy } from "@/data/site/v1";
import { amountsFrom } from "@/lib/site/amounts";
import { checkClaims, decodeEntities, describeViolations, readPage, type ClaimsContext } from "@/lib/site/claims";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";

const at = vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
  return { path: "/" };
});

class NotFound extends Error {}
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => at.path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  notFound: (): never => {
    throw new NotFound("not found");
  },
}));
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
// Every font a sketch or the root layout loads. A font a sketch adds must be added here, which is the point: it is a deliberate download.
vi.mock("next/font/google", () => {
  const font = (name: string) => () => ({ variable: `font-${name}`, className: `font-${name}` });
  return {
    Mona_Sans: font("mona"),
    Inter_Tight: font("inter-tight"),
    Newsreader: font("newsreader"),
    IBM_Plex_Mono: font("plex-mono"),
    Instrument_Sans: font("instrument-sans"),
    Figtree: font("figtree"),
    Bricolage_Grotesque: font("bricolage"),
    Fraunces: font("fraunces"),
    DM_Mono: font("dm-mono"),
  };
});

const { default: SketchPage, metadata, generateStaticParams } = await import("./hero/[n]/page");
const { default: IndexPage, metadata: indexMetadata } = await import("./page");
const { heroSketches } = await import("@/components/site/v2/sketches");
const { isHeroSketch, navFor } = await import("@/components/site-header");
const { footerFor } = await import("@/components/footer-switch");
const { siteChrome } = await import("@/lib/site/chrome");

const amounts = amountsFrom(v3Defaults);
const { copy } = v1Copy(amounts);
const context: ClaimsContext = { amounts, compounding: compoundingSteps.flatMap((step) => [step.week, step.bricks]) };
const numbers = ["1", "2", "3", "4", "5"];

const Page = SketchPage as unknown as (props: { params: Promise<{ n: string }> }) => ReactNode;
const sketchMarkup = (n: string) => pageMarkup(<Page params={Promise.resolve({ n })} />);

const env = (vercelEnv: string, nodeEnv: string) => {
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  vi.stubEnv("NODE_ENV", nodeEnv);
};

/** What a reader sees: the markup with its tags taken out. */
const text = (markup: string) =>
  markup
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

beforeEach(() => {
  resetNextFakes();
  at.path = "/";
});
afterEach(() => vi.unstubAllEnvs());

describe("the preview addresses are not served in production", () => {
  it("are not found on Vercel production", async () => {
    env("production", "production");
    for (const n of numbers) await expect(sketchMarkup(n), n).rejects.toBeInstanceOf(NotFound);
    await expect(pageMarkup(<IndexPage />)).rejects.toBeInstanceOf(NotFound);
  });

  it("are not found on a production build with no VERCEL_ENV", async () => {
    env("", "production");
    for (const n of numbers) await expect(sketchMarkup(n), n).rejects.toBeInstanceOf(NotFound);
    await expect(pageMarkup(<IndexPage />)).rejects.toBeInstanceOf(NotFound);
    vi.stubEnv("VERCEL_ENV", undefined);
    expect(process.env.VERCEL_ENV).toBeUndefined();
    for (const n of numbers) await expect(sketchMarkup(n), n).rejects.toBeInstanceOf(NotFound);
    await expect(pageMarkup(<IndexPage />)).rejects.toBeInstanceOf(NotFound);
  });

  it("render on a Vercel preview, which is built with NODE_ENV=production, and in development and tests", async () => {
    for (const [vercelEnv, nodeEnv] of [
      ["preview", "production"],
      ["", "development"],
      ["", "test"],
    ]) {
      env(vercelEnv, nodeEnv);
      for (const n of numbers) expect(await sketchMarkup(n), `${n} ${vercelEnv} ${nodeEnv}`).toContain(`data-sketch="${n}"`);
      expect(await pageMarkup(<IndexPage />)).toContain("/site-preview/hero/5");
    }
  });

  it("are kept out of search, and a number that is not a sketch is not found", async () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(indexMetadata.robots).toEqual({ index: false, follow: false });
    expect(generateStaticParams()).toEqual(numbers.map((n) => ({ n })));
    for (const n of ["0", "6", "one", "1.5"]) await expect(sketchMarkup(n), n).rejects.toBeInstanceOf(NotFound);
  });
});

describe("the index", () => {
  it("shows all five with a link to each full page and a note under each", async () => {
    const markup = await pageMarkup(<IndexPage />);
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(heroSketches.map((sketch) => sketch.site)).toEqual(["theacademysf.com", "earth-ai.com", "maticrobots.com", "railcode.dev", "olddogs.ai"]);
    for (const sketch of heroSketches) {
      expect(markup, sketch.name).toContain(`<a class="tlink chev" href="/site-preview/hero/${sketch.n}">`);
      expect(markup.match(new RegExp(`<iframe[^>]*src="/site-preview/hero/${sketch.n}"`, "g")), sketch.name).toHaveLength(2);
      for (const words of [sketch.name, sketch.site, sketch.takes, sketch.leaves, sketch.needs]) expect(text(markup), sketch.name).toContain(words);
    }
    // Every frame has a name a screen reader can say.
    for (const frame of markup.match(/<iframe[^>]*>/g) ?? []) expect(frame).toMatch(/title="[^"]{10,}"/);
  });
});

describe.each(numbers)("hero sketch %s", (n) => {
  let markup = "";
  beforeEach(async () => {
    markup = await sketchMarkup(n);
  });

  it("prints the v1 words: one h1 with the headline, the sub-line, both actions and the card line after them", () => {
    const h1 = markup.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g) ?? [];
    expect(h1).toHaveLength(1);
    expect(text(h1[0] ?? "")).toBe(copy.home.hero.headline);
    expect(text(markup)).toContain(copy.home.hero.sub);

    // From the h1 on: the header's own start button comes before it and is not the hero's.
    const hero = markup.slice(markup.indexOf("<h1"));
    const start = new RegExp(`<a\\b[^>]*href="/start\\?path=re"[^>]*>${copy.buttons.start}</a>`).exec(hero);
    expect(start, "the start link").not.toBeNull();
    const secondary = new RegExp(`<a\\b[^>]*href="#how"[^>]*>See how it works</a>`).exec(hero);
    expect(secondary, "the secondary link").not.toBeNull();
    expect(secondary!.index).toBeGreaterThan(start!.index);
    // The card line is the next text after the two actions.
    const after = text(hero.slice(secondary!.index + secondary![0].length));
    expect(after.startsWith(copy.cardLine)).toBe(true);
    expect(markup.split(copy.cardLine)).toHaveLength(2);
    // The secondary link has somewhere to land.
    expect(markup.match(/\sid="how"/g)).toHaveLength(1);
    expect(text(markup)).toContain("How it works");
  });

  it("sends every start button to /start for the audience “re”", () => {
    const starts = [...markup.matchAll(/href="(\/start[^"]*)"/g)].map((m) => m[1]);
    expect(starts.length).toBeGreaterThanOrEqual(2);
    expect(new Set(starts)).toEqual(new Set(["/start?path=re"]));
    expect(markup).not.toContain('href="/zack');
  });

  it("passes the claims check", () => {
    expect(describeViolations(checkClaims(readPage(`/site-preview/hero/${n}`, markup), context))).toBe("");
    // The check has teeth on this markup: the brick counts pass only because their zone is marked.
    const unmarked = markup.replaceAll(' data-claims="compounding"', "").replaceAll(/ data-bricks="[^"]*"/g, "");
    expect(checkClaims(readPage(`/site-preview/hero/${n}`, unmarked), context).map((v) => v.rule)).toContain("number");
  });

  it("shows the bricks: three to a week, each with a label a screen reader hears", () => {
    const labels = [...markup.matchAll(new RegExp(`${copy.bricks.week} (\\d+), ${copy.bricks.idea} (\\d+): (?:${copy.bricks.setUp}|${copy.bricks.empty})`, "g"))];
    // Sketch 4 draws its bricks in one SVG, named by the week and the count.
    if (n === "4") expect(markup).toMatch(/<svg[^>]*role="img"[^>]*aria-label="Week 3: 9 ideas"/);
    else expect(labels.length).toBeGreaterThanOrEqual(9);
    expect(text(markup)).toContain("Week 3");
  });

  it("gives every placeholder an accessible label and a fixed shape", () => {
    const placeholders = markup.match(/<div\b[^>]*data-placeholder="[^"]*"[^>]*>/g) ?? [];
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
    for (const tag of placeholders) {
      expect(tag).toContain('role="img"');
      const label = decodeEntities(/aria-label="([^"]*)"/.exec(tag)?.[1] ?? "");
      expect(label).toMatch(/^Placeholder\. .{20,}/);
      // The size is drawn from data-size, and is not in the label.
      expect(label).not.toMatch(/\d/);
      expect(tag).toMatch(/data-size="\d+ × \d+ [\w ]+"/);
      if (tag.includes('data-placeholder="ratio"')) expect(tag).toMatch(/style="[^"]*aspect-ratio:\s*\d+\s*\/\s*\d+/);
      // R19: a label may describe a person, and never calls one a user, a client or a customer.
      expect(label).not.toMatch(/\b(user|client|customer|member|testimonial|realtor)\b/i);
    }
    // The logo is a labelled slot beside the word.
    expect(markup).toMatch(/<span role="img" aria-label="Logo placeholder" data-logo-slot[^>]*>[\s\S]*?<\/span>\s*<\/span>Roger/);
  });

  it("draws its own header: the logo slot, the five links, sign in and a start button", () => {
    const header = /<header\b[\s\S]*?<\/header>/.exec(markup)?.[0] ?? "";
    for (const href of ["/how-it-works", "/#price", "/library", "/faq", "/about", "/signin", "/start?path=re"]) expect(header, href).toContain(`href="${href}"`);
    expect(markup.match(/<header\b/g)).toHaveLength(1);
    expect(markup).not.toContain("<footer");
  });

  it("puts no quote, name or role beside a picture of a person (R19)", () => {
    const people = (markup.match(/aria-label="Placeholder\. [^"]*"/g) ?? []).filter((label) => /\b(person|people|figures|hands?)\b/i.test(label));
    if (people.length === 0) return;
    expect(markup).not.toContain("<blockquote");
    expect(markup).not.toContain('data-claims="testimonial"');
    expect(markup).not.toContain('data-claims="letter"');
    expect(text(markup)).not.toContain(copy.testimonials.title);
  });
});

describe("the sketches are independent", () => {
  const dir = path.join(process.cwd(), "src/components/site/v2/sketches");
  const files = readdirSync(dir).filter((file) => /^sketch-\d/.test(file));

  it("has one component file and one stylesheet per sketch", () => {
    for (const n of numbers) {
      expect(files, n).toContain(`sketch-${n}.tsx`);
      expect(files, n).toContain(`sketch-${n}.css`);
    }
  });

  it("no sketch imports another sketch, the v1 look, or the index of sketches", () => {
    for (const file of files.filter((f) => /\.tsx?$/.test(f))) {
      const own = /^sketch-(\d)/.exec(file)![1];
      const imports = [...readFileSync(path.join(dir, file), "utf8").matchAll(/from\s+"([^"]+)"|import\s+"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
      for (const from of imports) {
        const other = /sketch-(\d)/.exec(from);
        if (other) expect(other[1], `${file} imports ${from}`).toBe(own);
        expect(from, file).not.toMatch(/site\/v1\//);
        expect(from, file).not.toMatch(/^\.\/?(index)?$/);
      }
    }
  });

  // Every selector of a stylesheet, outside @-rules and keyframe steps, with comments taken out.
  const selectorsOf = (file: string) => {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...css.matchAll(/(^|[{}])\s*([^{}@]+?)\s*\{/g)]
      .map((m) => m[2].trim())
      .filter((s) => !/^(from|to|\d+%)$/.test(s))
      .flatMap((group) => group.split(",").map((s) => s.trim()));
    return { css, selectors };
  };

  it("keeps every rule of a sketch's stylesheet under that sketch's own class", () => {
    for (const n of numbers) {
      const { css, selectors } = selectorsOf(path.join(dir, `sketch-${n}.css`));
      expect(selectors.length).toBeGreaterThan(20);
      for (const selector of selectors) expect(selector, `sketch-${n}.css`).toMatch(new RegExp(`^(\\.js )?\\.sk${n}(?![\\w])|^(\\.js )?\\.sk${n}-[\\w-]+`));
      // And it sets no global token.
      expect(css).not.toMatch(/--color-|--font-(mona|sans)|:root/);
    }
  });

  // After a click from a sketch to another page, Next keeps the sketch in the document, hidden
  // (docs/site/v1-acceptance.md, open defect 4). A rule such as `html:has([data-sketch]) body`
  // would still match there and repaint /pricing or /start, so no rule may reach above the wrapper.
  it("styles nothing above a sketch's wrapper: no html, body or :has() rule that a hidden sketch could still switch on", () => {
    const files = [...numbers.map((n) => path.join(dir, `sketch-${n}.css`)), path.join(dir, "../placeholder.css")];
    for (const file of files) {
      const { selectors } = selectorsOf(file);
      for (const selector of selectors) {
        expect(selector, file).not.toMatch(/(^|[\s>+~,(])(html|body|main)\b|:has\(|:root|^\*/);
      }
    }
    // The shared kit's rules are all under its own classes.
    for (const selector of selectorsOf(path.join(dir, "../placeholder.css")).selectors) expect(selector).toMatch(/^\.v2-/);
  });
});

describe("nothing of the example sites is on a sketch", () => {
  it.each(numbers)("sketch %s names none of the five sites", async (n) => {
    const words = text(await sketchMarkup(n)).toLowerCase();
    for (const sketch of heroSketches) {
      expect(words, sketch.site).not.toContain(sketch.site);
      // The name without its ending: "olddogs", "railcode".
      expect(words, sketch.site).not.toContain(sketch.site.split(".")[0]);
    }
  });
});

describe("the site's header and footer", () => {
  const chrome = siteChrome("v1", amounts);

  it("are left off the sketch pages and no others", () => {
    for (const n of numbers) {
      expect(isHeroSketch(`/site-preview/hero/${n}`, true)).toBe(true);
      expect(footerFor(`/site-preview/hero/${n}`, true)).toBe("none");
    }
    for (const p of ["/", "/pricing", "/site-preview", "/site-preview/blocks", "/site-preview/hero", "/site-preview/hero/", "/site-preview/hero/1/more", "/site-preview/heroes/1", "/x/site-preview/hero/1", "/start", "/app", "/admin", "/zack", "/for/acme"]) {
      expect(isHeroSketch(p, true), p).toBe(false);
      expect(footerFor(p, true), p).not.toBe("none");
    }
    // The links a page's header carries are untouched: only whether the header is drawn changed.
    expect(navFor("/site-preview", "v1", chrome)).toEqual(navFor("/pricing", "v1", chrome));
  });

  // In production a sketch's address is the not-found page. It keeps the site's header and footer like any other.
  it("stay on a sketch's address where the sketches are not served, and by default", async () => {
    const { SiteHeader } = await import("@/components/site-header");
    const { FooterSwitch } = await import("@/components/footer-switch");
    at.path = "/site-preview/hero/1";
    for (const n of numbers) {
      expect(isHeroSketch(`/site-preview/hero/${n}`, false)).toBe(false);
      expect(footerFor(`/site-preview/hero/${n}`, false)).toBe("full");
      expect(footerFor(`/site-preview/hero/${n}`)).toBe("full");
    }
    const siteHeader = '<header class="sticky top-0 z-40 bg-ground">';
    expect(await pageMarkup(<SiteHeader site="v1" chrome={chrome} sketches={false} />)).toContain(siteHeader);
    expect(await pageMarkup(<SiteHeader site="v1" chrome={chrome} />)).toContain(siteHeader);
    expect(await pageMarkup(<SiteHeader site="v1" chrome={chrome} sketches />)).not.toContain("<header");
    const footer = <FooterSwitch full={<footer>full</footer>} minimal={<footer>minimal</footer>} />;
    expect(await pageMarkup(footer)).toContain("<footer>full</footer>");
    expect(await pageMarkup(<FooterSwitch sketches full={<footer>full</footer>} minimal={<footer>minimal</footer>} />)).not.toContain("<footer");
  });

  it("through the root layout: a sketch page has only its own header, and the index keeps the site's", async () => {
    const { default: RootLayout } = await import("@/app/layout");
    const Layout = RootLayout as unknown as (props: { params: Promise<object>; children: ReactNode }) => ReactNode;
    at.path = "/site-preview/hero/1";
    const sketch = await pageMarkup(
      <Layout params={Promise.resolve({})}>
        <Page params={Promise.resolve({ n: "1" })} />
      </Layout>,
    );
    expect(sketch.match(/<header\b[^>]*>/g)).toEqual(['<header class="sk1-nav">']);
    expect(sketch).not.toContain("<footer");
    expect(sketch).toContain('<main id="main"');

    at.path = "/site-preview";
    const index = await pageMarkup(
      <Layout params={Promise.resolve({})}>
        <IndexPage />
      </Layout>,
    );
    expect(index).toContain('<header class="sticky top-0 z-40 bg-ground">');
    expect(index).toContain("<footer");
  });
});
