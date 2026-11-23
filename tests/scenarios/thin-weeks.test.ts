import { beforeEach, describe, expect, it, vi } from "vitest";
import { linkContributor } from "@/lib/admin/users";
import { addDays } from "@/lib/clock";
import { afterFreeLists, delivered, monday, newWorld, order, outcome, play, seedPool, sendRun, signUp, subscribed, toronto, userRow, type Member, type World } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * Thin weeks (R13 to R15): a pool with only two plays gives every member a
 * short list, which is still a delivered list (a free list used, the
 * third-list charge made, an order charged in full); the week after, nothing
 * is left that fits, so no list, no charge, no free list used, a note, and an
 * alert. Members' own runs carry a link in every playbook, so intake flags
 * them and nothing new reaches the pool; a flagged run still counts as
 * arrived (spec B.6 rule 6).
 */
let w: World;
let trial: Member; // monthly plan, on free lists
let third: Member; // monthly plan, both free lists used, told the amount
let movedOn: Member; // monthly plan, both free lists used, linked to the seed contributor: nothing fits on their first-charge Monday
let paying: Member; // monthly subscriber
let single: Member; // one at a time, both free lists used, with an order
const A = "2026-12-07";
const B = "2026-12-14";

beforeEach(async () => {
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  const [seed] = await seedPool(w, { contributors: 1, playsEach: 2, ranOn: "2026-11-26" });
  await w.at("2026-12-02T16:00:00Z");
  const us = { currency: "USD" as const, country: "US" as const };
  trial = await signUp(w, { email: "tia@example.com", ...us });
  third = await signUp(w, { email: "theo@example.com", ...us });
  movedOn = await signUp(w, { email: "max@example.com", ...us });
  paying = await signUp(w, { email: "pat@example.com", ...us });
  single = await signUp(w, { email: "sol@example.com", ...us, plan: "per_run" });
  await afterFreeLists(w, third, { told: true });
  await afterFreeLists(w, movedOn, { told: true });
  await afterFreeLists(w, single);
  await subscribed(w, paying);
  expect((await linkContributor(w.query, "peter@example.com", seed.contributorId, movedOn.id)).ok).toBe(true);
});

/** Saturday's order, Sunday's runs (flagged: a link in each playbook), then the Monday. */
async function week(monday_: string) {
  await w.at(toronto(addDays(monday_, -2), "12:00"));
  expect(await order(w, single, monday_)).toEqual({ ok: true });
  await w.at(toronto(addDays(monday_, -1), "15:00"));
  for (const m of [trial, third, movedOn, single]) await sendRun(w, m, [play(undefined, { link: true })]);
  return monday(w, monday_);
}
const subjectsFor = (m: Member) => w.subjects(m.email);
const admins = () => w.sent.filter((x) => x.subject.startsWith("[Roger]"));

describe("thin weeks", () => {
  it("sends a short list as a full list, then no list when nothing fits, with the right note for each member", async () => {
    // Week A: two plays in the pool. Every member but the linked one gets both, as a short list.
    const a = await week(A);
    expect(await w.query(`select status from runs where user_id is not null group by status`)).toEqual([{ status: "flagged" }]);
    for (const m of [trial, third, paying, single]) {
      expect(await outcome(w, m.id, A)).toBe("short");
      expect(await delivered(w, m.id, A)).toHaveLength(2);
      const email = w.mail(m.email).find((x) => x.subject.startsWith("Your two ideas") || x.subject === "Your list, and your receipt")!;
      expect(email.text).toContain("not three");
    }
    // R14: a short list uses a free list, triggers the third-list charge, and an order is charged the full list price.
    expect((await userRow(w, trial.id)).free_lists_used).toBe(1);
    expect(a.charge.first).toMatchObject({ charged: 1 });
    expect(await userRow(w, third.id)).toMatchObject({ status: "active" });
    expect(a.charge.orders).toMatchObject({ charged: 1 });
    expect(w.stripe.invoicesFor(single.customer)[0]).toMatchObject({ status: "paid", totalCents: 10000 });
    // R25: the member linked to the seed contributor is never picked its plays; nothing fits, so the first charge moves.
    expect(await outcome(w, movedOn.id, A)).toBe("none");
    expect(await delivered(w, movedOn.id, A)).toEqual([]);
    expect(subjectsFor(movedOn)).toContain("Your first charge moved");
    expect(w.stripe.callsTo("subscriptions.create").map((c) => c.args.customer)).not.toContain(movedOn.customer);

    // Week B: nothing new fits anyone.
    const invoicesBefore = w.stripe.invoiceList.length;
    const b = await week(B);
    for (const m of [trial, paying, single, third]) {
      expect(await outcome(w, m.id, B)).toBe("none");
      expect(await delivered(w, m.id, B)).toEqual([]);
    }
    expect(b.charge.orders).toMatchObject({ no_plays: 1, charged: 0 });
    expect(w.stripe.invoiceList.length).toBe(invoicesBefore);

    // Trial on free lists: a note, and the free list is not used.
    expect((await userRow(w, trial.id)).free_lists_used).toBe(1);
    const trialNote = w.mail(trial.email).find((x) => x.subject === "No new ideas for you this week")!;
    expect(trialNote.text).toContain("doesn’t use one of your free lists");
    // Paying monthly: a note that never mentions charges, an alert, and the week is excused, never a miss (R15).
    const payingNote = w.mail(paying.email).find((x) => x.subject === "No new ideas for you this week")!;
    expect(payingNote.text).not.toMatch(/not charged|no charge|nothing was charged/i);
    const alert = admins().filter((x) => x.subject === "[Roger] A paying member had no eligible ideas" && x.text.includes(paying.id));
    expect(alert.map((x) => x.to.split(",").sort())).toEqual([["ehab@example.com", "peter@example.com"]]);
    expect(await w.query(`select result, excused_by from contribution_weeks where user_id = $1 and week_of = $2`, [paying.id, B])).toEqual([{ result: "excused", excused_by: "roger" }]);
    // One at a time: the order is closed with no charge and an email saying why; it does not carry over.
    const why = w.mail(single.email).filter((x) => x.subject === "No list this week, and no charge");
    expect(why).toHaveLength(1);
    expect(why[0].text).toContain("weren’t enough new ideas");
    expect(await w.query(`select status from orders where user_id = $1 order by week_of`, [single.id])).toEqual([{ status: "sent" }, { status: "no_run" }]);
  });

  // R15 says both admins are alerted whenever a member has no eligible plays. As built, only a paying monthly member
  // raises an alert (src/lib/cora/send-job.ts:166, `if (paying)`); a trial or one-at-a-time member with none raises nothing.
  // Kept as a known failure until the owner decides whether R15 or the build is right.
  it.fails("alerts both admins for a trial member with no eligible plays too (R15)", async () => {
    await week(A);
    await week(B);
    expect(await outcome(w, trial.id, B)).toBe("none");
    const alerts = admins().filter((x) => x.text.includes(trial.id));
    expect(alerts.map((x) => x.to.split(",").sort())).toEqual([["ehab@example.com", "peter@example.com"]]);
  });
});
