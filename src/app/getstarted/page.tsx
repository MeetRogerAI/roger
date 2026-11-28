import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalForMember, NextStep, PublishedSetupStep } from "@/components/app/getstarted-parts";
import { GetStartedStep as Step } from "@/components/app/setup-step";

const title = "Get started with an AI agent";
const description = "Install an AI agent, set up your starter team, and agree your daily goal. Then connect Zack and get your first Cora Curation.";

export const metadata: Metadata = {
  title: "Get started",
  description,
  alternates: { canonical: "/getstarted" },
  openGraph: { url: "/getstarted", title, description },
};

/** The public startup page (spec B.11). */
export default function GetStartedPage() {
  return (
    <article className="wrap py-16 md:py-24">
      <div className="max-w-[42rem]">
        <h1 className="text-h2 text-stretch-display">{title}</h1>
        <p className="mt-4 text-lead text-ink-2">Starting from nothing? These steps take you from no AI agent to one that saves you time every day.</p>

        <ol className="mt-12 space-y-12">
          <Step id="install" title="Install your AI agent.">
            <p className="mt-3 text-ink-2">Grok Bot is the AI agent we recommend if you are starting from nothing.</p>
            <ol className="mt-4 list-decimal space-y-1 pl-6">
              <li>
                Go to the{" "}
                <a href="https://x.ai/bot" target="_blank" rel="noopener noreferrer" className="tlink">
                  Grok Bot site
                </a>{" "}
                and download it.
              </li>
              <li>Open it.</li>
              <li>Upgrade to a paid plan of your choice.</li>
              <li>Name your Chief of Staff.</li>
            </ol>
          </Step>

          <Suspense fallback={null}>
            <PublishedSetupStep />
          </Suspense>

          <Step id="daily-goal" title="Your daily goal.">
            <p className="mt-3 text-lead">You are all set up. Your responsibility is to use your agent setup every day until you have saved at least 30 minutes that day.</p>
            <Suspense fallback={null}>
              <GoalForMember />
            </Suspense>
          </Step>

          <Step id="next" title="Next.">
            <Suspense fallback={<div className="min-h-24" />}>
              <NextStep />
            </Suspense>
          </Step>
        </ol>
      </div>
    </article>
  );
}
