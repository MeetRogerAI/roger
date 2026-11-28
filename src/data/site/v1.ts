/**
 * Every word on site version 1 (plan R7, R14a, KTD5, KTD8). A wording change
 * is one edit here.
 *
 * Not always the words a visitor reads. Since the Pages editor (plan
 * docs/plans/2026-11-27-0941-feat-admin-cms-plan.md, KTD1), a covered page
 * prints this copy with two layers on top: src/data/site/released.json, what
 * preview had published when the last release was taken, and the edits
 * published in that site's Admin, Website, Pages. An entry in released.json
 * wins over a line here: when you rewrite a line that the release file also
 * holds, change or delete that entry in the same commit, or the change will
 * not show (docs/site/content-release.md). Never rename an id in this file:
 * a stored edit is keyed by it and is lost.
 *
 * The wording is the draft copy in artifacts/v3-marketing-website-spec.md
 * ("Messaging and copy direction") and A.14 of artifacts/Roger v3 - design
 * spec.md, as changed by Peter's decisions. Every line that is not the spec's
 * own words is listed for Peter in docs/site/v1-copy-changes.md:
 * - short labels and the /how-it-works paragraphs, which the spec describes
 *   but does not write;
 * - the lines that state the higher rate, which give the Canadian figure
 *   beside the US one;
 * - Peter's homepage review of November 26, 2026 (section 7 there): the site
 *   speaks to anyone who uses AI agents, not to people in real estate; the
 *   marketing pages show the monthly price only; what arrives each Monday is
 *   called a "Cora Curation"; and every start button reads the same;
 * - Peter's third homepage review, of November 27, 2026 (section 9 there):
 *   "How it works" is merged into the hero, "Who runs this" is gone from the
 *   homepage, the examples section, the shorter line under the price, and the
 *   closing band's own button.
 *
 * Amounts are never typed here. A line names them in braces, {monthlyUsd},
 * {monthlyCad}, {higherUsd}, {higherCad}, {freeLists}, {firstPaidList},
 * {firstPaidWeek}, {lastFreeList} and {trialCloseDays}, and fillCopy in
 * src/lib/site/amounts.ts puts the values in.
 *
 * The week numbers and brick counts of "It compounds" live in
 * ./compounding.ts. The caption words here name them as {week} and {bricks},
 * which fillCopy leaves alone and compoundingCaption in
 * src/lib/site/compounding.ts fills for each stack.
 *
 * Ids. Every item of a list a page prints has an `id` (the questions, the hero
 * steps, the problem statements and the others). Wording edited in the admin is
 * stored under the item's id, never under its place in the list, so an id
 * never changes once it is live and is never given to another item. Ids are
 * letters, digits and hyphens, and none starts with "x-", which marks an item
 * added in the admin. src/lib/site/content/registry.ts refuses a list without
 * them.
 *
 * Vocabulary (spec 0.4): outside `v1Zack`, and the one line
 * `zackWarning`, "agent" never appears without "AI" in front, because some
 * readers are called agents in their own work. A test holds this file to it.
 */
import type { BrickWords, ClosingBandCopy, ControlBlockCopy, PriceBlockCopy, Question, QuestionGroup, SampleCardCopy, SharedCopy } from "./copy-types";

/** The pages that show a subset of the questions: the homepage. /faq shows all of them. (/agents did too, until it was deleted on November 27, 2026.) */
export type QuestionPage = "home";

/**
 * `id` never changes once a question is live: an answer edited in the admin is stored under it. The wording here
 * is the built-in text, which shows when there is no edit.
 */
export type V1Question = Question & { id: string; on: QuestionPage[] };
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

/**
 * The line under the price (Peter's words, November 26, 2026), which "What does
 * it cost?" and the closing band repeat. Both of its counts are the number of
 * free Cora Curations: one arrives each Monday, so that many weeks pass first.
 */
const valueLine = "Get {freeLists} Cora Curations for free and pay only after you have tried the product for {freeLists} full weeks.";
/**
 * When an unused trial closes (Peter, November 28, 2026: the site states main's
 * live rule, src/lib/housekeeping/trial.ts and clocks.ts), said the same way in
 * the terms (./legal.ts) and on /how-it-works. The 14 is HELD_CLOSE_DAYS in
 * src/lib/housekeeping/clocks.ts, a constant rather than a setting, so it is
 * typed here and a test holds it to that constant.
 */
export const trialCloseRule =
  "If no first Cora Curation is delivered, the trial closes without a charge. With a card added, it closes {trialCloseDays} days after you added it. With no card, it closes 14 days after the email with your first Cora Curation’s titles, or {trialCloseDays} days after sign-up if no such email is sent. Each Monday with no Cora Curation because of Roger adds a week.";
/** What a Cora Curation is, said once on each page that names one. */
const curationIs = "three ideas picked for you by Cora, each with a full playbook";

const questions: V1QuestionGroup[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        id: "no-agents-yet",
        q: "I don’t use AI agents yet. Can I start?",
        a: "Yes. The startup page walks you through installing one and setting up a starter team. Most people finish in about half an hour.",
        on: ["home"],
      },
      {
        id: "which-agents",
        q: "Which AI agents does Roger work with?",
        a: "Every AI agent. Zack has ready-made files for Claude, Duet, Grok Bot and Hark. On any other, one prompt adapts him, or you can upload his report yourself.",
        on: [],
      },
      {
        id: "each-week",
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
        id: "zack-reads",
        q: "What does Zack read?",
        a: `${zackReads} ${zackSkips}`,
        on: ["home"],
      },
      {
        id: "what-leaves",
        q: "What leaves my account?",
        a: "Two files each week. Zack’s report is a write-up of your most useful plays, which he is instructed to write with names, clients, addresses, amounts and other private details replaced by placeholders. A private matching profile describes your work and your setup in general words, and is not shared with other users. You agree to this when you sign up, and you can turn it off.",
        on: [],
      },
      {
        id: "see-and-change",
        q: "Can I see and change what Zack does?",
        a: "Yes. Your dashboard shows the exact instructions your Zack runs. You can tell him to skip whole subjects, block specific words and names, share an outline only, or follow rules you write yourself.",
        on: [],
      },
      {
        id: "who-sees",
        q: "Who sees my plays?",
        a: "Other Roger users, without your name or anything that identifies you. A play is described as ‘run by 3 users’, never as yours.",
        on: ["home"],
      },
      {
        id: "competitors",
        q: "I compete with other people on Roger. What if I don’t want to share?",
        a: "You decide exactly what Zack shares, down to skipping whole subjects and blocking names. If you switch sharing off completely in your dashboard, your Cora Curation still arrives every Monday and the price becomes {higherUsd} a month ({higherCad} in Canada).",
        on: [],
      },
      {
        id: "delete-sent",
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
        id: "what-is-a-curation",
        q: "What is a Cora Curation?",
        a: `What arrives each Monday: ${curationIs}. Cora is the AI agent that ranks every play in Roger.`,
        on: ["home"],
      },
      {
        id: "how-chosen",
        q: "How are my three ideas chosen?",
        a: "Cora scores every play on hours saved, reach, ease to copy, proof and surprise, then matches plays to the kind of work your own week shows. She never sends something you already run.",
        on: [],
      },
      {
        id: "does-not-fit",
        q: "What if an idea doesn’t fit me?",
        a: "Paste it into your AI agent anyway and ask how it would apply to you. Every playbook starts by telling your AI agent to adapt it to your setup.",
        on: [],
      },
      {
        id: "other-agent",
        q: "Will an idea work on my AI agent if it came from a different one?",
        a: "Yes. Your own AI agent rewrites the playbook for itself before installing it.",
        on: [],
      },
    ],
  },
  {
    id: "price-and-billing",
    title: "Price and billing",
    items: [
      {
        id: "cost",
        q: "What does it cost?",
        a: `{monthlyUsd} a month, plus tax where it applies. In Canada it is {monthlyCad} a month, plus applicable tax. ${valueLine}`,
        on: ["home"],
      },
      {
        id: "card-charged",
        q: "When is my card charged?",
        a: "The first charge comes with your {firstPaidList} Cora Curation, and the charge repeats once a month after that. Your first {freeLists} Cora Curations are free, and we email you after the {lastFreeList} one with what happens next.",
        on: ["home"],
      },
      {
        id: "why-a-card",
        q: "When do you ask for my card?",
        a: "When your first Cora Curation is ready. It is not charged then: the first charge comes with your {firstPaidList} Cora Curation. Until a card is saved, your first Cora Curation shows only its titles, and the full ideas open once a card is added. If you don’t want to continue, cancel in one click before then and you pay nothing.",
        on: [],
      },
      {
        id: "missed-week",
        q: "What if Zack misses a week?",
        a: "The first miss each month is forgiven. A second miss makes that month {higherUsd} ({higherCad} in Canada). We email you both times.",
        on: [],
      },
      {
        id: "refund",
        q: "Can I get a refund?",
        a: "No, unless we charge you by mistake: then tell us and we refund the mistaken charge in full to your card. You get {freeLists} free Cora Curations before any charge, and you can cancel any time.",
        on: [],
      },
    ],
  },
];

// The homepage headline and sub-line, which the browser title, the search description and the social card repeat.
const headline = "Your AI agents, smarter every Monday.";
const subLine = "Roger makes your AI agents smarter every week, with battle-tested ideas that have already worked for real people in the network.";

// Lines of /how-it-works and /about that each page's search description repeats. None names an amount, so static metadata can read them.
const mondayOfTheWeek = "Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best. They arrive as your Cora Curation, each with a full playbook.";
const runBy = "Roger is run by Peter Kuperman.";

/** A reading page's browser title, search description and shared-link line, from its own heading and one of its own lines. */
const pageMeta = (title: string, description: string) => ({ title: `Roger: ${title}`, headline: title, description });

/** Everything but /zack. The vocabulary rule applies to all of it except `zackWarning`. */
export const v1 = {
  // --- The strings shared behaviour needs (SharedCopy) ---
  buttons: {
    /** Every start button and link on the site, the header's included, reads this (Peter, November 26, 2026). */
    start: "Get {freeLists} free Cora Curations",
    signIn: "Sign in",
    openApp: "Open Roger",
  },
  // Payment at the first Cora Curation (main, plan 2026-11-26-001, Peter): no card at sign-up. The agreed trial line, in this site's naming.
  cardLine: "We ask for your card when your first Cora Curation is ready.",
  /** Under the price (Peter's words, November 27, 2026). The week is the one of the first paid Cora Curation, from the settings. */
  trialLine: "Your first {freeLists} Cora Curations are free. Payment starts no earlier than week {firstPaidWeek}.",
  price: {
    switchLabel: "Show prices in",
    perMonth: "month",
    tax: { USD: "plus tax where it applies", CAD: "plus applicable tax" },
  },
  /**
   * Shown on /zack only, so the vocabulary rule does not apply to it. The first sentence is the spec's (A.11).
   * The rest says what the privacy page's "The free Zack run" says: the report may be read, and after sign-up its plays are shared.
   */
  zackWarning:
    "Check your report for client names or private details before pasting. It may be read by Roger’s team and by Cora, Roger’s ranking agent. If you sign up, its plays are shared with other users in anonymous form.",
  questions,
  /**
   * Header links. "Pricing" goes to the homepage's price section (PRICE_SECTION_HREF in src/lib/site/chrome.ts, which
   * a test holds this to). The ids were the names of these labels before the links were a list, and the admin's
   * edits saved under those names are read under these (src/lib/site/content/format.ts, legacyText).
   */
  nav: [
    { id: "howItWorks", label: "How it works", href: "/how-it-works" },
    { id: "pricing", label: "Pricing", href: "/#price" },
    { id: "library", label: "Use cases", href: "/library" },
    { id: "faq", label: "FAQ", href: "/faq" },
    { id: "about", label: "About", href: "/about" },
  ],
  footer: {
    place: "Roger, Toronto",
    privacy: "Privacy",
    terms: "Terms",
    /** The same five as the header, in another order. */
    links: [
      { id: "pricing", label: "Pricing", href: "/#price" },
      { id: "howItWorks", label: "How it works", href: "/how-it-works" },
      { id: "faq", label: "FAQ", href: "/faq" },
      { id: "about", label: "About", href: "/about" },
      { id: "library", label: "Use cases", href: "/library" },
    ],
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
    monthly: { name: "Monthly", note: `A new Cora Curation every Monday: ${curationIs}.` },
  },
  control: {
    title: "You decide what Zack shares",
    // The spec writes each point as one run of sentences; its first sentence is the title.
    points: [
      { id: "read", title: "Read every line.", body: "The exact instructions your Zack runs are in your dashboard." },
      { id: "rules", title: "Set your own rules.", body: "Skip whole subjects, block names and words, or add rules in your own words." },
      // Peter, November 26, 2026: "Turn sharing off any time in your dashboard. is the hero. The hero is the subhead." Nothing else in this point.
      {
        id: "off",
        title: "Turn sharing off any time in your dashboard.",
        body: "Protect your privacy and your most valuable ideas at any time.",
      },
    ],
    link: { label: "How Zack works", href: "/how-it-works#zack" },
  } satisfies ControlBlockCopy,
  questionsBlock: {
    title: "Questions",
    more: { label: "All questions", href: "/faq" },
  },
  testimonials: { title: "What people say" },
  /**
   * "Cora Curation Examples" (Peter, November 27, 2026): real plays, one shown at a time. The plays and the short
   * title of each are in ./examples.ts. `nav` names the row that switches between them, for a screen reader.
   */
  sample: {
    title: "Cora Curation Examples",
    nav: "Examples",
    /** The first of the card's two headings, and the two rows under it. Every row is folded until it is opened. */
    idea: { title: "The Idea", summary: "Summary", copy: "What To Copy" },
    install: {
      help: "The button copies this prompt with the full playbook under it. Paste both into your AI agent, then answer its setup questions.",
      copy: "Copy prompt and playbook",
    },
    scores: {
      title: "Cora’s scores",
      outOf: "of 10",
      notScored: "Not scored yet",
      // The spec's five score names, and nothing more: the app's own help text under each is not public copy.
      names: { hours: "Hours saved", reach: "Reach", ease: "Ease to copy", proof: "Proof", surprise: "Surprise" },
    },
    /**
     * The second heading. Under it is one folded row, "8 steps" with the count from the play, which opens to a row for each step.
     * `whole` is that row's label for a play whose playbook is not written as numbered parts.
     */
    playbook: { title: "The Playbook", steps: "steps", whole: "The full playbook" },
  } satisfies SampleCardCopy & { title: string; nav: string },
  bricks: {
    /** Each brick's label for screen readers: "Week 2, idea 1: set up". */
    week: "Week",
    idea: "idea",
    setUp: "set up",
    empty: "not set up yet",
    /**
     * Under a stack. The numbers come from ./compounding.ts. The count is said in ideas: each square is one idea
     * (Peter, November 26, 2026: "use the word ideas throughout"). {bricks} is only the count's name in the code.
     */
    caption: { week: "Week {week}", bricks: "{bricks} ideas" },
  } satisfies BrickWords,

  // --- Pages ---
  home: {
    hero: {
      headline,
      sub: subLine,
      /**
       * Beside the headline: how Roger works, in four steps, one at a time (Peter, November 27, 2026: the homepage's
       * "How it works" section is merged into the hero). Each step is its label, its headline and its text.
       */
      graphic: {
        name: "How Roger works, in four parts",
        /** The same name for when the list does not have four steps (an admin may add or remove one in Pages). */
        nameAny: "How Roger works, step by step",
        steps: [
          { id: "use", label: "Use", title: "Set up your AI agents", body: "Set up your AI agents. If you don’t have any, our starter team takes about half an hour to install." },
          { id: "collect", label: "Collect", title: "Zack reviews your week", body: "Each Sunday, an AI agent called Zack reviews your week and writes up what worked, with private details removed." },
          { id: "curate", label: "Curate", title: "Cora picks your three ideas", body: "Early Monday, Cora reads what worked for everyone and picks the three ideas that fit you best. That is your Cora Curation." },
          { id: "deploy", label: "Deploy", title: "Approve The Ideas", body: "Say yes to the ideas you like and see them in action for you." },
        ],
        pause: "Pause",
        play: "Play",
      },
    },
    problem: {
      title: "The problem",
      statements: [
        { id: "told", text: "Everyone is being told to use AI. Almost nobody is told what to use it for." },
        { id: "unposted", text: "The people getting real work out of AI agents rarely post how. It involves their clients and their business." },
        { id: "alone", text: "So each person works out the same things alone, a few months apart." },
      ],
    },
    compounds: {
      title: "It compounds",
      line: "Three ideas a week. Each one you set up stays set up. Six months in, your AI agents do things you would not have thought to ask for.",
      /** The loop's own words: its name for a screen reader, and its one button. */
      loop: { name: "The stack, week by week", pause: "Pause", play: "Play" },
    },
    /**
     * The homepage ends on its line and one button, with nothing under either (Peter, November 27, 2026).
     * This button alone has its own words. Every other start button reads `buttons.start`.
     */
    closing: { line: "See what your first {freeLists} Cora Curations bring.", start: "Level up your use of AI Agents Now." },
  },
  /** Under the closing band's line on /library: the line under the price. */
  closingSub: valueLine,

  howItWorks: {
    title: "How it works",
    meta: pageMeta("How it works", mondayOfTheWeek),
    week: {
      title: "The week",
      days: [
        { id: "sunday", day: "Sunday", body: "Zack reviews the past seven days of your own AI agent activity and writes up what worked, with private details removed. He runs on his own, or you can upload his report yourself." },
        { id: "monday", day: "Monday", body: mondayOfTheWeek },
        { id: "tuesday", day: "Tuesday", body: "Open an idea, press copy and paste it into your AI agent. It sets itself up and asks you what it needs to know." },
        { id: "wednesday", day: "Wednesday", body: "Each idea you set up stays set up, and your three ideas stay in your dashboard for when you want them." },
      ],
    },
    zack: {
      id: "zack",
      title: "Zack, in detail",
      points: [
        { id: "reads", title: "What he reads", body: zackReads },
        { id: "never-reads", title: "What he never reads", body: zackSkips },
        { id: "removes", title: "What he removes", body: zackRemoves },
        { id: "change", title: "What you can change", body: "Your dashboard shows the exact instructions your Zack runs. You can tell him to skip whole subjects, block specific words and names, share an outline only, or follow rules you write yourself." },
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
        { id: "play", part: "Play", note: "What the idea does, in a sentence." },
        { id: "trigger", part: "Trigger", note: "What starts it." },
        { id: "setup-first", part: "Setup first", note: "What your AI agent asks you once, before the first run." },
        { id: "steps", part: "Steps", note: "What your AI agent does, in order." },
        { id: "guardrails", part: "Guardrails", note: "What it must never do." },
        { id: "output", part: "Output", note: "What you get back." },
        { id: "pitfalls", part: "Pitfalls seen", note: "What went wrong for someone else, and the fix." },
        { id: "done-when", part: "Done when", note: "How you know it worked." },
        { id: "paste", part: "Paste to install", note: "The prompt you copy. The playbook goes with it." },
      ],
    },
    firstWeeks: {
      title: "Your first {freeLists} weeks",
      steps: [
        { id: "start", text: "You start. No card is needed yet." },
        { id: "zack-runs", text: "Zack runs on Sunday." },
        { id: "arrive", text: "Your first {freeLists} Cora Curations arrive, one each Monday. They are free. We ask for your card when the first one is ready, and it is not charged then." },
        { id: "email", text: "After your {lastFreeList} Cora Curation, we email you with what happens next." },
        { id: "charged", text: "Your card is charged with your {firstPaidList} Cora Curation, and once a month after that. Cancel before then and you pay nothing." },
        { id: "closes", text: trialCloseRule },
      ],
    },
    noAgent: {
      title: "If you have no AI agent yet",
      body: "You can still start. The startup page walks you through installing one and setting up a starter team.",
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

  /**
   * /library's own words on a site version: its heading, the lines around the rows, and the band it ends on. The
   * rows, and the words inside the search, the filters and the watch form, are not here.
   */
  library: {
    /** The heading, which is set on two lines. */
    title: { first: "The use-case", second: "library" },
    /** "[count]" stands for the number of use cases, which the page puts in. It is not written {count}, because names in braces are amounts from the settings. */
    intro: "[count] real things people’s AI agents did, in our words, each linked to the person’s own post. Read from public posts every morning. None of them are Roger clients.",
    watchLink: "Watch for what you need",
    watch: {
      title: "Not in the library yet?",
      note: "The morning someone’s AI agent does it, you get one email with the link. Every email has a link to stop.",
    },
    band: "This is what people post in public. Roger sends you what works in private.",
  },
} satisfies SharedCopy & Record<string, unknown>;

/**
 * /zack and /zack/[agent], the free Zack run. Kept apart from `v1` because
 * these pages may say "agent" on its own (spec 0.4). The warning above the
 * paste box is `v1.zackWarning`, because shared behaviour needs it. The page
 * that linked here, /agents, was deleted on November 27, 2026; /zack is still
 * served and is in the sitemap.
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
export type V1ZackCopy = typeof v1Zack;

/** Every question with its group and its built-in wording, amounts not yet filled in. The admin's list. */
export function builtInQuestions(): (V1Question & { group: string })[] {
  return questions.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title })));
}

// The copy a page prints, with its amounts filled in and any stored edits in place, is v1Copy in
// src/lib/site/content/model.ts. It is not here, because that module reads this one.

/**
 * What PriceBlock takes, from filled copy: the shared price words, the block's
 * own, the trial line and the button. Pages call this and do not merge by hand.
 */
export function priceBlockCopy(copy: Pick<V1Copy, "priceBlock" | "price" | "trialLine" | "buttons">): PriceBlockCopy {
  return { ...copy.priceBlock, ...copy.price, trialLine: copy.trialLine, start: copy.buttons.start };
}

/** What ClosingBand takes on /library, from filled copy and the page's own closing line. The line under it is the one under the price. */
export function closingBandCopy(copy: Pick<V1Copy, "trialLine" | "buttons" | "closingSub">, line: string): ClosingBandCopy {
  return { line, sub: copy.closingSub, start: copy.buttons.start, trialLine: copy.trialLine };
}

/** The questions a page shows: its own subset in the order of /faq. */
export function questionsOn(copy: Pick<V1Copy, "questions">, page: QuestionPage): (Question & { id: string })[] {
  return copy.questions.flatMap((group) => group.items.filter((item) => item.on.includes(page)));
}
