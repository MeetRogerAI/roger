import { z } from "zod";
import { categories } from "@/data/categories";
import { LEVEL_QUIZ_VERSION, rogerLevels } from "@/data/roger-levels-quiz";
import { isZackAgent } from "@/lib/zack/agents";

/**
 * The sign-up quiz (spec B.4): seven questions on one screen. The answers become
 * the profile Cora matches on, and they set one of three paths. The quiz
 * never blocks anyone.
 */

export const usesAgents = ["not_yet", "most_weeks", "every_day"] as const;
export const agentCounts = ["none", "1-2", "3-5", "6+"] as const;
export const newSoftware = ["avoid", "if_shown", "often"] as const;

export const quizSchema = z
  .object({
    work: z.enum(["real_estate", "other"]),
    role: z.string().trim().min(2, "Tell us your role and kind of business, in a few words.").max(120),
    uses: z.enum(usesAgents),
    // Question 3 is "choose any": people often run more than one agent.
    agents: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
    agentOther: z.string().trim().max(60).default(""),
    // The one ticked agent marked primary: the first ticked unless the person picks another.
    primary: z.string().trim().max(40).default(""),
    count: z.enum(agentCounts),
    // Question 5: their AI agent level, 0 to 9 (src/data/roger-levels-quiz.ts, levels v1.1).
    level: z.coerce.number().int().min(rogerLevels[0].level).max(rogerLevels[rogerLevels.length - 1].level),
    // Which levels list the answer was given on. Answers saved before v1.1 have no
    // marker: their level is on the v1.0 list, 0 to 8 ("artifacts/Roger AI Agent
    // Levels and Check Charts v1.0.md"), where 8 meant "8 or above". No backfill.
    levelQuiz: z.literal(LEVEL_QUIZ_VERSION).optional(),
    help: z.array(z.enum(categories)).max(categories.length).default([]),
    software: z.enum(newSoftware),
  })
  .refine((a) => !a.agents.includes("other") || a.agentOther.length > 0, { message: "Which AI agent?", path: ["agentOther"] });

export type QuizAnswers = z.infer<typeof quizSchema>;

export type SignupPath = "running" | "new" | "not_ready";

/**
 * running: uses AI agents every day, or runs three or more.
 * not_ready: "Not yet" and "I avoid it" (launch list D8).
 * new: everyone else.
 */
export function routeFor(a: Pick<QuizAnswers, "uses" | "count" | "software">): SignupPath {
  if (a.uses === "every_day" || a.count === "3-5" || a.count === "6+") return "running";
  if (a.uses === "not_yet" && a.software === "avoid") return "not_ready";
  return "new";
}

/** Reads the quiz form. Field errors are keyed by field name for the form to show inline. */
export function parseQuiz(fd: FormData, agentSlugs: readonly string[]):
  | { ok: true; answers: QuizAnswers }
  | { ok: false; errors: Record<string, string> } {
  const raw = {
    work: fd.get("work") ?? undefined,
    role: fd.get("role") ?? "",
    uses: fd.get("uses") ?? undefined,
    agents: [...new Set(fd.getAll("agent"))],
    agentOther: fd.get("agentOther") ?? "",
    primary: fd.get("primary") ?? "",
    count: fd.get("count") ?? undefined,
    level: fd.get("level") || undefined,
    help: fd.getAll("help"),
    software: fd.get("software") ?? undefined,
  };
  const r = quizSchema.safeParse(raw);
  const errors: Record<string, string> = {};
  if (!r.success) {
    for (const issue of r.error.issues) {
      // The checkboxes are all named "agent"; the form shows their error under that name.
      const k = issue.path[0] === "agents" ? "agent" : String(issue.path[0] ?? "form");
      errors[k] ??= messages[k] ?? issue.message;
    }
    return { ok: false, errors };
  }
  const offered = [...agentSlugs, "other", "not_sure"];
  if (!r.data.agents.every((a) => offered.includes(a))) return { ok: false, errors: { agent: messages.agent } };
  // Kept in the order the quiz lists them; "Not sure yet" alongside a named agent adds nothing.
  const named = offered.filter((a) => a !== "not_sure" && r.data.agents.includes(a));
  const agents = named.length ? named : ["not_sure"];
  // A primary that isn't ticked (or is "Not sure yet") is ignored, and the default applies.
  const primary = r.data.primary !== "not_sure" && agents.includes(r.data.primary) ? r.data.primary : "";
  return { ok: true, answers: { ...r.data, agents, primary, levelQuiz: LEVEL_QUIZ_VERSION } };
}

/**
 * The one agent the account is set up for first (users.agent, which picks the
 * Zack file): the one marked primary, else the first chosen agent that has its
 * own Zack file, else the first chosen, with "Another one" standing for the
 * name typed. Members can switch agent on /app/zack.
 */
export function primaryAgent(a: Pick<QuizAnswers, "agents" | "agentOther" | "primary">): string {
  const marked = a.primary && a.agents.includes(a.primary) ? a.primary : undefined;
  const first = marked ?? a.agents.find(isZackAgent) ?? a.agents[0] ?? "not_sure";
  return first === "other" ? a.agentOther : first;
}

const messages: Record<string, string> = {
  work: "Choose one.",
  role: "Tell us your role and kind of business, in a few words.",
  uses: "Choose one.",
  agent: "Choose at least one.",
  agentOther: "Which AI agent?",
  count: "Choose one.",
  level: "Choose the one closest to you.",
  software: "Choose one.",
};
