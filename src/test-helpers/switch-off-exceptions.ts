/**
 * The reviewed list of differences B4 makes to a B1 to B3 path while
 * `v3.levelsLive` is off (B4 plan, "Switch-off proof, the shared harness" and
 * Scope Boundaries). Everything else B4 builds must leave every existing path's
 * normalised query trace (src/test-helpers/query-trace.ts) exactly as it was.
 *
 * Each entry names the path, the difference and why, and is reviewed in the
 * PR. A trace difference that no entry here allows fails the test. A test
 * passes only the entries that apply to its input (for example, exception 1
 * only for a profile that carries a roger-level fence).
 *
 * `addedStatements` are the statements the path may gain. They start empty:
 * the unit that makes the difference fills them in, with the test that proves
 * nothing else changed. An entry whose difference is a changed statement, not
 * an added one, says so in `difference`, and that unit's test compares that
 * statement on its own.
 */
export type SwitchOffException = {
  readonly id: "level-fence-at-receipt" | "profile-settings-read" | "retention-level-erase" | "hourly-level-tasks";
  /** The B4 plan unit that makes the difference. */
  readonly unit: number;
  readonly path: string;
  readonly difference: string;
  readonly why: string;
  readonly addedStatements: readonly RegExp[];
};

export const SWITCH_OFF_EXCEPTIONS = {
  levelFenceAtReceipt: {
    id: "level-fence-at-receipt",
    unit: 5,
    path: "src/lib/zack/receive.ts storeReport, profiles carrying a roger-level fence",
    difference:
      "The fence is cut out of the stored raw_text, has_level_block is set, and the profile insert also writes the level_submissions row in the same statement (a different statement for these inputs only; a profile without a fence is stored with today's SQL and parameters).",
    why: "Privacy (R24): no unvalidated block is ever written, whatever the switch. Intake captures while the switch is off so the go-live step can validate real runs. No B1 to B3 input carries a fence.",
    addedStatements: [],
  },
  profileSettingsRead: {
    id: "profile-settings-read",
    unit: 7,
    path: "src/lib/intake/process.ts processProfile, when receipt reported a level block",
    difference: "One settings read (readV3Settings) to see whether levelsLive is on; with it off, nothing else runs.",
    why: "The engine runs after a profile only with the raw switch on, and only the caller passing levelBlock: true reaches the read. No existing input does.",
    addedStatements: [],
  },
  retentionLevelErase: {
    id: "retention-level-erase",
    unit: 14,
    path: "src/lib/housekeeping/retention.ts ERASE_SQL and HOLDS_DATA_SQL",
    difference: "The erase also deletes the member's level_submissions, level_items, cora_job_matches and user_levels rows, and the holds-data count counts them (changed statements, not added ones).",
    why: "Intake captures whatever the switch, so retention must erase what it captured whatever the switch (R24: deleted with the account's other data). The tables are empty while no block arrives.",
    addedStatements: [],
  },
  hourlyLevelTasks: {
    id: "hourly-level-tasks",
    unit: 7,
    path: "src/lib/housekeeping/job.ts HOURLY_TASKS (levels_rescore, Unit 7; level_tag_proposals, Unit 11; hold-alert retries, Unit 13)",
    difference: "The task list gains tasks that return at once while their switches are off; the order test expects them after the existing tasks.",
    why: "No new cron schedule: the engine's rescore, tag proposals and hold-alert retries live in the hourly pass.",
    addedStatements: [],
  },
} as const satisfies Record<string, SwitchOffException>;

/** Every reviewed exception, for a test that wants to list them. */
export const ALL_SWITCH_OFF_EXCEPTIONS: readonly SwitchOffException[] = Object.values(SWITCH_OFF_EXCEPTIONS);
