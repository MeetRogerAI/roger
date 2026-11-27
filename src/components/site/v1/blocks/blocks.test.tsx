import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixture from "../../../../../db/seeds/sample-play.fixture.json";
import { v3Defaults } from "@/data/config";
import { bricksPerWeek, compoundingFinal, compoundingNumbers, compoundingSteps, compoundingWeeks } from "@/data/site/compounding";
import type { SharedCopy } from "@/data/site/copy-types";
import { letter, letterShown } from "@/data/site/letter";
import { samplePlay } from "@/data/site/sample-play";
import { closingBandCopy, priceBlockCopy, questionsOn, v1, v1Agents, v1Copy, v1Zack } from "@/data/site/v1";
import { buildIdeaView, factors } from "@/lib/cora/idea-view";
import { amountsFrom, currencies, hasBareDollar, priceLine } from "@/lib/site/amounts";
import { compoundingCaption } from "@/lib/site/compounding";
import type { SamplePlay } from "@/lib/site/sample";
import { pageMarkup } from "@/test-helpers/page-markup";

vi.hoisted(() => {
  delete process.env.DATABASE_URL;
});
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));

const { publicIdeaView } = await import("@/lib/site/sample");
const { BrickStack } = await import("./brick-stack");
const { ClosingBand } = await import("./closing-band");
const { ControlBlock } = await import("./control-block");
const { PriceBlock } = await import("./price-block");
const { Questions } = await import("./questions");
const { SampleCard } = await import("./sample-card");
const { SectionHead } = await import("./section-head");
const { Testimonials } = await import("./testimonials");

const amounts = amountsFrom(v3Defaults);
const { copy, agents, zack } = v1Copy(amounts);
const preface = v3Defaults.playbookPreface;

/** What a reader sees: the markup with its tags taken out. */
const text = (markup: string) =>
  markup
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Every string in a copy object with the path to it, leaving out the keys that are not words on a page. */
function strings(value: unknown, path = "", skip: string[] = ["on", "href", "id"]): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`, skip));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => (skip.includes(k) ? [] : strings(v, path ? `${path}.${k}` : k, skip)));
  }
  return [];
}

// "agent" or "agents" with no "AI" in front (spec 0.4). "AI Agent" in a title also passes.
const bareAgent = /(?<!\bAI )\bagents?\b/i;
const timeFigure = /\d\s*(?:hours?|hrs?|minutes?|mins?)\b/i;
const emoji = /\p{Extended_Pictographic}/u;

// The made-up fixture carries every figure the app's card can show.
const playWithFigures: SamplePlay = {
  id: "fixture",
  title: fixture.title,
  category: fixture.category,
  description: fixture.description,
  heavyUseFor: fixture.heavy_use_for,
  playbookMd: fixture.playbook_md,
  pasteToInstall: fixture.paste_to_install,
  writtenOn: fixture.written_on,
  figures: { ...fixture.figures, math: "Worked out from 25 minutes saved, 8 runs a week." },
  scores: { hours: fixture.f_hours, reach: fixture.f_reach, ease: fixture.f_ease, proof: fixture.f_proof, surprise: fixture.f_surprise },
  score: fixture.score,
};

describe("the sample idea card", () => {
  // Rendered from the view with its figures left in, so the card itself is what keeps them off the page.
  const withFigures = buildIdeaView(playWithFigures, preface);
  const markup = renderToStaticMarkup(<SampleCard idea={withFigures} copy={copy.sample} />);
  const seen = text(markup);

  it("is given a play that does carry time figures", () => {
    expect(withFigures.timeLine).toContain("hours a week");
    expect(withFigures.tiles.eachTime.headline).toContain("minutes saved");
    expect(withFigures.howWorkedOut).not.toBeNull();
  });

  it("prints no time line, no time tile and no missing-figure text", () => {
    for (const absent of [
      withFigures.timeLine!,
      "hours a week",
      "minutes saved",
      "Time saved",
      "Each time",
      "Heavy user",
      "Run by",
      "Not available",
      "Not enough figures",
      "Confidence",
      "estimate",
      "worked out",
    ]) {
      expect(seen, absent).not.toContain(absent);
    }
    expect(seen).not.toMatch(timeFigure);
  });

  it("shows Cora's five scores, each with the spec's name and its number", () => {
    expect(markup.match(/data-score="/g)).toHaveLength(5);
    expect(copy.sample.scores.names).toEqual({ hours: "Hours saved", reach: "Reach", ease: "Ease to copy", proof: "Proof", surprise: "Surprise" });
    for (const factor of factors) {
      expect(seen).toContain(`${copy.sample.scores.names[factor.key]} ${playWithFigures.scores[factor.key]} ${copy.sample.scores.outOf}`);
    }
  });

  it("prints none of the app's help text under a score, and nothing about time saved", () => {
    expect(factors.map((f) => f.help)).toContain("time saved a week");
    for (const factor of factors) expect(seen, factor.help).not.toContain(factor.help);
    expect(seen).not.toMatch(/time saved/i);
  });

  it("has no score row at all for a play with no scores", () => {
    for (const scores of [samplePlay.scores, {}]) {
      const unscored = renderToStaticMarkup(<SampleCard idea={publicIdeaView({ ...samplePlay, scores }, preface)} copy={copy.sample} />);
      const unscoredSeen = text(unscored);
      expect(unscored).not.toContain("data-score=");
      expect(unscored).not.toContain('data-fold="scores"');
      expect(unscoredSeen).not.toContain(copy.sample.scores.title);
      expect(unscoredSeen).not.toContain(copy.sample.scores.notScored);
      expect(unscoredSeen).not.toContain(copy.sample.scores.names.reach);
      // The rest of the card is still there.
      expect(unscoredSeen).toContain(copy.sample.idea.copy);
      expect(unscoredSeen).toContain(copy.sample.playbook.title);
    }
  });

  it("puts the scores of a scored play in a folded row of their own, under The Idea", () => {
    const row = /<details data-fold="scores"[^>]*>(.*?)<\/details>/.exec(markup);
    expect(row).not.toBeNull();
    expect(row![0]).not.toMatch(/<details[^>]*\sopen/);
    expect(text(row![1]).startsWith(copy.sample.scores.title)).toBe(true);
    expect(row![1].match(/data-score="/g)).toHaveLength(5);
    expect(markup.indexOf('data-fold="scores"')).toBeLessThan(markup.indexOf(`>${copy.sample.playbook.title}<`));
  });

  it("keeps all five bars when only some scores exist, and says which are missing", () => {
    const part = renderToStaticMarkup(<SampleCard idea={publicIdeaView({ ...samplePlay, scores: { hours: 7, reach: null } }, preface)} copy={copy.sample} />);
    expect(part.match(/data-score="/g)).toHaveLength(5);
    expect(text(part)).toContain(`Hours saved 7 ${copy.sample.scores.outOf}`);
    expect(text(part).split(copy.sample.scores.notScored)).toHaveLength(5);
  });

  it("is inline: no dialog element", () => {
    expect(markup).not.toMatch(/<dialog/i);
    expect(markup).not.toContain('aria-haspopup="dialog"');
  });

  it("has the install prompt with a copy button under What To Copy, and the playbook", () => {
    const row = /<details data-fold="copy"[^>]*>(.*?)<\/details>/.exec(markup)![1];
    expect(text(row).startsWith(copy.sample.idea.copy)).toBe(true);
    expect(text(row)).toContain(playWithFigures.pasteToInstall);
    expect(row).toMatch(new RegExp(`<button[^>]*>.*${copy.sample.install.copy}.*</button>`));
    expect(seen).toContain(copy.sample.playbook.title);
    expect(seen).toContain("Never send anything to a client. Draft only.");
  });

  it("drops the figures before the view is built, for either source", () => {
    const view = publicIdeaView(playWithFigures, preface);
    expect(view.timeLine).toBeNull();
    expect(view.howWorkedOut).toBeNull();
    expect(Object.values(view.tiles).every((tile) => tile.headline === null)).toBe(true);
  });
});

/** The words inside every element that is not folded away: what a reader sees before opening anything. */
const unfolded = (markup: string) => {
  let rest = markup;
  // Innermost rows first, so a row inside a row goes with it.
  for (let before = ""; before !== rest; ) {
    before = rest;
    rest = rest.replace(/<details\b[^>]*>(?:(?!<details\b)[\s\S])*?<\/details>/g, (row) => /<summary\b[^>]*>[\s\S]*?<\/summary>/.exec(row)?.[0] ?? "");
  }
  return text(rest);
};

describe("the sample idea card, folded (Peter's homepage review, November 26, 2026)", () => {
  const idea = publicIdeaView(samplePlay, preface);
  const markup = renderToStaticMarkup(<SampleCard idea={idea} copy={copy.sample} />);
  const rows = [...markup.matchAll(/<details\b([^>]*)>/g)].map((m) => m[1]);
  const fold = (name: string) => rows.filter((attrs) => attrs.includes(`data-fold="${name}"`));

  it("is the bundled play, whose playbook has eight parts", () => {
    expect(samplePlay.playbookMd.match(/^## /gm)).toHaveLength(8);
  });

  it("has two headings that do not fold, The Idea and The Playbook, in that order", () => {
    expect(copy.sample.idea).toEqual({ title: "The Idea", summary: "Summary", copy: "What To Copy" });
    expect(copy.sample.playbook.title).toBe("The Playbook");
    const headings = [...markup.matchAll(/<h4\b[^>]*>(.*?)<\/h4>/g)].map((m) => m[1]);
    expect(headings.slice(0, 2)).toEqual(["The Idea", "The Playbook"]);
    // Neither heading is inside a row, so neither can be folded away.
    for (const heading of ["The Idea", "The Playbook"]) expect(unfolded(markup)).toContain(heading);
  });

  it("is folded when it arrives: every row is a native details element, and none is open", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const attrs of rows) expect(attrs).not.toMatch(/\sopen\b/);
    expect(markup.match(/<summary\b/g)).toHaveLength(rows.length);
  });

  it("has Summary and What To Copy under The Idea, and one row under The Playbook that holds a row for each of the eight steps", () => {
    expect(fold("summary")).toHaveLength(1);
    expect(fold("copy")).toHaveLength(1);
    expect(fold("playbook")).toHaveLength(1);
    expect(fold("step")).toHaveLength(8);
    expect(markup).toContain('data-steps="8"');
    const summaries = [...markup.matchAll(/<summary\b[^>]*>(.*?)<\/summary>/g)].map((m) => text(m[1]));
    expect(summaries).toEqual(["Summary", "What To Copy", "8 steps", "1. Play", "2. Trigger", "3. Setup first", "4. Steps", "5. Guardrails", "6. Output", "7. Pitfalls seen", "8. Done when"]);
    // The eight step rows are inside the one playbook row, so folded they take one row, not eight.
    const playbook = markup.slice(markup.indexOf('data-fold="playbook"'));
    expect(playbook.match(/data-fold="step"/g)).toHaveLength(8);
    expect(markup.slice(0, markup.indexOf('data-fold="playbook"'))).not.toContain('data-fold="step"');
  });

  it("shows only the headings and the row labels until a row is opened", () => {
    expect(unfolded(markup)).toBe(`${idea.category} ${idea.title} The Idea Summary What To Copy The Playbook 8 steps`);
  });

  it("still has all of the play's text in the page: the description, the install prompt and every line of the playbook", () => {
    const seen = text(markup);
    expect(seen).toContain(samplePlay.description);
    expect(seen).toContain(samplePlay.pasteToInstall);
    const lines = samplePlay.playbookMd
      .split("\n")
      .map((line) => line.replace(/^#+\s+|^[-*]\s+|^\d+[.)]\s+/, "").trim())
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(20);
    for (const line of lines) expect(seen, line).toContain(line);
    // The summary is under Summary, and the prompt under What To Copy.
    expect(text(/<details data-fold="summary"[^>]*>(.*?)<\/details>/.exec(markup)![1])).toBe(`Summary ${samplePlay.description}`);
    expect(text(/<details data-fold="copy"[^>]*>(.*?)<\/details>/.exec(markup)![1])).toContain(samplePlay.pasteToInstall);
  });

  it("says the play's own count of steps, and shows a playbook with no headed parts whole, under one row with no count", () => {
    const six = samplePlay.playbookMd.split("## 7. ")[0].trim();
    const shorter = renderToStaticMarkup(<SampleCard idea={publicIdeaView({ ...samplePlay, playbookMd: six }, preface)} copy={copy.sample} />);
    expect(shorter).toContain('data-steps="6"');
    expect(text(shorter)).toContain("6 steps");

    const plain = renderToStaticMarkup(<SampleCard idea={publicIdeaView({ ...samplePlay, playbookMd: "Read the message.\n\nWrite two replies." }, preface)} copy={copy.sample} />);
    expect(plain).not.toContain("data-steps=");
    expect(plain).not.toContain('data-fold="step"');
    expect(unfolded(plain)).toContain(`The Playbook ${copy.sample.playbook.whole}`);
    expect(text(plain)).toContain("Read the message. Write two replies.");
  });

  it("marks each row's state with a plus that turns when the row is open, and a summary a keyboard can reach", () => {
    expect(markup.match(/group-open\/fold:rotate-45/g)).toHaveLength(3);
    expect(markup.match(/group-open\/step:rotate-45/g)).toHaveLength(8);
    // A summary is focusable by default: nothing takes it out of the tab order or hides the focus ring.
    expect(markup).not.toMatch(/<summary[^>]*tabindex="-1"/);
    expect(markup).not.toMatch(/<summary[^>]*outline-none/);
  });
});

describe("the price block", () => {
  const priceCopy = priceBlockCopy(copy);
  const render = (initialCurrency: "USD" | "CAD") => pageMarkup(<PriceBlock amounts={amounts} copy={priceCopy} initialCurrency={initialCurrency} audience="re" />);

  it("has a USD and a CAD button that say which is on", async () => {
    const markup = await render("USD");
    const buttons = markup.match(/<button[^>]*aria-pressed="(true|false)"[^>]*>[^<]*<\/button>/g) ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatch(/aria-pressed="true"[^>]*>USD</);
    expect(buttons[1]).toMatch(/aria-pressed="false"[^>]*>CAD</);
    expect(markup).toContain(`aria-label="${copy.price.switchLabel}"`);

    const canada = (await render("CAD")).match(/<button[^>]*aria-pressed="(true|false)"[^>]*>[^<]*<\/button>/g) ?? [];
    expect(canada[1]).toMatch(/aria-pressed="true"[^>]*>CAD</);
  });

  it("shows one plan, monthly, and no other (Peter's homepage review, November 26, 2026)", async () => {
    const markup = await render("USD");
    expect(markup.match(/data-plan="/g)).toHaveLength(1);
    expect(markup).toContain('data-plan="monthly"');
    const seen = text(markup);
    expect(seen).not.toMatch(/one list|one at a time|\/ list\b|most people/i);
    expect(Object.keys(copy.priceBlock).sort()).toEqual(["monthly", "sub", "title"]);
    expect(Object.keys(copy.price).sort()).toEqual(["perMonth", "switchLabel", "tax"]);
  });

  it("has Peter's line directly under its heading, before the currency switch", async () => {
    expect(copy.priceBlock.sub).toBe("Get two Cora Curations for free and pay only after you have tried the product for two full weeks.");
    // Both counts are the number of free Cora Curations, from the settings: one arrives each Monday.
    expect(v1.priceBlock.sub).toBe("Get {freeLists} Cora Curations for free and pay only after you have tried the product for {freeLists} full weeks.");
    const markup = await render("USD");
    expect(markup).toMatch(new RegExp(`</h2><p data-price-sub="true"[^>]*>${copy.priceBlock.sub}</p>`));
    expect(markup.indexOf("data-price-sub")).toBeLessThan(markup.indexOf('role="group"'));
  });

  it("names the plan one heading level under its own heading: h3 under an h2, h2 under an h1, in the same classes", async () => {
    const headings = (markup: string) => [...markup.matchAll(/<(h[1-6])\b([^>]*)>(.*?)<\/\1>/g)].map((m) => ({ tag: m[1], classes: /class="([^"]*)"/.exec(m[2])?.[1], words: m[3] }));
    // The homepage and /agents: the block's heading is an h2.
    const asH2 = headings(await render("USD"));
    expect(asH2).toEqual([
      { tag: "h2", classes: "text-h2", words: copy.priceBlock.title },
      { tag: "h3", classes: "text-title", words: copy.priceBlock.monthly.name },
    ]);
    // /pricing: the block's heading is the page's h1, so the plan is an h2 and no level is skipped.
    const asH1 = headings(await pageMarkup(<PriceBlock amounts={amounts} copy={priceCopy} initialCurrency="USD" audience="re" as="h1" />));
    expect(asH1).toEqual(asH2.map((h) => ({ ...h, tag: h.tag === "h2" ? "h1" : "h2" })));
  });

  it("puts the trial line directly after the price, before the button", async () => {
    const markup = await render("USD");
    const afterPrices = markup.slice(markup.indexOf(copy.priceBlock.monthly.note) + copy.priceBlock.monthly.note.length);
    expect(text(afterPrices).startsWith(copy.trialLine)).toBe(true);
    expect(text(afterPrices).slice(copy.trialLine.length).trim()).toBe(copy.buttons.start);
  });

  it("shows the price in each currency with its code after it and its tax note, never a bare dollar sign", async () => {
    const seen = text(await render("USD"));
    for (const line of ["US$200 / month USD", "CA$280 / month CAD", "plus tax where it applies", "plus HST"]) {
      expect(seen).toContain(line);
    }
    expect(hasBareDollar(seen)).toBe(false);
    expect(seen).not.toContain("400");
    expect(seen).not.toContain("560");
  });

  it("writes each price in priceLine's words, and takes the tax notes from the copy", async () => {
    const seen = text(await render("CAD"));
    for (const currency of currencies) {
      expect(seen).toContain(`${priceLine(currency, amounts.monthly[currency], copy.price.perMonth)} ${copy.price.tax[currency]}`);
    }
    const reworded = text(await pageMarkup(<PriceBlock amounts={amounts} copy={{ ...priceCopy, tax: { USD: "before tax", CAD: "before HST" } }} />));
    expect(reworded).toContain("US$200 / month USD before tax");
    expect(reworded).toContain("CA$280 / month CAD before HST");
    expect(reworded).not.toContain("plus");
  });

  it("takes the price from the amounts, in both currencies, when the settings change", async () => {
    const dearer = amountsFrom({ ...v3Defaults, priceUsd: 230, priceCad: 310 });
    const seen = text(await pageMarkup(<PriceBlock amounts={dearer} copy={priceCopy} />));
    expect(seen).toContain("US$230 / month USD");
    expect(seen).toContain("CA$310 / month CAD");
    expect(seen).not.toContain("US$200");
  });

  it("is given the spec's two tax notes by the v1 copy, with no bare dollar sign", () => {
    expect(v1.price.tax).toEqual({ USD: "plus tax where it applies", CAD: "plus HST" });
    expect(priceCopy.tax).toEqual(v1.price.tax);
    for (const note of Object.values(v1.price.tax)) expect(hasBareDollar(note), note).toBe(false);
  });

  it("keeps both currencies readable with no script: the other one is hidden only under html.js", async () => {
    const markup = await render("USD");
    const usd = /<span data-currency="USD" class="([^"]*)"/.exec(markup)?.[1];
    const cad = /<span data-currency="CAD" class="([^"]*)"/.exec(markup)?.[1];
    expect(usd).toBe("block");
    expect(cad).toBe("block [.js_&amp;]:hidden");
    // The switch can do nothing without script, so it shows only with it.
    expect(markup).toMatch(/role="group"[^>]*class="hidden [^"]*\[\.js_&amp;\]:inline-flex/);
  });

  it("sends its button to /start with the page's audience", async () => {
    expect(await render("USD")).toMatch(/<a[^>]*href="\/start\?path=re"[^>]*>Get two free Cora Curations<\/a>/);
  });
});

describe("testimonials", () => {
  it("render nothing at all for an empty list", () => {
    expect(renderToStaticMarkup(<Testimonials title={copy.testimonials.title} items={[]} />)).toBe("");
  });

  it("show each quote word for word, then who said it", () => {
    const markup = renderToStaticMarkup(
      <Testimonials
        title={copy.testimonials.title}
        items={[{ id: "t1", person: "Dana K.", attribution: "Made-up role", quote: "Exactly these words, and no others.", saidOn: null, audience: "re", position: 0, cleared: true }]}
      />,
    );
    const seen = text(markup);
    expect(seen).toContain(copy.testimonials.title);
    expect(seen).toContain("“Exactly these words, and no others.”");
    expect(seen.indexOf("Dana K.")).toBeGreaterThan(seen.indexOf("no others."));
    expect(seen).toContain("Made-up role");
  });
});

describe("the brick stack", () => {
  it("gives every brick its own text label", () => {
    const markup = renderToStaticMarkup(<BrickStack weeks={compoundingFinal.week} perRow={13} words={copy.bricks} caption />);
    const bricks = markup.match(/<li[^>]*>.*?<\/li>/g) ?? [];
    expect(bricks).toHaveLength(compoundingFinal.bricks);
    for (const brick of bricks) expect(brick).toMatch(/<span class="sr-only">Week \d+, idea [123]: set up<\/span>/);
    expect(new Set(bricks.map((b) => text(b))).size).toBe(bricks.length);
    expect(text(markup)).toContain("Week 26 78 bricks");
  });

  it("builds its caption from the copy's words, and has none unless asked", () => {
    const reworded = { ...copy.bricks, caption: { week: "Monday {week}", bricks: "{bricks} ideas set up" } };
    expect(text(renderToStaticMarkup(<BrickStack weeks={2} words={reworded} caption />))).toContain("Monday 2 6 ideas set up");
    expect(renderToStaticMarkup(<BrickStack weeks={2} words={copy.bricks} />)).not.toContain("<figcaption");
  });

  it("draws an empty slot as an outline and labels it as not set up", () => {
    const markup = renderToStaticMarkup(<BrickStack weeks={2} setUp={4} words={copy.bricks} />);
    expect(markup.match(/data-set-up="yes"/g)).toHaveLength(4);
    expect(markup.match(/data-set-up="no"/g)).toHaveLength(2);
    expect(markup.match(/: not set up yet</g)).toHaveLength(2);
    expect(markup.match(/<li[^>]*data-set-up="no"[^>]*class="[^"]*border /g)).toHaveLength(2);
  });

  it("uses the level colours, lifted on night", () => {
    expect(renderToStaticMarkup(<BrickStack weeks={1} level={3} words={copy.bricks} />)).toContain("bg-level-3");
    expect(renderToStaticMarkup(<BrickStack weeks={1} level={3} night words={copy.bricks} />)).toContain("bg-f-proof-night");
  });

  it("renders exactly as it did before `wide` and `xl`, for a caller that passes neither", () => {
    const brick = (n: number) => `<li data-week="1" data-brick="${n}" data-set-up="yes" style="--i:${n - 1}" class="size-5 rounded-[5px] bg-level-1"><span class="sr-only">Week 1, idea ${n}: set up</span></li>`;
    expect(renderToStaticMarkup(<BrickStack weeks={1} words={copy.bricks} />)).toBe(
      `<figure class="inline-flex flex-col items-center "><ul class="flex flex-wrap-reverse gap-1.5" style="width:72px" data-bricks="3">${brick(1)}${brick(2)}${brick(3)}</ul></figure>`,
    );
    // The same at every size that existed, with a width in pixels and no breakpoint classes or width variables.
    for (const [size, classes, width] of [
      ["s", "size-3 rounded-[3px]", 12 * 13 + 4 * 12],
      ["m", "size-5 rounded-[5px]", 20 * 13 + 6 * 12],
      ["l", "size-8 rounded-[8px]", 32 * 13 + 8 * 12],
    ] as const) {
      const markup = renderToStaticMarkup(<BrickStack weeks={2} size={size} perRow={13} setUp={4} words={copy.bricks} />);
      expect(markup, size).toContain(`style="width:${width}px" data-bricks="6"`);
      expect(markup.match(new RegExp(`class="${classes.replace(/[[\]]/g, "\\$&")} `, "g")), size).toHaveLength(6);
      expect(markup, size).not.toContain("lg:");
      expect(markup, size).not.toContain("--bricks-w");
    }
  });

  it("has an xl size: a larger brick and gap, and a width to match", () => {
    const markup = renderToStaticMarkup(<BrickStack weeks={4} size="xl" night words={copy.bricks} />);
    // Three across: 3 × 56 and two gaps of 12.
    expect(markup).toContain('<ul class="flex flex-wrap-reverse gap-3" style="width:192px" data-bricks="12">');
    expect(markup.match(/class="size-14 rounded-\[8px\] bg-f-reach-night"/g)).toHaveLength(12);
    expect(markup).not.toContain("lg:");
  });

  it("with `wide`, changes size and number across from the lg breakpoint, through two width variables", () => {
    const markup = renderToStaticMarkup(<BrickStack weeks={2} size="m" perRow={7} wide={{ size: "l", perRow: 13 }} words={copy.bricks} />);
    // Narrow: 7 × 20 and six gaps of 6. Wide: 13 × 32 and twelve gaps of 8.
    expect(markup).toContain('<ul class="flex flex-wrap-reverse gap-1.5 lg:gap-2 w-(--bricks-w) lg:w-(--bricks-w-lg)" style="--bricks-w:176px;--bricks-w-lg:512px" data-bricks="6">');
    expect(markup.match(/class="size-5 rounded-\[5px\] lg:size-8 lg:rounded-\[8px\] bg-level-1"/g)).toHaveLength(6);
    // The width is left to the classes: no fixed width in the style.
    expect(markup).not.toMatch(/style="width:/);
  });

  it("with `wide`, keeps the narrow size or number across for whichever is left out", () => {
    const sameSize = renderToStaticMarkup(<BrickStack weeks={1} size="s" perRow={3} wide={{ perRow: 9 }} words={copy.bricks} />);
    expect(sameSize).toContain('class="flex flex-wrap-reverse gap-1 lg:gap-1 w-(--bricks-w) lg:w-(--bricks-w-lg)" style="--bricks-w:44px;--bricks-w-lg:140px"');
    expect(sameSize).toContain('class="size-3 rounded-[3px] lg:size-3 lg:rounded-[3px] bg-level-1"');

    const sameAcross = renderToStaticMarkup(<BrickStack weeks={1} size="m" wide={{ size: "xl" }} words={copy.bricks} />);
    expect(sameAcross).toContain('style="--bricks-w:72px;--bricks-w-lg:192px"');
    expect(sameAcross).toContain('class="size-5 rounded-[5px] lg:size-14 lg:rounded-[8px] bg-level-1"');
    expect(sameAcross).toContain("gap-1.5 lg:gap-3");
  });
});

describe("the other blocks", () => {
  it("control block: the title, three points and the link to the Zack detail", () => {
    const markup = renderToStaticMarkup(<ControlBlock copy={copy.control} />);
    const seen = text(markup);
    expect(seen).toContain("You decide what Zack shares");
    expect(markup.match(/<li/g)).toHaveLength(3);
    expect(seen).toContain("the price becomes US$400 a month (CA$560 in Canada).");
    expect(markup).toContain('href="/how-it-works#zack"');
  });

  it("control block: each point reads title first, and the third is Peter's line on privacy over the sentence on turning sharing off", () => {
    const markup = renderToStaticMarkup(<ControlBlock copy={copy.control} />);
    const points = (markup.match(/<li[^>]*>.*?<\/li>/g) ?? []).map(text);
    expect(points).toEqual([
      "Read every line. The exact instructions your Zack runs are in your dashboard.",
      "Set your own rules. Skip whole subjects, block names and words, or add rules in your own words.",
      "Protect your privacy and your most valuable ideas at any time. Turn sharing off any time in your dashboard. Your Cora Curations keep coming and the price becomes US$400 a month (CA$560 in Canada).",
    ]);
    expect(copy.control.points.map((p) => p.title)).toEqual(["Read every line.", "Set your own rules.", "Protect your privacy and your most valuable ideas at any time."]);
    expect(markup.match(/<p class="text-title">/g)).toHaveLength(3);
  });

  it("reveal: every revealed element also suppresses the hydration warning's cause, in one place", () => {
    // suppressHydrationWarning leaves no trace in markup, so the wrapper is checked by what it renders.
    expect(renderToStaticMarkup(<ControlBlock copy={copy.control} />)).toMatch(/<ul data-reveal="true" class="[^"]*md:grid-cols-3/);
    expect(renderToStaticMarkup(<Questions title="Q" items={questionsOn(copy, "home")} />)).toMatch(/<div data-reveal="true" class="wrap /);
  });

  it("questions: each one is a details element, with the link to /faq", () => {
    const items = questionsOn(copy, "home");
    const markup = renderToStaticMarkup(<Questions title={copy.questionsBlock.title} items={items} more={copy.questionsBlock.more} />);
    expect(markup.match(/<details/g)).toHaveLength(items.length);
    expect(markup.match(/<summary/g)).toHaveLength(items.length);
    expect(markup).toContain('href="/faq"');
    expect(renderToStaticMarkup(<Questions title="None" items={[]} />)).toBe("");
  });

  it("closing band: one line, the line under the price, the start button, then the trial line", async () => {
    const band = closingBandCopy(copy, agents.closing.line);
    expect(band).toEqual({ line: "Find out what other heavy users know.", sub: copy.priceBlock.sub, start: "Get two free Cora Curations", trialLine: copy.trialLine });
    const seen = text(await pageMarkup(<ClosingBand copy={band} audience="agents" />));
    expect(seen).toBe(`Find out what other heavy users know. ${copy.priceBlock.sub} Get two free Cora Curations ${copy.trialLine}`);
    // The homepage's own line speaks of Cora Curations too.
    expect(copy.home.closing.line).toBe("See what your first two Cora Curations bring.");
  });

  it("section head: a centred heading with its sub-line", () => {
    const markup = renderToStaticMarkup(<SectionHead title="It compounds" sub="One sentence." as="h1" />);
    expect(markup).toContain("<h1");
    expect(markup).toContain("text-center");
    expect(text(markup)).toBe("It compounds One sentence.");
  });
});

describe("v1 copy", () => {
  const all = [...strings(v1), ...strings(v1Agents, "agents"), ...strings(v1Zack, "zack")];
  const filled = [...strings(copy), ...strings(agents, "agents"), ...strings(zack, "zack")];

  it("fills the shared strings every version must have", () => {
    const shared: SharedCopy = copy;
    expect(shared.buttons.start).toBe("Get two free Cora Curations");
    // One label for every start button: there is no shorter one for the header.
    expect(Object.keys(shared.buttons).sort()).toEqual(["openApp", "signIn", "start"]);
    expect(shared.cardLine).toBe("Card required. Charged only with your third Cora Curation.");
    expect(shared.trialLine).toBe(
      "Your first two Cora Curations are free. We ask for a card when you start. It is charged with your third Cora Curation, and once a month after that. Cancel before then and you pay nothing.",
    );
    expect(shared.questions.map((g) => g.title)).toEqual(["Getting started", "Zack and privacy", "Cora and the ideas", "Price and billing"]);
    expect(shared.questions.flatMap((g) => g.items)).toHaveLength(18);
  });

  it("types no amount: no dollar sign, and no price, rate, free-list count or trial day written as a number or word", () => {
    for (const s of all) {
      expect(s.text, s.path).not.toContain("$");
      expect(s.text, s.path).not.toMatch(/\b(?:100|140|200|280|400|560|21)\b/);
      expect(s.text, s.path).not.toMatch(/\btwo free\b|\bfirst two\b|\btwo Cora\b|\btwo full weeks\b|\bthird (?:Monday )?list\b|\bthird Cora\b|\bthird Monday\b|\bsecond (?:list|Cora)\b/i);
    }
  });

  it("calls what arrives each Monday a Cora Curation, and never a list (Peter's homepage review, November 26, 2026)", () => {
    for (const s of filled) {
      expect(s.text, s.path).not.toMatch(/Monday lists?\b|\b(?:free|your|third|second|first|a|one|no) lists?\b|\blists\b|one at a time/i);
      // Both words capitalised, wherever it is named.
      expect(s.text.match(/cora curations?/gi) ?? [], s.path).toEqual(s.text.match(/Cora Curations?/g) ?? []);
    }
    expect(filled.filter((s) => /Cora Curation/.test(s.text)).length).toBeGreaterThan(15);
    // Each page that names one says once what it is, in the same words.
    const what = "three ideas picked for you by Cora, each with a full playbook";
    expect(copy.priceBlock.monthly.note).toContain(what);
    expect(copy.pricing.included.items[0]).toContain(what);
    expect(copy.questions.flatMap((g) => g.items).find((i) => i.q === "What is a Cora Curation?")?.a).toContain(what);
    expect(copy.home.how.steps[2].body).toContain("That is your Cora Curation.");
    expect(copy.howItWorks.week.days[1].body).toContain("They arrive as your Cora Curation");
  });

  it("speaks to anyone who uses AI agents: no real estate wording anywhere in the copy", () => {
    for (const s of filled) expect(s.text, s.path).not.toMatch(/real estate|realtor|brokerage|open house|\blistings?\b|\bbuyers?\b|\bsellers?\b|home evaluation/i);
    expect(copy.home.hero.sub).toBe("Roger makes your AI agents smarter every week, with battle tested ideas that have already worked for real people in the network.");
    expect(copy.home.problem.statements[0]).toBe("Everyone is being told to use AI. Almost nobody is told what to use it for.");
  });

  it("names only amounts that exist, and shows no bare dollar sign once filled", () => {
    // The brick caption's {week} and {bricks} are not amounts: they are filled per stack.
    const captions = filled.filter((s) => s.path.startsWith("bricks.caption."));
    expect(captions.map((s) => s.text)).toEqual(["Week {week}", "{bricks} bricks"]);
    for (const s of filled.filter((x) => !captions.includes(x))) {
      expect(s.text, s.path).not.toMatch(/[{}]/);
      expect(hasBareDollar(s.text), s.path).toBe(false);
    }
  });

  it("has no digit followed by hour or minute", () => {
    for (const s of filled) expect(s.text, s.path).not.toMatch(timeFigure);
  });

  it("states one price, monthly, and never a price for one list", () => {
    for (const s of filled) {
      expect(s.text, s.path).not.toContain("Two lists one at a time cost the same as a whole month");
      expect(s.text, s.path).not.toMatch(/US\$100|CA\$140|costs less|cheaper/);
    }
    for (const s of all) expect(s.text, s.path).not.toMatch(/\{list(?:Usd|Cad)\}/);
    expect(copy.pricing.explained).toEqual({
      title: "Monthly, explained",
      body: "A Cora Curation every Monday. Your first two are free. Your card is charged once a month, starting with your third Cora Curation.",
      under: "One price, charged once a month. Cancel in one click.",
    });
  });

  it("answers “What does it cost?” as the price block does: monthly only, both prices, Peter's line, and the higher rate as the effect of turning sharing off", () => {
    const items = copy.questions.flatMap((g) => g.items);
    expect(items.find((i) => i.q === "What does it cost?")?.a).toBe(
      `US$200 a month, plus tax where it applies. In Canada it is CA$280 a month, plus HST. ${copy.priceBlock.sub} If you turn sharing off in your dashboard, the price becomes US$400 a month (CA$560 in Canada).`,
    );
    expect(items.find((i) => i.q === "When is my card charged?")?.a).toBe(
      "A card is required when you sign up, and it is not charged then. The first charge comes with your third Cora Curation, and the charge repeats once a month after that. Your first two Cora Curations are free, and we email you after the second one with what happens next.",
    );
    expect(items.map((i) => i.q)).not.toContain("Can I buy one list at a time?");
  });

  it("mentions the higher rate only as the spec does: sharing off, or a second missed week", () => {
    const higher = filled.filter((s) => /US\$400|CA\$560/.test(s.text));
    expect(higher.length).toBeGreaterThan(0);
    // A control point is read as one run of sentences: its title, then its body.
    const point = (path: string) => copy.control.points.find((p, i) => path === `control.points[${i}].body`);
    for (const s of higher) expect(`${point(s.path)?.title ?? ""} ${s.text}`, s.path).toMatch(/sharing off|second miss/i);
  });

  it("gives the Canadian higher rate every time it gives the US one", () => {
    const higher = filled.filter((s) => /US\$400|CA\$560/.test(s.text));
    expect(higher.map((s) => s.path).sort()).toEqual(["control.points[2].body", "pricing.contributing.body", "questions[1].items[4].a", "questions[3].items[0].a", "questions[3].items[3].a"]);
    for (const s of higher) {
      expect(s.text.match(/US\$400/g), s.path).toHaveLength(s.text.match(/US\$400 (?:a month )?\(CA\$560 in Canada\)/g)?.length ?? 0);
      expect(s.text.match(/CA\$560/g), s.path).toHaveLength(s.text.match(/US\$400/g)!.length);
    }
    expect(copy.pricing.contributing.body).toContain("A second miss makes that month US$400 (CA$560 in Canada).");
    expect(copy.pricing.contributing.body).toContain("the monthly price is US$400 (CA$560 in Canada).");
  });

  it("does not say nothing arrives on Wednesday, or that an idea can start on a schedule", () => {
    const wednesday = copy.howItWorks.week.days.find((d) => d.day === "Wednesday");
    expect(wednesday?.body).toBe("Each idea you set up stays set up, and your three ideas stay in your dashboard for when you want them.");
    expect(copy.howItWorks.anatomy.notes.find((n) => n.part === "Trigger")?.note).toBe("What starts it.");
    for (const s of filled) expect(s.text, s.path).not.toMatch(/\bschedule\b/i);
  });

  it("never says agent without AI in front, outside /agents and /zack", () => {
    const ruled = strings(copy).filter((s) => s.path !== "zackWarning");
    expect(ruled.length).toBeGreaterThan(100);
    for (const s of ruled) expect(s.text, s.path).not.toMatch(bareAgent);
    // The rule has teeth: the two exempt pages do use the bare word.
    expect(strings(agents).some((s) => bareAgent.test(s.text))).toBe(true);
    expect(bareAgent.test(copy.zackWarning)).toBe(true);
  });

  it("has no exclamation mark, no emoji and no user count", () => {
    for (const s of filled) {
      expect(s.text, s.path).not.toContain("!");
      expect(s.text, s.path).not.toMatch(emoji);
      expect(s.text, s.path).not.toMatch(/join (?:hundreds|thousands)|\d[\d,]*\+? (?:users|members|people|customers)\b(?!’)/i);
    }
  });

  it("tags seven questions for the homepage and seven for /agents, “What is a Cora Curation?” among both", () => {
    expect(questionsOn(copy, "home")).toHaveLength(7);
    expect(questionsOn(copy, "agents")).toHaveLength(7);
    for (const page of ["home", "agents"] as const) expect(questionsOn(copy, page).map((i) => i.q)).toContain("What is a Cora Curation?");
  });
});

describe("the letter", () => {
  it("shows at least three paragraphs, none about Circles or applications", () => {
    expect(letterShown.length).toBeGreaterThanOrEqual(3);
    for (const p of letterShown) {
      expect(p.shown, p.id).not.toMatch(/Circle|appl/i);
      expect(p.original, p.id).not.toMatch(/Circle|appl/i);
    }
  });

  it("flags every paragraph about Circles or applications as no longer true", () => {
    for (const p of letter.paragraphs.filter((x) => /Circle|appl/i.test(x.original))) expect(p.stillTrue, p.id).toBe(false);
    expect(letter.paragraphs.filter((p) => !p.stillTrue).map((p) => p.id)).toEqual(["answer", "applications", "apply"]);
  });

  it("changes Peter's words in one place only: agents became AI agents", () => {
    const changed = letter.paragraphs.filter((p) => p.shown !== p.original);
    expect(changed.map((p) => p.id)).toEqual(["noticed"]);
    expect(changed[0].shown).toBe(changed[0].original.replace("people do with agents", "people do with AI agents"));
  });

  it("follows the vocabulary rule in what it shows", () => {
    for (const p of letterShown) expect(p.shown, p.id).not.toMatch(bareAgent);
  });

  it("has no exclamation mark and no emoji in anything it shows", () => {
    for (const shown of [letter.greeting, ...letterShown.map((p) => p.shown), letter.signOff, letter.signature]) {
      expect(shown).not.toContain("!");
      expect(shown).not.toMatch(emoji);
    }
  });
});

describe("the bundled sample play", () => {
  const words = [samplePlay.title, samplePlay.category, samplePlay.description, samplePlay.heavyUseFor, samplePlay.playbookMd, samplePlay.pasteToInstall];

  it("carries no figures and no made-up score", () => {
    expect(samplePlay.figures).toEqual({});
    expect(samplePlay.score).toBeNull();
    expect(Object.values(samplePlay.scores).every((v) => v === null)).toBe(true);
  });

  it("has no time-saved or frequency figure, no amount and no income claim", () => {
    for (const w of words) {
      expect(w).not.toMatch(timeFigure);
      expect(w).not.toMatch(/\b(?:a|per|each) (?:week|year|day|month)\b/i);
      expect(w).not.toMatch(/\$|\bsaved?\b(?! (?:a skill|context|note))|\bincome\b|\brevenue\b|\bcommission\b/i);
    }
  });

  it("follows the vocabulary rule and no longer says member", () => {
    for (const w of words) {
      expect(w).not.toMatch(bareAgent);
      expect(w).not.toMatch(/\bmembers?\b/i);
    }
  });

  it("has no exclamation mark and no emoji", () => {
    expect(emoji.test("Done ✅")).toBe(true);
    for (const w of words) {
      expect(w).not.toContain("!");
      expect(w).not.toMatch(emoji);
    }
  });

  it("keeps the eight numbered parts the install prompt refers to", () => {
    const parts = samplePlay.playbookMd.match(/^## \d\. .+$/gm);
    expect(parts).toEqual(["## 1. Play", "## 2. Trigger", "## 3. Setup first", "## 4. Steps", "## 5. Guardrails", "## 6. Output", "## 7. Pitfalls seen", "## 8. Done when"]);
    expect(samplePlay.pasteToInstall).toContain("Read sections 1 to 8");
  });
});

describe("the compounding data", () => {
  it("is exactly seven states, weeks 1, 2, 3, 4, 10, 17 and 26, and ends at 78 bricks", () => {
    expect(compoundingSteps).toHaveLength(7);
    expect(compoundingWeeks).toEqual([1, 2, 3, 4, 10, 17, 26]);
    expect(compoundingSteps.map((s) => [s.week, s.bricks])).toEqual([
      [1, 3],
      [2, 6],
      [3, 9],
      [4, 12],
      [10, 30],
      [17, 51],
      [26, 78],
    ]);
    expect(compoundingFinal).toEqual({ week: 26, bricks: 78 });
    // Peter's decision of November 26, 2026: the loop ends at 78. No state follows the finished stack.
    expect(compoundingSteps.at(-1)).toEqual(compoundingFinal);
  });

  it("counts three bricks a week in one place: every count is its week times three", () => {
    expect(bricksPerWeek).toBe(3);
    for (const s of compoundingSteps) expect(s.bricks, `week ${s.week}`).toBe(s.week * bricksPerWeek);
    expect(compoundingSteps.map((s) => s.week)).toEqual([...compoundingWeeks]);
  });

  it("lists every number the section may print: the seven weeks and the seven counts, and no other", () => {
    expect([...compoundingNumbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 6, 9, 10, 12, 17, 26, 30, 51, 78]);
  });

  it("holds numbers only: the words of a caption come from the copy", () => {
    for (const s of compoundingSteps) expect(Object.values(s).every((v) => typeof v === "number")).toBe(true);
    expect(v1.bricks.caption).toEqual({ week: "Week {week}", bricks: "{bricks} bricks" });
    expect(compoundingSteps.map((s) => compoundingCaption(copy.bricks.caption, s)).at(-1)).toEqual({ week: "Week 26", bricks: "78 bricks" });
  });
});
