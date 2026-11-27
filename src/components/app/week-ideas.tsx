"use client";

import { useState, useTransition } from "react";
import { setUpIdea } from "@/app/app/actions";
import { orderNextList, cancelNextList } from "@/app/app/order-actions";
import type { WeekIdea } from "@/lib/app/week";
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

/** The week's ideas (spec B.8 item 4): one card each, "I set this up" under the sheet's title. */
export function WeekIdeas({ week, ideas }: { week: string; ideas: WeekIdea[] }) {
  return (
    <div className="grid gap-4">
      {ideas.map((i) => (
        <div key={i.id} id={`idea-${i.id}`}>
          <IdeaCard idea={i} sheetActions={<SetUpButton week={week} idea={i} />} />
        </div>
      ))}
    </div>
  );
}

/** One at a time: order or cancel the coming Monday's list (spec B.9). */
export function OrderBox({ week, weekLabel, ordered, price }: { week: string; weekLabel: string; ordered: boolean; price: string }) {
  const [state, setState] = useState<{ ordered: boolean; message: string }>({ ordered, message: "" });
  const [pending, start] = useTransition();
  const act = (fn: typeof orderNextList, next: boolean) =>
    start(async () => {
      const fd = new FormData();
      fd.set("week", week);
      const r = await fn(fd);
      setState(r.ok ? { ordered: next, message: next ? "Ordered." : "Cancelled." } : { ordered: state.ordered, message: r.message });
    });
  return (
    <div className="rounded-[8px] border border-rule bg-surface p-5">
      <p className="text-title">{state.ordered ? `Your Cora Curation for ${weekLabel} is ordered.` : `Want a Cora Curation on ${weekLabel}?`}</p>
      <p className="mt-1 text-small text-ink-2">
        {state.ordered ? "You can cancel until Sunday night." : `${price}, charged that morning once Zack’s report has arrived. Order until Sunday night.`}
      </p>
      <button type="button" className="btn mt-4" disabled={pending} onClick={() => act(state.ordered ? cancelNextList : orderNextList, !state.ordered)}>
        {pending ? "Saving…" : state.ordered ? "Cancel the order" : "Order this Cora Curation"}
      </button>
      <p role="status" aria-live="polite" className="mt-2 text-small text-ink-2">
        {state.message}
      </p>
    </div>
  );
}
