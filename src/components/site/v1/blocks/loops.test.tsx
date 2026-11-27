/**
 * The two loops of the homepage (Peter's homepage reviews of November 26 and
 * 27, 2026): the hero's four steps and the seven states of "It compounds".
 * Tests run in node, with no browser, so what is checked here is what the
 * server sends (the still picture a visitor with no script reads), the
 * arithmetic of each loop, the rule for being on screen, and the rules in
 * globals.css that decide when anything moves.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { v3Defaults } from "@/data/config";
import { compoundingSteps } from "@/data/site/compounding";
import { v1Copy } from "@/data/site/v1";
import { amountsFrom } from "@/lib/site/amounts";
import { CompoundingLoop, LOOP_START_MS, LOOP_STATE_MS, arrival, nextState } from "./compounding-loop";
import { HERO_STEP_MS, HeroSteps, nextStep } from "./hero-steps";
import { ON_SCREEN_SHARE, holdsAfter, isOnScreen, isPlaying, noHolds, stepAfter, type HoldEvent, type Holds } from "./use-loop-play";

const { copy } = v1Copy(amountsFrom(v3Defaults));
const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\r\n/g, "\n");
const source = (file: string) => readFileSync(path.join(process.cwd(), "src/components/site/v1/blocks", file), "utf8").replace(/\r\n/g, "\n");

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The part of globals.css inside its "Bricks in motion" motion query: the only rules that hide or move anything in either loop. */
const motion = (() => {
  const start = css.indexOf("@media (prefers-reduced-motion: no-preference) {", css.indexOf("Bricks in motion"));
  return css.slice(start, css.indexOf('"Cora Curation Examples"', start));
})();

describe("the hero's four steps", () => {
  const graphic = copy.home.hero.graphic;
  const markup = renderToStaticMarkup(<HeroSteps copy={graphic} words={copy.bricks} />);
  const parts = [...markup.matchAll(/<li data-step="(\d)" data-active="(yes|no)">(.*?)<\/li>(?=<li data-step|<\/ol>)/g)];

  it("has the four labels Use, Collect, Curate and Deploy, each with its headline and its text, in order", () => {
    expect(graphic.steps.map((step) => step.label)).toEqual(["Use", "Collect", "Curate", "Deploy"]);
    expect(graphic.steps.map((step) => step.title)).toEqual(["Set up your AI agents", "Zack reviews your week", "Cora picks your three ideas", "Approve The Ideas"]);
  });

  it("names the fourth step in Peter's words (November 27, 2026)", () => {
    expect(graphic.steps[3]).toEqual({ label: "Deploy", title: "Approve The Ideas", body: "Say yes to the ideas you like and see them in action for you." });
    expect(markup).not.toContain("Paste to install");
    expect(markup).not.toContain("press copy");
  });

  it("with no script, is an ordered list of all four steps, each its label, its number, its headline and its text", () => {
    expect(parts).toHaveLength(4);
    for (const [i, part] of parts.entries()) {
      const step = graphic.steps[i];
      const inner = part[3];
      expect(text(/<span data-step-label[^>]*>(.*?)<\/span>/.exec(inner)![1]), step.label).toBe(step.label);
      expect(/<span aria-hidden="true" data-claims="numeral" data-step-number[^>]*>(\d)<\/span>/.exec(inner)![1], step.label).toBe(String(i + 1));
      expect(text(/<h2 data-step-headline[^>]*>(.*?)<\/h2>/.exec(inner)![1]), step.label).toBe(step.title);
      expect(text(/<p data-step-body[^>]*>(.*?)<\/p>/.exec(inner)![1]), step.label).toBe(step.body);
    }
    // Nothing in the list is hidden by a class: a step is hidden only by the motion rules, under html.js.
    const list = /<ol data-step-list[^>]*>.*<\/ol>/.exec(markup)![0];
    expect(list).not.toMatch(/class="[^"]*(?<![\w-])(?:hidden|invisible|opacity-0)(?![\w-])[^"]*"/);
    expect(parts.map((p) => p[2])).toEqual(["yes", "no", "no", "no"]);
  });

  it("draws 3, 6, 9 and 12 ideas for steps 1 to 4, as “How it works” drew them: the night colour of the first level, three across", () => {
    const stacks = parts.map((part) => [...part[3].matchAll(/<li data-week="\d+" data-brick="\d+" data-set-up="yes"[^>]*class="([^"]*)"/g)].map((m) => m[1]));
    expect(stacks.map((s) => s.length)).toEqual([3, 6, 9, 12]);
    expect(parts.map((part) => /data-bricks="(\d+)"/.exec(part[3])![1])).toEqual(["3", "6", "9", "12"]);
    // One colour and one size for every idea, the ones the deleted section used (BrickStack size "m", night, level 1).
    expect(new Set(stacks.flat())).toEqual(new Set(["size-5 rounded-[5px] bg-f-reach-night"]));
    // Three across: 3 × 20 and two gaps of 6.
    for (const part of parts) expect(part[3]).toContain('style="width:72px"');
    // Each idea is labelled for a screen reader in the copy's words, so colour is never the only signal.
    expect(text(parts[1][3])).toContain("Week 2, idea 3: set up");
    expect(text(markup)).not.toMatch(/bricks?/i);
  });

  it("keeps a row as tall as the tallest stack in every step, so the numbers share a line", () => {
    for (const part of parts) expect(part[3]).toContain('<div class="flex h-[98px] items-end justify-between gap-6">');
    // Four rows of 20 and three gaps of 6.
    expect(4 * 20 + 3 * 6).toBe(98);
  });

  it("has the labels as real buttons that mark the current step, and a real Pause button, both shown only as part of the loop", () => {
    const tabs = /<div data-step-tabs="true" role="group" aria-label="([^"]*)" class="([^"]*)">(.*?)<\/div>/.exec(markup)!;
    expect(tabs[1]).toBe(graphic.name);
    expect(tabs[2].split(" ")).toContain("hidden");
    const buttons = [...tabs[3].matchAll(/<button type="button"([^>]*)>([^<]*)<\/button>/g)];
    expect(buttons.map((b) => b[2])).toEqual(["Use", "Collect", "Curate", "Deploy"]);
    expect(buttons.map((b) => b[1].includes('aria-current="step"'))).toEqual([true, false, false, false]);
    const controls = /<div data-step-controls="true" class="([^"]*)">/.exec(markup)!;
    expect(controls[1].split(" ")).toContain("hidden");
    const pause = /<button type="button" data-step-pause="true" class="([^"]*)">([^<]*)<\/button>/.exec(markup)!;
    expect(pause[2]).toBe("Pause");
    expect(graphic.play).toBe("Play");
    // Each control is at least 44px tall.
    for (const classes of [pause[1], ...buttons.map((b) => /class="([^"]*)"/.exec(b[1])![1])]) expect(classes.split(" ")).toContain("min-h-11");
  });

  it("announces no change to a screen reader", () => {
    expect(markup).not.toMatch(/aria-live|role="(?:status|alert|marquee|timer)"|aria-atomic/);
    expect(source("hero-steps.tsx")).not.toMatch(/aria-live=|role="status"/);
  });

  it("steps through the four steps and comes back to the first, each long enough to read its text", () => {
    expect([0, 1, 2, 3].map((i) => nextStep(i, 4))).toEqual([1, 2, 3, 0]);
    expect(nextStep(0, 0)).toBe(0);
    expect(HERO_STEP_MS).toBeGreaterThanOrEqual(4000);
  });

  it("takes what stops it from the shared rules, moves only on screen, gives a step a label jumped to its full time, and never starts under reduced motion", () => {
    const code = source("hero-steps.tsx");
    expect(code).toContain("useLoopPlay()");
    expect(code).toContain("{...holdProps}");
    expect(code).toContain("onClick={toggle}");
    // The frame is the stage that has to be on screen.
    expect(code).toContain("<div ref={stageRef} data-step-stage");
    // One timeout for each step, started again when the step changes; an interval would cut short a step a label jumped to.
    expect(code).not.toContain("setInterval");
    expect(code).toContain("}, [playing, current, count]);");
    // The shared wait, which returns its own cancel, so leaving a step clears its timer.
    expect(code).toContain("return stepAfter(HERO_STEP_MS, () => setCurrent((c) => nextStep(c, count)));");
    expect(code).toContain('window.matchMedia("(prefers-reduced-motion: no-preference)").matches');
  });

  it("becomes a loop only under html.js and with motion allowed: every rule that hides a step or shows a control is inside the motion query", () => {
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
    expect(motion).toContain(".js .hero-steps [data-step-controls]");
  });

  it("keeps its height from step to step: all four share one grid cell, so the frame is as tall as the tallest", () => {
    const rule = /\.js \.hero-steps \[data-step\] \{([^}]*)\}/.exec(motion)![1];
    expect(rule).toContain("grid-area: 1 / 1;");
    // A step that is not showing keeps its box (visibility, not display), which is what reserves the height.
    expect(rule).toContain("visibility: hidden;");
    expect(rule).not.toContain("display:");
    expect(motion).not.toMatch(/\.hero-steps[^{]*\{[^}]*\b(?:height|min-height|max-height)\s*:/);
  });

  it("moves with opacity and transform only", () => {
    for (const m of motion.matchAll(/\.hero-steps[^{]*\{([^}]*)\}/g)) {
      const moved = [...m[1].matchAll(/transition:\s*([^;]*);/g)].flatMap((t) => t[1].split(",").map((part) => part.trim().split(/\s+/)[0]));
      for (const property of moved) expect(["opacity", "transform", "visibility"], m[0].slice(0, 60)).toContain(property);
    }
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

  it("moves only while it is on screen, whatever else is true (Peter, November 27, 2026)", () => {
    expect(isPlaying(noHolds, false, false)).toBe(false);
    expect(isPlaying(noHolds, false, true)).toBe(true);
    // Coming on screen does not release a hold: a paused loop stays paused.
    expect(isPlaying(after(press), false, true)).toBe(false);
    expect(isPlaying(after(keyboardFocus), false, true)).toBe(false);
    expect(isPlaying(noHolds, true, true)).toBe(false);
  });

  it("counts a stage as on screen when half of it is in the window, or when it fills half of the window", () => {
    expect(ON_SCREEN_SHARE).toBe(0.5);
    // A stage 400 tall in a window 900 tall.
    expect(isOnScreen(0, 0, 900)).toBe(false);
    expect(isOnScreen(0.49, 196, 900)).toBe(false);
    expect(isOnScreen(0.5, 200, 900)).toBe(true);
    expect(isOnScreen(1, 400, 900)).toBe(true);
    // A stage 2000 tall can never show half of itself in a window 800 tall: filling half of the window counts.
    expect(isOnScreen(0.19, 380, 800)).toBe(false);
    expect(isOnScreen(0.2, 400, 800)).toBe(true);
    // A page left by a click stays in the document, hidden: nothing of it is in the window.
    expect(isOnScreen(0, 0, 0)).toBe(false);
  });

  it("asks the browser whether the stage is on screen, starts off screen, and lets go when the page is put away", () => {
    const code = source("use-loop-play.ts");
    expect(code).toContain("new IntersectionObserver(");
    expect(code).toContain("observer.observe(stage);");
    expect(code).toContain("observer.disconnect();");
    // Off screen until the browser says otherwise, on the server and before the first report.
    expect(code).toContain("const [onScreen, setOnScreen] = useState(false);");
    expect(code).toContain("playing: isPlaying(holds, tabHidden, onScreen),");
    // No scroll listener: the browser reports the stage coming and going.
    expect(code).not.toMatch(/addEventListener\("scroll"|onScroll|getBoundingClientRect/);
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

  it("“It compounds” goes 1, 2, 3, 4, 10, 17, 26 and round again, without end, every state for the same time", () => {
    vi.useFakeTimers();
    try {
      const count = compoundingSteps.length;
      // Once begun it is at the first week.
      const loop = run({ start: 0, count, dwell: () => LOOP_STATE_MS });
      const cycle = count * LOOP_STATE_MS;
      vi.advanceTimersByTime(5 * cycle);
      const weeks = loop.seen.map((s) => compoundingSteps[s.state].week);
      // Five full cycles, and it is still going.
      expect(weeks).toEqual(Array(5).fill([2, 3, 4, 10, 17, 26, 1]).flat());
      expect(vi.getTimerCount()).toBe(1);
      // An even pace: every state stays up the same time, week 26 too, in every cycle.
      expect(new Set(loop.seen.slice(1).map((s, i) => s.at - loop.seen[i].at))).toEqual(new Set([LOOP_STATE_MS]));
      // Reaching week 26 is not an end, the first time or any time: week 1 always follows it.
      const afterLast = loop.seen.flatMap((s, i) => (compoundingSteps[s.state].week === 26 && loop.seen[i + 1] ? [compoundingSteps[loop.seen[i + 1].state].week] : []));
      expect(afterLast).toEqual([1, 1, 1, 1, 1]);
      vi.advanceTimersByTime(100 * cycle);
      expect(loop.seen).toHaveLength(105 * count);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops when it is held (paused, or scrolled off screen) and goes on from the same state, for a full wait, when it is let go", () => {
    vi.useFakeTimers();
    try {
      const count = compoundingSteps.length;
      const loop = run({ start: 0, count, dwell: () => LOOP_STATE_MS });
      vi.advanceTimersByTime(2 * LOOP_STATE_MS + 500);
      expect(loop.seen.map((s) => s.state)).toEqual([1, 2]);
      loop.stop();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(loop.seen).toHaveLength(2);
      loop.resume();
      vi.advanceTimersByTime(LOOP_STATE_MS - 1);
      expect(loop.seen).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(loop.seen.map((s) => s.state)).toEqual([1, 2, 3]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the hero's four steps go round without end too, each for the same time", () => {
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
    expect(markup).toContain('data-started="no"');
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

  it("goes through the seven states in order and loops, every state for the same time", () => {
    const order = [0];
    for (let i = 0; i < 8; i++) order.push(nextState(order.at(-1)!, 7));
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 0, 1]);
    // One time for every state: there is no separate, longer wait on the last.
    expect(source("compounding-loop.tsx")).not.toMatch(/LOOP_LAST_MS|dwellFor/);
    expect(LOOP_STATE_MS).toBeGreaterThanOrEqual(1800);
    // Long enough for the largest arrival to finish and rest before the next: under a second of arriving, then the fade.
    expect(LOOP_STATE_MS).toBeGreaterThanOrEqual(900 + 560 + 400);
  });

  it("starts from week 1 the first time its stage is on screen, after a short look at the whole stack", () => {
    const code = source("compounding-loop.tsx");
    expect(code).toContain("const [started, setStarted] = useState(false);");
    expect(code).toMatch(/if \(!started\) \{\s*return stepAfter\(LOOP_START_MS, \(\) => \{\s*setStarted\(true\);\s*setCurrent\(0\);\s*\}\);\s*\}/);
    expect(LOOP_START_MS).toBeGreaterThan(0);
    expect(LOOP_START_MS).toBeLessThan(LOOP_STATE_MS);
    // The stage is the week, the count and the stack: what has to be on screen for the loop to move.
    expect(code).toContain("<div ref={stageRef} data-loop-stage");
    const stage = /<div data-loop-stage="true"[^>]*>(.*?)<\/figure><\/div>/.exec(markup)![1];
    expect(stage).toContain("data-loop-caption");
    expect(stage).toContain('data-bricks="78"');
    expect(stage).not.toContain("data-loop-states");
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
    expect(code).toContain("return stepAfter(LOOP_STATE_MS, () => setCurrent((c) => nextState(c, steps.length)));");
    expect(code).toContain("}, [playing, current, started, steps.length]);");
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

  it("moves a brick with opacity and transform only, so nothing is laid out again, and fades the wall where it stands at the wrap", () => {
    const rule = (selector: string) => new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`).exec(motion)![1];
    const arriving = rule(".js .compounding-loop [data-brick]");
    const out = rule('.js .compounding-loop [data-brick][data-out="yes"]');
    for (const block of [arriving, out]) {
      const moved = [...block.matchAll(/transition:\s*([^;]*);/g)].flatMap((t) => t[1].split(",").map((part) => part.trim().split(/\s+/)[0]));
      expect(new Set(moved)).toEqual(new Set(["opacity", "transform"]));
      expect(block).not.toMatch(/\b(?:width|height|margin|top|left|display)\s*:/);
    }
    // Going out: the fade runs, and the move back up waits until the brick cannot be seen. No brick is seen to jump.
    expect(out).toMatch(/opacity 420ms var\(--ease-out\),\s*transform 0s linear 420ms;/);
    // Coming in: eased, one after another from the bricks already there.
    expect(arriving).toContain("transition-delay: calc(max(0, var(--i, 0) - var(--from, 0)) * var(--per, 30ms));");
    expect(arriving).not.toContain("ease-spring");
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
