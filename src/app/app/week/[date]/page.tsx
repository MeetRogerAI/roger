import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CardSavedNotice } from "@/components/app/card-saved-notice";
import { HeldIdeas } from "@/components/app/held-ideas";
import { WeekIdeas } from "@/components/app/week-ideas";
import { heldHeading, heldTeaser } from "@/lib/app/held";
import { weekIdeas } from "@/lib/app/week";
import { isRealDate } from "@/lib/clock";
import { requireUser } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { longDate } from "@/lib/mail/templates/welcome";
import { readV3Settings } from "@/lib/v3-settings";

export const metadata: Metadata = { title: "A past week" };

/**
 * A past week's ideas: only the user's own delivered picks. A held week (no
 * card yet, plan 2026-11-26-001 Unit 3) shows its titles only; any other week
 * is a plain empty state.
 */
async function Week({ params, searchParams }: { params: PageProps<"/app/week/[date]">["params"]; searchParams: PageProps<"/app/week/[date]">["searchParams"] }) {
  await connection();
  const { date } = await params;
  const { card } = await searchParams;
  const session = await requireUser(`/app/week/${encodeURIComponent(date)}`);
  const settings = await readV3Settings();
  const ideas = await weekIdeas(query, session.userId, date, settings.playbookPreface);
  const valid = isRealDate(date);
  const held = !ideas.length && valid ? await heldTeaser(query, session.userId) : null;
  if (held && held.week === date) {
    return (
      <div className="space-y-8">
        <h1 className="text-h2">{heldHeading(held.count)}</h1>
        <HeldIdeas titles={held.titles} />
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {/* After a card save on the Payment page (Unit 5): "Your card is saved. Here are your ideas." */}
      {ideas.length > 0 && <CardSavedNotice card={card} />}
      <h1 className="text-h2">{valid ? `Your ideas for the week of ${longDate(date)}` : "That isn’t a week"}</h1>
      {ideas.length ? (
        <WeekIdeas week={date} ideas={ideas} />
      ) : (
        <p className="text-small text-ink-2">
          There are no ideas for you for that week.{" "}
          <Link href="/app/history" className="tlink">
            See every idea
          </Link>
        </p>
      )}
    </div>
  );
}

export default function Page({ params, searchParams }: PageProps<"/app/week/[date]">) {
  return (
    <Suspense fallback={<p className="text-lead text-ink-2">Loading…</p>}>
      <Week params={params} searchParams={searchParams} />
    </Suspense>
  );
}
