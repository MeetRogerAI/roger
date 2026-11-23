import type { Query } from "@/lib/db-query";

/**
 * The onboarding checklist at the top of /app (spec B.10). Each step ticks
 * itself from something the app has stored; the person never ticks a box.
 *
 * - The startup page viewed while signed in: "Install your AI agent".
 * - The published setup file shown to them on that page: "Set up your starter team".
 * - "That's my goal" pressed: "Agree your daily goal".
 * - A Zack key made (and so shown): "Connect Zack".
 * - A report received from their AI agent, test or real: "Send a test run".
 * - The Zack controls page opened: "Check your Zack controls".
 * - A list delivered: "Wait for Monday".
 *
 * Steps tick only from their own fact. The one exception: once a list has
 * been delivered every step counts as done, so the checklist disappears.
 */
export type OnboardingFact = "getstarted_at" | "setup_version" | "goal_at" | "controls_at";

export type StepKey = "install" | "starter_team" | "goal" | "connect" | "test_run" | "controls" | "monday";
export type Step = { key: StepKey; label: string; href: string | null; done: boolean };
export type Checklist = { path: "new" | "running"; steps: Step[]; complete: boolean };

export type Facts = {
  getstartedViewed: boolean;
  setupSeen: boolean;
  goalAgreed: boolean;
  keyMade: boolean;
  runReceived: boolean;
  controlsOpened: boolean;
  listDelivered: boolean;
};

const STEPS: Record<StepKey, { label: string; href: string | null; fact: keyof Facts }> = {
  install: { label: "Install your AI agent", href: "/getstarted#install", fact: "getstartedViewed" },
  starter_team: { label: "Set up your starter team", href: "/getstarted#starter-team", fact: "setupSeen" },
  goal: { label: "Agree your daily goal", href: "/getstarted#daily-goal", fact: "goalAgreed" },
  connect: { label: "Connect Zack", href: "/app/zack#key-h", fact: "keyMade" },
  test_run: { label: "Send a test run", href: "/app/zack#key-h", fact: "runReceived" },
  controls: { label: "Check your Zack controls", href: "/app/zack", fact: "controlsOpened" },
  monday: { label: "Wait for Monday", href: null, fact: "listDelivered" },
};

export const PATH_STEPS: Record<"new" | "running", StepKey[]> = {
  new: ["install", "starter_team", "goal", "connect", "test_run", "monday"],
  running: ["connect", "test_run", "controls", "monday"],
};

export function buildChecklist(path: "new" | "running", facts: Facts): Checklist {
  // Each step ticks only from its own fact, except that a delivered list ticks
  // everything: onboarding is over, and the checklist goes away.
  const steps = PATH_STEPS[path].map((key) => ({ key, label: STEPS[key].label, href: STEPS[key].href, done: facts.listDelivered || facts[STEPS[key].fact] }));
  return { path, steps, complete: steps.every((s) => s.done) };
}

type Row = {
  path: "new" | "running";
  status: string;
  onboarding: Record<string, unknown> | null;
  key_made: boolean;
  run_received: boolean;
  list_delivered: boolean;
};

/** The checklist for a user who can receive lists, or null (no such user, or an account that is closed or still signing up). */
export async function loadChecklist(q: Query, userId: string): Promise<Checklist | null> {
  const [u] = await q<Row>(
    `select u.path, u.status, u.onboarding,
            u.zack_key_created_at is not null as key_made,
            exists (select 1 from runs r where r.user_id = u.id and r.route in ('connector', 'upload')) as run_received,
            exists (select 1 from picks p where p.user_id = u.id and p.delivered_at is not null and not p.dry_run) as list_delivered
     from users u where u.id = $1`,
    [userId],
  );
  if (!u || !["trial", "active", "held"].includes(u.status)) return null;
  const o = u.onboarding ?? {};
  return buildChecklist(u.path, {
    getstartedViewed: Boolean(o.getstarted_at),
    setupSeen: Boolean(o.setup_version),
    goalAgreed: Boolean(o.goal_at),
    keyMade: u.key_made,
    runReceived: u.run_received,
    controlsOpened: Boolean(o.controls_at),
    listDelivered: u.list_delivered,
  });
}

/** A signed-in view of /getstarted: the page was seen, and so was the published setup file, if there is one. */
export async function recordGetStartedView(q: Query, userId: string, file: { version: number } | null): Promise<void> {
  await noteOnboarding(q, userId, "getstarted_at");
  if (file) await noteOnboarding(q, userId, "setup_version", file.version);
}

/**
 * Records a fact the first time it happens; later calls change nothing (the
 * first time is what counts). `value` defaults to now; "setup_version" stores
 * the version number that was shown.
 */
export async function noteOnboarding(q: Query, userId: string, fact: OnboardingFact, value?: string | number): Promise<void> {
  await q(
    `update users set onboarding = onboarding || jsonb_build_object($2::text, $3::text)
     where id = $1 and onboarding->>($2::text) is null`,
    [userId, fact, String(value ?? new Date().toISOString())],
  );
}
