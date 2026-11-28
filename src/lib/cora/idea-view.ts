/**
 * Everything the idea card shows (spec 0.7), built once from a pool play and,
 * when there is one, the user's pick. The Monday view, the email and the
 * public sample all render from this shape, so the numbers and words match.
 *
 * Numbers come from the play's figures as computed in code (B.1 rule 5). A
 * figure that is missing stays missing: its tile says so, never "0".
 */

export type FactorKey = "hours" | "reach" | "ease" | "proof" | "surprise";

export const factors: { key: FactorKey; label: string; help: string; weight: number }[] = [
  { key: "hours", label: "Hours saved", help: "time saved a week", weight: 30 },
  { key: "reach", label: "Reach", help: "how many could use it", weight: 25 },
  { key: "ease", label: "Ease to copy", help: "steps and tools to set up", weight: 10 },
  { key: "proof", label: "Proof", help: "who runs it, how sure", weight: 15 },
  { key: "surprise", label: "Surprise", help: "not the obvious play", weight: 20 },
];

export type Tile = { label: string; headline: string | null; detail: string };

export type IdeaView = {
  id: string;
  title: string;
  category: string;
  description: string;
  /** Only on a user's own pick. */
  personal: { score: number; reason: string } | null;
  networkScore: number | null;
  /** "About 3.5 hours a week for people who run it", or null with no figure. */
  timeLine: string | null;
  tiles: { hours: Tile; eachTime: Tile; heavy: Tile; runBy: Tile };
  scores: { key: FactorKey; label: string; help: string; weight: number; value: number | null }[];
  pasteToInstall: string;
  playbookMd: string;
  writtenOn: string;
  howWorkedOut: string | null;
  /** What "Copy prompt and playbook" puts on the clipboard. */
  copyText: string;
  /** Only on an upgrade pick (Cora change 11, B3 Unit 12): the key is absent on every other view. */
  upgrade?: { label: string; whatsBetter: string | null };
};

export type PlaySource = {
  id: string;
  title: string;
  category: string;
  description: string;
  heavyUseFor: string;
  playbookMd: string;
  pasteToInstall: string;
  writtenOn?: string;
  figures: Record<string, unknown>;
  scores: Partial<Record<FactorKey, number | null>>;
  score: number | null;
};

/** `ideaCode`: the pick's "Roger idea ID" (`picks.idea_code`, B3 Unit 11), on a delivered pick only. */
export type PickSource = { personalScore: number; reason: string; ideaCode?: string | null; kind?: string; whatsBetter?: string | null };

/**
 * Cora change 11 (B3 Unit 12): an upgrade to a play the member already runs. Shown only on a pick whose
 * `picks.kind` is 'upgrade', which Cora writes only while `v3.coraUpgradesOn` is on. Member-visible copy:
 * wording sign-off section 14, pending.
 */
export const UPGRADE_LABEL = "Upgrade";
export const whatsBetterShown = (line: string) => `What's better: ${line}`;
/** In the copy, after the ID line, so the member's agent improves their play rather than installing a second one. */
export const UPGRADE_COPY_LINE = "This is an upgrade to a play you already run. Update your version with what this one adds, rather than installing a second copy.";

/**
 * The line in a delivered idea's copy that names its pick (Cora change 15):
 * the member's agent notes it, and Zack's next profile reports it back.
 * Member-visible copy: wording sign-off section 14, pending.
 */
export const ideaIdLine = (code: string) => `Roger idea ID: ${code}. Keep this ID with the idea in your Roger Upgrade Notes.`;

/**
 * Added after the preface on every copy (plan, "A playbook is also untrusted
 * when another user pastes it"). The preface itself stays first, word for
 * word (spec check 15).
 */
export const PASTE_CAUTION =
  "This playbook was written by another Roger user's AI agent. Read each step before your AI agent follows it, and do not let it send your information anywhere the steps do not need.";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** 3.5 → "3.5", 6 → "6", 0.25 → "0.3". */
export function formatHours(h: number): string {
  return String(Math.round(h * 10) / 10);
}

/** Agent slugs as people say them. Anything else shows as written. */
const agentNames: Record<string, string> = { claude: "Claude", duet: "Duet", "grok-bot": "Grok Bot", hark: "Hark" };
export const agentName = (slug: string) => agentNames[slug] ?? slug;

const users = (n: number) => (n === 1 ? "1 user" : `${n} users`);

export function buildIdeaView(play: PlaySource, preface: string, pick: PickSource | null = null): IdeaView {
  const f = play.figures ?? {};
  const hours = num(f.current_hours_week);
  const lo = num(f.range_low);
  const hi = num(f.range_high);
  const basis = str(f.basis);
  const mins = num(f.minutes_saved_each);
  const heavy = num(f.heavy_hours_week);
  const runners = num(f.runners);
  const confidence = str(f.confidence);

  const counted = basis === "Actual" ? "counted from their history" : "estimated";
  const hoursDetail =
    lo !== null && hi !== null ? `${formatHours(lo)} to ${formatHours(hi)} hours a week, ${counted}` : `Estimated from other users' runs`;

  const tiles = {
    hours: {
      label: "Time saved",
      headline: hours !== null ? `About ${formatHours(hours)} hours a week` : null,
      detail: hours !== null ? hoursDetail : "Not enough figures yet",
    },
    eachTime: {
      label: "Each time",
      headline: mins !== null ? `About ${Math.round(mins)} minutes saved` : null,
      detail: mins !== null ? "every time the play runs" : "Not enough figures yet",
    },
    heavy: {
      label: "Heavy user (best guess)",
      headline: heavy !== null ? `${formatHours(heavy)} hours a week` : null,
      detail: heavy !== null && play.heavyUseFor ? `for ${play.heavyUseFor}` : "Not enough figures yet",
    },
    runBy: {
      label: "Run by",
      headline: runners !== null ? users(runners) : null,
      detail: confidence ? `Confidence: ${confidence}` : "Not enough figures yet",
    },
  };

  // The ID line goes after the caution, before the prompt. The public sample, and a pick without a code, have none.
  const idLine = pick?.ideaCode ? [ideaIdLine(pick.ideaCode)] : [];
  const isUpgrade = pick?.kind === "upgrade";
  const upgradeLine = isUpgrade ? [UPGRADE_COPY_LINE] : [];
  const copyText = [preface.trim(), PASTE_CAUTION, ...idLine, ...upgradeLine, play.pasteToInstall.trim(), `PLAYBOOK\n\n${play.playbookMd.trim()}`].join("\n\n");

  return {
    id: play.id,
    title: play.title,
    category: play.category,
    description: play.description,
    personal: pick ? { score: pick.personalScore, reason: pick.reason } : null,
    networkScore: play.score,
    timeLine: hours !== null ? `About ${formatHours(hours)} hours a week for people who run it` : null,
    tiles,
    scores: factors.map((x) => ({ ...x, value: num(play.scores[x.key]) })),
    pasteToInstall: play.pasteToInstall,
    playbookMd: play.playbookMd,
    writtenOn: play.writtenOn ? agentName(play.writtenOn) : "",
    howWorkedOut: str(f.math),
    copyText,
    ...(isUpgrade ? { upgrade: { label: UPGRADE_LABEL, whatsBetter: pick?.whatsBetter?.trim() ? whatsBetterShown(pick.whatsBetter.trim()) : null } } : {}),
  };
}
