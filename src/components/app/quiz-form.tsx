"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { QuizAnswers } from "@/lib/signup/quiz";
import { submitQuiz, type StartFormState } from "@/app/start/actions";
import type { StartParams } from "@/lib/signup/params";
import { LEVEL_QUIZ_VERSION, rogerLevels } from "@/data/roger-levels";

const idle: StartFormState = { status: "idle" };

type Option = { value: string; label: string };

/**
 * The seven-question sign-up quiz (spec B.4), one question per screen with a
 * progress bar. Every question stays in the form (only the current one is
 * shown), so Back loses nothing and one submit sends every answer. Next checks
 * the current question; a missing answer the server finds opens that question.
 * Every question is a real fieldset with a visible legend; errors show inline
 * and are announced.
 */
/** `initial`: the answers already given (coming back from Step 2), so nothing has to be typed again. */
export function QuizForm({ params, agents, categories, initial }: { params: StartParams; agents: Option[]; categories: readonly string[]; initial?: QuizAnswers | null }) {
  const [state, action, pending] = useActionState(submitQuiz, idle);
  // Question 3: ticked agents in the order they were ticked, and the one picked as primary.
  const [ticked, setTicked] = useState<string[]>(initial?.agents ?? []);
  const [chosen, setChosen] = useState<string | null>(initial?.primary || null);
  const primary = chosen && ticked.includes(chosen) ? chosen : (ticked.find((v) => v !== "not_sure") ?? "");
  const toggle = (v: string, on: boolean) => setTicked((t) => (on ? [...t.filter((x) => x !== v), v] : t.filter((x) => x !== v)));
  const agentOptions = [...agents, { value: "other", label: "Another one" }, { value: "not_sure", label: "Not sure yet" }];
  const id = useId();
  // Question 5 is pre-selected only for an answer given on this levels list; an older
  // answer (levels v1.0, no marker) is asked again.
  const levelAnswer = initial?.levelQuiz === LEVEL_QUIZ_VERSION ? initial.level : undefined;
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const e = errors;
  const last = QUESTIONS.length - 1;

  // The server's answer: open the first question it says is missing.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const errs = state.errors ?? {};
    setErrors(errs);
    const first = QUESTIONS.findIndex((keys) => keys.some((k) => errs[k]));
    if (first >= 0) setStep(first);
  }

  // A new question takes focus, so keyboard and screen-reader users land on it.
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    const q = formRef.current?.querySelector<HTMLElement>(`[data-q="${step}"]`);
    q?.focus({ preventScroll: true });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [step]);

  /** Checks one question in the browser, with the server's own messages. */
  function check(i: number): Record<string, string> {
    const f = formRef.current;
    if (!f) return {};
    const val = (n: string) => ((f.elements.namedItem(n) as RadioNodeList | HTMLInputElement | null)?.value ?? "").trim();
    const out: Record<string, string> = {};
    if (i === 0) {
      if (!val("work")) out.work = "Choose one.";
      else if (val("role").length < 2) out.role = "Tell us your role and kind of business, in a few words.";
    }
    if (i === 1 && !val("uses")) out.uses = "Choose one.";
    if (i === 2) {
      if (!ticked.length) out.agent = "Choose at least one.";
      else if (ticked.includes("other") && !val("agentOther")) out.agentOther = "Which AI agent?";
    }
    if (i === 3 && !val("count")) out.count = "Choose one.";
    if (i === 4 && !val("level")) out.level = "Choose the one closest to you.";
    if (i === 6 && !val("software")) out.software = "Choose one.";
    return out;
  }

  /** Shows a question's problems, or clears them; true when it is answered. */
  function settle(i: number): boolean {
    const found = check(i);
    setErrors((prev) => {
      const next = { ...prev };
      for (const k of QUESTIONS[i]) delete next[k];
      return { ...next, ...found };
    });
    return Object.keys(found).length === 0;
  }

  function go(to: number) {
    moved.current = true;
    setStep(Math.max(0, Math.min(last, to)));
  }

  const next = () => {
    if (settle(step)) go(step + 1);
  };

  return (
    <form
      action={action}
      // Submitted by hand so React doesn't clear the form when an answer is missing:
      // everything typed and ticked stays, and the missing answers are marked.
      onSubmit={(ev) => {
        ev.preventDefault();
        // Enter in an earlier question means "next", not "send".
        if (step < last) return next();
        if (!settle(step)) return;
        const fd = new FormData(ev.currentTarget);
        startTransition(() => action(fd));
      }}
      ref={formRef}
      className="mt-10"
      noValidate
    >
      <Progress step={step} total={QUESTIONS.length} />

      {(["path", "cur", "ref", "zack", "utm"] as const).map((k) => (
        <input key={k} type="hidden" name={k} value={params[k] ?? ""} />
      ))}

      <Question n={1} at={step} legend="What do you do?" error={e.work ?? e.role}>
        <Radios
          name="work"
          defaultValue={initial?.work ?? (params.path === "re" ? "real_estate" : undefined)}
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
          defaultValue={initial?.role}
          className={field}
          // Typing a role with neither choice made means "Something else"; a choice already made is left alone.
          onChange={(ev) => {
            const work = ev.currentTarget.form?.elements.namedItem("work") as RadioNodeList | null;
            if (work && !work.value && ev.currentTarget.value.trim()) work.value = "other";
          }}
        />
      </Question>

      <Question n={2} at={step} legend="Do you use AI agents for work today?" error={e.uses}>
        <Radios
          name="uses"
          defaultValue={initial?.uses}
          options={[
            { value: "not_yet", label: "Not yet" },
            { value: "most_weeks", label: "Most weeks" },
            { value: "every_day", label: "Every day" },
          ]}
        />
      </Question>

      <Question
        n={3}
        at={step}
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
                  <input type="checkbox" name="agent" value={o.value} defaultChecked={isTicked} onChange={(ev) => toggle(o.value, ev.currentTarget.checked)} className="size-4 accent-accent" />
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
            <input id={`${id}-other`} name="agentOther" maxLength={60} defaultValue={initial?.agentOther} className={field} />
          </>
        )}
      </Question>

      <Question n={4} at={step} legend="How many agents, bots or scheduled routines do you run?" error={e.count}>
        <Radios
          name="count"
          defaultValue={initial?.count}
          options={[
            { value: "none", label: "None" },
            { value: "1-2", label: "1 or 2" },
            { value: "3-5", label: "3 to 5" },
            { value: "6+", label: "6 or more" },
          ]}
        />
      </Question>

      <Question n={5} at={step} legend="Which level sounds most like you today?" hint="Pick the one that matches how you work most weeks." error={e.level}>
        <div className="grid gap-2">
          {rogerLevels.map((l) => {
            const up = rogerLevels.find((x) => x.level === l.level + 1);
            const lid = `${id}-level-${l.level}`;
            return (
              <label key={l.level} className={`${choice} items-start py-3`}>
                <input
                  type="radio"
                  name="level"
                  value={l.level}
                  defaultChecked={levelAnswer === l.level}
                  aria-labelledby={`${lid}-name`}
                  aria-describedby={up?.symptom ? `${lid}-does ${lid}-next` : `${lid}-does`}
                  className="mt-1 size-4 shrink-0 accent-accent"
                />
                <span>
                  <span id={`${lid}-name`} className="block font-[560] text-ink">
                    <span className="tabular">Level {l.level}</span> · {l.name}
                  </span>
                  <span id={`${lid}-does`} className="block text-ink-2">
                    {l.does}
                  </span>
                  {/* The next level's symptom ("you need it when…"): what would move them up. */}
                  {up?.symptom && (
                    <span id={`${lid}-next`} className="mt-1 block text-meta text-ink-2">
                      Next: <span className="tabular">Level {up.level}</span> when {lowerFirst(up.symptom)}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </Question>

      <Question n={6} at={step} legend="What do you most want help with?" hint="Choose any.">
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c} className={choice}>
              <input type="checkbox" name="help" value={c} defaultChecked={initial?.help.includes(c as (typeof initial.help)[number])} className="size-4 accent-accent" />
              {c}
            </label>
          ))}
        </div>
      </Question>

      <Question n={7} at={step} legend="How do you feel about trying new software for work?" error={e.software}>
        <Radios
          name="software"
          defaultValue={initial?.software}
          options={[
            { value: "avoid", label: "I avoid it" },
            { value: "if_shown", label: "I’ll try it if someone shows me" },
            { value: "often", label: "I try new tools often" },
          ]}
        />
      </Question>

      {state.status === "error" && state.message && !Object.keys(e).length && (
        <p role="alert" className="mt-6 text-small text-error">
          {state.message}
        </p>
      )}
      <div className="mt-10 flex items-center gap-6">
        {step < last ? (
          <button type="button" onClick={next} className="btn btn-l">
            Next
          </button>
        ) : (
          <button type="submit" className="btn btn-l" disabled={pending}>
            {pending ? "Saving…" : "Continue"}
          </button>
        )}
        {step > 0 && (
          <button type="button" onClick={() => go(step - 1)} className="min-h-12 px-1 text-body text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            Back
          </button>
        )}
      </div>
    </form>
  );
}

/** "You re-explain…" reads as "when you re-explain…". Every v1.1 symptom starts with an ordinary word. */
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

const field = "mt-2 w-full rounded-[8px] border border-rule-strong bg-surface px-4 py-3 text-body";
const choice =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-[8px] border border-rule bg-surface px-4 py-2 text-small has-[:checked]:border-accent has-[:checked]:bg-accent-wash";

/** The form fields behind each question, in order: which errors open which question. */
const QUESTIONS: readonly (readonly string[])[] = [["work", "role"], ["uses"], ["agent", "agentOther"], ["count"], ["level"], ["help"], ["software"]];

function Progress({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step + 1) / total) * 100);
  return (
    <div className="mb-8">
      <p className="tabular text-small text-ink-2">
        Question {step + 1} of {total}
      </p>
      <div
        role="progressbar"
        aria-label="Questions"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step + 1}
        aria-valuetext={`Question ${step + 1} of ${total}`}
        className="mt-2 h-2 overflow-hidden rounded-full bg-rule"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** One question. Only the current one is shown; the others stay in the form so their answers are sent. */
function Question({ n, at, legend, hint, error, children }: { n: number; at: number; legend: string; hint?: string; error?: string; children: ReactNode }) {
  const errId = `q${n}-err`;
  return (
    <fieldset
      data-q={n - 1}
      tabIndex={-1}
      hidden={at !== n - 1}
      aria-describedby={error ? errId : undefined}
      aria-invalid={error ? true : undefined}
      className="outline-none"
    >
      <legend className="text-title">{legend}</legend>
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
