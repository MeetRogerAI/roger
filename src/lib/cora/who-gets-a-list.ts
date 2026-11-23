/**
 * Who gets a list each Monday (spec B.7 table). The table mixes two moments:
 * picking at the 1:00 AM cutoff, and sending at 7:00 AM after the 6:00 AM
 * charge. `phase` says which is being decided. Nothing here touches money.
 */
export type ListFacts = {
  status: "signup" | "trial" | "active" | "held" | "cancelled" | "closed";
  plan: "monthly" | "per_run";
  sponsored: boolean;
  sharing: "share" | "match_only" | "off";
  /** This week's run arrived by the cutoff (not a test run). */
  runArrived: boolean;
  /** One at a time: an order for this Monday exists. */
  ordered: boolean;
  /** One at a time: this week's charge succeeded. Known only at send time. */
  charged: boolean;
  /** Cancelled: the paid month has ended. */
  accessEnded: boolean;
};

export type ListDecision = { gets: boolean; why: string };

export function whoGetsAList(f: ListFacts, phase: "pick" | "send"): ListDecision {
  if (f.status === "held") return { gets: false, why: "payment held" };
  if (f.status === "closed" || f.status === "signup") return { gets: false, why: f.status === "closed" ? "closed" : "not signed up" };
  if (f.status === "cancelled" && f.accessEnded) return { gets: false, why: "cancelled and past the paid month" };
  if (f.sponsored) return { gets: true, why: "sponsored: every Monday" };
  if (f.status === "trial") {
    if (f.sharing === "off") return { gets: true, why: "trial, Zack off: matched from the profile" };
    return f.runArrived ? { gets: true, why: "trial, run arrived" } : { gets: false, why: "trial, no run this week (a free list is not used)" };
  }
  // Active, or cancelled within the paid month.
  if (f.plan === "monthly") return { gets: true, why: "monthly: every Monday" };
  if (!f.ordered) return { gets: false, why: "one at a time: no order this week" };
  if (!f.runArrived) return { gets: false, why: "one at a time: ordered, but no run arrived" };
  // Picks are made at the cutoff so there is a list to charge for; it is sent only once charged.
  if (phase === "send" && !f.charged) return { gets: false, why: "one at a time: the charge did not succeed" };
  return { gets: true, why: phase === "pick" ? "one at a time: ordered and run arrived" : "one at a time: ordered, run arrived, charged" };
}
