import Link from "next/link";

/** The four sign-up steps, in order (spec B.4; plan 2026-11-26-001 made Payment the fourth, at the first list). */
export const SIGNUP_STEPS = ["Questions", "Your account", "Product and Pricing", "Payment"] as const;

/**
 * The top of every sign-up step: a way back where going back is possible,
 * "Step N of 4" with the step's name, a progress bar, and the four steps
 * named in order, the ones already done ticked. Earlier steps are links only
 * where they can still be changed (the questions, until the account exists).
 */
export function SignupSteps({
  current,
  back,
  links = {},
}: {
  current: 1 | 2 | 3 | 4;
  /** A link back, shown above the step (e.g. Step 2 back to the questions, Step 4 back to the first list). */
  back?: { href: string; label: string };
  /** Earlier steps that can be opened again, by step number. */
  links?: Partial<Record<1 | 2 | 3, string>>;
}) {
  const pct = Math.round((current / SIGNUP_STEPS.length) * 100);
  return (
    <nav aria-label="Sign-up steps" className="mb-10">
      {back && (
        <p className="mb-6">
          <Link href={back.href} className="tlink-quiet inline-flex min-h-11 items-center gap-1 text-small">
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        </p>
      )}
      <p className="text-meta font-semibold uppercase tracking-wider text-ink-2">
        Step {current} of {SIGNUP_STEPS.length}
      </p>
      <div
        role="progressbar"
        aria-label="Sign-up progress"
        aria-valuemin={0}
        aria-valuemax={SIGNUP_STEPS.length}
        aria-valuenow={current}
        aria-valuetext={`Step ${current} of ${SIGNUP_STEPS.length}: ${SIGNUP_STEPS[current - 1]}`}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-ground-2"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-2 text-meta">
        {SIGNUP_STEPS.map((name, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          const done = n < current;
          const here = n === current;
          const href = done ? links[n as 1 | 2 | 3] : undefined;
          const label = (
            <>
              <span aria-hidden="true">{done ? "✓ " : ""}</span>
              {name}
              {done && <span className="sr-only"> (done)</span>}
            </>
          );
          return (
            <li key={name} aria-current={here ? "step" : undefined} className={here ? "font-semibold text-ink" : "text-ink-2"}>
              {href ? (
                <Link href={href} className="tlink-quiet">
                  {label}
                </Link>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
