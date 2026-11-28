// The release snapshot (plan U10, KTD9, R19): reads what preview has published and writes it into the repo as
// src/data/site/released.json, the built-in wording and layout the release carries to production.
//
//   npm run snapshot-content                                   reads https://preview.meetroger.ai
//   npm run snapshot-content -- https://preview.meetroger.ai   the same, said out loud
//   npm run snapshot-content -- http://localhost:3000          a local build (http is allowed for localhost only)
//   SNAPSHOT_FROM=https://… npm run snapshot-content           the address from the environment
//
// Run it while preparing a release, before the merge to main, from a checkout of the code being released. The
// steps around it are in docs/site/content-release.md.
//
// What it does, in order, and nothing else:
//   1. GET <address>/api/site-content/published, over https, with a time limit and a size limit. Anything but a 200
//      answer that is a content overlay of the format this checkout reads is refused: a 503 (preview could not read
//      its database) and a 409 (something published cannot be released, with the list of what to fix) included.
//   2. Writes src/data/site/released.json, keys in order, so the commit's diff shows only what changed. It is written
//      whole or not at all (a new file renamed over the old one), and no redirect is followed.
//   3. Holds the new file to the strict reading of the code being released (src/data/site/released.test.ts: every
//      id known, every name in braces real, every link usable, every covered page renders). If that fails, the
//      file is put back as it was; so it is when the test cannot be run, takes over ten minutes, or is stopped.
//   4. Prints what changed against the file that was there.
// It writes no other path, apart from that new file beside it for a moment. Plain Node, on Windows and elsewhere.
import { spawnSync } from "node:child_process";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RELEASED_FILE = path.join(REPO, "src", "data", "site", "released.json");
export const DEFAULT_SITE = "https://preview.meetroger.ai";
export const EXPORT_PATH = "/api/site-content/published";
/**
 * The longest answer read. A real release file is a few kilobytes; one with every field and every list at its limit
 * is about 1.4 MB (2 MB if every character were written as an escape), so this refuses only what no release can be.
 */
export const MAX_BYTES = 5_000_000;
export const TIMEOUT_MS = 30_000;
/** The longest the strict test may take before it counts as failed. It takes seconds; a hung runner must not hold the new file in place. */
export const CHECK_TIMEOUT_MS = 10 * 60_000;

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

export class Refused extends Error {}

/** The export's address on a site: https, or http on this machine. A bare site address gets the export's path. */
export function exportAddress(site) {
  let url;
  try {
    url = new URL(site);
  } catch {
    throw new Refused(`"${site}" is not an address. Give the site's address, such as ${DEFAULT_SITE}.`);
  }
  const local = LOCAL_HOSTS.includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Refused(`${url.origin} is not https. The snapshot reads a site over https only (http only for localhost).`);
  if (url.username || url.password) throw new Refused("The address holds a user name or a password. The export needs neither.");
  if (url.pathname === "/" || url.pathname === "") url.pathname = EXPORT_PATH;
  url.search = "";
  url.hash = "";
  return url;
}

/** A value as JSON with every object's keys in order, two spaces deep, ending in a newline: how the release file is written. */
export function canonicalJson(value) {
  const sorted = (part) => (isRecord(part) ? Object.fromEntries(Object.keys(part).sort().map((key) => [key, sorted(part[key])])) : Array.isArray(part) ? part.map(sorted) : part);
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

/**
 * The shape of a content overlay: an object with a numeric format and nothing but `format`, `text`, `sections` and
 * `lists`, the last three objects. What is in them is for the strict test to judge, against the code being released.
 */
export function shapeProblem(value, format) {
  if (!isRecord(value)) return "The answer is not an object.";
  if (typeof value.format !== "number") return "The answer has no numeric format.";
  if (format !== undefined && value.format !== format) return `The answer is format ${value.format}, and this checkout reads format ${format}. Take the snapshot from a site that runs the code being released.`;
  const extra = Object.keys(value).filter((key) => !["format", "text", "sections", "lists"].includes(key));
  if (extra.length > 0) return `The answer holds what an overlay does not: ${extra.join(", ")}.`;
  for (const part of ["text", "sections", "lists"]) if (!isRecord(value[part])) return `The answer's "${part}" is not an object.`;
  return null;
}

/** Why a request failed, with the cause Node keeps behind "fetch failed" (a refused connection, a certificate it does not trust). */
const why = (error) => {
  const said = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : "";
  return `${said}${cause}`;
};

/**
 * Writes a file whole or not at all: to a new file beside it, then renamed over it, which replaces it in one step on
 * Windows and elsewhere. A crash or a full disk mid-write leaves the old file as it was, never half of the new one.
 */
export function writeWhole(file, text) {
  const next = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(next, text);
    renameSync(next, file);
  } finally {
    rmSync(next, { force: true });
  }
}

/** Reads a response's body, refusing one longer than `max` bytes. */
async function bodyOf(response, max) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > max) throw new Refused(`The answer is ${length} bytes, more than the ${max} a release file can be.`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Refused(`The answer is more than the ${max} bytes a release file can be.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

/** The overlay a site exports, or a Refused error that says why not. */
export async function fetchExport(url, { fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES, format } = {}) {
  let response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new Refused(`${url.href} did not answer, or answered with a redirect, which the snapshot does not follow (${why(error)}).`);
  }
  let text;
  try {
    text = await bodyOf(response, maxBytes);
  } catch (error) {
    if (error instanceof Refused) throw error;
    // The time limit runs on until the whole answer is read: a site that stops halfway is refused here.
    throw new Refused(`${url.href} stopped before its whole answer was read (${why(error)}).`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (response.status !== 200) {
    const said = isRecord(body) && typeof body.error === "string" ? ` It says: ${body.error}` : "";
    const problems = isRecord(body) && Array.isArray(body.problems) ? body.problems.filter((p) => typeof p === "string") : [];
    throw new Refused([`${url.href} answered ${response.status}, not 200.${said}`, ...problems.map((p) => `  - ${p}`)].join("\n"));
  }
  if (body === undefined) throw new Refused(`${url.href} did not answer with JSON.`);
  const problem = shapeProblem(body, format);
  if (problem) throw new Refused(`${url.href}: ${problem}`);
  return body;
}

const short = (text) => {
  const line = String(text).replace(/\s+/g, " ").trim();
  return line.length > 70 ? `${line.slice(0, 69)}…` : line;
};

/** What changed between two release files, as lines a person reads. */
export function summary(before, after) {
  const was = isRecord(before) ? before : {};
  const lines = [];
  const counts = { added: 0, changed: 0, removed: 0, sections: 0, lists: 0 };
  const part = (value, name) => (isRecord(value) && isRecord(value[name]) ? value[name] : {});
  const [t0, t1] = [part(was, "text"), part(after, "text")];
  for (const id of [...new Set([...Object.keys(t0), ...Object.keys(t1)])].sort()) {
    if (!Object.hasOwn(t0, id)) {
      counts.added++;
      lines.push(`  + ${id}: “${short(t1[id])}”`);
    } else if (!Object.hasOwn(t1, id)) {
      counts.removed++;
      lines.push(`  - ${id}: back to the code's wording (was “${short(t0[id])}”)`);
    } else if (t0[id] !== t1[id]) {
      counts.changed++;
      lines.push(`  ~ ${id}: “${short(t0[id])}” → “${short(t1[id])}”`);
    }
  }
  for (const [name, noun] of [["sections", "the sections of"], ["lists", "the list"]]) {
    const [a, b] = [part(was, name), part(after, name)];
    for (const id of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (canonicalJson(a[id] ?? null) === canonicalJson(b[id] ?? null)) continue;
      counts[name]++;
      lines.push(`  ~ ${noun} ${id}: ${b[id] === undefined ? "back to the code's" : JSON.stringify(b[id])}`);
    }
  }
  const total = counts.added + counts.changed + counts.removed + counts.sections + counts.lists;
  if (total === 0) return ["No change: released.json already holds what the site has published."];
  return [`released.json: ${counts.added} text(s) added, ${counts.changed} changed, ${counts.removed} back to the code's wording; ${counts.sections} page(s) with other sections; ${counts.lists} list(s) changed.`, ...lines];
}

/** The strict test of the release file, on the code of this checkout. True when it passes. */
export function strictTest() {
  // Node itself and the repo's own vitest, by path: nothing depends on PATH, on npx, or on the directory the command was typed in.
  const run = spawnSync(process.execPath, [path.join(REPO, "node_modules", "vitest", "vitest.mjs"), "run", "src/data/site/released.test.ts"], { cwd: REPO, stdio: "inherit", timeout: CHECK_TIMEOUT_MS, windowsHide: true });
  if (run.error) console.error(`The strict test could not be run: ${run.error.message}`);
  // A runner that could not start, timed out or was stopped has no status 0: the file counts as failed.
  return run.status === 0;
}

/**
 * The whole snapshot. `site` is the site's address; the rest is for tests. Returns the exit code: 0 when the file
 * was written (or already held the export) and passed, 1 when nothing was written or it was put back.
 */
export async function snapshot({ site = DEFAULT_SITE, file = RELEASED_FILE, fetch, check = strictTest, log = console.log, warn = console.error } = {}) {
  let before;
  let current;
  try {
    before = readFileSync(file, "utf8");
    current = JSON.parse(before);
  } catch {
    before = null;
  }
  let overlay;
  try {
    const url = exportAddress(site);
    log(`Reading ${url.href}`);
    overlay = await fetchExport(url, { fetch, format: isRecord(current) && typeof current.format === "number" ? current.format : undefined });
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    warn(`Snapshot refused. Nothing was written.\n${error.message}`);
    return 1;
  }
  const next = canonicalJson(overlay);
  if (before === next) {
    log(summary(current, overlay).join("\n"));
    return 0;
  }
  writeWhole(file, next);
  log(`Wrote ${path.relative(REPO, file)}. Checking it against this checkout's code (the strict test)…`);
  // Ctrl-C while the test runs stops the test, and the file is then put back below, instead of this process ending first.
  const keep = () => {};
  process.on("SIGINT", keep);
  let passed = false;
  try {
    passed = check() === true;
  } catch (error) {
    warn(`The strict test could not be run: ${why(error)}`);
  } finally {
    process.off("SIGINT", keep);
  }
  if (!passed) {
    if (before === null) rmSync(file, { force: true });
    else writeWhole(file, before);
    warn("The new release file fails the strict test of this checkout's code (above), so it was put back as it was. The site and this checkout probably disagree on a field, section or list id: take the snapshot from a site that runs the code being released.");
    return 1;
  }
  log(summary(current, overlay).join("\n"));
  log("Read the diff (git diff src/data/site/released.json), run the tests, and commit it with the release.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const site = process.argv.slice(2).find((arg) => arg !== "--") ?? process.env.SNAPSHOT_FROM ?? DEFAULT_SITE;
  process.exitCode = await snapshot({ site });
}
