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

/**
 * Each playbook part beside its note, when the playbook has exactly the parts the notes name, in the notes' order:
 * the annotated idea on /how-it-works. A play may be written another way (an example edited or put first in Pages):
 * then there is no pairing, and the page shows the notes as a list beside the whole playbook, so no note sits
 * beside the wrong part. The Pages editor asks the same question of a playbook as it is typed.
 */
export function annotate<N extends { part: string }>(md: string, notes: readonly N[]): { note: N; part: string }[] | null {
  const parts = playbookParts(md);
  if (parts.length !== notes.length) return null;
  const heading = (part: string) => part.split("\n")[0].toLowerCase();
  if (!notes.every((n, i) => /^#/.test(parts[i]) && heading(parts[i]).includes(n.part.toLowerCase()))) return null;
  return notes.map((note, i) => ({ note, part: parts[i] }));
}

export type PlaybookStep = {
  /** The part's own heading, without the "##": "4. Steps". */
  heading: string;
  /** Everything under the heading, as written. */
  body: string;
};

/**
 * The playbook as steps, each under its own heading, for the sample card's
 * folded rows. A step is a heading of the playbook's top level with
 * everything under it: a smaller heading inside a step stays in that step's
 * text, and a "#" line inside a fenced code block is not a heading. So the
 * count the card prints is the count of the playbook's own parts.
 *
 * Null for a playbook that is not written that way (a play chosen in the
 * admin may be): no heading, one heading only, words before the first
 * heading, or a heading with nothing under it. The caller then shows the
 * whole text in one piece, so no words are given a heading they did not have
 * and no row opens to nothing.
 */
export function playbookSteps(md: string): PlaybookStep[] | null {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const headings: { at: number; level: number; text: string }[] = [];
  let fenced = false;
  for (const [at, line] of lines.entries()) {
    if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced) {
      const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
      if (heading) headings.push({ at, level: heading[1].length, text: heading[2].trim() });
    }
  }
  if (headings.length === 0) return null;
  const top = Math.min(...headings.map((h) => h.level));
  const tops = headings.filter((h) => h.level === top);
  if (tops.length < 2) return null;
  if (lines.slice(0, tops[0].at).join("").trim() !== "") return null;
  const steps = tops.map((h, i) => ({
    heading: h.text,
    body: lines
      .slice(h.at + 1, tops[i + 1]?.at)
      .join("\n")
      .trim(),
  }));
  return steps.every((step) => step.heading !== "" && step.body !== "") ? steps : null;
}
