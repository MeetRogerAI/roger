import type { Metadata } from "next";
import { notFound } from "next/navigation";
import sample from "../../../../../db/seeds/sample-play.fixture.json";
import { IdeaCard } from "@/components/app/idea-card";
import { v3Defaults } from "@/data/config";
import { buildIdeaView } from "@/lib/cora/idea-view";

export const metadata: Metadata = { title: "Idea card preview", robots: { index: false, follow: false } };

const play = {
  id: "fixture",
  title: sample.title,
  category: sample.category,
  description: sample.description,
  heavyUseFor: sample.heavy_use_for,
  playbookMd: sample.playbook_md,
  pasteToInstall: sample.paste_to_install,
  writtenOn: sample.written_on,
  figures: sample.figures,
  scores: { hours: sample.f_hours, reach: sample.f_reach, ease: sample.f_ease, proof: sample.f_proof, surprise: sample.f_surprise },
  score: sample.score,
};

/** Builder's preview of the idea card with the made-up fixture. Not on production. */
export default function IdeaCardPreview() {
  if (process.env.VERCEL_ENV === "production") notFound();
  const publicView = buildIdeaView(play, v3Defaults.playbookPreface);
  const picked = buildIdeaView(play, v3Defaults.playbookPreface, {
    personalScore: 66,
    reason: "Matches the client follow-up work your own week shows.",
  });
  return (
    <section className="wrap py-16">
      <h1 className="text-h2">Idea card preview</h1>
      <p className="mt-4 text-ink-2">Made-up fixture data. Not shown on production.</p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-small font-[600]">Public sample (no personal score)</h2>
          <IdeaCard idea={publicView} />
        </div>
        <div>
          <h2 className="mb-3 text-small font-[600]">A user&apos;s pick</h2>
          <IdeaCard idea={picked} sheetActions={<button type="button" className="btn btn-s">I set this up</button>} />
        </div>
      </div>
    </section>
  );
}
