import { byRank, personalScore, type Scored } from "./score";

/**
 * Picking a user's three (spec B.7 rules 2 to 4, Cora 2.0 changes 9 and 10).
 * Fit is decided upstream (a model, or the quiz profile); everything here is
 * arithmetic and order, the same on every run.
 */
export type Fitted = {
  play: Scored;
  /** 5, 3 or 1. */
  fit: 1 | 3 | 5;
  /** The play's job matches something in the user's Friction and gaps: wins ties (change 10). */
  frictionMatch: boolean;
  /** The user's setup has everything the play requires (change 9). */
  installable: boolean;
  /** An upgrade to a play the user already runs (Cora change 11, only with `v3.coraUpgradesOn`): at most one per list. */
  upgrade?: boolean;
};

export type Pick = Fitted & { position: 1 | 2 | 3; personal: number };
export type PickResult = { outcome: "picked" | "short" | "none"; picks: Pick[] };

function order(a: Fitted & { personal: number }, b: Fitted & { personal: number }): number {
  return (
    Number(b.installable) - Number(a.installable) ||
    b.personal - a.personal ||
    Number(b.frictionMatch) - Number(a.frictionMatch) ||
    byRank(a.play, b.play)
  );
}

/**
 * The three highest personal scores at Fit 3 or more; if fewer than three,
 * fill with the highest network scores at Fit 1. A play the user cannot
 * install today ranks below every play they can. One or two is fine when that
 * is all there is; none is recorded as "none".
 */
export function pickThree(candidates: Fitted[]): PickResult {
  const withScore = candidates.map((c) => ({ ...c, personal: personalScore(c.play.score, c.fit) }));
  // Installable first, whatever the Fit (change 9: below every play the user can install today).
  // Within each: Fit 3 or more by personal score, then Fit 1 by network score.
  const tier = (c: (typeof withScore)[number]) => (c.installable ? 0 : 2) + (c.fit >= 3 ? 0 : 1);
  // At most one upgrade: the best-placed one competes, any other is left out (change 11).
  let upgrades = 0;
  const chosen = [...withScore]
    .sort((a, b) => tier(a) - tier(b) || (a.fit >= 3 && b.fit >= 3 ? order(a, b) : byRank(a.play, b.play)))
    .filter((c) => !c.upgrade || upgrades++ === 0)
    .slice(0, 3);
  const picks = chosen.map((c, i) => ({ ...c, position: (i + 1) as 1 | 2 | 3 }));
  return { outcome: picks.length === 3 ? "picked" : picks.length ? "short" : "none", picks };
}
