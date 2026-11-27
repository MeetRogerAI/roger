/**
 * The Roger AI agent levels, 0 to 9 (artifacts/Roger AI Agent Levels and
 * Check Charts v1.1.md, section 1), word for word: the name, what the system
 * does, and the "you need it when…" symptom. Asked in the sign-up quiz
 * (question 5), stored with `levelQuiz: "1.1"`.
 *
 * The quiz shows each level's own description, then "Next: Level N+1 when"
 * the next level's symptom. Level 0 has no symptom in the source (nobody needs
 * to reach "Non-user"), so its symptom is null; Level 9 has no Next line.
 *
 * Answers stored without the marker were given on the v1.0 list, 0 to 8
 * ("artifacts/Roger AI Agent Levels and Check Charts v1.0.md"), where 8 meant
 * "8 or above". The quiz doesn't pre-select those: the person answers again.
 */
export type RogerLevel = {
  level: number;
  name: string;
  /** "What the system does". */
  does: string;
  /** "You need it when…". */
  symptom: string | null;
};

export const LEVEL_QUIZ_VERSION = "1.1" as const;

export const rogerLevels: readonly RogerLevel[] = [
  { level: 0, name: "Non-user", does: "Nothing. No AI use in the last 4 weeks.", symptom: null },
  {
    level: 1,
    name: "Asker",
    does: "Answers one-off questions and drafts, starting from zero each time.",
    symptom: "You do everything by hand while everyone around you talks about AI.",
  },
  {
    level: 2,
    name: "Context-giver",
    does: "Knows who you are: instructions, memory, projects, your voice. Still only produces text you carry by hand.",
    symptom: "You re-explain who you are every time you open a chat.",
  },
  {
    level: 3,
    name: "Delegator",
    does: "A named agent owns a job, reads your real sources (email, calendar, files), and finishes multi-step work. Anything that sends waits for you.",
    symptom: "You copy AI output into email, documents and apps, and do all the clicking yourself.",
  },
  {
    level: 4,
    name: "Automator",
    does: "Work starts without you: routines on a schedule or trigger, built from saved skills, each reporting back with a receipt.",
    symptom: 'Nothing happens unless you open a chat and say "go".',
  },
  {
    level: 5,
    name: "Team builder",
    does: "Several narrow agents and a coordinator that routes work between them. You stop being the go-between.",
    symptom: "One agent mixes up its jobs, or you are the switchboard passing work between chats.",
  },
  {
    level: 6,
    name: "Operator",
    does: "Jobs earn the right to act on their own through a trust ladder. The system is reviewed weekly, kept clean, and recoverable.",
    symptom: 'Results end in "should work now", the same correction comes back every week, or the bill grows faster than the work.',
  },
  {
    level: 7,
    name: "Autonomous organization",
    does: "Whole domains (a business function or a household area) run end to end. The system starts work unasked, and other people are served by your agents directly.",
    symptom: "You are still the one who notices what needs doing, and work waits for you.",
  },
  {
    level: 8,
    name: "Self-evolving",
    does: "The system finds its own failures, tests them, proposes and builds its own new agents and skills, and retires what isn't used.",
    symptom: "You are the only one improving the system; every fix is you tinkering.",
  },
  {
    level: 9,
    name: "Multiplier",
    does: "You build agent systems that other people run in their own lives, and your plays are installed and kept by others.",
    symptom: "The only person your system helps is you.",
  },
];
