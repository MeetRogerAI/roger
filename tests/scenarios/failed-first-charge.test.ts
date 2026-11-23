import { beforeEach, describe, expect, it, vi } from "vitest";
import { delivered, newWorld, passHours, seedPool, signUp, toronto, userRow, weeksWithRuns, type Member, type World } from "./helpers";

vi.mock("@/lib/secrets", () => ({ getSecret: async () => "test-key" }));

/**
 * A failed first charge (spec B.9; checks 19, 22): the third list is held,
 * the card is retried on days 1, 3 and 7 by the hourly pass, a success sends
 * the held list at once, and seven days of failure close the trial with no
 * charge. A hard decline is not retried and still closes on day 7.
 */
let w: World;
let m: Member;
const THIRD = "2026-12-21";

beforeEach(async () => {
  w = await newWorld({ start: "2026-11-30T15:00:00Z" });
  await seedPool(w, { contributors: 6, playsEach: 3, ranOn: "2026-11-26" });
  await w.at("2026-12-02T16:00:00Z");
  m = await signUp(w, { email: "dana@example.ca", currency: "CAD", country: "CA" });
  await weeksWithRuns(w, [m], ["2026-12-07", "2026-12-14"]);
  expect((await userRow(w, m.id)).free_lists_used).toBe(2);
});

const declines = () => w.mail(m.email).filter((x) => x.subject === "Your card didn’t go through");
const keys = () => w.stripe.callsTo("subscriptions.create").map((c) => String(c.args.idempotencyKey).split(":")[2]);

describe("a failed first charge", () => {
  it("holds the third list, retries on day 1 and day 3, and sends the list the moment the day-3 retry succeeds", async () => {
    w.stripe.script(m.customer, "soft", "soft");
    const [r] = await weeksWithRuns(w, [m], [THIRD]);
    expect(r.charge.first).toMatchObject({ declined: 1, charged: 0 });
    expect(await userRow(w, m.id)).toMatchObject({ status: "held", hold_reason: "first_charge_failed" });
    expect(await delivered(w, m.id, THIRD)).toEqual([]);
    expect(declines()).toHaveLength(1);
    expect(declines()[0].text).toContain("December 22");
    expect(declines()[0].text).toContain("December 24");

    // Day 1 (Tuesday 6:00 AM): the hourly pass tries again; declined again.
    await passHours(w, toronto("2026-12-22", "07:05"));
    expect(keys()).toEqual(["1", "2"]);
    expect(await userRow(w, m.id)).toMatchObject({ status: "held" });
    expect(declines()).toHaveLength(2);
    expect(await delivered(w, m.id, THIRD)).toEqual([]);

    // Day 3: the retry succeeds; the held list goes out in the same pass, once.
    await passHours(w, toronto("2026-12-24", "07:05"));
    expect(keys()).toEqual(["1", "2", "3"]);
    expect(await userRow(w, m.id)).toMatchObject({ status: "active", hold_reason: null });
    expect(await delivered(w, m.id, THIRD)).toHaveLength(3);
    expect(w.subjects(m.email).filter((s) => s === "You’re subscribed")).toHaveLength(1);
    expect(w.subjects(m.email).filter((s) => s.includes("December 21"))).toHaveLength(1);
    expect(w.stripe.subs.size).toBe(1);

    // Nothing more happens on day 7.
    await passHours(w, toronto("2026-12-28", "08:05"), 3);
    expect(keys()).toEqual(["1", "2", "3"]);
    expect(w.subjects(m.email).filter((s) => s.includes("December 21"))).toHaveLength(1);
  });

  it("closes the trial on day 7 with no charge when every retry fails, and never sends the held list", async () => {
    w.stripe.script(m.customer, "soft", "soft", "soft", "soft");
    await weeksWithRuns(w, [m], [THIRD]);
    await passHours(w, toronto("2026-12-28", "05:05"), 2);
    expect(keys()).toEqual(["1", "2", "3"]);
    expect(await userRow(w, m.id)).toMatchObject({ status: "held" });

    // Day 7, 6:00 AM: the last attempt fails and the same pass closes the trial.
    await passHours(w, toronto("2026-12-28", "08:05"));
    expect(keys()).toEqual(["1", "2", "3", "4"]);
    const u = await userRow(w, m.id);
    expect(u).toMatchObject({ status: "closed", free_lists_used: 2 });
    expect(u.access_ends_at).not.toBeNull();
    expect(w.subjects(m.email).filter((s) => s === "Your Roger trial has closed")).toHaveLength(1);
    expect(declines()).toHaveLength(4);
    expect(w.stripe.subs.size).toBe(0);
    expect(w.stripe.invoicesFor(m.customer)).toEqual([]);
    expect(await delivered(w, m.id, THIRD)).toEqual([]);

    // Closed stays closed: no list next Monday, nothing charged, no second closing email.
    await weeksWithRuns(w, [], ["2027-01-04"]);
    expect(keys()).toHaveLength(4);
    expect(w.subjects(m.email).filter((s) => s === "Your Roger trial has closed")).toHaveLength(1);
  });

  it("does not retry a hard decline, and still closes on day 7", async () => {
    w.stripe.script(m.customer, "hard");
    await weeksWithRuns(w, [m], [THIRD]);
    expect(declines()[0].text).toContain("won’t try it again");
    await passHours(w, toronto("2026-12-28", "08:05"), 3);
    expect(keys()).toEqual(["1"]);
    expect(await userRow(w, m.id)).toMatchObject({ status: "closed" });
    expect(w.stripe.subs.size).toBe(0);
  });
});
