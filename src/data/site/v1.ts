/**
 * Every word on site version 1 (plan R7, R14a, KTD5, KTD8). A wording change
 * is one edit here.
 *
 * The wording is the draft copy in artifacts/v3-marketing-website-spec.md
 * ("Messaging and copy direction") and A.14 of artifacts/Roger v3 - design
 * spec.md, word for word. Two kinds of line are not the spec's own words, and
 * each one is listed for Peter in docs/site/v1-copy-changes.md:
 * - lines the single-list price made false (plan R8), rewritten to say that
 *   monthly brings a list every Monday for the price of one list;
 * - short labels and the /how-it-works paragraphs, which the spec describes
 *   but does not write;
 * - the lines that state the higher rate, and the one that states the price
 *   of one list in US dollars alone, which now give the Canadian figure beside
 *   the US one.
 *
 * Amounts are never typed here. A line names them in braces, {monthlyUsd},
 * {monthlyCad}, {listUsd}, {listCad}, {higherUsd}, {higherCad}, {freeLists},
 * {firstPaidList}, {lastFreeList} and {trialCloseDays}, and fillCopy in
 * src/lib/site/amounts.ts puts the values in.
 *
 * The week numbers and brick counts of "It compounds" live in
 * ./compounding.ts. The caption words here name them as {week} and {bricks},
 * which fillCopy leaves alone and compoundingCaption in
 * src/lib/site/compounding.ts fills for each stack.
 *
 * Vocabulary (spec 0.4): outside `v1Agents` and `v1Zack`, and the one line
 * `zackWarning`, "agent" never appears without "AI" in front, because readers
 * in real estate are also called agents. A test holds this file to it.
 */
import { fillCopy, type Amounts } from "@/lib/site/amounts";
import type { BrickWords, ClosingBandCopy, ControlBlockCopy, PriceBlockCopy, Question, QuestionGroup, SampleCardCopy, SharedCopy } from "./copy-types";

/** The pages that show a subset of the questions. /faq shows all of them. */
export type QuestionPage = "home" | "agents";

export type V1Question = Question & { on: QuestionPage[] };
export type V1QuestionGroup = Omit<QuestionGroup, "items"> & { items: V1Question[] };

/**
 * What Zack reads, skips and removes, as the Zack 2.0 instructions in
 * content/zack state it for all four AI agents (approved by Peter on
 * November 26, 2026: the site's wording follows the Zack 2.0 instructions).
 * The question "What does Zack read?" and "Zack, in detail" on /how-it-works
 * share these sentences. A test compares them with the four instruction files.
 */
const zackReads =
  "The past seven days of activity across your AI agent account, including work finished in that time. He also reads the list of what the account has set up, such as its skills, scheduled tasks and connected services, and the notes your AI agent keeps about the Roger ideas it has installed.";
const zackSkips = "He skips email, calendar and Drive, chats and projects shared with other people, and other people’s messages. He reads no other account.";
const zackRemoves = "Zack is instructed to replace names, clients, addresses, amounts and other private details with placeholders, and Roger checks again when the report arrives.";

const questions: V1QuestionGroup[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        q: "I don’t use AI agents yet. Can I start?",
        a: "Yes. The startup page walks you through installing one and setting up a starter team for real estate. Most people finish in about half an hour.",
        on: ["home"],
      },
      {
        q: "Which AI agents does Roger work with?",
        a: "Every AI agent. Zack has ready-made files for Claude, Duet, Grok Bot and Hark. On any other, one prompt adapts him, or you can upload his report yourself.",
        on: ["agents"],
      },
      {
        q: "What do I have to do each week?",
        a: "Open your three ideas on Monday and set up the ones you want. Zack runs on his own on Sunday.",
        on: ["home"],
      },
    ],
  },
  {
    id: "zack-and-privacy",
    title: "Zack and privacy",
    items: [
      {
        q: "What does Zack read?",
        a: `${zackReads} ${zackSkips}`,
        on: ["home"],
      },
      {
        q: "What leaves my account?",
        a: "Two files each week. Zack’s report is a write-up of your most useful plays, which he is instructed to write with names, clients, addresses, amounts and other private details replaced by placeholders. A private matching profile describes your work and your setup in general words, and is not shared with other users. You agree to this when you sign up, and you can turn it off.",
        on: ["agents"],
      },
      {
        q: "Can I see and change what Zack does?",
        a: "Yes. Your dashboard shows the exact instructions your Zack runs. You can tell him to skip whole subjects, block specific words and names, share an outline only, or follow rules you write yourself.",
        on: ["agents"],
      },
      {
        q: "Who sees my plays?",
        a: "Other Roger users, without your name or anything that identifies you. A play is described as ‘run by 3 users’, never as yours.",
        on: ["home"],
      },
      {
        q: "I compete with other people on Roger. What if I don’t want to share?",
        a: "You decide exactly what Zack shares, down to skipping whole subjects and blocking names. If you switch sharing off completely in your dashboard, monthly still brings three ideas every Monday and costs {higherUsd} a month ({higherCad} in Canada).",
        on: ["agents"],
      },
      {
        q: "Can I delete what I’ve sent?",
        a: "Yes. You can delete any weekly report from your dashboard.",
        on: [],
      },
    ],
  },
  {
    id: "cora-and-the-ideas",
    title: "Cora and the ideas",
    items: [
      {
        q: "How are my three ideas chosen?",
        a: "Cora scores every play on hours saved, reach, ease to copy, proof and surprise, then matches plays to the kind of work your own week shows. She never sends something you already run.",
        on: [],
      },
      {
        q: "What if an idea doesn’t fit me?",
        a: "Paste it into your AI agent anyway and ask how it would apply to you. Every playbook starts by telling your AI agent to adapt it to your setup.",
        on: [],
      },
      {
        q: "Will an idea work on my AI agent if it came from a different one?",
        a: "Yes. Your own AI agent rewrites the playbook for itself before installing it.",
        on: ["agents"],
      },
    ],
  },
  {
    id: "price-and-billing",
    title: "Price and billing",
    items: [
      {
        q: "What does it cost?",
        a: "{monthlyUsd} a month, or {listUsd} for one list at a time, plus tax where it applies. In Canada it is {monthlyCad} a month or {listCad} a list, plus HST. Monthly brings a list every Monday for the price of one list.",
        on: ["home"],
      },
      {
        q: "When is my card charged?",
        a: "On monthly, with your {firstPaidList} Monday list and not before. On one at a time, only when you order a list. Your first {freeLists} lists are free either way, and we email you after your {lastFreeList} list with what happens next.",
        on: ["home", "agents"],
      },
      {
        q: "Why do you need a card for a free trial?",
        a: "So that nothing changes on your {firstPaidList} Monday. If you don’t want to continue, cancel in one click before then and you pay nothing.",
        on: [],
      },
      {
        q: "What if Zack misses a week?",
        a: "On monthly, the first miss each month is forgiven. A second miss makes that month {higherUsd} ({higherCad} in Canada). We email you both times.",
        on: [],
      },
      {
        q: "Can I get a refund?",
        a: "No. You get {freeLists} free lists before any charge, and you can cancel any time.",
        on: [],
      },
      {
        q: "Can I buy one list at a time?",
        a: "Yes. One list costs {listUsd} ({listCad} in Canada), and you order it for any Monday you want. For the same price, monthly brings a new list every Monday.",
        on: [],
      },
    ],
  },
];

// The homepage headline and sub-line, which the browser title, the search description and the social card repeat.
const headline = "Your AI agents, smarter every Monday.";
const subLine = "Roger makes your AI agents smarter every week, with ideas that worked for other real estate users.";

// Lines of /pricing, /how-it-works and /about that each page's search description repeats. None names an amount, so static metadata can read them.
const firstIncluded = "Three ideas every Monday, each with a full playbook.";
const underBothColumns = "One list on its own costs the same as a whole month. Monthly brings a list every Monday for that price.";
const mondayOfTheWeek = "Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best. You receive your three ideas, each with a full playbook.";
const runBy = "Roger is run by Peter Kuperman.";

/** A reading page's browser title, search description and shared-link line, from its own heading and one of its own lines. */
const pageMeta = (title: string, description: string) => ({ title: `Roger: ${title}`, headline: title, description });

/** Everything but /agents and /zack. The vocabulary rule applies to all of it except `zackWarning`. */
export const v1 = {
  // --- The strings shared behaviour needs (SharedCopy) ---
  buttons: {
    start: "Get {freeLists} free Monday lists",
    startShort: "Start free",
    signIn: "Sign in",
    openApp: "Open Roger",
  },
  cardLine: "Card required. Charged only with your {firstPaidList} list.",
  trialLine:
    "Your first {freeLists} Monday lists are free. We ask for a card when you start. On monthly it is charged with your {firstPaidList} list. On one at a time it is charged only when you order a list. Cancel before then and you pay nothing.",
  price: {
    switchLabel: "Show prices in",
    perMonth: "month",
    perList: "list",
    popular: "Most people choose this",
    tax: { USD: "plus tax where it applies", CAD: "plus HST" },
  },
  /** Shown on /zack only, so the vocabulary rule does not apply to it. */
  zackWarning:
    "Check your report for client names or private details before pasting. It is read by Roger’s team and by Cora, Roger’s ranking agent, and is never published.",
  questions,
  /** Header links. The footer shows the same five under the same labels. */
  nav: {
    howItWorks: "How it works",
    pricing: "Pricing",
    library: "Use cases",
    faq: "FAQ",
    about: "About",
  },
  footer: {
    place: "Roger, Toronto",
    /** The link to /agents. The spec's "agents" is "AI agents" here (vocabulary rule; approved by Peter). */
    agents: "For people who run AI agents",
    privacy: "Privacy",
    terms: "Terms",
  },
  notFound: {
    title: "That page isn’t here",
    line: "The link may be old or mistyped.",
    home: "Go to the homepage",
  },
  /** The browser title, the search description and the social card's one line: the homepage headline and sub-line. */
  meta: {
    title: `Roger: ${headline}`,
    headline,
    description: subLine,
  },

  // --- Shared blocks ---
  priceBlock: {
    title: "Price",
    monthly: { name: "Monthly", note: "A new list every Monday." },
    list: { name: "One list at a time", note: "One list, for one Monday." },
  },
  control: {
    title: "You decide what Zack shares",
    // The spec writes each point as one run of sentences; its first sentence is the title.
    points: [
      { title: "Read every line.", body: "The exact instructions your Zack runs are in your dashboard." },
      { title: "Set your own rules.", body: "Skip whole subjects, block names and words, or add rules in your own words." },
      { title: "Turn sharing off any time in your dashboard.", body: "On monthly your ideas keep coming and the price becomes {higherUsd} a month ({higherCad} in Canada)." },
    ],
    link: { label: "How Zack works", href: "/how-it-works#zack" },
  } satisfies ControlBlockCopy,
  questionsBlock: {
    title: "Questions",
    more: { label: "All questions", href: "/faq" },
  },
  testimonials: { title: "What people say" },
  sample: {
    title: "What arrives on Monday",
    line: "This is one idea, as it arrives.",
    install: {
      title: "Paste to install",
      help: "The button copies this prompt with the full playbook under it. Paste both into your AI agent, then answer its setup questions.",
      copy: "Copy prompt and playbook",
      writtenOn: "Written on",
      writtenOnNote: "Words like “skill” or “routine” may have another name on your AI agent.",
    },
    scores: {
      title: "Cora’s scores",
      outOf: "of 10",
      notScored: "Not scored yet",
      // The spec's five score names, and nothing more: the app's own help text under each is not public copy.
      names: { hours: "Hours saved", reach: "Reach", ease: "Ease to copy", proof: "Proof", surprise: "Surprise" },
    },
    playbook: { title: "The playbook" },
  } satisfies SampleCardCopy & { title: string; line: string },
  bricks: {
    /** Each brick's label for screen readers: "Week 2, idea 1: set up". */
    week: "Week",
    idea: "idea",
    setUp: "set up",
    empty: "not set up yet",
    /** Under a stack. The numbers come from ./compounding.ts. */
    caption: { week: "Week {week}", bricks: "{bricks} bricks" },
  } satisfies BrickWords,

  // --- Pages ---
  home: {
    hero: {
      headline,
      sub: subLine,
      secondary: { label: "See how it works", href: "#how" },
    },
    problem: {
      title: "The problem",
      statements: [
        "Everyone in real estate is being told to use AI. Almost nobody is told what to use it for.",
        "The people getting real work out of AI agents rarely post how. It involves their clients and their business.",
        "So each person works out the same things alone, a few months apart.",
      ],
    },
    how: {
      id: "how",
      title: "How it works",
      steps: [
        { title: "Set up your AI agents", body: "Set up your AI agents. If you don’t have any, our starter team takes about half an hour to install." },
        { title: "Zack reviews your week", body: "Each Sunday, an AI agent called Zack reviews your week and writes up what worked, with client details removed." },
        { title: "Cora picks your three ideas", body: "Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best." },
        { title: "Paste to install", body: "Open one, press copy, paste it into your AI agent. It sets itself up and asks you what it needs to know." },
      ],
    },
    compounds: {
      title: "It compounds",
      line: "Three ideas a week. Each one you set up stays set up. Six months in, your AI agents do things you would not have thought to ask for.",
    },
    whoRuns: {
      title: "Who runs this",
      leadIn: runBy,
      /** Read out for his photograph, once the file exists. */
      photoAlt: "Peter Kuperman",
      link: { label: "Read Peter’s letter", href: "/about" },
    },
    closing: { line: "See what your first {freeLists} Mondays bring." },
  },

  pricing: {
    title: "Pricing",
    meta: pageMeta("Pricing", `${firstIncluded} ${underBothColumns}`),
    included: {
      title: "What is included",
      items: [
        firstIncluded,
        "Your own history of every idea you have received.",
        "Your Zack controls.",
        "A compounding view of what you have set up.",
      ],
    },
    explained: {
      title: "Monthly or one at a time, explained",
      monthly: { title: "Monthly", body: "Three ideas every Monday. Charged once a month, starting with your {firstPaidList} list." },
      list: { title: "One at a time", body: "Order a list for any Monday you want one. You are charged only for the lists you order." },
      under: underBothColumns,
    },
    contributing: {
      title: "How contributing works",
      body: "Roger works because everyone’s Zack contributes. On monthly, if Zack misses a week, the first miss each month is forgiven. A second miss makes that month {higherUsd} ({higherCad} in Canada). We email you both times, and the difference appears on your next invoice. If you switch sharing off in your dashboard, the monthly price is {higherUsd} ({higherCad} in Canada). One-at-a-time lists need that week’s Zack report.",
    },
    refunds: {
      title: "No refunds",
      body: "There are no refunds. You get {freeLists} free lists before any charge, and you can cancel in one click.",
    },
  },

  howItWorks: {
    title: "How it works",
    meta: pageMeta("How it works", mondayOfTheWeek),
    week: {
      title: "The week",
      days: [
        { day: "Sunday", body: "Zack reviews the past seven days of your own AI agent activity and writes up what worked, with client details removed. He runs on his own, or you can upload his report yourself." },
        { day: "Monday", body: mondayOfTheWeek },
        { day: "Tuesday", body: "Open an idea, press copy and paste it into your AI agent. It sets itself up and asks you what it needs to know." },
        { day: "Wednesday", body: "Each idea you set up stays set up, and your three ideas stay in your dashboard for when you want them." },
      ],
    },
    zack: {
      id: "zack",
      title: "Zack, in detail",
      points: [
        { title: "What he reads", body: zackReads },
        { title: "What he never reads", body: zackSkips },
        { title: "What he removes", body: zackRemoves },
        { title: "What you can change", body: "Your dashboard shows the exact instructions your Zack runs. You can tell him to skip whole subjects, block specific words and names, share an outline only, or follow rules you write yourself." },
      ],
      filesLink: { label: "Read the Zack files before you sign up" },
    },
    cora: {
      title: "Cora, in detail",
      body: "Cora scores every play on five things: hours saved, reach, ease to copy, proof and surprise. She never sends you something you already run, and never names who a play came from.",
    },
    anatomy: {
      title: "The anatomy of an idea",
      prefaceLabel: "Added to the top of every playbook",
      notes: [
        { part: "Play", note: "What the idea does, in a sentence." },
        { part: "Trigger", note: "What starts it." },
        { part: "Setup first", note: "What your AI agent asks you once, before the first run." },
        { part: "Steps", note: "What your AI agent does, in order." },
        { part: "Guardrails", note: "What it must never do." },
        { part: "Output", note: "What you get back." },
        { part: "Pitfalls seen", note: "What went wrong for someone else, and the fix." },
        { part: "Done when", note: "How you know it worked." },
        { part: "Paste to install", note: "The prompt you copy. The playbook goes with it." },
      ],
    },
    firstWeeks: {
      title: "Your first {freeLists} weeks",
      steps: [
        "You start, and we ask for a card. It is not charged.",
        "Zack runs on Sunday.",
        "Your first {freeLists} Monday lists arrive. They are free.",
        "After your {lastFreeList} list, we email you with what happens next.",
        "On monthly, your card is charged with your {firstPaidList} list. On one at a time, it is charged only when you order a list. Cancel before then and you pay nothing.",
        "If no first list is delivered within {trialCloseDays} days of sign-up, the trial closes without a charge.",
      ],
    },
    noAgent: {
      title: "If you have no AI agent yet",
      body: "You can still start. The startup page walks you through installing one and setting up a starter team for real estate.",
      link: { label: "Go to the startup page", href: "/getstarted" },
    },
  },

  faq: {
    title: "Questions",
    /** The description lists the page's four groups, by their own titles. */
    meta: pageMeta("Questions", `${questions.map((group) => group.title).join(", ")}.`),
  },

  about: {
    title: "About",
    meta: pageMeta("About", runBy),
    leadIn: runBy,
    /** Read out for his photograph and for his signature, once each file exists. */
    photoAlt: "Peter Kuperman",
    signatureAlt: "Peter’s signature",
  },

  library: {
    band: "This is what people post in public. Roger sends you what works in private.",
  },
} satisfies SharedCopy & Record<string, unknown>;

// The /agents headline and sub-line, which that page's browser title and search description repeat.
const agentsHeadline = "Stop figuring out AI agents alone.";
const agentsSubLine = "Every Monday, Roger sends you the three plays most worth installing, drawn from what other heavy users ran last week.";

/**
 * /agents, for people who already run AI agents. Kept apart from `v1` because
 * this page may say "agent" on its own (spec 0.4).
 */
export const v1Agents = {
  /** The browser title, the search description and the shared link's one line: this page's own headline and sub-line. */
  meta: {
    title: `Roger: ${agentsHeadline}`,
    headline: agentsHeadline,
    description: agentsSubLine,
  },
  hero: {
    headline: agentsHeadline,
    sub: agentsSubLine,
    secondary: { label: "Run Zack on yourself first", href: "/zack" },
  },
  /**
   * The strip under the hero. The spec's line is "Zack files for Claude, Duet,
   * Grok Bot and Hark. Any other agent adapts one with a single prompt." The
   * names are not typed here: the page takes them from src/data/zack.ts, the
   * agents whose file exists, so the sentence stays true when a file is added
   * or removed (agentsStripLine in src/components/site/v1/agents.tsx).
   */
  strip: {
    title: "Works with every agent",
    filesFor: "Zack files for",
    and: "and",
    others: "Any other agent adapts one with a single prompt.",
  },
  problem: {
    title: "The problem",
    statements: [
      "The most useful things people do with agents never get posted. They involve clients, money, and how the business runs.",
      "What gets posted is the highlight reel, never the playbook.",
      "So you work out alone what someone else solved last month.",
    ],
  },
  how: {
    title: "How it works",
    steps: [
      { title: "Add Zack", body: "Add Zack to your agent. He reviews your past seven days and writes up your best plays, with identities removed." },
      {
        title: "Cora picks your three",
        body: "Cora scores every play in the pool on hours saved, reach, ease to copy, proof and surprise, then picks the three that fit your work and that you don’t already run.",
      },
      { title: "Paste to install", body: "Each idea comes with a full playbook. Paste it into your agent and it adapts itself to your setup." },
    ],
  },
  closing: { line: "Find out what other heavy users know." },
};

/**
 * /zack and /zack/[agent], the free Zack run, linked from /agents only. Kept
 * apart from `v1` for the same reason. The warning above the paste box is
 * `v1.zackWarning`, because shared behaviour needs it.
 */
const zackTitle = "Run Zack on yourself first";
const zackIntro = "Zack runs in your own agent account and writes up your best plays from the past seven days. Nothing is sent to Roger unless you paste it here.";

/**
 * In this object "[agent]" stands for the agent's name and "[max]" for the
 * report's size limit. The page and the actions fill them in. They are not
 * written {agent}, because names in braces are amounts from the settings.
 */
export const v1Zack = {
  /** The browser title, the search description and the shared link's one line. */
  meta: { title: `Roger: ${zackTitle}`, headline: zackTitle, description: zackIntro },
  title: zackTitle,
  intro: zackIntro,
  steps: ["Pick your agent", "Your email", "Run Zack once", "Paste the report back"],
  /** Read out before a step's number, for screen readers: "Step 3: Run Zack once". */
  step: "Step",
  copyPrompt: "Copy",
  copied: "Copied",
  /** /zack: one entry per agent. */
  picker: {
    file: "Zack file for",
    version: "Version",
    choose: "Run Zack on [agent]",
    noFile: "No Zack file yet. You start from the Hark file and ask [agent] to adapt it.",
    chooseNoFile: "Adapt Zack for [agent]",
  },
  notListed: {
    title: "Agent not listed?",
    body: "Start from the Hark file and ask your own agent to adapt it.",
    link: "Start from the Hark file",
    /** The name used in headings when the visitor's agent is not one we list. */
    name: "your agent",
  },
  /** /zack/[agent]: above the steps. */
  agentPage: {
    title: "Run Zack on [agent]",
    back: "Pick another agent",
    loading: "Loading your run…",
  },
  email: {
    title: "Your email",
    body: "Use the email you would sign up with. Your report can only be attached to an account with the same email.",
    label: "Email address",
    submit: "Show me the instructions",
    pending: "Starting…",
    invalid: "Enter a valid email address.",
    limited: "Too many tries with this email. Try again in an hour.",
    limitedHere: "Too many tries from here. Try again in an hour.",
    /**
     * Shown when the address holds a run link that opens nothing. One line for every cause, so it tells nobody
     * whether the link was mistyped, replaced or used. It ends on a link to /signin: lead, then the link's words.
     */
    expired: "That run link is no longer active. Start again with the same email and you get a new one.",
    expiredSignInLead: "Already use Roger?",
    expiredSignIn: "Sign in",
    started: "Your run is ready.",
    continue: "Continue to the instructions",
  },
  noDatabase: "Saving is not switched on here yet, so a report cannot be pasted back. You can still read the instructions and run Zack.",
  ourSide: "Something went wrong on our side. Try again in a minute.",
  run: {
    title: "Run Zack once",
    fileLead: "Give [agent] the Zack file. Download it, or copy its text.",
    fileName: "Zack The Collector for",
    version: "Version",
    download: "Download the file",
    copyFile: "Copy the file",
    adaptLead: "There is no Zack file for [agent] yet. Start from the Hark file and ask your own agent to adapt it with this prompt.",
    adaptLabel: "Your agent",
    adaptPlaceholder: "e.g. ChatGPT",
    adaptBlank: "[INSERT AGENT]",
    adaptPrompt:
      "I want you to take the Zack The Collector file, and update it so that it works for [agent]. I then want you to create a .md file for my agent I can download and then do a test run and produce a markdown file",
    adaptCopy: "Copy prompt",
    adaptAfter: "That test run is your report. Skip the next prompt and paste the report below.",
    promptLead: "Attach the file (or paste its text), then send this:",
    prompt: "Run Zack the Collector now from the attached file and create a .md output file.",
    comeBack: "When Zack finishes, come back and paste your report below. This page’s address holds your place, so you can bookmark it or leave the tab open.",
  },
  paste: {
    title: "Paste the report back",
    label: "Your Zack report",
    submit: "Save my report",
    pending: "Saving…",
    empty: "Paste your report first.",
    tooLong: "That is over [max] characters. Paste the run file only, without the matching profile.",
    limited: "Too many tries. Try again in an hour.",
    notSaved: "We could not save this report, because this run link is no longer active. Start again with your email, then paste the report there.",
    startAgain: "Start again",
  },
  afterPaste: {
    title: "Your top plays",
    saved: "Your report is saved.",
    noPlays: "We could not read the plays in your report. It is saved all the same.",
    next: "Start with the same email and this report becomes your first run.",
    already: "We have your report for this run. Pasting another replaces it.",
    again: "Paste a different report",
  },
};

export type V1Copy = typeof v1;
export type V1AgentsCopy = typeof v1Agents;
export type V1ZackCopy = typeof v1Zack;

/** The three copy objects with every amount filled in, ready for a page. */
export function v1Copy(amounts: Amounts): { copy: V1Copy; agents: V1AgentsCopy; zack: V1ZackCopy } {
  return { copy: fillCopy(v1, amounts), agents: fillCopy(v1Agents, amounts), zack: fillCopy(v1Zack, amounts) };
}

/**
 * What PriceBlock takes, from filled copy: the shared price words, the block's
 * own, the trial line and the button. Pages call this and do not merge by hand.
 */
export function priceBlockCopy(copy: Pick<V1Copy, "priceBlock" | "price" | "trialLine" | "buttons">): PriceBlockCopy {
  return { ...copy.priceBlock, ...copy.price, trialLine: copy.trialLine, start: copy.buttons.start };
}

/** What ClosingBand takes, from filled copy and the page's own closing line. */
export function closingBandCopy(copy: Pick<V1Copy, "trialLine" | "buttons">, line: string): ClosingBandCopy {
  return { line, start: copy.buttons.start, trialLine: copy.trialLine };
}

/** The questions a page shows: its own subset in the order of /faq. */
export function questionsOn(copy: Pick<V1Copy, "questions">, page: QuestionPage): Question[] {
  return copy.questions.flatMap((group) => group.items.filter((item) => item.on.includes(page)));
}
