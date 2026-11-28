import { HELD_BUTTON, heldHeading } from "@/lib/app/held";
import { renderEmail, type Rendered } from "../layout";
import { longDate } from "@/lib/dates";

/**
 * "Your ideas are waiting" (plan 2026-11-26-001, Unit 7; origin R11): days 2
 * and 7 after a no-card trial's first teaser. Titles only, like the teaser
 * (`held.ts`): this template is given nothing else, so it can show no reason,
 * score or step. `closesOn` is the Toronto date the trial closes if no card
 * is added. Drafted copy, for S18 sign-off.
 */
export function heldReminderEmail(o: { week: string; titles: string[]; closesOn: string; paymentUrl: string }): Rendered {
  return renderEmail({
    subject: "Your ideas are waiting",
    preview: o.titles.join(" · ").slice(0, 120),
    heading: "Your ideas are waiting",
    paragraphs: [
      `${heldHeading(o.titles.length)}. Cora picked ${o.titles.length === 1 ? "this idea" : "these ideas"} for you for the week of ${longDate(o.week)}:`,
      ...o.titles.map((t, n) => `${n + 1}. ${t}`),
      "Add your card to see why each one fits you and how to set it up. Your first two Cora Curations are free, and nothing is charged today.",
      `If no card is added by ${longDate(o.closesOn)}, your trial closes. Nothing is charged either way.`,
    ],
    button: { label: HELD_BUTTON, url: o.paymentUrl },
  });
}
