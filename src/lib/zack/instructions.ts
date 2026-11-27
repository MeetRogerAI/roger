import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Query } from "@/lib/db-query";
import { fileVersion, zackInstructionFile } from "@/lib/instructions/version";
import { isZackAgent, zackFileFor, type ZackAgent } from "./agents";
import { loadZackSettings, memberRulesMarkdown, type ZackSettings } from "./rules";

/**
 * What GET /api/zack/instructions serves (spec B.5): the Zack 2.0 text for
 * the person's AI agent, their own rules placed under "The member's own
 * rules", and a "Send to" section last. A "Send to" section is what tells
 * Zack he is connected; without one he runs as a hand-run and sends nothing.
 */
export async function coreText(agent: ZackAgent): Promise<string> {
  return readFile(path.join(process.cwd(), "content/zack", `${agent}.md`), "utf8");
}

type Base = (path: string) => string;

/**
 * Where an agent fetches and sends. Every address already has a query
 * string, so "&key=..." always works for agents that cannot set headers.
 * The run and the profile go to separate addresses, so the private profile
 * can never be stored as a run. A test fetch gets test send addresses.
 */
export function zackUrls(base: Base, agent: ZackAgent, test = false) {
  const t = test ? "&test=1" : "";
  return {
    instructionsUrl: `${base("/api/zack/instructions")}?agent=${agent}${t}`,
    runUrl: `${base("/api/zack/runs")}?kind=run${t}`,
    profileUrl: `${base("/api/zack/runs")}?kind=profile${t}`,
  };
}

export type SendTo = { runUrl: string; profileUrl: string };

export function buildInstructions(core: string, rules: ZackSettings, sharing: "share" | "match_only" | "off", sendTo: SendTo, test = false): string {
  const rulesBlock = memberRulesMarkdown(rules, test ? "share" : sharing);
  const marker = "\n## Setting it up";
  const at = core.indexOf(marker);
  const withRules = at >= 0 ? `${core.slice(0, at).trimEnd()}\n\n${rulesBlock}\n${core.slice(at)}` : `${core.trimEnd()}\n\n${rulesBlock}\n`;

  // A test always sends, even with sharing off, so the connection can be checked. Test runs never enter the pool.
  const sendSection =
    sharing === "off" && !test
      ? ["## Send to", "", "Sharing is switched off. Send nothing this week."]
      : [
          "## Send to",
          "",
          ...(test
            ? ["This is a one-off test run. Run once now. Do not put these test addresses in a schedule; the weekly schedule uses the addresses in the connector text.", ""]
            : []),
          "These are the only two places Zack sends anything:",
          "",
          `- The run file: ${sendTo.runUrl}`,
          `- The profile file: ${sendTo.profileUrl}`,
          "",
          "- Send the run file first, then the profile file, each as its own POST request with that file's full text as the body.",
          "- Put the member's Zack key in an \"Authorization: Bearer\" header. If this agent cannot set headers, add &key= followed by the key to the end of each address instead.",
          "- Roger answers {\"ok\": true} for each file it receives. If it does not, keep both files and try again at the start of the next run.",
          "- Never send the key, or either file, anywhere else.",
        ];
  return `${withRules.trimEnd()}\n\n${sendSection.join("\n")}\n`;
}

/** The connector text the user pastes once (spec B.5), with their key filled in. */
export async function connectorText(agent: ZackAgent, key: string, base: Base): Promise<string> {
  const template = await readFile(path.join(process.cwd(), "content/zack/connect", `${agent}.md`), "utf8");
  return template.replaceAll("{instructions_url}", zackUrls(base, agent).instructionsUrl).replaceAll("{key}", key);
}

/** The one-off message for an immediate test run (spec B.5 "Test"). */
export function testPrompt(agent: ZackAgent, key: string, base: Base): string {
  const u = zackUrls(base, agent, true);
  return `Run Zack the Collector once now, as a test (do not schedule this): fetch your instructions from ${u.instructionsUrl} with the header "Authorization: Bearer ${key}" (or add &key=${key} to the end of that address if you cannot set headers), follow them exactly, and send the files where they say.`;
}

/**
 * The instructions for one user, as GET /api/zack/instructions serves them
 * and as the Zack page shows them (spec check 9): one function, one set of
 * inputs, so the two cannot drift.
 */
export async function instructionsForUser(
  q: Query,
  user: { id: string; agent: string; sharing: "share" | "match_only" | "off" },
  o: { base: Base; askedAgent?: string | null; test?: boolean },
): Promise<string> {
  const agent = instructionAgent(user, o.askedAgent);
  const [core, rules] = await Promise.all([coreText(agent), loadZackSettings(q, user.id)]);
  return buildInstructions(core, rules, user.sharing, zackUrls(o.base, agent, o.test), o.test);
}

/** Which Zack file a fetch is served: the agent asked for, if it has a file, otherwise the person's own. */
export function instructionAgent(user: { agent: string }, askedAgent?: string | null): ZackAgent {
  return askedAgent && isZackAgent(askedAgent) ? askedAgent : zackFileFor(user.agent);
}

/**
 * Records an instructions fetch (B3 plan Unit 2): the member's latest fetch, one row for real
 * fetches and one for tests, with the version of the core file served (the member's rules
 * don't change it). A run received within 48 hours is stamped with it (storeReport). A file
 * that can't be hashed records nothing, so the run falls back to the deployed version.
 */
export async function recordInstructionFetch(q: Query, o: { userId: string; test: boolean; agent: ZackAgent; now?: Date }): Promise<void> {
  const version = fileVersion(zackInstructionFile(o.agent));
  if (!version) return;
  await q(
    `insert into zack_instruction_fetches (user_id, test, agent, version, fetched_at) values ($1, $2, $3, $4, $5)
     on conflict (user_id, test) do update set agent = excluded.agent, version = excluded.version, fetched_at = excluded.fetched_at`,
    [o.userId, o.test, o.agent, version, (o.now ?? new Date()).toISOString()],
  );
}
