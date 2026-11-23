import type { ReactNode } from "react";
import type { PublishedSetup } from "@/lib/setup-file";
import { CopyTextButton } from "./copy-text-button";

/** "Version 3, updated November 23, 2026." (spec B.11 item 2) */
export function versionLine(f: PublishedSetup): string {
  const d = new Date(f.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Toronto" });
  return `Version ${f.version}, updated ${d}.`;
}

/** One step of /getstarted: a list item with its own anchor, so the checklist can link to it. */
export function GetStartedStep({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <li id={id} className="scroll-mt-24 border-t border-rule pt-10">
      <h2 className="text-h3">{title}</h2>
      {children}
    </li>
  );
}

/**
 * The starter setup file (spec B.11 item 2). Absent when nothing is
 * published: the step is left out rather than shown empty.
 */
export function SetupStep({ file }: { file: PublishedSetup | null }) {
  if (!file) return null;
  return (
    <GetStartedStep id="starter-team" title="Set up your starter team.">
      <p className="mt-3 text-ink-2">Copy the setup file below. When your AI agent asks “What’s the first task I can help you with?”, paste it in and send it.</p>
      <div className="mt-5 rounded-[8px] border border-rule bg-surface">
        <div className="flex items-center justify-between gap-4 border-b border-rule px-4 py-3">
          <p className="text-meta text-ink-2">Starter team setup file</p>
          <CopyTextButton text={file.bodyMd} label="Copy" className="btn btn-s" />
        </div>
        <pre tabIndex={0} aria-label="The starter team setup file" className="max-h-[28rem] overflow-auto whitespace-pre-wrap p-4 text-small [overflow-wrap:anywhere]">
          {file.bodyMd}
        </pre>
      </div>
      <p className="mt-3 text-small text-ink-2">{versionLine(file)}</p>
    </GetStartedStep>
  );
}
