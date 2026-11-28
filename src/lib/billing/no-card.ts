/**
 * Facts about trials that wait for their card (plan 2026-11-26-001), shared
 * by billing, the Cora send and the housekeeping clocks. Kept here so billing
 * never imports the housekeeping tasks (whole-branch review W8).
 */

/** `closed_reason` of the 14-day close of a teasered trial that never added its card (reopenable for 7 days). */
export const CLOSED_NO_CARD = "no_card";

/**
 * When the card-at-the-first-list flow started (the day it was built). A
 * trial whose card was saved before it took the card at sign-up (the old
 * flow), so the hourly unlock sweep leaves it alone unless it was teasered
 * (`first_teaser_at` set, which only the new flow does); the welcome sweep
 * uses the same moment (`WELCOME_SWEEP_FROM`, signup/finish.ts). Whole-branch
 * review W5: the first hourly pass after the deploy must not email leftover
 * preview accounts.
 */
export const NO_CARD_FLOW_FROM = "2026-11-26T00:00:00Z";
