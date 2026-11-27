import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AdaptPrompt, CopyText, FreeRunEmailForm, FreeRunReportForm } from "@/components/site/shared/free-run-form";
import { v1Copy, type V1ZackCopy } from "@/data/site/v1";
import { hasDb } from "@/lib/db";
import { query } from "@/lib/db-query";
import { getAmounts } from "@/lib/site/amounts";
import { isRunToken, readRun, type RunView } from "@/lib/site/free-run";
import type { BuiltVersion } from "@/lib/site/version";
import { downloadName, freeRunAgents, OTHER_AGENT, zackFile, type FreeRunAgent, type ZackFile } from "@/lib/site/zack-files";
import { SectionHead } from "./blocks/section-head";

/**
 * /zack and /zack/[agent] on site version 1: the free Zack run, for people
 * who already run agents (spec A.11). Linked from /agents only.
 *
 *   /zack           1. pick your agent
 *   /zack/[agent]   2. your email
 *                   3. run Zack once: the file, and the prompt in a code block with a Copy button
 *                   4. paste the report back, then the play titles and one start button
 *
 * The run's token rides in the page address (?run=…) from step 2 on, so a
 * reopened tab comes back to step 3 and 4. A token that is unknown, replaced
 * or already attached to an account brings the visitor back to step 2, with
 * one plain line and nothing that says which of the three it was. Starting
 * again there gives every email, new or not, the same empty run.
 *
 * These pages may say "agent" without "AI" in front (spec 0.4).
 */

const AGENT = "[agent]";
const named = (line: string, name: string) => line.replaceAll(AGENT, name);
const ghost = "btn btn-m border-rule-strong bg-transparent text-ink hover:border-ink hover:bg-transparent";

/** The name used in headings and sentences: the agent's, or "your agent" for one we do not list. */
const nameOf = (agent: FreeRunAgent, zack: V1ZackCopy) => agent.name ?? zack.notListed.name;

/** The four steps, with the one the page is on marked. */
function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mx-auto mt-10 flex max-w-[44rem] flex-wrap justify-center gap-x-6 gap-y-2 text-meta text-ink-2">
      {steps.map((step, i) => (
        <li key={step} aria-current={i === current ? "step" : undefined} className={i === current ? "font-[600] text-ink" : undefined}>
          <span data-claims="numeral" className="tabular">{i + 1}.</span> {step}
        </li>
      ))}
    </ol>
  );
}

/** One step of the flow: its number and name, and what it holds, in one reading column. */
function Step({ n, title, word, children }: { n: number; title: string; /** "Step", read out before the number. */ word: string; children: ReactNode }) {
  const id = `step-${n}`;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-14 border-t border-rule py-12 first:border-t-0 md:py-16">
      <h2 id={`${id}-title`} className="text-h3">
        {/* data-claims: a step's number, for the claims check (src/lib/site/claims.ts). */}
        <span aria-hidden="true" data-claims="numeral" className="mr-3 text-accent tabular">
          {String(n).padStart(2, "0")}
        </span>
        <span data-claims="numeral" className="sr-only">
          {word} {n}:{" "}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Reads each agent's file, cached, so the page keeps its static shell. */
export async function V1ZackPicker({ version }: { version: BuiltVersion }) {
  const agents = freeRunAgents();
  const files = await Promise.all(agents.map((a) => zackFile(a.file)));
  const { zack } = v1Copy(await getAmounts());
  return <V1ZackPickerView version={version} zack={zack} agents={agents.map((agent, i) => ({ agent, version: files[i].version }))} />;
}

export function V1ZackPickerView({
  version,
  zack,
  agents,
}: {
  /** The version being served. v2 and v3 show this page until they have their own. */
  version: BuiltVersion;
  zack: V1ZackCopy;
  /** Each agent with the version its file states. */
  agents: { agent: FreeRunAgent; version: string }[];
}) {
  const listed = agents.filter(({ agent }) => agent.slug !== OTHER_AGENT);
  const other = agents.find(({ agent }) => agent.slug === OTHER_AGENT);
  return (
    <div data-site={version}>
      <section aria-labelledby="zack-title" className="bg-ground">
        <div className="wrap pb-16 pt-16 md:pb-20 md:pt-24">
          <SectionHead id="zack-title" title={zack.title} sub={zack.intro} as="h1" />
          <Steps steps={zack.steps} current={0} />
        </div>
      </section>

      <section id="agents" aria-labelledby="agents-title" className="scroll-mt-14 bg-ground-2">
        <div className="wrap py-16 md:py-20">
          <h2 id="agents-title" className="mx-auto max-w-[44rem] text-center text-h3">
            {zack.steps[0]}
          </h2>
          <ul className="mx-auto mt-10 grid max-w-[60rem] gap-4 sm:grid-cols-2">
            {listed.map(({ agent, version: fileVersion }) => (
              <li key={agent.slug} data-agent={agent.slug} className="flex flex-col rounded-[8px] border border-rule bg-surface p-6">
                {agent.hasOwnFile ? (
                  <>
                    <p className="text-meta text-ink-2">{zack.picker.file}</p>
                    <h3 className="mt-1 text-title">{agent.name}</h3>
                    {fileVersion && (
                      <p className="mt-1 text-meta text-ink-2 tabular">
                        {zack.picker.version} {fileVersion}
                      </p>
                    )}
                    <p className="mt-6">
                      <Link href={`/zack/${agent.slug}`} className="btn btn-m">
                        {named(zack.picker.choose, agent.name ?? "")}
                      </Link>
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-title">{agent.name}</h3>
                    <p className="mt-2 text-small text-ink-2">{named(zack.picker.noFile, agent.name ?? "")}</p>
                    <p className="mt-6">
                      <Link href={`/zack/${agent.slug}`} className={ghost}>
                        {named(zack.picker.chooseNoFile, agent.name ?? "")}
                      </Link>
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {other && (
        <section id="not-listed" aria-labelledby="not-listed-title" className="scroll-mt-14 bg-ground">
          <div className="wrap py-16 text-center md:py-20">
            <h2 id="not-listed-title" className="mx-auto max-w-[44rem] text-h3">
              {zack.notListed.title}
            </h2>
            <p className="mx-auto mt-4 max-w-[40rem] text-lead text-ink-2">{zack.notListed.body}</p>
            <p className="mt-8">
              <Link href={`/zack/${other.agent.slug}`} className={ghost}>
                {zack.notListed.link}
              </Link>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * The page for one agent. The heading is the static shell; the steps under it
 * depend on the run token in the address and on the database, so they are
 * read in a child under Suspense.
 */
export async function V1ZackAgent({ version, agent, searchParams }: { version: BuiltVersion; agent: FreeRunAgent; searchParams: Search }) {
  const amounts = await getAmounts();
  const { zack, copy } = v1Copy(amounts);
  const file = await zackFile(agent.file);
  return (
    <div data-site={version}>
      <section aria-labelledby="zack-title" className="bg-ground">
        <div className="wrap pt-16 md:pt-24">
          <SectionHead id="zack-title" title={named(zack.agentPage.title, nameOf(agent, zack))} sub={zack.intro} as="h1" />
          <p className="mt-6 text-center text-small">
            <Link href="/zack" className="tlink">
              {zack.agentPage.back}
            </Link>
          </p>
        </div>
      </section>
      <div className="bg-ground">
        <div className="wrap pb-20 pt-6 md:pb-28">
          {/* The steps stream in after the heading. The column keeps most of a screen's height from the start, so the footer waits below the fold and does not jump when they arrive. */}
          <div data-flow-column className="mx-auto min-h-[70svh] max-w-[44rem]">
            <Suspense
              fallback={
                <p role="status" className="py-12 text-body text-ink-2">
                  {zack.agentPage.loading}
                </p>
              }
            >
              <Flow agent={agent} file={file} zack={zack} warning={copy.zackWarning} start={copy.buttons.start} cardLine={copy.cardLine} searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

type FlowWords = { agent: FreeRunAgent; file: ZackFile; zack: V1ZackCopy; warning: string; start: string; cardLine: string };

/** Reads the run the address names. A database that cannot be reached reads as no run. */
async function Flow({ searchParams, ...words }: FlowWords & { searchParams: Search }) {
  const { run } = await searchParams;
  const token = typeof run === "string" ? run : Array.isArray(run) ? (run[0] ?? "") : "";
  const db = hasDb();
  let view: RunView | null = null;
  if (db && isRunToken(token)) {
    try {
      // A run started for another agent is not this page's run.
      view = await readRun(query, token, words.agent.slug);
    } catch (e) {
      console.error("[zack] run not read", e instanceof Error ? e.message : e);
    }
  }
  return <FlowView {...words} db={db} token={token} run={view} />;
}

/**
 * The steps, for what is known about the visitor's run:
 *   - a live run: the instructions and the paste box;
 *   - no run, or a token that opens nothing: the email step;
 *   - no database: the email step with a line saying saving is off, and the instructions all the same.
 */
export function FlowView({ agent, file, zack, warning, start, cardLine, db, token, run }: FlowWords & { db: boolean; /** The `run` value in the address, "" when there is none. */ token: string; run: RunView | null }) {
  if (run) {
    return (
      <>
        <Instructions agent={agent} file={file} zack={zack} />
        <Step n={4} title={zack.paste.title} word={zack.step}>
          <FreeRunReportForm
            agent={agent.slug}
            token={token}
            hasReport={run.hasReport}
            copy={{
              label: zack.paste.label,
              submit: zack.paste.submit,
              pending: zack.paste.pending,
              startAgain: zack.paste.startAgain,
              warning,
              summaryTitle: zack.afterPaste.title,
              saved: zack.afterPaste.saved,
              noPlays: zack.afterPaste.noPlays,
              next: zack.afterPaste.next,
              already: zack.afterPaste.already,
              again: zack.afterPaste.again,
              start,
              cardLine,
            }}
          />
        </Step>
      </>
    );
  }
  return (
    <>
      <Step n={2} title={zack.email.title} word={zack.step}>
        <p className="mt-4 text-body text-ink-2">{zack.email.body}</p>
        {!db && (
          <p role="status" data-no-database className="mt-6 rounded-[8px] bg-ground-2 px-5 py-4 text-body">
            {zack.noDatabase}
          </p>
        )}
        <FreeRunEmailForm
          // A fresh form for each address, so one that has just answered does not stay on screen when its token opens nothing.
          key={token || "new"}
          agent={agent.slug}
          // With no database the line above already says saving is off, and the action answers with the same words: once is enough.
          shownAbove={db ? undefined : zack.noDatabase}
          notice={db && token ? { text: zack.email.expired, signInLead: zack.email.expiredSignInLead, signIn: zack.email.expiredSignIn } : undefined}
          copy={{ label: zack.email.label, submit: zack.email.submit, pending: zack.email.pending, started: zack.email.started, continue: zack.email.continue }}
        />
      </Step>
      {/* With no database there is no paste box, so the line that points to it is left out. */}
      {!db && <Instructions agent={agent} file={file} zack={zack} pasteBelow={false} />}
    </>
  );
}

/** Step 3: the file to give the agent, the prompt that adapts it where the agent has none of its own, and the run-once prompt. */
function Instructions({ agent, file, zack, pasteBelow = true }: { agent: FreeRunAgent; file: ZackFile; zack: V1ZackCopy; /** The paste box follows this step. */ pasteBelow?: boolean }) {
  const name = nameOf(agent, zack);
  const run = zack.run;
  return (
    <Step n={3} title={run.title} word={zack.step}>
      <p className="mt-4 text-body text-ink-2">{agent.hasOwnFile ? named(run.fileLead, name) : named(run.adaptLead, name)}</p>
      <div data-zack-file className="mt-6 rounded-[8px] border border-rule bg-surface p-6">
        <p className="text-meta text-ink-2">{run.fileName}</p>
        <p className="mt-1 text-title">{agent.fileFor}</p>
        {file.version && (
          <p className="mt-1 text-meta text-ink-2 tabular">
            {run.version} {file.version}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <a className="btn btn-m" href={`/zack/${agent.file}`} download={downloadName(agent.fileFor, file.version)}>
            {run.download}
          </a>
          <CopyText text={file.text} label={run.copyFile} copied={zack.copied} className={ghost} />
        </div>
      </div>

      {!agent.hasOwnFile && (
        <>
          <AdaptPrompt name={agent.name} copy={{ label: run.adaptLabel, placeholder: run.adaptPlaceholder, blank: run.adaptBlank, prompt: run.adaptPrompt, copy: run.adaptCopy, copied: zack.copied }} />
          <p className="mt-4 text-small text-ink-2">{run.adaptAfter}</p>
        </>
      )}

      <p className="mt-10 text-body text-ink-2">{run.promptLead}</p>
      <div data-run-prompt className="on-night mt-5 flex flex-col gap-4 rounded-[8px] bg-night p-5 text-night-ink sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <pre className="min-w-0 whitespace-pre-wrap break-words">
          <code className="font-mono text-small leading-relaxed">{run.prompt}</code>
        </pre>
        <CopyText text={run.prompt} label={zack.copyPrompt} copied={zack.copied} className="btn btn-m btn-light shrink-0 self-start sm:self-auto" />
      </div>
      {pasteBelow && <p className="mt-8 text-body">{run.comeBack}</p>}
    </Step>
  );
}
