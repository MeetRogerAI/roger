/**
 * A playbook's text taken apart, for the pages that show one part at a time:
 * the sample card's folded steps and the annotated idea on /how-it-works.
 * Nothing is added to or taken from the text.
 */

/** A playbook's parts in order: each "##" heading with the lines under it. Lines before the first heading are a part of their own. */
export function playbookParts(md: string): string[] {
  const parts: string[][] = [];
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*#{1,6}\s+/.test(line) || parts.length === 0) parts.push([]);
    parts.at(-1)!.push(line);
  }
  return parts.map((lines) => lines.join("\n").trim()).filter((part) => part !== "");
}

export type PlaybookStep = {
  /** The part's own heading, without the "##": "4. Steps". */
  heading: string;
  /** Everything under the heading, as written. */
  body: string;
};

/**
 * The parts as steps, each under its own heading, when every part has one.
 * Null for a playbook written another way (a play chosen in the admin may
 * be): the caller then shows the whole text in one piece, so no words are
 * given a heading they did not have.
 */
export function playbookSteps(md: string): PlaybookStep[] | null {
  const parts = playbookParts(md);
  if (parts.length === 0) return null;
  const steps: PlaybookStep[] = [];
  for (const part of parts) {
    const [first, ...rest] = part.split("\n");
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(first);
    if (!heading || !heading[1].trim()) return null;
    steps.push({ heading: heading[1].trim(), body: rest.join("\n").trim() });
  }
  return steps;
}
