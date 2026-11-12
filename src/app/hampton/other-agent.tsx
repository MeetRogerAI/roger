"use client";

import { useId, useState } from "react";
import { CopyButton } from "./copy-button";

const PLACEHOLDER = "[INSERT AGENT]";
const template = (agent: string) =>
  `I want you to take the Zack The Collector file, and update it so that it works for ${agent}. I then want you to create a .md file for my agent I can download and then do a test run and produce a markdown file`;

/** The prompt for porting Zack to an agent we don't list; the visitor's agent name fills the gap as they type. */
export function OtherAgentPrompt() {
  const id = useId();
  const [agent, setAgent] = useState("");
  const name = agent.trim();
  const [before, after] = template(PLACEHOLDER).split(PLACEHOLDER);

  return (
    <div className="mt-5 max-w-[48rem]">
      <label htmlFor={id} className="text-meta font-[560] text-ink-2">
        Your agent
      </label>
      <input
        id={id}
        value={agent}
        onChange={(e) => setAgent(e.target.value)}
        placeholder="e.g. ChatGPT"
        autoComplete="off"
        className="mt-1.5 block h-11 w-full max-w-[20rem] rounded-[8px] border border-rule-strong bg-surface px-3.5 text-body outline-offset-2 placeholder:text-ink-2/70"
      />
      <div className="mt-4 flex flex-col gap-4 rounded-[8px] bg-night p-5 text-night-ink sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <code className="font-mono text-small leading-relaxed">
          {before}
          <span className="text-accent-night">{name || PLACEHOLDER}</span>
          {after}
        </code>
        <CopyButton
          text={template(name || PLACEHOLDER)}
          label="Copy prompt"
          className="btn btn-m btn-light shrink-0 self-start sm:self-auto"
        />
      </div>
    </div>
  );
}
