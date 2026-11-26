/**
 * /zack and /zack/[agent] (plan U8): the picker and the flow's steps on site
 * version 1, the routes under a version and under Circles, and the rules the
 * pages keep (the warning word for word, one start button carrying the token,
 * a label on every field, no figure of time).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportState, StartRunState } from "@/app/zack/actions";
import type { ReportCopy } from "@/components/site/shared/free-run-form";
import { v3Defaults } from "@/data/config";
import { v1Copy } from "@/data/site/v1";
import { amountsFrom } from "@/lib/site/amounts";
import { nextHeaders, resetNextFakes } from "@/test-helpers/next-fakes";
import { pageMarkup } from "@/test-helpers/page-markup";

vi.hoisted(() => {
  process.env.SITE_VERSION = "v1";
  delete process.env.VERCEL_ENV;
  delete process.env.DATABASE_URL;
});
vi.mock("next/headers", () => nextHeaders);
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => "/zack",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}));

const { V1ZackPicker, V1ZackAgent, FlowView } = await import("./zack");
const { freeRunAgent, freeRunAgents, zackFile, fileVersion, downloadName, OTHER_AGENT } = await import("@/lib/site/zack-files");
const { FreeRunEmailView, FreeRunReportView } = await import("@/components/site/shared/free-run-form");
const { readRun, saveReport, startRun } = await import("@/lib/site/free-run");
const { claimFreeRun } = await import("@/lib/zack/receive");
const { testDb } = await import("@/test-helpers/pglite-db");

const amounts = amountsFrom(v3Defaults);
const { zack, copy } = v1Copy(amounts);
const TOKEN = "Zk3-run_token-Zk3-run_token-Zk3-run_token-0";
const WARNING = "Check your report for client names or private details before pasting. It is read by Roger’s team and by Cora, Roger’s ranking agent, and is never published.";

const text = (markup: string) =>
  markup
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const hrefs = (markup: string) => [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((h) => !h.startsWith("/_next/"));

async function flow(slug: string, state: { db?: boolean; token?: string; run?: { agent: string; hasReport: boolean } | null }) {
  const agent = freeRunAgent(slug)!;
  const file = await zackFile(agent.file);
  return pageMarkup(
    <FlowView agent={agent} file={file} zack={zack} warning={copy.zackWarning} start={copy.buttons.start} cardLine={copy.cardLine} db={state.db ?? true} token={state.token ?? ""} run={state.run ?? null} />,
  );
}

/** Every field a person fills in has a visible label pointing at it. */
function expectLabels(markup: string) {
  const fields = [...markup.matchAll(/<(?:input|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((f) => !f.includes('type="hidden"') && !f.includes('name="_gotcha"'));
  expect(fields.length).toBeGreaterThan(0);
  for (const f of fields) {
    const id = /\bid="([^"]+)"/.exec(f)?.[1];
    expect(id, f).toBeTruthy();
    expect(markup, f).toContain(`<label for="${id}"`);
  }
}

beforeEach(() => resetNextFakes());

describe("the agents of the free run", () => {
  it("are the listed agents and 'other'; one with no file starts from the Hark file", () => {
    const agents = freeRunAgents();
    expect(agents.map((a) => a.slug)).toEqual(["claude", "grok-bot", "duet", "hark", "instinct", "muse", "dots", "viktor", OTHER_AGENT]);
    expect(agents.filter((a) => a.hasOwnFile).map((a) => a.slug)).toEqual(["claude", "grok-bot", "duet", "hark"]);
    for (const a of agents.filter((x) => !x.hasOwnFile)) expect(a).toMatchObject({ file: "zack-the-collector-hark.md", fileFor: "Hark" });
    expect(freeRunAgent("other")).toMatchObject({ name: null, hasOwnFile: false });
    expect(freeRunAgent("zack-the-collector-claude.md")).toBeNull();
    expect(freeRunAgent("")).toBeNull();
  });

  it("show each file's real version, read from the file", async () => {
    const file = await zackFile("zack-the-collector-claude.md");
    expect(file.version).toBe(fileVersion(file.text));
    expect(file.version).toMatch(/^\d+\.\d+$/);
    expect(file.text.startsWith("# Zack The Collector (for Claude)")).toBe(true);
    expect(fileVersion("no version line")).toBe("");
    expect(downloadName("Claude", "2.0")).toBe("Zack The Collector (for Claude) v2.0.md");
    expect(downloadName("Claude", "")).toBe("Zack The Collector (for Claude).md");
  });
});

describe("/zack on v1: the picker", () => {
  it("has the heading, the four steps, and a link to each agent's own page", async () => {
    const markup = await pageMarkup(<V1ZackPicker version="v1" />);
    expect(markup).toContain('data-site="v1"');
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(text(markup)).toContain("Run Zack on yourself first");
    for (const step of zack.steps) expect(text(markup)).toContain(step);
    expect(hrefs(markup)).toEqual(["/zack/claude", "/zack/grok-bot", "/zack/duet", "/zack/hark", "/zack/instinct", "/zack/muse", "/zack/dots", "/zack/viktor", "/zack/other"]);
    expect(markup).toMatch(/<a [^>]*href="\/zack\/claude"[^>]*>Run Zack on Claude<\/a>/);
  });

  it("shows the version each file states, for the agents that have one", async () => {
    const markup = await pageMarkup(<V1ZackPicker version="v1" />);
    for (const slug of ["claude", "grok-bot", "duet", "hark"]) {
      const card = new RegExp(`<li data-agent="${slug}"[\\s\\S]*?</li>`).exec(markup)![0];
      const { version } = await zackFile(freeRunAgent(slug)!.file);
      expect(text(card), slug).toContain(`Version ${version}`);
    }
  });

  it("sends an agent with no file, and 'Agent not listed?', to the path that starts from the Hark file", async () => {
    const markup = await pageMarkup(<V1ZackPicker version="v1" />);
    const viktor = /<li data-agent="viktor"[\s\S]*?<\/li>/.exec(markup)![0];
    expect(text(viktor)).toContain("No Zack file yet. You start from the Hark file and ask Viktor to adapt it.");
    expect(text(viktor)).not.toContain("Version");
    expect(text(markup)).toContain("Agent not listed? Start from the Hark file and ask your own agent to adapt it.");
    expect(markup).toMatch(/<a [^>]*href="\/zack\/other"[^>]*>Start from the Hark file<\/a>/);
  });

  it("has no start button, no price and no figure of time", async () => {
    const markup = await pageMarkup(<V1ZackPicker version="v1" />);
    expect(hrefs(markup).filter((h) => h.startsWith("/start"))).toEqual([]);
    expect(text(markup)).not.toMatch(/\$|\d\s*(hours?|minutes?)\b/i);
    expect(text(markup)).not.toContain("[agent]");
  });
});

describe("/zack/[agent] on v1: the steps", () => {
  it("with no run, shows the email step alone: a labelled field, the honeypot, and no instructions", async () => {
    const markup = await flow("claude", {});
    expect(text(markup)).toContain("Step 2: Your email");
    expect(markup).toContain('name="_gotcha"');
    expect(markup).toMatch(/<input type="hidden" name="agent" value="claude"\/>/);
    expect(markup).toMatch(/<button type="submit"[^>]*>Show me the instructions<\/button>/);
    expectLabels(markup);
    expect(markup).not.toContain("data-run-prompt");
    expect(markup).not.toContain("<textarea");
    expect(text(markup)).not.toContain(zack.email.expired);
    expect(text(markup)).not.toContain(zack.noDatabase);
  });

  it("with a token that opens nothing, returns to the email step with one plain line and a way to sign in", async () => {
    const markup = await flow("claude", { token: TOKEN, run: null });
    const notice = /<p role="status" data-run-notice[\s\S]*?<\/p>/.exec(markup)![0];
    expect(text(notice)).toBe("That run link is no longer active. Start again with the same email and you get a new one. Already use Roger? Sign in");
    expect(notice).toMatch(/<a [^>]*href="\/signin"[^>]*>Sign in<\/a>/);
    // It says nothing of why: not that a run was used, attached or replaced, and nothing of an account for this email.
    expect(text(notice)).not.toMatch(/claim|attach|account|replac|expire|already (used|have)/i);
    // The email field is right under it, to start again with.
    expect(markup.indexOf("data-run-notice")).toBeLessThan(markup.indexOf('name="email"'));
    expect(markup).not.toContain("data-run-prompt");
    expect(markup).not.toContain("<textarea");
    // Nothing on the page repeats the token.
    expect(markup).not.toContain(TOKEN);
  });

  it("after a start, shows a new email, an email with a run waiting and an email whose run is on an account the same page", async () => {
    const { query } = await testDb();
    const now = new Date("2026-11-29T23:00:00Z");
    const report = "## 1. Client email in two tones";
    const waiting = await startRun(query, { email: "bo@example.com", agent: "claude", now });
    await saveReport(query, { token: waiting.token, report, now });
    const taken = await startRun(query, { email: "cy@example.com", agent: "claude", now });
    await saveReport(query, { token: taken.token, report, now });
    const [user] = await query<{ id: string }>("insert into users (email, status, sharing, pending_zack_token) values ('cy@example.com', 'trial', 'share', $1) returning id", [taken.token]);
    expect(await claimFreeRun(query, user.id, "23:59", now)).toBe(true);

    const page = async (token: string) => (await flow("claude", { token, run: await readRun(query, token, "claude") })).replaceAll(token, "[token]");
    const pages: string[] = [];
    for (const email of ["ana@example.com", "bo@example.com", "cy@example.com"]) {
      const { token } = await startRun(query, { email, agent: "claude", now: new Date(now.getTime() + 60_000) });
      pages.push(await page(token));
    }
    // The run's own page: the instructions and an empty paste box, with no start button yet.
    expect(pages[0]).toContain("data-run-prompt");
    expect(pages[0]).toContain("<textarea");
    expect(pages[0]).not.toContain("data-run-notice");
    expect(hrefs(pages[0]).filter((h) => h.startsWith("/start"))).toEqual([]);
    expect(pages[1]).toBe(pages[0]);
    expect(pages[2]).toBe(pages[0]);
    // The two earlier links, one replaced and one that was attached to an account, now show the same page as each other.
    const old = [await page(waiting.token), await page(taken.token)];
    expect(old[0]).toContain("data-run-notice");
    expect(old[1]).toBe(old[0]);
  });

  it("with no database, says saving is not switched on and still shows the instructions", async () => {
    const markup = await flow("claude", { db: false });
    expect(/<p role="status" data-no-database[^>]*>([^<]*)<\/p>/.exec(markup)?.[1]).toBe(zack.noDatabase);
    expect(markup).toContain("data-run-prompt");
    expect(markup).not.toContain("<textarea");
    expect(text(markup)).not.toContain(zack.email.expired);
    // No paste box, so nothing points to one.
    expect(text(markup)).not.toContain(zack.run.comeBack);
    expect(text(await flow("claude", { token: TOKEN, run: { agent: "claude", hasReport: false } }))).toContain(zack.run.comeBack);
  });

  it("with a live run, shows the instructions: the file with its real version, and the run-once prompt in a code block with a Copy button", async () => {
    const markup = await flow("claude", { token: TOKEN, run: { agent: "claude", hasReport: false } });
    const { version } = await zackFile("zack-the-collector-claude.md");
    const step = /<section id="step-3"[\s\S]*?<\/section>/.exec(markup)![0];
    expect(text(step)).toContain("Step 3: Run Zack once");
    expect(text(step)).toContain(`Zack The Collector for Claude Version ${version}`);
    expect(step).toMatch(new RegExp(`<a class="btn btn-m" href="/zack/zack-the-collector-claude.md" download="Zack The Collector \\(for Claude\\) v${version.replace(".", "\\.")}\\.md">Download the file</a>`));
    const prompt = /<div data-run-prompt[\s\S]*?<\/div>/.exec(step)![0];
    expect(prompt).toMatch(/<pre[^>]*><code[^>]*>Run Zack the Collector now from the attached file and create a \.md output file\.<\/code><\/pre>/);
    expect(prompt).toMatch(/<button type="button"[^>]*><span aria-live="polite">Copy<\/span><\/button>/);
    // No email step once the run is live, and no adapting prompt for an agent with its own file.
    expect(markup).not.toContain('name="email"');
    expect(text(markup)).not.toContain("update it so that it works for");
  });

  it("puts the warning above the paste box, word for word", async () => {
    const markup = await flow("claude", { token: TOKEN, run: { agent: "claude", hasReport: false } });
    expect(copy.zackWarning).toBe(WARNING);
    const step = /<section id="step-4"[\s\S]*?<\/section>/.exec(markup)![0];
    expect(text(step)).toContain("Step 4: Paste the report back");
    // The warning, then the box's own label, with nothing between them.
    expect(text(step)).toContain(`${WARNING} Your Zack report`);
    expect(step.indexOf(WARNING)).toBeLessThan(step.indexOf("<textarea"));
    expect(step).toMatch(new RegExp(`<input type="hidden" name="run" value="${TOKEN}"/>`));
    expect(step).toContain('name="_gotcha"');
    expect(step).toMatch(/<button type="submit"[^>]*>Save my report<\/button>/);
    expectLabels(step);
    // Nothing to start with until a report is in.
    expect(hrefs(markup).filter((h) => h.startsWith("/start"))).toEqual([]);
  });

  it("with a report already in, offers the one start button, carrying the token and the audience", async () => {
    const markup = await flow("claude", { token: TOKEN, run: { agent: "claude", hasReport: true } });
    expect(hrefs(markup).filter((h) => h.startsWith("/start"))).toEqual([`/start?path=agents&zack=${TOKEN}`]);
    expect(markup).toMatch(/<a class="btn btn-l" href="\/start\?path=agents&amp;zack=[^"]+">Get two free Monday lists<\/a>/);
    expect(text(markup)).toContain("We have your report for this run. Pasting another replaces it.");
    expect(text(markup)).toContain(copy.cardLine);
    // The paste box is still there, under its warning.
    expect(markup).toContain("<textarea");
    expect(markup).toContain(WARNING);
  });

  it("for an agent with no file, starts from the Hark file with the adapting prompt naming the agent", async () => {
    const markup = await flow("viktor", { token: TOKEN, run: { agent: "viktor", hasReport: false } });
    expect(text(markup)).toContain("There is no Zack file for Viktor yet. Start from the Hark file and ask your own agent to adapt it with this prompt.");
    expect(markup).toContain('href="/zack/zack-the-collector-hark.md"');
    expect(text(markup)).toContain("update it so that it works for Viktor .");
    expectLabels(/<section id="step-4"[\s\S]*?<\/section>/.exec(markup)![0]);
  });

  it("for an agent we do not list, asks for its name in a labelled field", async () => {
    const markup = await flow("other", { token: TOKEN, run: { agent: "other", hasReport: false } });
    expect(text(markup)).toContain("There is no Zack file for your agent yet.");
    expect(text(markup)).toContain("update it so that it works for [INSERT AGENT] .");
    const step = /<section id="step-3"[\s\S]*?<\/section>/.exec(markup)![0];
    expect(text(step)).toContain("Your agent");
    expectLabels(step);
  });

  it("shows no price, no figure of time and no unfilled name in any state", async () => {
    for (const state of [{}, { db: false }, { token: TOKEN, run: { agent: "claude", hasReport: true } }]) {
      const markup = await flow("claude", state);
      // The Zack file's own text rides in the Copy button's data, not on the page.
      expect(text(markup)).not.toMatch(/\$|\d\s*(hours?|minutes?)\b/i);
      expect(text(markup)).not.toMatch(/\[agent\]|\[max\]|\{\w+\}/);
    }
  });

  it("keeps the heading in the static shell and reads the run under Suspense", async () => {
    const markup = await pageMarkup(<V1ZackAgent version="v1" agent={freeRunAgent("claude")!} searchParams={Promise.resolve({})} />);
    expect(markup).toContain('data-site="v1"');
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(text(markup)).toContain("Run Zack on Claude");
    expect(markup).toMatch(/<a [^>]*href="\/zack"[^>]*>Pick another agent<\/a>/);
    // No database in this test: the email step, the line about saving, and the instructions.
    expect(text(markup)).toContain("Step 2: Your email");
    expect(text(markup)).toContain(zack.noDatabase);
    const other = await pageMarkup(<V1ZackAgent version="v1" agent={freeRunAgent("other")!} searchParams={Promise.resolve({ run: ["a", "b"] })} />);
    expect(text(other)).toContain("Run Zack on your agent");
  });

  it("holds the steps' column to most of a screen from the start, so the footer does not jump when they stream in (U10 acceptance)", async () => {
    const markup = await pageMarkup(<V1ZackAgent version="v1" agent={freeRunAgent("other")!} searchParams={Promise.resolve({})} />);
    // The column that holds the Suspense boundary reserves its height whether the fallback or the steps are in it.
    const column = /<div data-flow-column="true" class="([^"]*)">/.exec(markup);
    expect(column, "the steps' column").not.toBeNull();
    expect(column![1].split(" ")).toContain("min-h-[70svh]");
    expect(markup).toContain('id="step-2"');
    expect(markup.indexOf("data-flow-column")).toBeLessThan(markup.indexOf('id="step-2"'));
  });
});

/**
 * What the two forms show for each answer from their actions. The forms keep
 * the answer in React state, which a server render cannot set, so these render
 * the views the forms hand that answer to.
 */
describe("/zack/[agent] on v1: after an answer from the server", () => {
  const reportCopy: ReportCopy = {
    label: zack.paste.label,
    submit: zack.paste.submit,
    pending: zack.paste.pending,
    startAgain: zack.paste.startAgain,
    warning: copy.zackWarning,
    summaryTitle: zack.afterPaste.title,
    saved: zack.afterPaste.saved,
    noPlays: zack.afterPaste.noPlays,
    next: zack.afterPaste.next,
    already: zack.afterPaste.already,
    again: zack.afterPaste.again,
    start: copy.buttons.start,
    cardLine: copy.cardLine,
  };
  const emailCopy = { label: zack.email.label, submit: zack.email.submit, pending: zack.email.pending, started: zack.email.started, continue: zack.email.continue };
  const report = (state: ReportState, over: { hasReport?: boolean; pasteOver?: boolean; pending?: boolean } = {}) =>
    pageMarkup(<FreeRunReportView agent="claude" token={TOKEN} hasReport={over.hasReport ?? false} pasteOver={over.pasteOver} pending={over.pending} copy={reportCopy} state={state} />);
  const email = (state: StartRunState, pending = false) => pageMarkup(<FreeRunEmailView agent="claude" copy={emailCopy} state={state} pending={pending} />);
  const startLinks = (markup: string) => hrefs(markup).filter((h) => h.startsWith("/start"));
  const START = `/start?path=agents&zack=${TOKEN}`;

  it("lists the play titles in the report's order, then the one start button carrying the token", async () => {
    const titles = ["Client email in two tones", "Zoning lookup in plain words", "Listing sheet from rough notes"];
    const markup = await report({ status: "ok", titles });
    expect(text(markup)).toContain("Your top plays Your report is saved.");
    const list = /<ol\b[\s\S]*?<\/ol>/.exec(markup)![0];
    expect([...list.matchAll(/<li\b[^>]*>([^<]*)<\/li>/g)].map((m) => m[1])).toEqual(titles);
    expect(text(markup)).not.toContain(zack.afterPaste.noPlays);
    expect(startLinks(markup)).toEqual([START]);
    expect(markup).toMatch(/<a class="btn btn-l" href="\/start\?path=agents&amp;zack=[^"]+">Get two free Monday lists<\/a>/);
    expect(text(markup)).toContain(copy.cardLine);
    // The summary stands in for the paste box, with a way back to it.
    expect(markup).not.toContain("<textarea");
    expect(markup).toMatch(/<button type="button"[^>]*>Paste a different report<\/button>/);
    expect(text(markup)).not.toMatch(/\$|\d\s*(hours?|minutes?)\b/i);
  });

  it("with no titles, says the plays could not be read and that the report is saved, and still offers the start button", async () => {
    for (const state of [{ status: "ok", titles: [] }, { status: "ok" }] satisfies ReportState[]) {
      const markup = await report(state);
      expect(text(markup)).toContain("Your report is saved.");
      expect(text(markup)).toContain("We could not read the plays in your report. It is saved all the same.");
      expect(markup).not.toMatch(/<ol\b|<li\b/);
      expect(startLinks(markup)).toEqual([START]);
    }
  });

  it("on a link that is no longer active, says so with the start-again link, keeps the pasted text, and offers no start button", async () => {
    const pasted = "## 1. Client email in two tones\nA play.";
    const markup = await report({ status: "gone", message: zack.paste.notSaved, values: { report: pasted } });
    const alert = /<p role="alert"[\s\S]*?<\/p>/.exec(markup)![0];
    expect(text(alert)).toBe(`${zack.paste.notSaved} Start again`);
    // Back to the agent's own page with no token, which is the email step.
    expect(alert).toMatch(/<a [^>]*href="\/zack\/claude"[^>]*>Start again<\/a>/);
    expect(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/.exec(markup)![1]).toBe(pasted);
    expect(startLinks(markup)).toEqual([]);
  });

  it("on an error, fills the paste box again with what was pasted and says what was wrong beside it", async () => {
    const pasted = "x".repeat(300);
    const refused = await report({ status: "error", errors: { report: zack.paste.empty }, values: { report: pasted } });
    const box = /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/.exec(refused)!;
    expect(box[1]).toBe(pasted);
    expect(box[0]).toContain('aria-invalid="true"');
    const errorId = /<p id="([^"]+)" role="alert"[^>]*>Paste your report first\.<\/p>/.exec(refused)![1];
    expect(/aria-describedby="([^"]+)"/.exec(box[0])![1].split(" ")).toContain(errorId);
    // A message for the whole form (a limit, or a failure on our side) keeps the text too, with no start-again link.
    const limited = await report({ status: "error", message: zack.paste.limited, values: { report: pasted } });
    expect(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/.exec(limited)![1]).toBe(pasted);
    expect(text(/<p role="alert"[\s\S]*?<\/p>/.exec(limited)![0])).toBe(zack.paste.limited);
    expect(hrefs(limited)).toEqual([]);
    // Text with markup in it comes back as text.
    const odd = await report({ status: "error", message: zack.ourSide, values: { report: "</textarea><b>&" } });
    expect(odd).toContain("&lt;/textarea&gt;&lt;b&gt;&amp;</textarea>");
  });

  it("on an error, fills the email field again with what was typed and says what was wrong beside it", async () => {
    const refused = await email({ status: "error", errors: { email: zack.email.invalid }, values: { email: "ana@example" } });
    const field = /<input\b[^>]*name="email"[^>]*>/.exec(refused)![0];
    expect(field).toContain('value="ana@example"');
    expect(field).toContain('aria-invalid="true"');
    const errorId = /<p id="([^"]+)" role="alert"[^>]*>Enter a valid email address\.<\/p>/.exec(refused)![1];
    expect(field).toContain(`aria-describedby="${errorId}"`);
    for (const message of [zack.email.limited, zack.email.limitedHere, zack.ourSide]) {
      const markup = await email({ status: "error", message, values: { email: "ana@example.com" } });
      expect(/<input\b[^>]*name="email"[^>]*>/.exec(markup)![0], message).toContain('value="ana@example.com"');
      expect(text(/<p role="alert"[\s\S]*?<\/p>/.exec(markup)![0])).toBe(message);
    }
    // Before any answer the field is empty.
    expect(/<input\b[^>]*name="email"[^>]*>/.exec(await email({ status: "idle" }))![0]).toContain('value=""');
  });

  it("once a run has started, shows the way on to its page, for a browser with no script", async () => {
    const markup = await email({ status: "ok", token: TOKEN });
    expect(text(markup)).toBe("Your run is ready. Continue to the instructions");
    expect(hrefs(markup)).toEqual([`/zack/claude?run=${TOKEN}`]);
    expect(markup).not.toContain("<form");
  });

  it("shows the paste box again once the visitor chooses to paste a different report, with the start button kept", async () => {
    const markup = await report({ status: "ok", titles: ["Client email in two tones"] }, { hasReport: true, pasteOver: true });
    expect(markup).toContain("<textarea");
    expect(text(markup)).toContain("We have your report for this run. Pasting another replaces it.");
    expect(text(markup)).not.toContain("Your top plays");
    expect(startLinks(markup)).toEqual([START]);
  });

  it("names what it is doing on each button while an answer is on its way", async () => {
    expect(await report({ status: "idle" }, { pending: true })).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Saving…<\/button>/);
    expect(await email({ status: "idle" }, true)).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Starting…<\/button>/);
  });
});

describe("the routes", () => {
  async function routes(site: string) {
    vi.resetModules();
    process.env.SITE_VERSION = site;
    return { zack: await import("@/app/zack/page"), agent: await import("@/app/zack/[agent]/page") };
  }
  const props = (agent: string, search: Record<string, string> = {}) => ({ params: Promise.resolve({ agent }), searchParams: Promise.resolve(search) });
  const notFound = expect.objectContaining({ digest: expect.stringContaining("404") });

  it("under a site version, /zack is the picker, open to search", async () => {
    const { zack: page } = await routes("v1");
    const markup = await pageMarkup(await page.default());
    expect(text(markup)).toContain("Pick your agent");
    expect(markup).not.toContain("Zack The Collector Page");
    expect(markup).not.toContain("not built yet");
    expect(page.metadata).toEqual({
      title: { absolute: "Roger: Run Zack on yourself first" },
      description: zack.intro,
      alternates: { canonical: "/zack" },
      openGraph: { url: "/zack", title: "Run Zack on yourself first", description: zack.intro },
    });
  });

  it("under a site version, /zack/[agent] is open to search, and kept out once its address carries a run token", async () => {
    const { agent: page } = await routes("v1");
    expect(page.instant).toBe(false);
    expect(page.generateStaticParams()).toContainEqual({ agent: "claude" });
    expect(page.generateStaticParams()).toContainEqual({ agent: "other" });
    const plain = await page.generateMetadata(props("claude"));
    expect(plain).toEqual({
      title: { absolute: "Roger: Run Zack on yourself first: Claude" },
      description: zack.intro,
      alternates: { canonical: "/zack/claude" },
      openGraph: { url: "/zack/claude", title: "Run Zack on yourself first", description: zack.intro },
    });
    for (const run of [TOKEN, "", "not-a-token"]) {
      const withRun = await page.generateMetadata(props("claude", { run }));
      expect(withRun.robots, run).toEqual({ index: false, follow: false });
      expect(withRun.alternates).toEqual({ canonical: "/zack/claude" });
    }
    const markup = await pageMarkup(await page.default(props("claude")));
    expect(text(markup)).toContain("Run Zack on Claude");
  });

  it("under a site version, an agent that is not in the list is not found", async () => {
    const { agent: page } = await routes("v1");
    await expect(page.default(props("nobody"))).rejects.toEqual(notFound);
    await expect(page.default(props("zack-the-collector-claude.md"))).rejects.toEqual(notFound);
    expect(await page.generateMetadata(props("nobody"))).toEqual({ robots: { index: false, follow: false } });
  });

  for (const site of ["circles", "legacy"]) {
    it(`under ${site}, /zack is the Hampton page and /zack/claude is not found (covers AE8, AE9)`, async () => {
      // "legacy" is not a version the override accepts: it is Circles with circlesMode off.
      vi.resetModules();
      if (site === "legacy") {
        vi.doMock("@/data/config", async (orig) => {
          const real = await orig<typeof import("@/data/config")>();
          return { ...real, siteConfig: { ...real.siteConfig, flags: { ...real.siteConfig.flags, circlesMode: false } } };
        });
      }
      process.env.SITE_VERSION = "circles";
      const zackPage = await import("@/app/zack/page");
      const agentPage = await import("@/app/zack/[agent]/page");
      const hampton = await import("@/app/hampton/page");
      const markup = await pageMarkup(await zackPage.default());
      expect(markup).toContain("Zack The Collector Page");
      expect(markup).toBe(await pageMarkup(await hampton.default()));
      expect(markup).not.toContain("Pick your agent");
      for (const agent of ["claude", "other"]) await expect(agentPage.default(props(agent)), agent).rejects.toEqual(notFound);
      expect(await agentPage.generateMetadata(props("claude", { run: TOKEN }))).toEqual({ robots: { index: false, follow: false } });
      vi.doUnmock("@/data/config");
    });
  }
});
