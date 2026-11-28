import { withSafeguard } from "./safeguard";

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
  /** The play's install notes with the safeguard preamble on top (./safeguard): what is shown and copied. */
  pasteToInstall: string;
  playbookMd: string;
  writtenOn: string;
  howWorkedOut: string | null;
  /** What "Copy prompt and playbook" puts on the clipboard. */
  copyText: string;
  /**
   * An admin removed it from the pool after it was delivered (2026-11-28
   * review F4): the card shows WITHDRAWN_NOTICE instead of its install text,
   * playbook and copy button, which are all empty.
   */
  withdrawn: boolean;
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
  /** Its pool play was removed from the pool. */
  withdrawn?: boolean;
};

export type PickSource = { personalScore: number; reason: string };

/** What a delivered idea shows once its pool play is removed from the pool. */
export const WITHDRAWN_NOTICE = "This idea was withdrawn by Roger.";

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

  // The preface stays first, word for word (spec check 15). The safeguard preamble opens the paste-to-install text, and
  // replaces the older one-line caution (plan, "A playbook is also untrusted when another user pastes it"; 2026-11-27).
  // A withdrawn idea (removed from the pool after delivery) keeps nothing that could be pasted or run.
  const withdrawn = play.withdrawn === true;
  const pasteToInstall = withdrawn ? "" : withSafeguard(play.pasteToInstall);
  const copyText = withdrawn ? "" : [preface.trim(), pasteToInstall, `PLAYBOOK\n\n${play.playbookMd.trim()}`].join("\n\n");

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
    pasteToInstall,
    playbookMd: withdrawn ? "" : play.playbookMd,
    writtenOn: play.writtenOn ? agentName(play.writtenOn) : "",
    howWorkedOut: withdrawn ? null : str(f.math),
    copyText,
    withdrawn,
  };
}
