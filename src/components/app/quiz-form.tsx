"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { submitQuiz, type StartFormState } from "@/app/start/actions";
import type { StartParams } from "@/lib/signup/params";

const idle: StartFormState = { status: "idle" };

type Option = { value: string; label: string };

/**
 * The six-question sign-up quiz (spec B.4), on one screen. Every question is
 * a real fieldset with a visible legend; errors show inline under the
 * question and are announced.
 */
export function QuizForm({ params, agents, categories }: { params: StartParams; agents: Option[]; categories: readonly string[] }) {
  const [state, action, pending] = useActionState(submitQuiz, idle);
  const [agent, setAgent] = useState("");
  const e = state.errors ?? {};
  const id = useId();

  return (
    <form action={action} className="mt-10 space-y-10" noValidate>
      {(["path", "cur", "ref", "zack", "utm"] as const).map((k) => (
        <input key={k} type="hidden" name={k} value={params[k] ?? ""} />
      ))}

      <Question n={1} legend="What do you do?" error={e.work ?? e.role}>
        <Radios
          name="work"
          defaultValue={params.path === "re" ? "real_estate" : undefined}
          options={[
            { value: "real_estate", label: "I work in real estate" },
            { value: "other", label: "Something else" },
          ]}
        />
        <label htmlFor={`${id}-role`} className="mt-4 block text-small font-[560]">
          Your role and kind of business, in one line
        </label>
        <input id={`${id}-role`} name="role" maxLength={120} placeholder="e.g. Broker, residential resale" className={field} />
      </Question>

      <Question n={2} legend="Do you use AI agents for work today?" error={e.uses}>
        <Radios
          name="uses"
          options={[
            { value: "not_yet", label: "Not yet" },
            { value: "most_weeks", label: "Most weeks" },
            { value: "every_day", label: "Every day" },
          ]}
        />
      </Question>

      <Question n={3} legend="Which AI agent do you use, or plan to?" error={e.agent ?? e.agentOther}>
        <Radios
          name="agent"
          onChange={setAgent}
          options={[...agents, { value: "other", label: "Another one" }, { value: "not_sure", label: "Not sure yet" }]}
        />
        {agent === "other" && (
          <>
            <label htmlFor={`${id}-other`} className="mt-4 block text-small font-[560]">
              Which one?
            </label>
            <input id={`${id}-other`} name="agentOther" maxLength={60} className={field} />
          </>
        )}
      </Question>

      <Question n={4} legend="How many agents, bots or scheduled routines do you run?" error={e.count}>
        <Radios
          name="count"
          options={[
            { value: "none", label: "None" },
            { value: "1-2", label: "1 or 2" },
            { value: "3-5", label: "3 to 5" },
            { value: "6+", label: "6 or more" },
          ]}
        />
      </Question>

      <Question n={5} legend="What do you most want help with?" hint="Choose any.">
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c} className={choice}>
              <input type="checkbox" name="help" value={c} className="size-4 accent-accent" />
              {c}
            </label>
          ))}
        </div>
      </Question>

      <Question n={6} legend="How do you feel about trying new software for work?" error={e.software}>
        <Radios
          name="software"
          options={[
            { value: "avoid", label: "I avoid it" },
            { value: "if_shown", label: "I’ll try it if someone shows me" },
            { value: "often", label: "I try new tools often" },
          ]}
        />
      </Question>

      {state.status === "error" && state.message && (
        <p role="alert" className="text-small text-error">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn btn-l" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

const field = "mt-2 w-full rounded-[8px] border border-rule-strong bg-surface px-4 py-3 text-body";
const choice =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-[8px] border border-rule bg-surface px-4 py-2 text-small has-[:checked]:border-accent has-[:checked]:bg-accent-wash";

function Question({ n, legend, hint, error, children }: { n: number; legend: string; hint?: string; error?: string; children: ReactNode }) {
  const errId = `q${n}-err`;
  return (
    <fieldset aria-describedby={error ? errId : undefined} aria-invalid={error ? true : undefined}>
      <legend className="text-title">
        <span className="tabular mr-2 text-ink-2">{n}.</span>
        {legend}
      </legend>
      {hint && <p className="mt-1 text-small text-ink-2">{hint}</p>}
      <div className="mt-4">{children}</div>
      {error && (
        <p id={errId} role="alert" className="mt-2 text-small text-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function Radios({ name, options, defaultValue, onChange }: { name: string; options: Option[]; defaultValue?: string; onChange?: (v: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.value} className={choice}>
          <input
            type="radio"
            name={name}
            value={o.value}
            defaultChecked={o.value === defaultValue}
            onChange={() => onChange?.(o.value)}
            className="size-4 accent-accent"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
