/**
 * How the Pages screens say which item of a list a field belongs to: by its
 * place and its wording, so the owner never has to count (./caption.ts, and
 * fieldLabelWith in ./labels.ts).
 */
import { describe, expect, it } from "vitest";
import { CAPTION_MAX, fullName, itemTitle, shortened } from "./caption";
import { captionField, fieldLabel, fieldLabelWith } from "./labels";
import { baseline, textAt } from "./model";
import { siteRegistry } from "./registry";

const field = (id: string) => siteRegistry.fields.get(id)!;
const original = (id: string) => textAt(baseline, id) ?? "";

describe("a wording cut short for a label", () => {
  it("is left alone when it fits, on one line", () => {
    expect(shortened("What does Roger cost?")).toBe("What does Roger cost?");
    expect(shortened("  Two\n\nlines \t here ")).toBe("Two lines here");
    expect(shortened("")).toBe("");
    expect(shortened("x".repeat(CAPTION_MAX))).toBe("x".repeat(CAPTION_MAX));
  });

  it("is cut at a whole word, without the punctuation the cut would end on, and marked", () => {
    const long = "What do I have to do each week, and on which day, and what happens when I am away";
    const cut = shortened(long);
    expect(cut).toBe("What do I have to do each week, and on which day, and what…");
    expect([...cut].length).toBeLessThanOrEqual(CAPTION_MAX + 1);
    expect(shortened("One two three, four five", 14)).toBe("One two three…");
  });

  it("cuts one long unbroken word at the limit, and never leaves half a character", () => {
    expect(shortened("x".repeat(200))).toBe(`${"x".repeat(CAPTION_MAX)}…`);
    const emoji = "🎉".repeat(100);
    const cut = shortened(emoji, 10);
    expect(cut).toBe(`${"🎉".repeat(10)}…`);
    // Every character is whole: encoding it loses nothing.
    expect(decodeURIComponent(encodeURIComponent(cut))).toBe(cut);
  });
});

describe("an item's name", () => {
  it("is its place and its wording, and the place alone when it has no wording", () => {
    expect(itemTitle("Question 3", "What do I have to do each week?")).toBe("Question 3 — “What do I have to do each week?”");
    expect(itemTitle("Question 3", "   ")).toBe("Question 3");
    expect(fullName("Question 3", "What do I have to do each week?", "Answer")).toBe("Question 3 — “What do I have to do each week?” · Answer");
    expect(fullName(null, "anything", "Headline")).toBe("Headline");
  });

  it("comes from the item's first field: a question's question, a step's label, a point's title", () => {
    expect(captionField(field("questions.price-and-billing.items.cost.a"))?.id).toBe("questions.price-and-billing.items.cost.q");
    expect(captionField(field("questions.price-and-billing.items.cost.q"))?.id).toBe("questions.price-and-billing.items.cost.q");
    expect(captionField(field("home.hero.graphic.steps.collect.body"))?.id).toBe("home.hero.graphic.steps.collect.label");
    expect(captionField(field("control.points.0.body") ?? field("home.hero.headline"))).toBeDefined();
    expect(captionField(field("home.hero.headline"))).toBeNull();
    // A question group's heading belongs to no item.
    expect(captionField(field("questions.price-and-billing.title"))).toBeNull();
  });

  it("is on every field of every numbered item, with the wording the screen shows", () => {
    expect(fieldLabelWith(field("home.hero.graphic.steps.collect.title"), original)).toEqual({ group: "Step 2", name: "Headline", item: "Step 2 — “Collect”", full: "Step 2 — “Collect” · Headline" });
    expect(fieldLabelWith(field("home.hero.headline"), original)).toEqual({ group: null, name: "Headline", item: null, full: "Headline" });
    // The wording is whatever the caller shows: a draft, here.
    expect(fieldLabelWith(field("questions.price-and-billing.items.cost.a"), () => "How much is it?").full).toBe("Question 1 — “How much is it?” · Answer");
    for (const entry of siteRegistry.fields.values()) {
      const label = fieldLabelWith(entry, original);
      if (!entry.item?.noun) {
        expect(label.full, entry.id).toBe(fieldLabel(entry).full);
        continue;
      }
      // "Question 3 — “…” · Answer": the place, the item's own wording, what the field is. Never an id.
      expect(label.full, entry.id).toMatch(/^[A-Z][a-z]+ \d+ — “.+” · \S/);
      expect(label.full, entry.id).not.toContain(entry.item.id.length > 3 ? `“${entry.item.id}”` : "\u0000");
    }
  });
});
