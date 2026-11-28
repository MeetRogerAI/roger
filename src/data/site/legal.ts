/**
 * Privacy and terms for a built site version (plan U9, spec A.13). Peter
 * reviewed and confirmed both on November 26, 2026, so the pages render them
 * without the "Draft, under review." note.
 *
 * Each sentence states something the spec, the plan or the code says, and
 * nothing else. What was left out because no source states it is listed in
 * docs/site/v1-copy-changes.md.
 *
 * Amounts are never typed here. A line names them in braces, as the page copy
 * in ./v1.ts does, and `siteLegal` fills them from the settings. The period
 * runs are kept for is {retentionDays}: the same setting the housekeeping job
 * uses for a user's runs and for free Zack runs.
 *
 * Vocabulary (spec 0.4): "agent" never appears without "AI" in front. A test
 * holds both documents to it.
 */
import { siteConfig } from "@/data/config";
import type { LegalDoc } from "@/data/legal";
import { fillCopy, type Amounts } from "@/lib/site/amounts";
import { trialCloseRule } from "./v1";

const email = siteConfig.contactEmail;

/**
 * The model provider's position on training (spec A.13; launch list S10),
 * checked on November 27, 2026: Anthropic's Commercial Terms ("Anthropic may
 * not train models on Customer Content from Services", effective June 17,
 * 2025) and Vercel's AI Gateway docs ("AI Gateway does not use your prompts or
 * responses for training purposes", September 10, 2026). Every model Roger
 * calls is an Anthropic model through the AI Gateway (src/lib/intake/model.ts,
 * src/lib/cora/merge.ts, src/lib/cora/fit.ts). Re-check both if the provider
 * or the route changes.
 */
export const trainingPosition =
  "Cora’s model provider is Anthropic, reached through Vercel’s AI Gateway. Anthropic’s commercial terms do not allow it to train its models on what Roger sends, and Vercel does not use it for training either.";

/**
 * The three passages kept from the privacy text the site already had (spec
 * A.13: "The existing passages on the library, watches, and analytics, kept as
 * they are"). The library and watch passages are from `circlesPrivacyPreview`
 * in src/data/circles-legal.ts, and the analytics passage is from `privacy` in
 * src/data/legal.ts. The watch passage is word for word but for its opening.
 * Its first sentence, "The library's optional watch sign-up is separate from
 * Circles.", is left out because a site version has no Circles, and the "It"
 * that began the next sentence is replaced by the subject of the dropped one,
 * "The library's optional watch sign-up", so the passage still says what
 * collects the email. A test compares all three with their sources.
 */
const keptPassages: LegalDoc["sections"] = [
  {
    id: "library",
    heading: "The public library",
    body: ["The library summarises public posts in Roger's own words and links to the original. It shows the author's public handle. Email us if you want a post of yours removed."],
  },
  {
    id: "watches",
    heading: "Existing library sign-ups",
    body: [
      "The library's optional watch sign-up collects the email and search you provide so Roger can send matching use cases. Each watch email includes a way to stop. The site runs on Vercel, its database is hosted by Neon, and email is sent through Resend. These services may store information outside Canada.",
    ],
  },
  { id: "analytics", heading: "Analytics", body: ["This site doesn’t run analytics right now. If we turn it on, this page will say so first."] },
];

const privacyIntro = "Roger is run from Toronto. We’re responsible for the personal information Roger collects. Here is what we collect, what happens to it and who holds it, in plain language.";

export const sitePrivacy: LegalDoc = {
  title: "Privacy",
  updated: "November 2026",
  intro: privacyIntro,
  sections: [
    {
      id: "sign-up",
      heading: "What sign-up collects",
      body: [
        "When you sign up we collect your name, your email address, your answers to the sign-up quiz, the AI agent you use, your country and your time zone.",
        "Your quiz answers become the profile Cora uses to match ideas to you.",
      ],
    },
    {
      id: "card",
      heading: "Your card",
      body: ["Your card is collected by Stripe. Roger never sees the card number."],
    },
    {
      id: "zack",
      heading: "What Zack does",
      body: [
        "Zack is an AI agent that runs in your own AI agent account. It reads the past seven days of activity across that account, including work finished in that time. It also reads the list of what the account has set up, such as its skills, scheduled tasks and connected services, and the notes file your AI agent keeps about the Roger ideas it has installed, from which it reports on ideas from the past eight weeks.",
        "Zack is instructed to remove private details before it writes its report, and Roger checks again when the report arrives. Zack sends two files to Roger each week, because you agreed to that when you signed up: the report, and a private matching profile.",
        "The matching profile describes, in general words, the kind of work you do, what your AI agent account has set up, the public services connected to it by name, where your week still took effort, and what became of earlier Roger ideas. Roger uses it to match ideas to you. It is not shared with other users. It is sent on the share and matching only settings. Its contents are erased when you delete the run it came with, and with your runs after your access ends.",
        "You can read the instructions your Zack runs, change what it collects and turn sharing off, all in your dashboard.",
        "Sharing has three settings: share with the pool, use for your own matching only, or Zack off. On matching only, Zack still sends both files; they are used to choose your ideas and none of your plays are shared. With Zack off, Zack is told to send nothing, except in a test run you start yourself, which still sends and is never shared. On monthly, matching only and Zack off both bring the higher monthly rate, which the Terms describe.",
      ],
    },
    {
      id: "runs",
      heading: "What happens to a run",
      body: [
        "When a run reaches Roger it is stored as it arrived. It is then checked again for private details before any of its plays are shared.",
        "It is processed by Cora, an AI system, through a model provider. Cora scores plays and picks the ideas each user receives.",
        "Roger’s team can read a run, and reviews any play the check flags before it is shared.",
        trainingPosition,
      ],
    },
    {
      id: "other-users",
      heading: "What other users see",
      body: ["Other Roger users see anonymous plays only. Roger never shows who a play came from."],
    },
    {
      id: "retention",
      heading: "How long we keep your runs",
      body: [
        "We keep your runs while you have access to Roger, and for {retentionDays} days after your access ends. Cancelling does not delete your account.",
        "After that period the text of each run and its matching profile are erased, and plays that were never shared are deleted. An empty record of each run stays until your account is deleted: its week, how it arrived, the AI agent it came from and when it arrived.",
        // Privacy decision P3 (2026-11-27): IDLE_RETENTION_DAYS in src/lib/housekeeping/retention.ts (a year).
        "If your account is on hold, or is on an older plan than monthly, the same erasing happens once a year has passed with no run sent, no Cora Curation ordered, no charge and no sign-in.",
        "You can delete any run from your dashboard.",
        "Plays already shared stay in the pool. Other users see nothing that identifies you. Roger keeps your own copy of each shared play until your account is deleted, and a private record of which account a shared play came from, so that Cora does not send it back to you. When your account is deleted, that record is changed to say “unknown author”.",
      ],
    },
    {
      id: "free-run",
      heading: "The free Zack run",
      body: [
        "The free Zack run at /zack is separate from sign-up. It stores the email you give, the AI agent you choose and the report you paste. To limit misuse, it also keeps a count of requests from your IP address. Each count covers one hour and is removed by an hourly clean-up after that hour ends.",
        "Your report may be read by Roger’s team and by Cora, Roger’s ranking AI system.",
        "It is attached to an account only if you go on to sign up from that run with the same email. It then becomes your first run and is treated like any other run: with sharing on, which is how every account starts, its plays are shared with other users in anonymous form.",
        "If you do not sign up, the free run is deleted {retentionDays} days after you started it. If you do sign up, the copy of the report kept with the free run is cleared after the same {retentionDays} days. The email and the AI agent stay on that record until your account is deleted.",
        "The run is reached by the link in your browser’s address bar. The run link works for anyone who has it, so do not share it. Anyone with the link can replace the report, and anyone who enters your email at /zack with the same AI agent can start the run again, which replaces the earlier run and its report. Neither can read a report you pasted.",
      ],
    },
    ...keptPassages,
    {
      id: "services",
      heading: "The services that hold your data",
      body: [
        "These services hold or process what this page describes: Vercel, which runs the site and passes Roger’s requests to the model provider; Neon, which hosts the database; Resend, which sends email; Stripe, which collects your card; Google, if you sign in with Google; and the model provider Cora runs through.",
        "Some of them store data outside Canada.",
      ],
    },
    {
      // Privacy decision P6 (2026-11-27): RECORD_MONTHS and KEEP_NOTIFICATION_KINDS in src/lib/housekeeping/retention.ts.
      id: "records",
      heading: "Other records we keep",
      body: [
        "We keep a record of each email Roger sends you for a year. The record that your welcome email went out stays until your account is deleted, so it is never sent twice.",
        "Records of payment events from Stripe are kept for eighteen months.",
        "If you left your email with us without signing up, for example to hear when sign-up opens or to get a starter pack, we keep it for a year from the last time you left it.",
      ],
    },
    {
      id: "your-data",
      heading: "Asking what we hold, correcting it or deleting it",
      body: [
        `Email ${email} to ask what we hold about you, to have it corrected or to have it deleted. We will answer within 30 days.`,
        "You can also ask us to take your shared plays out of the pool, and we will remove them.",
        "When an account is deleted, or its email address is changed, Roger’s admin log keeps a short record of it that includes the email address.",
      ],
    },
  ],
};

const termsIntro =
  "These terms cover Roger: the free trial, the price and the ideas we send you each Monday. We’ve kept them short and plain. “We”, “us” and “our” means Roger, run from Toronto, Ontario. “You” means the person who signs up.";

export const siteTerms: LegalDoc = {
  title: "Terms",
  updated: "November 2026",
  intro: termsIntro,
  sections: [
    {
      id: "trial",
      heading: "The free trial",
      body: [
        "Your first {freeLists} Cora Curations are free. A Cora Curation is the set of ideas Roger sends you on a Monday. Only a Cora Curation that is delivered to you counts as one of them.",
        // Main's held list (src/lib/app/held.ts): with no card, the first Cora Curation is titles only until the card is saved (src/lib/cora/unlock.ts).
        "We ask for a card when your first Cora Curation is ready, and it is kept on file. It is not charged then. Until a card is saved, your first Cora Curation shows only its titles, and the full ideas open once a card is added.",
        "Your card is charged with your {firstPaidList} Cora Curation, and once a month after that. Cancel before then and you pay nothing.",
        // Main's trial clocks (src/lib/housekeeping/trial.ts and clocks.ts): card saved, trialCloseDays from the card; no card,
        // HELD_CLOSE_DAYS (14, a constant, not a setting) from the first titles-only email, else trialCloseDays from sign-up;
        // each Monday with no Cora Curation because of Roger moves the close a week.
        trialCloseRule,
      ],
    },
    {
      id: "price",
      heading: "The price",
      body: [
        "Roger has one plan, monthly. It costs {monthlyUsd} a month ({monthlyCad} in Canada). It is charged once a month and brings a Cora Curation every Monday. A week has no Cora Curation when Roger has no new ideas for you or the week fails on our side, and Cora Curations are held while a payment is unpaid.",
      ],
    },
    {
      id: "contributing",
      heading: "Contributing, and the higher monthly rate",
      body: [
        "Roger works because everyone’s Zack contributes. Everyone starts as a contributor.",
        "If Zack misses a week, the first miss each billing month is forgiven. A second miss makes that month {higherUsd} ({higherCad} in Canada). A miss caused by Roger never counts. We email you both times.",
        "If you set sharing to matching only or to Zack off in your dashboard, the monthly price is {higherUsd} a month ({higherCad} in Canada).",
        "Those are the only two cases where the higher rate applies. It is not a plan you can choose.",
        "Your subscription itself stays at the standard price. For a month at the higher rate, the difference is added to your next invoice as its own line.",
      ],
    },
    {
      // The Payment page's "Terms and refunds" link (main, components/app/payment/trust.tsx) opens /terms#roger-monthly,
      // and /refunds redirects here (next.config.ts). The refund, payment-failure and consumer-law paragraphs are main's
      // approved "Roger monthly" section (src/data/legal.ts rogerMonthlyTerms, approved by Peter on 2026-11-26), word for
      // word but for the number of free Cora Curations, which comes from the settings here (Peter, November 28, 2026).
      id: "roger-monthly",
      heading: "Refunds and cancelling",
      body: [
        "No refunds. Because you can try Roger free for {freeLists} Cora Curations and cancel any time, we don’t refund charges already made, including for the rest of a month after you cancel. If we charge you by mistake (for example, twice for the same month, or after your plan ended), tell us and we refund the mistaken charge in full to your card.",
        "You can cancel any time, in one click. Your access continues to the end of the month you have paid for.",
        "If a payment fails. Your Cora Curations pause until you update your card in Billing, then start again straight away.",
        "Your rights. Nothing here takes away a right you have under the consumer law where you live.",
      ],
    },
    {
      id: "tax",
      heading: "Tax",
      body: ["Prices are shown before tax. HST or other tax is added where it applies."],
    },
    {
      id: "plays",
      heading: "Your plays",
      body: [
        "Your plays are shared so that other users can use them. They are shared in anonymous form, without anything that identifies you.",
        "You keep the right to your own work. You grant Roger the right to share the anonymised play.",
      ],
    },
    {
      id: "ideas",
      heading: "The ideas",
      body: ["The ideas Roger sends you are other people’s working methods. They are offered as they are, with no promise of a result."],
    },
    { id: "questions", heading: "Questions", body: [`Email us at ${email}.`] },
  ],
};

export type SiteLegalName = "privacy" | "terms";

/**
 * Each page's browser title, search description and shared-link line: its own
 * heading and its own first paragraph. Neither names an amount, so static
 * metadata can read them.
 */
export const siteLegalMeta: Record<SiteLegalName, { title: string; headline: string; description: string }> = {
  privacy: { title: "Roger: Privacy", headline: "Privacy", description: privacyIntro },
  terms: { title: "Roger: Terms", headline: "Terms", description: termsIntro },
};

/** Both documents with every amount filled in, ready for a page. */
export function siteLegal(amounts: Amounts): Record<SiteLegalName, LegalDoc> {
  return { privacy: fillCopy(sitePrivacy, amounts), terms: fillCopy(siteTerms, amounts) };
}
