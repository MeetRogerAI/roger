import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { OrderBox, WeekIdeas } from "@/components/app/week-ideas";
import { loadHome } from "@/lib/app/home";
import { requireUser } from "@/lib/auth/access";
import { query } from "@/lib/db-query";
import { longDate } from "@/lib/mail/templates/welcome";
import { readV3Settings } from "@/lib/v3-settings";

export const metadata: Metadata = { title: "This week" };

/** The Monday view (spec B.8 item 4): this week's ideas, the status line, and what comes next. */
async function Home() {
  await connection();
  const session = await requireUser("/app");
  const settings = await readV3Settings();
  const home = await loadHome(query, session.userId, settings, new Date());
  if (!home || home.status === "signup") redirect("/start");

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-h2">{home.week ? `Your ideas for the week of ${longDate(home.week)}` : "Your first list is on its way"}</h1>
        <p className="mt-3 text-small text-ink-2">{home.statusLine}</p>
      </header>

      {home.ideas.length > 0 ? (
        <>
          {home.ideas.length < 3 && (
            <p className="text-small text-ink-2">
              This week there {home.ideas.length === 1 ? "is one idea" : `are ${home.ideas.length} ideas`} that fit you, not three. We only send ideas that fit.
            </p>
          )}
          <WeekIdeas week={home.week!} ideas={home.ideas} />
        </>
      ) : (
        <div className="rounded-[8px] border border-rule bg-surface p-6">
          <p className="text-title">Your ideas arrive on Monday morning.</p>
          <p className="mt-2 text-small text-ink-2">They are picked from what Zack reports, so the first step is to connect him.</p>
          <Link href="/app/zack" className="btn mt-4">
            Connect Zack
          </Link>
        </div>
      )}

      {home.order && <OrderBox week={home.order.week} weekLabel={longDate(home.order.week)} ordered={home.order.ordered} price={home.order.price} />}

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

export default function Page() {
  return (
    <Suspense fallback={<p className="text-lead text-ink-2">Loading…</p>}>
      <Home />
    </Suspense>
  );
}
