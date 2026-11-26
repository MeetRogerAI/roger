/**
 * The AI agent levels (artifacts/Roger AI Agent Levels and Check Charts v1.0.md):
 * how far someone's own AI setup has come. Asked in the sign-up quiz (question 5).
 */
export const agentLevels = [
  { level: 0, name: "Non-user", does: "Nothing. No AI use in the last 4 weeks.", role: "Doing everything yourself" },
  { level: 1, name: "Asker", does: "Answers one-off questions and drafts, starting from zero each time.", role: "Asking" },
  { level: 2, name: "Context-giver", does: "Knows who you are: instructions, memory, projects, your voice. Still only produces text you carry by hand.", role: "Briefing and copying" },
  { level: 3, name: "Delegator", does: "A named agent owns a job, reads your real sources (email, calendar, files), and finishes multi-step work. Anything that sends waits for you.", role: "Approving" },
  { level: 4, name: "Automator", does: "Work starts without you: routines on a schedule or trigger, built from saved skills, each reporting back with a receipt.", role: "Reading receipts" },
  { level: 5, name: "Team builder", does: "Several narrow agents and a coordinator that routes work between them. You stop being the go-between.", role: "Managing one coordinator" },
  { level: 6, name: "Operator", does: "Jobs earn the right to act on their own through a trust ladder. The system is reviewed weekly, kept clean, and recoverable.", role: "Promoting, demoting, reviewing" },
  { level: 7, name: "Autonomous organization", does: "Whole domains (a business function or a household area) run end to end. The system starts work unasked, and other people are served by your agents directly.", role: "Handling exceptions and decisions" },
  { level: 8, name: "Self-evolving", does: "The system finds its own failures, tests them, proposes and builds its own new agents and skills, and retires what isn't used.", role: "Approving changes to the system" },
] as const;
