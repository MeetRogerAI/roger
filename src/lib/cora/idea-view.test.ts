import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { v3Defaults } from "@/data/config";
import { buildIdeaView, formatHours, PASTE_CAUTION, type PlaySource } from "./idea-view";

const fixture = JSON.parse(readFileSync(new URL("../../../db/seeds/sample-play.fixture.json", import.meta.url), "utf8"));

const play: PlaySource = {
  id: "p1",
  title: fixture.title,
  category: fixture.category,
  description: fixture.description,
  heavyUseFor: fixture.heavy_use_for,
  playbookMd: fixture.playbook_md,
  pasteToInstall: fixture.paste_to_install,
  writtenOn: fixture.written_on,
  figures: fixture.figures,
  scores: { hours: 7, reach: 8, ease: 6, proof: 5, surprise: 6 },
  score: 68,
};

const preface = v3Defaults.playbookPreface;

describe("buildIdeaView", () => {
  it("fills all four tiles and five bars from full figures", () => {
    const v = buildIdeaView(play, preface);
    expect(v.tiles.hours.headline).toBe("About 3.5 hours a week");
    expect(v.tiles.hours.detail).toBe("2.1 to 4.9 hours a week, estimated");
    expect(v.tiles.eachTime.headline).toBe("About 25 minutes saved");
    expect(v.tiles.heavy.headline).toBe("6 hours a week");
    expect(v.tiles.runBy.headline).toBe("3 users");
    expect(v.scores.map((s) => s.value)).toEqual([7, 8, 6, 5, 6]);
    expect(v.timeLine).toBe("About 3.5 hours a week for people who run it");
    expect(v.writtenOn).toBe("Grok Bot");
  });

  it("says a missing figure is missing, never zero", () => {
    const v = buildIdeaView({ ...play, figures: { ...play.figures, minutes_saved_each: null, runners: undefined } }, preface);
    expect(v.tiles.eachTime.headline).toBeNull();
    expect(v.tiles.eachTime.detail).toBe("Not enough figures yet");
    expect(v.tiles.runBy.headline).toBeNull();
  });

  it("has no time line when hours are unknown", () => {
    expect(buildIdeaView({ ...play, figures: {} }, preface).timeLine).toBeNull();
  });

  it("keeps a null factor score as null", () => {
    const v = buildIdeaView({ ...play, scores: { hours: 7 } }, preface);
    expect(v.scores[1].value).toBeNull();
  });

  it("shows no personal score or reason without a pick", () => {
    expect(buildIdeaView(play, preface).personal).toBeNull();
  });

  it("shows the personal score and reason on a pick", () => {
    const v = buildIdeaView(play, preface, { personalScore: 66, reason: "Matches your client follow-up work." });
    expect(v.personal).toEqual({ score: 66, reason: "Matches your client follow-up work." });
  });

  it("starts every copy with the preface, word for word, then the caution, prompt and playbook", () => {
    const v = buildIdeaView(play, preface);
    expect(v.copyText.startsWith(preface)).toBe(true);
    const parts = v.copyText.split("\n\n");
    expect(parts[1]).toBe(PASTE_CAUTION);
    expect(v.copyText).toContain(play.pasteToInstall);
    expect(v.copyText).toContain(`PLAYBOOK\n\n${play.playbookMd.trim()}`);
  });

  it("says counted when the basis is Actual", () => {
    const v = buildIdeaView({ ...play, figures: { ...play.figures, basis: "Actual" } }, preface);
    expect(v.tiles.hours.detail).toMatch(/counted from their history/);
  });
});

describe("formatHours", () => {
  it("rounds to one decimal and drops a trailing zero", () => {
    expect(formatHours(3.5)).toBe("3.5");
    expect(formatHours(6)).toBe("6");
    expect(formatHours(0.25)).toBe("0.3");
  });
});
