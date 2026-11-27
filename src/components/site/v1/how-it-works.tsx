import type { ReactNode } from "react";
import Link from "next/link";
import { CopyTextButton } from "@/components/app/copy-text-button";
import { SimpleMarkdown } from "@/components/app/simple-markdown";
import { firstExample } from "@/data/site/examples";
import { v1Copy } from "@/data/site/v1";
import { zackAgents } from "@/data/zack";
import { getAmounts, type Amounts } from "@/lib/site/amounts";
import { playbookParts } from "@/lib/site/playbook";
import { getPlaybookPreface, publicIdeaView, type IdeaView } from "@/lib/site/sample";
import type { BuiltVersion } from "@/lib/site/version";
import { PageHead, ReadingSection, StartBand } from "./blocks/reading";
import { Hairline } from "./blocks/sections";

/**
 * /how-it-works on site version 1, long form in one narrow column, in the
 * spec's order (A.8):
 *
 *   1. the week                     Sunday to Wednesday
 *   2. Zack, in detail              id "zack": the control block links here
 *   3. Cora, in detail
 *   4. the anatomy of an idea       the preface first, then the sample idea, a note on each part
 *   5. your first weeks             the trial, step by step
 *   6. if you have no AI agent yet  the link to /getstarted
 *   then the start button
 *
 * The page is under the vocabulary rule ("AI agent", never "agent" alone).
 * One block is not the site's words: the line added to the top of every
 * playbook is a setting the app owns, printed word for word as a quotation and
 * marked with PREFACE_MARK so the vocabulary check can leave out that block
 * and nothing else.
 */

/** On the quotation of the playbook preface, the one block of this page that is not the site's own wording. */
export const PREFACE_MARK = "playbook-preface";

export type ZackFile = { name: string; href: string };

/**
 * The public Zack files, one link for each AI agent whose file exists, in
 * alphabetical order. They are the files in public/zack, served as they are,
 * so anyone can read exactly what Zack is told before signing up. /zack, the
 * free Zack run, is not linked from here.
 */
export function zackFiles(agents: readonly { name: string; file: string; available: boolean }[] = zackAgents): ZackFile[] {
  return agents
    .filter((agent) => agent.available)
    .map((agent) => ({ name: agent.name, href: `/zack/${agent.file}` }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export { playbookParts };

type Note = { part: string; note: string };

/**
 * Each playbook part beside its note, when the playbook has exactly the parts
 * the notes name, in the notes' order. A play may be
 * written another way: then there is no pairing, and the page shows the notes
 * as a list above the whole playbook, so no note sits beside the wrong part.
 */
export function annotate(md: string, notes: Note[]): { note: Note; part: string }[] | null {
  const parts = playbookParts(md);
  if (parts.length !== notes.length) return null;
  const heading = (part: string) => part.split("\n")[0].toLowerCase();
  if (!notes.every((n, i) => /^#/.test(parts[i]) && heading(parts[i]).includes(n.part.toLowerCase()))) return null;
  return notes.map((note, i) => ({ note, part: parts[i] }));
}

/** Reads what the page shows, all of it cached, so the page keeps its static shell. */
export async function V1HowItWorks({ version }: { version: BuiltVersion }) {
  const [amounts, preface] = await Promise.all([getAmounts(), getPlaybookPreface()]);
  // The idea taken apart is the first of the homepage's examples.
  return <V1HowItWorksView version={version} amounts={amounts} idea={publicIdeaView(firstExample.play, preface)} preface={preface} files={zackFiles()} />;
}

const partBox = "rounded-[8px] border border-rule bg-surface p-5 sm:p-6";

export function V1HowItWorksView({
  version,
  amounts,
  idea,
  preface,
  files,
}: {
  /** The version being served. v2 and v3 show this page until they have their own. */
  version: BuiltVersion;
  amounts: Amounts;
  /** The sample idea, built with publicIdeaView. */
  idea: IdeaView;
  /** The line added to the top of every playbook, from the settings. */
  preface: string;
  /** The public Zack files (zackFiles). Empty leaves the links out. */
  files: ZackFile[];
}) {
  const { copy } = v1Copy(amounts);
  const how = copy.howItWorks;
  // The last note is for the install prompt, which is not part of the playbook.
  const playbookNotes = how.anatomy.notes.slice(0, -1);
  const installNote = how.anatomy.notes.at(-1)!;
  const paired = annotate(idea.playbookMd, playbookNotes);

  return (
    <div data-site={version}>
      <PageHead title={how.title} />

      {/* 1. The week */}
      <ReadingSection id="week" title={how.week.title}>
        <dl className="border-b border-rule">
          {how.week.days.map((d) => (
            <div key={d.day} className="grid gap-x-8 gap-y-2 border-t border-rule py-6 sm:grid-cols-[7rem_minmax(0,1fr)]">
              <dt className="text-title">{d.day}</dt>
              <dd className="text-body">{d.body}</dd>
            </div>
          ))}
        </dl>
      </ReadingSection>

      {/* 2. Zack, in detail: the control block's link lands here */}
      <Hairline />
      <ReadingSection id={how.zack.id} title={how.zack.title}>
        <dl className="space-y-8">
          {how.zack.points.map((point) => (
            <div key={point.title}>
              <dt className="text-title">{point.title}</dt>
              <dd className="mt-2 text-body">{point.body}</dd>
            </div>
          ))}
        </dl>
        {files.length > 0 && (
          <div data-zack-files className="mt-10 border-t border-rule pt-6">
            <p className="text-title">{how.zack.filesLink.label}</p>
            <ul className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
              {files.map((file) => (
                <li key={file.href}>
                  {/* A file in public/, not a page: a plain link, so nothing tries to load it as a route. */}
                  <a href={file.href} className="tlink chev">
                    {file.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ReadingSection>

      {/* 3. Cora, in detail */}
      <Hairline />
      <ReadingSection id="cora" title={how.cora.title}>
        <p className="text-body">{how.cora.body}</p>
      </ReadingSection>

      {/* 4. The anatomy of an idea: the preface first, then the sample idea with a note on each part */}
      <Hairline />
      <ReadingSection id="anatomy" title={how.anatomy.title} width="wide">
        <figure data-preface className="mx-auto max-w-[40rem]">
          <figcaption className="text-meta font-semibold text-ink-2">{how.anatomy.prefaceLabel}</figcaption>
          {/* Word for word from the settings, so not held to the site's vocabulary: the mark says so. */}
          <blockquote data-verbatim={PREFACE_MARK} className="mt-3 border-l-2 border-rule-strong pl-4 text-body">
            {preface}
          </blockquote>
        </figure>

        {/* data-claims: the play's own text, for the claims check (src/lib/site/claims.ts). */}
        <article aria-labelledby="anatomy-idea" data-claims="sample" className="mt-14">
          <div className="max-w-[44rem]">
            <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">{idea.category}</p>
            <h3 id="anatomy-idea" className="mt-2 text-h3">
              {idea.title}
            </h3>
            <p className="mt-5 text-lead">{idea.description}</p>
          </div>

          {/* A note comes before its part, so it is read first; from the md breakpoint it sits in the margin beside it. */}
          <ol data-anatomy={paired ? "paired" : "listed"} className="mt-10 space-y-6 md:space-y-4">
            {paired ? (
              paired.map(({ note, part }) => (
                <AnatomyRow key={note.part} note={note}>
                  <SimpleMarkdown source={part} className="text-small" />
                </AnatomyRow>
              ))
            ) : (
              <li className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem] md:gap-8">
                <dl className="space-y-4 md:order-2 md:pt-5">
                  {playbookNotes.map((note) => (
                    <div key={note.part} data-note>
                      <dt className="text-small font-[620]">{note.part}</dt>
                      <dd className="text-small text-ink-2">{note.note}</dd>
                    </div>
                  ))}
                </dl>
                <div className={`${partBox} md:order-1`}>
                  <SimpleMarkdown source={idea.playbookMd} className="text-small" />
                </div>
              </li>
            )}
            <AnatomyRow note={installNote}>
              <blockquote className="border-l-2 border-rule-strong pl-4 text-small">{idea.pasteToInstall}</blockquote>
              <CopyTextButton text={idea.copyText} label={copy.sample.install.copy} className="btn btn-m btn-ink mt-5" />
            </AnatomyRow>
          </ol>
        </article>
      </ReadingSection>

      {/* 5. Your first weeks: the trial, step by step */}
      <Hairline />
      <ReadingSection id="first-weeks" title={how.firstWeeks.title}>
        <ol className="border-b border-rule">
          {how.firstWeeks.steps.map((step, i) => (
            <li key={step} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-t border-rule py-5">
              {/* Decoration: the list is ordered, so a screen reader already counts the steps. */}
              <span aria-hidden="true" data-claims="numeral" className="tabular text-title text-ink-2">
                {i + 1}
              </span>
              <span className="text-body">{step}</span>
            </li>
          ))}
        </ol>
      </ReadingSection>

      {/* 6. If you have no AI agent yet */}
      <Hairline />
      <ReadingSection id="no-agent" title={how.noAgent.title}>
        <p className="text-body">{how.noAgent.body}</p>
        <p className="mt-6">
          <Link href={how.noAgent.link.href} className="tlink chev">
            {how.noAgent.link.label}
          </Link>
        </p>
      </ReadingSection>

      <StartBand start={copy.buttons.start} cardLine={copy.cardLine} />
    </div>
  );
}

/** One part of the idea with its one-line note. */
function AnatomyRow({ note, children }: { note: Note; children: ReactNode }) {
  return (
    <li className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem] md:gap-8">
      <p data-note className="md:order-2 md:pt-5">
        <span className="block text-small font-[620]">{note.part}</span>
        <span className="block text-small text-ink-2">{note.note}</span>
      </p>
      <div className={`${partBox} md:order-1`}>{children}</div>
    </li>
  );
}
