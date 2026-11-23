import { after } from "next/server";
import { query } from "@/lib/db-query";
import { counterFor, hit, limits } from "@/lib/rate-limit";
import { readV3Settings } from "@/lib/v3-settings";
import { authenticate, PRIVATE_HEADERS } from "@/lib/zack/key";
import { checkReport, MAX_REPORT_CHARS, reportText, sendConnected, storeReport } from "@/lib/zack/receive";

export const maxDuration = 30;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE_HEADERS });
const TOO_BIG = `The report is over ${MAX_REPORT_CHARS.toLocaleString("en-US")} characters.`;

/** Reads the body, stopping as soon as it is clearly too big (JSON escapes and UTF-8 allow up to 4 bytes a character). */
async function readCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** POST /api/zack/runs?kind=run|profile (spec B.5 "Send"): returns { ok, week_of, replaced }. */
export async function POST(request: Request) {
  try {
    const user = await authenticate(query, request);
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const test = url.searchParams.get("test") === "1";

    const raw = await readCapped(request, MAX_REPORT_CHARS * 4 + 1000);
    if (raw === null) return json({ ok: false, error: TOO_BIG }, 413);
    const checked = checkReport(reportText(raw), url.searchParams.get("kind"));
    if (!checked.ok) return json({ ok: false, error: checked.error }, checked.status);

    // Only reports that pass the checks count, and tests have their own allowance,
    // so trying the connection on a Sunday afternoon never blocks that evening's run.
    if (!(await hit(`zack:${test ? "test" : "send"}:${user.id}`, limits.zackSendsPerKey, new Date(), counterFor(query)))) {
      return json({ ok: false, error: "Six sends a day is the limit. Keep the files and try again at the next run." }, 429);
    }
    const settings = await readV3Settings();
    const stored = await storeReport(query, user, checked, { route: "connector", test, cutoff: settings.runCutoff });
    // The answer never waits on email: Zack treats a slow answer as a failed send.
    after(() => sendConnected(user, stored, test));
    return json({ ok: true, week_of: stored.week_of, replaced: stored.replaced });
  } catch (e) {
    // Never log the request address: it may carry the key.
    console.error("[zack] send failed", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "Roger could not store the report. Keep it and try again later." }, 503);
  }
}
