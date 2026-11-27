/**
 * The decisions of the "It compounds" scroll story (plan KTD11), apart from the
 * browser: whether to stage it at all, which step the observer's entries have
 * reached, that a step once shown is never taken back, and when each brick
 * starts to move.
 */
import { describe, expect, it } from "vitest";
import { STAGE_FAILSAFE_MS, delayFor, reachedStep, shouldStage, shownAfter, type StepEntry } from "./compounding-stage";

// Four labels, as the story has: weeks 1, 2, 3 and the finished stack.
const steps = ["week 1", "week 2", "week 3", "finished"];

// A screen 800 tall: the observed area ends at its middle, 400.
const MIDDLE = 400;

const entry = (target: string, top: number, over: Partial<StepEntry> = {}): StepEntry => ({
  target,
  // What the browser reports for a label between the top of the screen and its middle.
  isIntersecting: top >= 0 && top < MIDDLE,
  boundingClientRect: { top },
  rootBounds: { bottom: MIDDLE },
  ...over,
});

describe("whether the story is staged", () => {
  it("is staged while the whole of it is still below the screen", () => {
    expect(shouldStage({ top: 2400 }, 800)).toBe(true);
    // Its top edge exactly at the bottom of the screen: nothing of it shows yet.
    expect(shouldStage({ top: 800 }, 800)).toBe(true);
  });

  it("is left as the finished picture when any of it is on screen", () => {
    expect(shouldStage({ top: 799 }, 800)).toBe(false);
    expect(shouldStage({ top: 300 }, 800)).toBe(false);
    expect(shouldStage({ top: 0 }, 800)).toBe(false);
    // Its top above the screen and the rest of it still showing.
    expect(shouldStage({ top: -200 }, 800)).toBe(false);
  });

  it("is left as the finished picture when it has been scrolled past", () => {
    expect(shouldStage({ top: -3000 }, 800)).toBe(false);
  });

  it("is left alone when the screen reports no height", () => {
    expect(shouldStage({ top: 0 }, 0)).toBe(false);
    expect(shouldStage({ top: 500 }, 0)).toBe(false);
  });
});

describe("the step the observer's entries have reached", () => {
  it("is none while every label is below the middle", () => {
    expect(reachedStep(steps.map((s, i) => entry(s, 900 + i * 60)), steps, MIDDLE)).toBe(0);
    expect(reachedStep([], steps, MIDDLE)).toBe(0);
  });

  it("is the last label above the middle, as each one crosses", () => {
    expect(reachedStep([entry("week 1", 390)], steps, MIDDLE)).toBe(1);
    expect(reachedStep([entry("week 2", 399)], steps, MIDDLE)).toBe(2);
    // Exactly on the line is not yet above it.
    expect(reachedStep([entry("week 3", 400)], steps, MIDDLE)).toBe(0);
    expect(reachedStep([entry("week 1", 200), entry("week 2", 260), entry("week 3", 420)], steps, MIDDLE)).toBe(2);
  });

  it("counts a label already scrolled off the top, which is above the middle but not intersecting", () => {
    const gone = entry("week 3", -120);
    expect(gone.isIntersecting).toBe(false);
    expect(reachedStep([gone], steps, MIDDLE)).toBe(3);
    // Every label gone past at once, in any order.
    expect(reachedStep([entry("finished", -40), entry("week 1", -220), entry("week 2", -160)], steps, MIDDLE)).toBe(4);
  });

  it("uses the middle it is given when an entry carries no root bounds", () => {
    const above = entry("week 2", 350, { isIntersecting: false, rootBounds: null });
    const below = entry("week 2", 450, { isIntersecting: false, rootBounds: null });
    expect(reachedStep([above], steps, MIDDLE)).toBe(2);
    expect(reachedStep([below], steps, MIDDLE)).toBe(0);
    // The entry's own bounds win over the fallback when it has them.
    expect(reachedStep([entry("week 2", 350, { isIntersecting: false, rootBounds: { bottom: 300 } })], steps, MIDDLE)).toBe(0);
  });

  it("trusts an entry the browser calls intersecting", () => {
    expect(reachedStep([entry("week 1", 500, { isIntersecting: true, rootBounds: null })], steps, MIDDLE)).toBe(1);
  });

  it("jumps straight to the last step when that is the only one reported", () => {
    expect(reachedStep([entry("finished", 120)], steps, MIDDLE)).toBe(4);
  });

  it("ignores an entry for something that is not a step", () => {
    expect(reachedStep([entry("something else", 100)], steps, MIDDLE)).toBe(0);
  });
});

describe("what is shown", () => {
  it("goes up to the step reached", () => {
    expect(shownAfter(0, 1)).toBe(1);
    expect(shownAfter(1, 2)).toBe(2);
    // A fast scroll, or a jump down the page: straight to the last step.
    expect(shownAfter(0, 4)).toBe(4);
  });

  it("is never taken back by a lower count, as on the way back up the page", () => {
    expect(shownAfter(3, 1)).toBe(3);
    expect(shownAfter(4, 0)).toBe(4);
    expect(shownAfter(2, 2)).toBe(2);
    // The whole way back up: every label below the middle again, and all four steps still shown.
    const back = reachedStep(steps.map((s, i) => entry(s, 500 + i * 60)), steps, MIDDLE);
    expect(back).toBe(0);
    expect(shownAfter(4, back)).toBe(4);
  });
});

describe("when each brick starts to move", () => {
  it("drops a week's three one after another, with no wait before the first", () => {
    expect([0, 1, 2].map((place) => delayFor(place, 3))).toEqual([0, 110, 220]);
  });

  it("drops fewer than three the same way", () => {
    expect(delayFor(0, 1)).toBe(0);
    expect([0, 1].map((place) => delayFor(place, 2))).toEqual([0, 110]);
  });

  it("fills in a long run first, then drops the last three after it", () => {
    // The jump to the finished stack: 69 bricks at once.
    const count = 69;
    const delays = Array.from({ length: count }, (_, place) => delayFor(place, count));
    expect(delays[0]).toBe(0);
    // The run before the last three is spread over 900 milliseconds, in order.
    const run = delays.slice(0, count - 3);
    expect(run).toEqual([...run].sort((a, b) => a - b));
    expect(run.at(-1)!).toBeLessThan(900);
    expect(run.at(-1)!).toBeGreaterThan(850);
    // The last three wait for the run to finish, then drop as a week does.
    expect(delays.slice(-3)).toEqual([1100, 1210, 1320]);
  });

  it("has one filling brick start at once, with the three after it", () => {
    expect([0, 1, 2, 3].map((place) => delayFor(place, 4))).toEqual([0, 1100, 1210, 1320]);
  });
});

describe("the failsafe", () => {
  it("gives the observer about a second to report before the staging is taken off", () => {
    expect(STAGE_FAILSAFE_MS).toBeGreaterThanOrEqual(800);
    expect(STAGE_FAILSAFE_MS).toBeLessThanOrEqual(1500);
  });
});
