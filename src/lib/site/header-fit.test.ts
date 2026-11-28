import { describe, expect, it } from "vitest";
import { v1 } from "@/data/site/v1";
import { navRow, textWidth } from "./header-fit";

/** The built-in words of the header, as printed (the start button's amount filled in as the settings' default does). */
const labels = v1.nav.map((link) => link.label);
const signIn = v1.buttons.signIn;
const start = "Get two free Cora Curations";

describe("navRow (plan U8)", () => {
  it("measures each label within two pixels of what Chrome drew for it on November 27, 2026", () => {
    // Widths of the links' words without their padding, as measured at 1024 pixels.
    const drawn: Record<string, number> = { "How it works": 93.7, Pricing: 52.0, "Use cases": 76.0, FAQ: 33.0, About: 46.3 };
    for (const [label, width] of Object.entries(drawn)) expect(Math.abs(textWidth(label, "link") - width), label).toBeLessThan(2.5);
    expect(Math.abs(textWidth(signIn, "button") - 50.8)).toBeLessThan(2);
    expect(Math.abs(textWidth(start, "button") - 211.8)).toBeLessThan(2);
  });

  it("keeps the built-in header's row from 1024 pixels, as it was built", () => {
    expect(navRow(labels, signIn, start)).toBe("lg");
  });

  it("moves the row to 1280 for a sixth link, or for a label longer by more than the 34 pixels 1024 leaves", () => {
    expect(navRow([...labels, "Run Zack"], signIn, start)).toBe("xl");
    expect(navRow(labels.map((label) => (label === "FAQ" ? "Questions" : label)), signIn, start)).toBe("xl");
    // A little longer still fits: "FAQs", or a shorter "Pricing".
    expect(navRow(labels.map((label) => (label === "FAQ" ? "FAQs" : label === "Pricing" ? "Price" : label)), signIn, start)).toBe("lg");
    // A longer start button takes the room too.
    expect(navRow(labels, signIn, "Get your two free Cora Curations today")).toBe("xl");
  });

  it("puts the links in the menu at every width when they do not fit at 1280 either, whatever the characters", () => {
    expect(navRow(Array.from({ length: 6 }, () => "W".repeat(24)), signIn, start)).toBe("menu");
    expect(navRow(["日本語のリンクのことばはとても長い", "もうひとつの長いリンク", "三つ目のリンクも長い"], signIn, start)).toBe("menu");
    // A character outside the measured ones counts wider than any of them.
    expect(textWidth("é", "link")).toBeGreaterThan(textWidth("W", "link"));
  });

  it("keeps the room of the signed-in visitor's button when it is wider than Sign in and the start button together", () => {
    expect(navRow(labels, signIn, start, v1.buttons.openApp)).toBe("lg");
    expect(navRow(labels, "Go", "Start", "W".repeat(30))).toBe("xl");
    expect(navRow(labels, signIn, start, "W".repeat(30))).toBe("xl");
  });

  it("needs no row for a header with no links", () => {
    expect(navRow([], signIn, start)).toBe("lg");
  });
});
