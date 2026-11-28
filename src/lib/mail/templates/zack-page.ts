import type { SharingOffPrice } from "@/lib/zack/sharing-effect";
import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "@/lib/dates";

const SHARING_WORDS = {
  share: "share with the pool",
  match_only: "use for my matching only",
  off: "Zack off",
} as const;

/**
 * Spec B.13 email 15. Turning sharing off (a monthly member, in the trial or paying) explains the rule in Peter's
 * words (2026-11-27), with the member's own higher price; any other change keeps its price line, if any.
 */
export function sharingChangedEmail(o: {
  sharing: keyof typeof SHARING_WORDS;
  priceLine: string | null;
  /** The member's higher monthly price ("US$400") when this change turns sharing off; null otherwise. */
  higherPrice?: SharingOffPrice | null;
}): Rendered {
  const zackPage = { label: "Zack page", url: appUrl("/app/zack") };
  const off = o.higherPrice
    ? [
        `Roger works by members sharing what their AI agents do, for the good of the whole network. If you don’t share, you can still use Roger and get your Cora Curations, but your price ${o.higherPrice.doubles ? `doubles, to ${o.higherPrice.higher} a month` : `goes up to ${o.higherPrice.higher} a month`}. This applies only to months when you are not sharing, and the difference is added to your next invoice.`,
      ]
    : null;
  return renderEmail({
    subject: "Your Zack sharing setting changed",
    preview: `Now: ${SHARING_WORDS[o.sharing]}.`,
    heading: "Your sharing setting changed.",
    paragraphs: [
      `Zack is now set to “${SHARING_WORDS[o.sharing]}”. This applies to sharing straight away.`,
      ...(off ?? (o.priceLine ? [o.priceLine] : [])),
      off
        ? {
            text: "If you didn’t make this change, open the Zack page and change it back. Your price depends on whether your Zack runs share what you learn about AI agents with the network.",
            link: zackPage,
          }
        : "If you didn’t make this change, open the Zack page and change it back, then write to us.",
    ],
    button: { label: "Open the Zack page", url: appUrl("/app/zack") },
  });
}

export function rulesChangedEmail(o: { rules: string; neverWords: string[] }): Rendered {
  return renderEmail({
    subject: "Your rules for Zack changed",
    preview: "Zack will follow them from his next run.",
    heading: "Your rules for Zack changed.",
    paragraphs: [
      o.rules ? `Your extra rules, which Zack follows from his next run: ${o.rules}` : "Your extra rules are now empty.",
      o.neverWords.length ? `Never include: ${o.neverWords.join(", ")}.` : "Your never-include list is now empty.",
      "If you didn’t make this change, open the Zack page and change it back, then write to us.",
    ],
    button: { label: "Open the Zack page", url: appUrl("/app/zack") },
  });
}

export function keyReplacedEmail(o: { prefix: string }): Rendered {
  return renderEmail({
    subject: "Your Zack key was replaced",
    preview: `The new key starts with ${o.prefix}.`,
    heading: "Your Zack key was replaced.",
    paragraphs: [
      `A new key starting with ${o.prefix} was made on the Zack page, and the old one stopped working. Your AI agent needs the new connector text.`,
      "If you didn’t make this change, sign in, make another new key, and write to us.",
    ],
    button: { label: "Open the Zack page", url: appUrl("/app/zack") },
  });
}

export function runDeletedEmail(o: { weekOf: string }): Rendered {
  return renderEmail({
    subject: "Zack’s report was deleted",
    preview: `The report for ${longDate(o.weekOf)}.`,
    heading: "Zack’s report was deleted.",
    paragraphs: [
      `The report for your Cora Curation on ${longDate(o.weekOf)}, its private profile, and any of its plays not yet shared were removed. Plays already in the shared pool stay there in anonymous form.`,
    ],
    button: { label: "Open the Zack page", url: appUrl("/app/zack") },
  });
}
