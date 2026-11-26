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
  /** Cancelled, or a monthly member cancelling or switching: the paid month does not cover this week. */
  accessEnded: boolean;
  /** Held: why. An unpaid renewal is still picked for; the list waits for the payment. */
  holdReason?: string | null;
  /**
   * A card is saved, or the member is sponsored (billing/has-card.ts). Only
   * the reason text reads it: a trial without a card is picked for as usual,
   * and its list is held until the card is saved.
   */
  hasCard: boolean;
};

export type ListDecision = { gets: boolean; why: string };

export function whoGetsAList(f: ListFacts, phase: "pick" | "send"): ListDecision {
  // A renewal unpaid: picked, and delivered once it is paid (the deliverable rule withholds it until then).
  if (f.status === "held" && !(phase === "pick" && f.holdReason === "renewal_unpaid")) return { gets: false, why: "payment held" };
  if (f.status === "closed" || f.status === "signup") return { gets: false, why: f.status === "closed" ? "closed" : "not signed up" };
  if (f.status === "cancelled" && f.accessEnded) return { gets: false, why: "cancelled and past the paid month" };
  if (f.status === "active" && f.plan === "monthly" && !f.sponsored && f.accessEnded) return { gets: false, why: "monthly ending before this week" };
  if (f.sponsored) return { gets: true, why: "sponsored: every Monday" };
  if (f.status === "trial") {
    const held = f.hasCard ? "" : "; no card yet, so the list is held until a card is saved";
    if (f.sharing === "off") return { gets: true, why: `trial, Zack off: matched from the profile${held}` };
    return f.runArrived ? { gets: true, why: `trial, run arrived${held}` } : { gets: false, why: "trial, no run this week (a free list is not used)" };
  }
  // Active, or cancelled within the paid month.
  if (f.plan === "monthly") return { gets: true, why: "monthly: every Monday" };
  if (!f.ordered) return { gets: false, why: "one at a time: no order this week" };
  if (!f.runArrived) return { gets: false, why: "one at a time: ordered, but no run arrived" };
  // Picks are made at the cutoff so there is a list to charge for; it is sent only once charged.
  if (phase === "send" && !f.charged) return { gets: false, why: "one at a time: the charge did not succeed" };
  return { gets: true, why: phase === "pick" ? "one at a time: ordered and run arrived" : "one at a time: ordered, run arrived, charged" };
}
