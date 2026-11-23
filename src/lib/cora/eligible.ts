/**
 * The one definition of an eligible play for a user (spec B.7 pick rule 1,
 * with Cora 2.0 changes 8 and 12). Picking and the admin count both use it.
 * The sets are built upstream from the database; this only decides.
 */
export type UserContext = {
  /** Pool plays the user already runs: their plays and "also runs" from the last four weeks, and jobs in their profile's Setup. */
  alreadyRuns: Set<string>;
  /** Pool plays that came from the user's own contributions, or from the seed contributor linked to them (R25). */
  ownContributions: Set<string>;
  /** Pool plays already sent to the user as ideas. */
  sent: Set<string>;
  /** Past ideas the user removed or skipped: never sent again. */
  declined: Set<string>;
  /** Sent ideas that could not be installed for something the user's setup now has: may be sent again (Cora 2.0 change 12). */
  resendable?: Set<string>;
};

export type Candidate = { id: string; retired: boolean };

export type Why = "retired" | "already_runs" | "own_contribution" | "already_sent" | "declined";

export function whyNot(play: Candidate, u: UserContext): Why | null {
  if (play.retired) return "retired";
  if (u.ownContributions.has(play.id)) return "own_contribution";
  if (u.alreadyRuns.has(play.id)) return "already_runs";
  if (u.declined.has(play.id)) return "declined";
  if (u.sent.has(play.id) && !u.resendable?.has(play.id)) return "already_sent";
  return null;
}

export function isEligible(play: Candidate, u: UserContext): boolean {
  return whyNot(play, u) === null;
}

export function eligiblePlays<T extends Candidate>(plays: T[], u: UserContext): T[] {
  return plays.filter((p) => isEligible(p, u));
}
