"use client";

import { useState, useTransition } from "react";
import { setUpIdea } from "@/app/app/actions";
import type { WeekIdea } from "@/lib/app/week";
import { SAFEGUARD_PREAMBLE } from "@/lib/cora/safeguard";
import { IdeaCard } from "./idea-card";

function SetUpButton({ week, idea }: { week: string; idea: WeekIdea }) {
  const [done, setDone] = useState(idea.setUp);
  const [pending, start] = useTransition();
  if (done) {
    return (
      <p className="text-small text-ink-2" role="status">
        {idea.confirmed ? "Set up, and Zack has seen it running." : "Marked as set up. Zack confirms it when it shows up in your week."}
      </p>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-s"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setUpIdea(week, idea.position);
          if (r.ok) setDone(true);
        })
      }
    >
      {pending ? "Saving…" : "I set this up"}
    </button>
  );
}

/**
 * The week's ideas (spec B.8 item 4): the safeguard preamble once at the top
 * of the list (2026-11-27), then one card each, "I set this up" under the
 * sheet's title. Each sheet's paste-to-install text carries it too.
 */
export function WeekIdeas({ week, ideas }: { week: string; ideas: WeekIdea[] }) {
  return (
    <div className="grid gap-4">
      <aside aria-label="Before you set these up" className="rounded-[8px] border border-rule bg-ground-2 p-4 text-small text-ink-2">
        {SAFEGUARD_PREAMBLE}
      </aside>
      {ideas.map((i) => (
        <div key={i.id} id={`idea-${i.id}`}>
          <IdeaCard idea={i} sheetActions={<SetUpButton week={week} idea={i} />} />
        </div>
      ))}
    </div>
  );
}
