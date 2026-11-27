/**
 * The two loops of the homepage (Peter's homepage review, November 26, 2026):
 * the hero's four parts and the seven states of "It compounds". Tests run in
 * node, with no browser, so what is checked here is what the server sends (the
 * still picture a visitor with no script reads), the arithmetic of each loop,
 * and the rules in globals.css that decide when anything moves.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { compoundingSteps } from "@/data/site/compounding";
import { v1Copy } from "@/data/site/v1";
import { amountsFrom } from "@/lib/site/amounts";
import { CompoundingLoop, LOOP_LAST_MS, LOOP_STATE_MS, arrival, dwellFor, nextState } from "./compounding-loop";
import { HERO_STEP_MS, HeroSteps, nextStep } from "./hero-steps";
import { holdsAfter, isPlaying, noHolds, stepAfter, type HoldEvent, type Holds } from "./use-loop-play";

const { copy } = v1Copy(amountsFrom(v3Defaults));
const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\r\n/g, "\n");
const source = (file: string) => readFileSync(path.join(process.cwd(), "src/components/site/v1/blocks", file), "utf8");

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The part of globals.css inside its "Bricks in motion" motion query: the only rules that hide or move anything in either loop. */
const motion = (() => {
  const start = css.indexOf("@media (prefers-reduced-motion: no-preference) {", css.indexOf("Bricks in motion"));
  return css.slice(start, css.indexOf("@keyframes brick-drop", start));
})();

describe("the hero's four parts", () => {
  const graphic = copy.home.hero.graphic;
  const headlines = copy.home.how.steps.map((step) => step.title);
  const markup = renderToStaticMarkup(<HeroSteps copy={graphic} headlines={headlines} />);

  it("has the four labels Use, Collect, Curate and Deploy, one for each step of “How it works”, in order", () => {
    expect(graphic.labels).toEqual(["Use", "Collect", "Curate", "Deploy"]);
    expect(headlines).toEqual(["Set up your AI agents", "Zack reviews your week", "Cora picks your three ideas", "Paste to install"]);
  });

  it("with no script, is a list of all four parts, each its label and its headline and nothing else", () => {
    const parts = [...markup.matchAll(/<li data-step="(\d)"[^>]*>(.*?)<\/li>/g)].map((m) => text(m[2]));
    expect(parts).toEqual(["Use Set up your AI agents", "Collect Zack reviews your week", "Curate Cora picks your three ideas", "Deploy Paste to install"]);
    // Headline only: no step's body text is in the picture.
    for (const step of copy.home.how.steps) expect(markup).not.toContain(step.body);
    // Nothing in the list is hidden by a class or an attribute: it is hidden only by the motion rules, under html.js.
    const list = /<ol data-step-list[^>]*>.*?<\/ol>/.exec(markup)![0];
    expect(list).not.toMatch(/\bhidden\b|sr-only|invisible|opacity-0|aria-hidden/);
  });

  it("has the labels as real buttons that mark the current part, and a real Pause button, both shown only as part of the loop", () => {
    const tabs = /<div data-step-tabs="true" role="group" aria-label="([^"]*)" class="([^"]*)">(.*?)<\/div>/.exec(markup)!;
    expect(tabs[1]).toBe(graphic.name);
    expect(tabs[2].split(" ")).toContain("hidden");
    const buttons = [...tabs[3].matchAll(/<button type="button"([^>]*)>([^<]*)<\/button>/g)];
    expect(buttons.map((b) => b[2])).toEqual(["Use", "Collect", "Curate", "Deploy"]);
    expect(buttons.map((b) => b[1].includes('aria-current="step"'))).toEqual([true, false, false, false]);
    const pause = /<button type="button" data-step-pause="true" class="([^"]*)">([^<]*)<\/button>/.exec(markup)!;
    expect(pause[2]).toBe("Pause");
    expect(pause[1].split(" ")).toContain("hidden");
    expect(graphic.play).toBe("Play");
    // Each control is at least 44px tall.
    for (const classes of [pause[1], ...buttons.map((b) => /class="([^"]*)"/.exec(b[1])![1])]) expect(classes.split(" ")).toContain("min-h-11");
  });

  it("announces no change to a screen reader", () => {
    expect(markup).not.toMatch(/aria-live|role="(?:status|alert|marquee|timer)"|aria-atomic/);
    expect(source("hero-steps.tsx")).not.toMatch(/aria-live=|role="status"/);
  });

  it("keeps four bricks as decoration, one for each part, hidden from a screen reader and dimmed only by the motion rules", () => {
    const bricks = /<ul aria-hidden="true" data-step-bricks="true"[^>]*>(.*?)<\/ul>/.exec(markup)![1];
    expect(bricks.match(/<li/g)).toHaveLength(4);
    expect(text(bricks)).toBe("");
    expect(bricks).not.toMatch(/opacity-|\bhidden\b|invisible/);
    expect(motion).toContain('.js .hero-steps [data-step-bricks] [data-lit="no"]');
  });

  it("steps through the four parts and comes back to the first", () => {
    expect([0, 1, 2, 3].map((i) => nextStep(i, 4))).toEqual([1, 2, 3, 0]);
    expect(nextStep(0, 0)).toBe(0);
    expect(HERO_STEP_MS).toBeGreaterThanOrEqual(2500);
  });

  it("takes what stops it from the shared rules, gives a part a label jumped to its full time, and never starts under reduced motion", () => {
    const code = source("hero-steps.tsx");
    expect(code).toContain("useLoopPlay()");
    expect(code).toContain("{...holdProps}");
    expect(code).toContain("onClick={toggle}");
    // One timeout for each part, started again when the part changes; an interval would cut short a part a label jumped to.
    expect(code).not.toContain("setInterval");
    expect(code).toContain("}, [playing, current, count]);");
    // The shared wait, which returns its own cancel, so leaving a part clears its timer.
    expect(code).toContain("return stepAfter(HERO_STEP_MS, () => setCurrent((c) => nextStep(c, count)));");
    expect(code).toContain('window.matchMedia("(prefers-reduced-motion: no-preference)").matches');
  });

  it("becomes a loop only under html.js and with motion allowed: every rule that hides a part or shows a control is inside the motion query", () => {
    const rules = [...css.matchAll(/^([^\n{}]*\.hero-steps[^\n{}]*)\{/gm)].map((m) => ({ selector: m[1].trim(), at: m.index }));
    expect(rules.length).toBeGreaterThan(5);
    const motionStart = css.indexOf(motion);
    const print = css.indexOf("@media print", motionStart);
    for (const rule of rules) {
      const inMotion = rule.at > motionStart && rule.at < motionStart + motion.length;
      // Outside the motion query the only rules are print's, which put the still list back.
      if (!inMotion) expect(rule.at, rule.selector).toBeGreaterThan(print);
      else expect(rule.selector, rule.selector).toMatch(/^\.js \.hero-steps /);
    }
    expect(motion).toContain(".js .hero-steps [data-step-tabs]");
    expect(motion).toContain(".js .hero-steps [data-step-pause]");
  });
});

describe("what stops and starts a loop", () => {
  const after = (...events: HoldEvent[]): Holds => events.reduce(holdsAfter, noHolds);
  const press: HoldEvent = { type: "toggle" };
  const keyboardFocus: HoldEvent = { type: "focus", visible: true };
  const clickFocus: HoldEvent = { type: "focus", visible: false };

  it("plays until something holds it: the button, keyboard focus or a hidden tab", () => {
    expect(isPlaying(noHolds)).toBe(true);
    expect(isPlaying(after(press))).toBe(false);
    expect(isPlaying(after(keyboardFocus))).toBe(false);
    expect(isPlaying(noHolds, true)).toBe(false);
    expect(isPlaying(after(keyboardFocus, { type: "blur", left: true }))).toBe(true);
    // Focus moving from one control of the loop to another is still focus in the loop.
    expect(isPlaying(after(keyboardFocus, { type: "blur", left: false }))).toBe(false);
  });

  it("is never stopped by a pointer resting on it, which is what made “It compounds” look as if it ended (Peter, November 26, 2026)", () => {
    // Nothing a mouse, a finger or a pen does by being over the loop is an event at all: the loop does not listen for it.
    const code = source("use-loop-play.ts");
    expect(code).not.toMatch(/onPointer|onMouse|pointerenter|pointerleave|mouseenter|hovered|:hover/);
    expect(Object.keys(noHolds).sort()).toEqual(["focused", "paused"]);
    for (const file of ["hero-steps.tsx", "compounding-loop.tsx"]) expect(source(file)).not.toMatch(/onPointer|onMouseEnter|onMouseLeave|onMouseOver/);
  });

  it("is not held by the focus a mouse click or a tap leaves on a button", () => {
    expect(isPlaying(after(clickFocus))).toBe(true);
    // Pause then Play by mouse or by touch: playing again, and the button says so.
    expect(after(clickFocus, press)).toEqual({ paused: true, focused: false });
    expect(isPlaying(after(clickFocus, press, clickFocus, press))).toBe(true);
  });

  it("moves when the button says it does: pressing Play lets go of the focus that is on the button", () => {
    // By keyboard, with focus still on the button.
    expect(after(keyboardFocus, press)).toEqual({ paused: true, focused: true });
    expect(isPlaying(after(keyboardFocus, press, press))).toBe(true);
    // The next time focus comes in by keyboard, it holds again.
    expect(isPlaying(after(keyboardFocus, press, press, { type: "blur", left: true }, keyboardFocus))).toBe(false);
    // And Pause holds whatever else happens, until Play.
    expect(isPlaying(after(press, keyboardFocus, { type: "blur", left: true }))).toBe(false);
  });

  it("reads the focus ring and the tab's visibility from the browser", () => {
    const code = source("use-loop-play.ts");
    expect(code).toContain('e.target.matches(":focus-visible")');
    expect(code).toContain('document.addEventListener("visibilitychange", changed)');
    expect(code).toContain('document.removeEventListener("visibilitychange", changed)');
    // On the server the tab counts as shown, so what is sent is the same as what hydrates.
    expect(code).toMatch(/\(\) => document\.hidden,\s*\(\) => false,/);
  });
});

/**
 * The clock of a loop, as its component runs it: an effect that, for the state it is at, waits that state's time and
 * moves on, and is run again when the state changes (React clears the last wait first). Driven here with fake timers.
 */
describe("a loop's clock, run for many cycles", () => {
  function run(o: { start: number; count: number; dwell: (current: number) => number }) {
    const seen: { state: number; at: number }[] = [];
    let current = o.start;
    let cancel = () => {};
    const began = Date.now();
    const effect = () => {
      cancel();
      cancel = stepAfter(o.dwell(current), () => {
        current = nextState(current, o.count);
        seen.push({ state: current, at: Date.now() - began });
        effect();
      });
    };
    effect();
    return { seen, stop: () => cancel(), resume: effect };
  }

  it("“It compounds” goes 1, 2, 3, 4, 10, 17, 26 and round again, without end, each state for the same time and week 26 a little longer", () => {
    vi.useFakeTimers();
    try {
      const count = compoundingSteps.length;
      // It starts on the last state, the finished picture, as the server sent it.
      const loop = run({ start: count - 1, count, dwell: (c) => dwellFor(c, count) });
      const cycle = LOOP_LAST_MS + (count - 1) * LOOP_STATE_MS;
      vi.advanceTimersByTime(5 * cycle);
      const weeks = loop.seen.map((s) => compoundingSteps[s.state].week);
      // Five full cycles, and it is still going.
      expect(weeks).toEqual(Array(5).fill([1, 2, 3, 4, 10, 17, 26]).flat());
      expect(vi.getTimerCount()).toBe(1);
      // An even pace: every state but the last stays up the same time, in every cycle.
      const stayed = loop.seen.slice(0, -1).map((s, i) => ({ week: compoundingSteps[s.state].week, ms: loop.seen[i + 1].at - s.at }));
      for (const s of stayed) expect(s.ms, `week ${s.week}`).toBe(s.week === 26 ? LOOP_LAST_MS : LOOP_STATE_MS);
      // Week 26 stays a little longer, not twice as long.
      expect(LOOP_LAST_MS).toBeGreaterThan(LOOP_STATE_MS);
      expect(LOOP_LAST_MS).toBeLessThanOrEqual(LOOP_STATE_MS * 1.5);
      // Reaching week 26 is not an end, the first time or any time: the next state always follows it.
      const afterLast = loop.seen.flatMap((s, i) => (compoundingSteps[s.state].week === 26 && loop.seen[i + 1] ? [compoundingSteps[loop.seen[i + 1].state].week] : []));
      expect(afterLast).toEqual([1, 1, 1, 1]);
      vi.advanceTimersByTime(100 * cycle);
      expect(loop.seen).toHaveLength(105 * count);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops when it is paused and goes on from the same state, for a full wait, when it is played again", () => {
    vi.useFakeTimers();
    try {
      const count = compoundingSteps.length;
      const loop = run({ start: count - 1, count, dwell: (c) => dwellFor(c, count) });
      vi.advanceTimersByTime(LOOP_LAST_MS + LOOP_STATE_MS + 500);
      expect(loop.seen.map((s) => s.state)).toEqual([0, 1]);
      loop.stop();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(loop.seen).toHaveLength(2);
      loop.resume();
      vi.advanceTimersByTime(LOOP_STATE_MS - 1);
      expect(loop.seen).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(loop.seen.map((s) => s.state)).toEqual([0, 1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the hero's four parts go round without end too, each for the same time", () => {
    vi.useFakeTimers();
    try {
      const loop = run({ start: 0, count: 4, dwell: () => HERO_STEP_MS });
      vi.advanceTimersByTime(40 * HERO_STEP_MS);
      expect(loop.seen.map((s) => s.state)).toEqual(Array(10).fill([1, 2, 3, 0]).flat());
      expect(new Set(loop.seen.slice(1).map((s, i) => s.at - loop.seen[i].at))).toEqual(new Set([HERO_STEP_MS]));
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the “It compounds” loop", () => {
  const loop = copy.home.compounds.loop;
  const markup = renderToStaticMarkup(<CompoundingLoop steps={compoundingSteps} words={copy.bricks} copy={loop} />);
  const lines = [...markup.matchAll(/<li data-loop-state="(\d+)" data-active="(yes|no)"[^>]*>(.*?)<\/li>/g)];

  it("with no script, is the last state: week 26 and all 78 ideas, none marked out", () => {
    expect(markup).toContain('data-state="6"');
    expect(markup).toContain('data-bricks="78"');
    expect(markup.match(/data-brick="/g)).toHaveLength(78);
    expect(markup).not.toContain("data-out=");
    expect(text(/<p aria-hidden="true" data-loop-caption[^>]*>(.*?)<\/p>/.exec(markup)![1])).toBe("Week 26 78 ideas");
  });

  it("says “ideas” for every count a reader sees or hears, and never “bricks” (Peter, November 26, 2026)", () => {
    expect(text(markup)).not.toMatch(/bricks?/i);
    // Attribute values a screen reader speaks: none says it either. (data-brick and the like are names in the code, never read out.)
    for (const spoken of markup.matchAll(/(?:aria-label|aria-description|title|alt)="([^"]*)"/g)) expect(spoken[1]).not.toMatch(/brick/i);
    expect(text(markup).match(/\b\d+ ideas\b/g)).toHaveLength(8);
  });

  it("lists all seven states as text, week and count, with the last one marked as current", () => {
    expect(lines.map((m) => text(m[3]))).toEqual(["Week 1 3 ideas", "Week 2 6 ideas", "Week 3 9 ideas", "Week 4 12 ideas", "Week 10 30 ideas", "Week 17 51 ideas", "Week 26 78 ideas"]);
    expect(lines.map((m) => m[2])).toEqual(["no", "no", "no", "no", "no", "no", "yes"]);
    // The list is plain text for everyone: not hidden, and not a control.
    const list = /<ol data-loop-states[^>]*>.*?<\/ol>/.exec(markup)![0];
    expect(list).not.toMatch(/sr-only|aria-hidden|\bhidden\b|<button/);
  });

  it("has a real Pause button, shown only where the loop runs, and announces no change to a screen reader", () => {
    const pause = /<button type="button" data-loop-pause="true" class="([^"]*)">([^<]*)<\/button>/.exec(markup)!;
    expect(pause[2]).toBe(loop.pause);
    expect([loop.pause, loop.play]).toEqual(["Pause", "Play"]);
    expect(pause[1].split(" ")).toEqual(expect.arrayContaining(["hidden", "min-h-11"]));
    expect(markup).not.toMatch(/aria-live|role="(?:status|alert|marquee|timer)"/);
    expect(markup).toContain(`role="group" aria-label="${loop.name}"`);
    expect(motion).toContain(".js .compounding-loop [data-loop-pause]");
  });

  it("goes through the seven states in order and loops, waiting a little longer on the last", () => {
    const order = [6];
    for (let i = 0; i < 8; i++) order.push(nextState(order.at(-1)!, 7));
    expect(order).toEqual([6, 0, 1, 2, 3, 4, 5, 6, 0]);
    expect([0, 1, 2, 3, 4, 5].map((i) => dwellFor(i, 7))).toEqual(Array(6).fill(LOOP_STATE_MS));
    expect(dwellFor(6, 7)).toBe(LOOP_LAST_MS);
    expect(LOOP_LAST_MS).toBeGreaterThan(LOOP_STATE_MS);
  });

  it("spreads the bricks that arrive with a state over under a second, counting from the bricks already there", () => {
    expect(compoundingSteps.map((_, i) => arrival(compoundingSteps, i).from)).toEqual([0, 3, 6, 9, 12, 30, 51]);
    for (const [i, step] of compoundingSteps.entries()) {
      const { from, perBrickMs } = arrival(compoundingSteps, i);
      expect((step.bricks - from) * perBrickMs, `week ${step.week}`).toBeLessThanOrEqual(900);
      expect(perBrickMs).toBeGreaterThan(0);
    }
  });

  it("marks out the bricks of later weeks at each state, so each state shows that week's count", () => {
    const code = source("compounding-loop.tsx");
    expect(code).toContain("shownWeeks={state.week}");
    // BrickStack does the marking: at week 10, thirty bricks stay and forty-eight are out.
    for (const step of compoundingSteps) {
      const bricks = [...markup.matchAll(/<li data-week="(\d+)" data-brick="(\d+)"/g)].filter((m) => Number(m[1]) <= step.week);
      expect(bricks, `week ${step.week}`).toHaveLength(step.bricks);
    }
  });

  it("takes what stops it from the shared rules, clears its timer, and never starts under reduced motion", () => {
    const code = source("compounding-loop.tsx");
    expect(code).toContain("useLoopPlay()");
    expect(code).toContain("{...holdProps}");
    expect(code).toContain("onClick={toggle}");
    // The shared wait, which returns its own cancel; one for each state, so the last state schedules the first.
    expect(code).toContain("return stepAfter(dwellFor(current, steps.length), () => setCurrent((c) => nextState(c, steps.length)));");
    expect(code).toContain("}, [playing, current, steps.length]);");
    expect(code).not.toContain("setInterval");
    expect(code).toContain('window.matchMedia("(prefers-reduced-motion: no-preference)").matches');
    expect(code).not.toMatch(/aria-live=|role="status"/);
  });

  it("hides a brick only under html.js and with motion allowed", () => {
    const rules = [...css.matchAll(/^([^\n{}]*\.compounding-loop[^\n{}]*)\{/gm)].map((m) => ({ selector: m[1].trim(), at: m.index }));
    expect(rules.length).toBeGreaterThan(3);
    const motionStart = css.indexOf(motion);
    const print = css.indexOf("@media print", motionStart);
    for (const rule of rules) {
      const inMotion = rule.at > motionStart && rule.at < motionStart + motion.length;
      if (!inMotion) expect(rule.at, rule.selector).toBeGreaterThan(print);
      else expect(rule.selector, rule.selector).toMatch(/^\.js \.compounding-loop /);
    }
    expect(motion).toContain('.js .compounding-loop [data-brick][data-out="yes"]');
  });

  it("fits a phone: nine bricks across at the small size is narrower than the page at 320px, and thirteen across from the lg breakpoint", () => {
    // 9 × 20 and eight gaps of 6; 13 × 32 and twelve gaps of 8.
    expect(markup).toContain('style="--bricks-w:228px;--bricks-w-lg:512px" data-bricks="78"');
    expect(228).toBeLessThan(320 - 32);
  });

  it("has no scroll story left: the old stage and its classes are gone", () => {
    expect(css).not.toMatch(/is-staged|data-step-week|data-step-dot|\.compounding\b(?!-loop)/);
    expect(source("compounding.tsx")).not.toMatch(/CompoundingStage|storyText|storySteps/);
  });
});
