import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CardSavedNotice } from "@/components/app/card-saved-notice";
import { HeldIdeas } from "@/components/app/held-ideas";
import { OnboardingChecklist } from "@/components/app/onboarding-checklist";
import { WeekIdeas } from "@/components/app/week-ideas";
import { WeekNote } from "@/components/app/week-note";
import { heldHeading } from "@/lib/app/held";
import { loadHome } from "@/lib/app/home";
import { requireUser } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { longDate } from "@/lib/dates";
import { memberNote } from "@/lib/feedback/feedback";
import { readV3Settings } from "@/lib/v3-settings";
import { featureOn } from "@/lib/v3-features";

export const metadata: Metadata = { title: "This week" };

/** The Monday view (spec B.8 item 4): this week's ideas, the status line, and what comes next. */
async function Home({ searchParams }: { searchParams: PageProps<"/app">["searchParams"] }) {
  const { card } = await searchParams;
  await connection();
  const session = await requireUser("/app");
  const settings = await readV3Settings();
  const home = await loadHome(query, session.userId, settings, new Date());
  if (!home || home.status === "signup") redirect("/start");
  // The weekly note (B3 Unit 5): under this week's delivered list, only while v3.feedbackOn is on.
  const noting = home.ideas.length > 0 && !!home.week && featureOn(settings, "feedbackOn");
  const note = noting ? await memberNote(query, session.userId, home.week!) : null;

  return (
    <div className="space-y-10">
      {/* After a card save with no list to show yet (Unit 5), or a promo code that could not be applied. */}
      {(card !== "saved" || home.ideas.length > 0) && <CardSavedNotice card={card} />}
      <header>
        <h1 className="text-h2">{home.week ? `Your ideas for the week of ${longDate(home.week)}` : home.held ? heldHeading(home.held.count) : "Your first list is on its way"}</h1>
        {home.statusLine !== home.missBanner && (
          <p className="mt-3 text-small text-ink-2">
            {home.statusLine}
            {home.statusLink && (
              <>
                {" "}
                <Link href={home.statusLink.href} className="tlink">
                  {home.statusLink.label}
                </Link>
              </>
            )}
          </p>
        )}
      </header>

      {home.missBanner && (
        <div role="status" className="rounded-[8px] border border-rule bg-surface p-6">
          <p className="text-title">{home.missBanner}</p>
          <p className="mt-2 text-small text-ink-2">
            To fix it, check that Zack still runs each week and can reach Roger.{" "}
            <Link href="/app/zack" className="tlink">
              Check Zack
            </Link>
          </p>
        </div>
      )}
      <OnboardingChecklist userId={session.userId} />

      {home.ideas.length > 0 ? (
        <>
          {home.ideas.length < 3 && (
            <p className="text-small text-ink-2">
              This week there {home.ideas.length === 1 ? "is one idea" : `are ${home.ideas.length} ideas`} that fit you, not three. We only send ideas that fit.
            </p>
          )}
          <WeekIdeas week={home.week!} ideas={home.ideas} />
          {noting && <WeekNote week={home.week!} note={note} />}
        </>
      ) : home.held ? (
        <HeldIdeas titles={home.held.titles} />
      ) : (
        <div className="rounded-[8px] border border-rule bg-surface p-6">
          <p className="text-title">Your ideas arrive on Monday morning.</p>
          <p className="mt-2 text-small text-ink-2">They are picked from what Zack reports, so the first step is to connect him.</p>
          <Link href="/app/zack" className="btn mt-4">
            Connect Zack
          </Link>
        </div>
      )}

      <p className="text-small text-ink-2">
        Ideas you’ve set up: {home.bricks.marked}
        {home.bricks.confirmed ? `, ${home.bricks.confirmed} confirmed by Zack` : ""}.{" "}
        <Link href="/app/history" className="tlink">
          See every idea
        </Link>
      </p>
    </div>
  );
}

export default function Page({ searchParams }: PageProps<"/app">) {
  return (
    <Suspense fallback={<p className="text-lead text-ink-2">Loading…</p>}>
      <Home searchParams={searchParams} />
    </Suspense>
  );
}
