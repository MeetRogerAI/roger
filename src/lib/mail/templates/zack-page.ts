import { appUrl, renderEmail, type Rendered } from "../layout";
import { longDate } from "@/lib/dates";

const SHARING_WORDS = {
  share: "share with the pool",
  match_only: "use for my matching only",
  off: "Zack off",
} as const;

export function sharingChangedEmail(o: { sharing: keyof typeof SHARING_WORDS; priceLine: string | null }): Rendered {
  return renderEmail({
    subject: "Your Zack sharing setting changed",
    preview: `Now: ${SHARING_WORDS[o.sharing]}.`,
    heading: "Your sharing setting changed.",
    paragraphs: [
      `Zack is now set to “${SHARING_WORDS[o.sharing]}”. This applies to sharing straight away.`,
      ...(o.priceLine ? [o.priceLine] : []),
      "If you didn’t make this change, open the Zack page and change it back, then write to us.",
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
      `The report for your list on ${longDate(o.weekOf)}, its private profile, and any of its plays not yet shared were removed. Plays already in the shared pool stay there in anonymous form.`,
    ],
    button: { label: "Open the Zack page", url: appUrl("/app/zack") },
  });
}
