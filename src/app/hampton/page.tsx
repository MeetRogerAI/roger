import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { siteConfig } from "@/data/config";
import { CopyButton } from "./copy-button";

const title = "Instructions for Zack The Collector";
const description = "Run Zack The Collector in your own agent, save the .md output and email it to Roger.";

// Shared by link only: kept out of search, the sitemap and the nav
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/hampton" },
  openGraph: { url: "/hampton", title, description, siteName: "Roger", type: "website" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

const dates = [
  { label: "Date", value: "November 12, 2026" },
  { label: "Deadline", value: "End of Friday, November 13" },
  { label: "Results", value: "Monday, November 16" },
];

const agents = [
  { name: "Claude", version: "0.6", file: "zack-the-collector-claude.md", download: "Zack The Collector (for Claude).md" },
  { name: "Duet", version: "0.1", file: "zack-the-collector-duet.md", download: "Zack The Collector (for Duet).md" },
  { name: "Hark", version: "1.8", file: "zack-the-collector-hark.md", download: "Zack The Collector (for Hark).md" },
];

const prompt = "Run Zack the Collector now from the attached file and create a .md output file.";

const mail = (subject: string) => `mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent(subject)}`;

const ghost =
  "btn btn-m border-rule-strong bg-transparent text-ink hover:border-ink hover:bg-transparent";

// Read from the same files Download serves, so Copy and Download never differ
async function readZackFiles() {
  "use cache";
  return Promise.all(agents.map((a) => readFile(path.join(process.cwd(), "public", "zack", a.file), "utf8")));
}

export default async function HamptonPage() {
  const texts = await readZackFiles();

  return (
    <>
      {/* Hero: the title and the three dates that matter */}
      <section aria-labelledby="hero-title" className="bg-ground">
        <div className="wrap pb-14 pt-12 md:pb-20 md:pt-20">
          <h1 id="hero-title" className="max-w-[14ch] text-display text-stretch-display">
            {title}
          </h1>
          <dl className="mt-10 grid max-w-[52rem] gap-y-5 border-t hairline pt-6 sm:grid-cols-3 sm:gap-x-8">
            {dates.map((d) => (
              <div key={d.label}>
                <dt className="text-meta font-[560] uppercase tracking-[0.08em] text-accent">{d.label}</dt>
                <dd className="mt-1 text-title">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* The four steps */}
      <section aria-label="Steps" className="bg-ground-2">
        <ol className="wrap py-6 md:py-10">
          <Step n={1} title="Download or copy the .md file that works with your agent.">
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {agents.map((a, i) => (
                <li key={a.name} className="flex flex-col rounded-[8px] border hairline bg-surface p-6">
                  <p className="text-meta text-ink-2">Zack The Collector for</p>
                  <p className="mt-1 text-h3">{a.name}</p>
                  <p className="mt-1 text-meta text-ink-2 tabular">Version {a.version}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <a
                      className="btn btn-m"
                      href={`/zack/${a.file}`}
                      download={a.download}
                      aria-label={`Download the ${a.name} file`}
                    >
                      Download
                    </a>
                    <CopyButton text={texts[i]} label="Copy" className={ghost} />
                  </div>
                </li>
              ))}
            </ul>
          </Step>

          <Step n={2} title="Prompt your agent.">
            <p className="mt-3 max-w-[36rem] text-ink-2">
              Attach the file from step 1 (or paste its text), then send this:
            </p>
            <div className="mt-5 flex max-w-[48rem] flex-col gap-4 rounded-[8px] bg-night p-5 text-night-ink sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <code className="font-mono text-small leading-relaxed">{prompt}</code>
              <CopyButton
                text={prompt}
                label="Copy prompt"
                className="btn btn-m btn-light shrink-0 self-start sm:self-auto"
              />
            </div>
          </Step>

          <Step n={3} title={`Email the output file to ${siteConfig.contactEmail}.`}>
            <p className="mt-3 max-w-[36rem] text-ink-2">
              Attach the .md file your agent made. This goes directly to Peter Kuperman, no one else.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a className="btn btn-m" href={mail("Zack results")}>
                Email my results
              </a>
              <span className="select-all text-small">{siteConfig.contactEmail}</span>
            </div>
          </Step>

          <Step n={4} title="Review it and tell us how to make it better." optional last>
            <p className="mt-3 max-w-[36rem] text-ink-2">
              Look over the process, the input file and the result. What was confusing, slow or wrong? What would
              make it more useful?
            </p>
            <div className="mt-5">
              <a className={ghost} href={mail("Zack feedback")}>
                Send feedback
              </a>
            </div>
          </Step>
        </ol>
      </section>
    </>
  );
}

function Step({
  n,
  title,
  optional,
  last,
  children,
}: {
  n: number;
  title: string;
  optional?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)] gap-4 py-10 md:grid-cols-[6rem_minmax(0,1fr)] md:gap-8 md:py-14 ${
        last ? "" : "border-b hairline"
      }`}
    >
      <span aria-hidden="true" className="text-h2 text-accent">
        {String(n).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <h2 className="text-h3">
          <span className="sr-only">Step {n}: </span>
          {title}
          {optional && (
            <span className="ml-3 inline-block translate-y-[-0.3em] rounded-full border border-rule-strong px-2.5 py-0.5 align-middle text-meta font-[560] tracking-normal text-ink-2">
              Optional
            </span>
          )}
        </h2>
        {children}
      </div>
    </li>
  );
}
