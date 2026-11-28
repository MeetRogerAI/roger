import Link from "next/link";
import { HELD_BUTTON } from "@/lib/app/held";
import { PAYMENT_PATH } from "@/lib/app/status";

/**
 * A held list (plan 2026-11-26-001, Unit 3; origin R8): one locked card per
 * title, and the button to the Payment page. It is given the titles only, so
 * it cannot show a reason, a score or a step. The page shows the heading
 * (`heldHeading`).
 */
export function HeldIdeas({ titles }: { titles: string[] }) {
  return (
    <div className="space-y-6">
      <ul className="grid gap-4" aria-label="Your ideas, locked until your card is saved">
        {titles.map((t, n) => (
          <li key={`${n}-${t}`} className="rounded-[8px] border border-rule bg-surface p-5 sm:p-6">
            <span className="flex items-start justify-between gap-4">
              <span className="text-title">{t}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" className="mt-1 shrink-0 text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <span className="mt-3 block text-small text-ink-2">Why it fits you and how to set it up open once your card is saved.</span>
          </li>
        ))}
      </ul>
      <div>
        <Link href={PAYMENT_PATH} className="btn">
          {HELD_BUTTON}
        </Link>
        <p className="mt-3 text-small text-ink-2">Your first two Cora Curations are free. Nothing is charged today.</p>
      </div>
    </div>
  );
}
