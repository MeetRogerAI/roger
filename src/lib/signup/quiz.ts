import { z } from "zod";
import { categories } from "@/data/categories";
import { isZackAgent } from "@/lib/zack/agents";

/**
 * The sign-up quiz (spec B.4): six questions on one screen. The answers become
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
    count: z.enum(agentCounts),
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
    count: fd.get("count") ?? undefined,
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
  return { ok: true, answers: { ...r.data, agents: named.length ? named : ["not_sure"] } };
}

/**
 * The one agent the account is set up for first (users.agent, which picks the
 * Zack file): the first chosen agent that has its own Zack file, else the
 * first chosen, with "Another one" standing for the name typed. Members can
 * switch agent on /app/zack.
 */
export function primaryAgent(a: Pick<QuizAnswers, "agents" | "agentOther">): string {
  const first = a.agents.find(isZackAgent) ?? a.agents[0] ?? "not_sure";
  return first === "other" ? a.agentOther : first;
}

const messages: Record<string, string> = {
  work: "Choose one.",
  role: "Tell us your role and kind of business, in a few words.",
  uses: "Choose one.",
  agent: "Choose at least one.",
  agentOther: "Which AI agent?",
  count: "Choose one.",
  software: "Choose one.",
};
