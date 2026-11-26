"use client";

import { startTransition, useActionState, useEffect, useId, useState, type ReactNode } from "react";
import { submitQuiz, type StartFormState } from "@/app/start/actions";
import type { StartParams } from "@/lib/signup/params";
import { agentLevels } from "@/data/agent-levels";

const idle: StartFormState = { status: "idle" };

type Option = { value: string; label: string };

/**
 * The seven-question sign-up quiz (spec B.4), on one screen. Every question is
 * a real fieldset with a visible legend; errors show inline under the
 * question and are announced.
 */
export function QuizForm({ params, agents, categories }: { params: StartParams; agents: Option[]; categories: readonly string[] }) {
  const [state, action, pending] = useActionState(submitQuiz, idle);
  // Question 3: ticked agents in the order they were ticked, and the one picked as primary.
  const [ticked, setTicked] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const primary = chosen && ticked.includes(chosen) ? chosen : (ticked.find((v) => v !== "not_sure") ?? "");
  const toggle = (v: string, on: boolean) => setTicked((t) => (on ? [...t.filter((x) => x !== v), v] : t.filter((x) => x !== v)));
  const agentOptions = [...agents, { value: "other", label: "Another one" }, { value: "not_sure", label: "Not sure yet" }];
  const e = state.errors ?? {};
  // Bring the first unanswered question into view.
  useEffect(() => {
    if (state.status !== "error") return;
    const first = document.querySelector<HTMLElement>("fieldset[aria-invalid]");
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state]);
  const id = useId();

  return (
    <form
      action={action}
      // Submitted by hand so React doesn't clear the form when an answer is missing:
      // everything typed and ticked stays, and the missing answers are marked.
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        startTransition(() => action(fd));
      }}
      className="mt-10 space-y-10"
      noValidate
    >
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
        <input
          id={`${id}-role`}
          name="role"
          maxLength={120}
          placeholder="e.g. Broker, residential resale"
          className={field}
          // Typing a role with neither choice made means "Something else"; a choice already made is left alone.
          onChange={(ev) => {
            const work = ev.currentTarget.form?.elements.namedItem("work") as RadioNodeList | null;
            if (work && !work.value && ev.currentTarget.value.trim()) work.value = "other";
          }}
        />
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

      <Question
        n={3}
        legend="Which AI agents do you use, or plan to?"
        hint="Choose any. The star marks your primary agent, the one Roger sets you up with first."
        error={e.agent ?? e.agentOther}
      >
        <input type="hidden" name="primary" value={primary} />
        <div className="grid gap-2 sm:grid-cols-2">
          {agentOptions.map((o) => {
            const isTicked = ticked.includes(o.value);
            const canLead = isTicked && o.value !== "not_sure";
            return (
              <div key={o.value} className={`${choice} justify-between`}>
                <label className="flex min-h-10 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" name="agent" value={o.value} onChange={(ev) => toggle(o.value, ev.currentTarget.checked)} className="size-4 accent-accent" />
                  {o.label}
                </label>
                {canLead &&
                  (o.value === primary ? (
                    <span className="flex items-center gap-1 text-small font-[560] text-accent">
                      <Star filled />
                      Primary
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setChosen(o.value)}
                      className="flex min-h-10 items-center gap-1 rounded-full px-2 text-small text-ink-2 hover:text-ink"
                      aria-label={`Make ${o.label} your primary agent`}
                    >
                      <Star />
                      Make primary
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
        {ticked.includes("other") && (
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

      <Question n={5} legend="Which level sounds most like you today?" hint="Pick the one that matches how you work most weeks." error={e.level}>
        <div className="grid gap-2">
          {agentLevels.map((l) => (
            <label key={l.level} className={`${choice} items-start py-3`}>
              <input type="radio" name="level" value={l.level} className="mt-1 size-4 shrink-0 accent-accent" />
              <span>
                <span className="block font-[560] text-ink">
                  <span className="tabular">Level {l.level}</span> · {l.name}
                </span>
                <span className="block text-ink-2">{l.does}</span>
                <span className="mt-1 block text-ink-2">Your role: {l.role}</span>
              </span>
            </label>
          ))}
        </div>
      </Question>

      <Question n={6} legend="What do you most want help with?" hint="Choose any.">
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c} className={choice}>
              <input type="checkbox" name="help" value={c} className="size-4 accent-accent" />
              {c}
            </label>
          ))}
        </div>
      </Question>

      <Question n={7} legend="How do you feel about trying new software for work?" error={e.software}>
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
    <fieldset
      aria-describedby={error ? errId : undefined}
      aria-invalid={error ? true : undefined}
      className={error ? "rounded-[8px] outline outline-2 outline-offset-[10px] outline-error" : undefined}
    >
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

function Radios({ name, options, defaultValue }: { name: string; options: Option[]; defaultValue?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o.value} className={choice}>
          <input
            type="radio"
            name={name}
            value={o.value}
            defaultChecked={o.value === defaultValue}
            className="size-4 accent-accent"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function Star({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M10 2.5l2.3 4.7 5.2.8-3.8 3.7.9 5.1L10 14.4l-4.6 2.4.9-5.1-3.8-3.7 5.2-.8z" />
    </svg>
  );
}
