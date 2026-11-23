/** The AI agents with a Zack 2.0 file in content/zack/. */
export const ZACK_AGENTS = ["claude", "duet", "grok-bot", "hark"] as const;
export type ZackAgent = (typeof ZACK_AGENTS)[number];

export function isZackAgent(a: string): a is ZackAgent {
  return (ZACK_AGENTS as readonly string[]).includes(a);
}

/** The Zack file for a person's AI agent; any other agent adapts the Grok Bot one. */
export function zackFileFor(agent: string): ZackAgent {
  return isZackAgent(agent) ? agent : "grok-bot";
}
