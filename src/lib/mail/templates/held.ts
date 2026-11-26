import { HELD_BUTTON, heldHeading } from "@/lib/app/held";
import { renderEmail, type Rendered } from "../layout";
import { longDate } from "./welcome";

/**
 * A held list's teaser (plan 2026-11-26-001, Unit 3; origin R8): a trial with
 * no card gets the titles of Cora's list, and a button to the Payment page.
 * Titles only: this template is given nothing else, so it can show no
 * reason, score or step. Drafted copy, for S18 sign-off.
 */
export function firstListHeldEmail(o: { week: string; titles: string[]; paymentUrl: string }): Rendered {
  const heading = heldHeading(o.titles.length);
  return renderEmail({
    subject: heading,
    preview: o.titles.join(" · ").slice(0, 120),
    heading,
    paragraphs: [
      `Cora picked ${o.titles.length === 1 ? "this idea" : "these ideas"} for you for the week of ${longDate(o.week)}:`,
      ...o.titles.map((t, n) => `${n + 1}. ${t}`),
      "Add your card to see why each one fits you and how to set it up. Your first two lists are free, and nothing is charged today.",
    ],
    button: { label: HELD_BUTTON, url: o.paymentUrl },
  });
}
