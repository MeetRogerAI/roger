import { describe, expect, it } from "vitest";
import { SAFEGUARD_PREAMBLE } from "@/lib/cora/safeguard";
import { esc } from "../layout";
import { mondayListEmail } from "./monday";

const ideas = [1, 2, 3].map((n) => ({ id: `id${n}`, title: `Idea ${n}`, reason: "Fits your work.", timeLine: null }));
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe("the Monday list email (2026-11-27)", () => {
  it("carries the safeguard preamble exactly once, at the top of the list, in the html and the text", () => {
    const m = mondayListEmail({ week: "2026-12-14", ideas, status: "Status line." });
    expect(count(m.text, SAFEGUARD_PREAMBLE)).toBe(1);
    expect(m.text.indexOf(SAFEGUARD_PREAMBLE)).toBeLessThan(m.text.indexOf("1. Idea 1"));
    expect(count(m.html, esc(SAFEGUARD_PREAMBLE))).toBe(1);
    expect(m.html.indexOf(esc(SAFEGUARD_PREAMBLE))).toBeLessThan(m.html.indexOf("1. Idea 1"));
  });

  it("carries it once for a short list too", () => {
    const m = mondayListEmail({ week: "2026-12-14", ideas: ideas.slice(0, 1), status: "Status line." });
    expect(count(m.text, SAFEGUARD_PREAMBLE)).toBe(1);
  });
});
