import type { RunListRow } from "./settings";

/**
 * The Status lines on /app/zack (spec B.5 item 1). Connected means a report
 * sent by Zack himself arrived after the current key was made; an upload or a
 * report sent with an older key does not count.
 */
export function statusLines(o: {
  keyPrefix: string;
  keyCreatedAt: string | null;
  sharing: "share" | "match_only" | "off";
  runs: RunListRow[];
  when: (iso: string) => string;
}): string[] {
  const sentWithThisKey = o.runs.filter((r) => r.route === "connector" && (!o.keyCreatedAt || r.received_at >= o.keyCreatedAt));
  const lines: string[] = [];
  if (!o.keyPrefix) lines.push("Not connected yet: make your key below and paste the connector text into your AI agent.");
  else if (sentWithThisKey.some((r) => !r.is_test)) lines.push("Connected.");
  else if (sentWithThisKey.length) lines.push("Connected: test received.");
  else lines.push("Not connected yet: paste the connector text into your AI agent, then send the test prompt.");

  const last = o.runs.filter((r) => !r.is_test).sort((a, b) => (a.received_at < b.received_at ? 1 : -1))[0];
  if (last) {
    const route = { connector: "sent by Zack", upload: "uploaded", free_tool: "from the free tool", admin: "added by Roger" }[last.route] ?? last.route;
    lines.push(`Last report: ${o.when(last.received_at)}, ${route}, ${last.plays} ${last.plays === 1 ? "play" : "plays"}.`);
  }
  lines.push(o.sharing === "off" ? "Zack is off, so no report is expected." : "Next report expected: Sunday at 6:00 PM in your time zone.");
  return lines;
}
