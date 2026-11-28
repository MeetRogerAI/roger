import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { v3Defaults } from "@/data/config";
import { buildIdeaView, type PlaySource } from "@/lib/cora/idea-view";
import { IdeaCard } from "./idea-card";

/** B3 plan Unit 12: the Upgrade label and the What's better line, on the card front and in the sheet, only on an upgrade pick. */
const f = JSON.parse(readFileSync(new URL("../../../db/seeds/sample-play.fixture.json", import.meta.url), "utf8"));
const play: PlaySource = {
  id: "p1",
  title: f.title,
  category: f.category,
  description: f.description,
  heavyUseFor: f.heavy_use_for,
  playbookMd: f.playbook_md,
  pasteToInstall: f.paste_to_install,
  writtenOn: f.written_on,
  figures: f.figures,
  scores: { hours: 7 },
  score: 68,
};
const render = (kind: string) =>
  renderToStaticMarkup(
    <IdeaCard idea={buildIdeaView(play, v3Defaults.playbookPreface, { personalScore: 70, reason: "r", kind, whatsBetter: "Adds guardrails your version doesn't have." })} initiallyOpen />,
  );

describe("IdeaCard and upgrades", () => {
  it("shows the label and the line on the front and in the sheet for an upgrade", () => {
    const html = render("upgrade");
    expect(html.match(/· Upgrade/g)).toHaveLength(2);
    expect(html.match(/What&#x27;s better: Adds guardrails your version doesn&#x27;t have\./g)).toHaveLength(2);
  });

  it("shows neither on any other pick", () => {
    const html = render("new");
    expect(html).not.toContain("Upgrade");
    expect(html).not.toContain("What&#x27;s better");
  });
});
