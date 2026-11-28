/**
 * Peter's letter, for /about and "Who runs this" (plan R13, spec A.10).
 *
 * Source: section "10.2 The letter" of
 * artifacts/Archives/Circles/Roger (CTA Circles) - design spec.md,
 * "Approved by Peter, November 15, 2026".
 *
 * The approved text still mentions Circles and applications, so each paragraph
 * carries a `stillTrue` flag and the pages show only the true ones until Peter
 * sends a new letter.
 *
 * `original` is Peter's text, untouched. `shown` is what a page prints. They
 * differ in one paragraph, by one added word: "agents" became "AI agents", which
 * the vocabulary rule requires on every page but /zack (spec 0.4).
 * Peter approved that change on November 26, 2026: section 2 of
 * docs/site/v1-copy-changes.md.
 */
export type LetterParagraph = {
  id: string;
  /** Peter's approved words. */
  original: string;
  /** What the site prints. */
  shown: string;
  /** False where the paragraph describes Circles or applications. */
  stillTrue: boolean;
};

const same = (id: string, text: string, stillTrue: boolean): LetterParagraph => ({ id, original: text, shown: text, stillTrue });

export const letter = {
  greeting: "Hey there,",
  paragraphs: [
    same("who", "I’m Peter Kuperman. I run AI agents every day, including my own AI chief of staff, and I deploy them inside companies for a living.", true),
    {
      id: "noticed",
      original:
        "Here is what I kept noticing. The most useful things people do with agents never get shared with others. The highlight reel sometimes gets posted. But never the playbook. So everyone is left to work out the same things alone.",
      shown:
        "Here is what I kept noticing. The most useful things people do with AI agents never get shared with others. The highlight reel sometimes gets posted. But never the playbook. So everyone is left to work out the same things alone.",
      stillTrue: true,
    },
    same(
      "answer",
      "My answer is Roger: A service that compiles full AI Agent playbooks from people. Every Sunday an agent called Zack writes up what worked that week for a Circle of people. Every Monday you get the best of it, ranked, with private details removed.",
      false,
    ),
    same("applications", "I read every application to Roger myself. I host the working sessions for the founding Circles.", false),
    same(
      "background",
      "I made my first real estate investment at 17 and still own it, 35+ years later. I also spent 18+ years in real estate finance, then built a company that taught children to code and went on to build AI software for businesses. I studied finance and computer science at Penn.",
      true,
    ),
    same("apply", "If you run three or more agents every day and suspect you’re using a fraction of what they can do, apply.", false),
  ] satisfies LetterParagraph[],
  signOff: "Thanks,",
  /** Typed when the signature file is missing. */
  signature: "Peter",
};

/** The paragraphs a page may print today, in the letter's order. */
export const letterShown: LetterParagraph[] = letter.paragraphs.filter((p) => p.stillTrue);
