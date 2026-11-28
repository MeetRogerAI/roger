/**
 * The release snapshot script (plan U10): what it refuses, and that it writes
 * nothing then; what it writes, and that a file failing the strict test is put
 * back. Against a temporary file and a stand-in for the site.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Refused, canonicalJson, exportAddress, fetchExport, snapshot, summary } from "./snapshot-content.mjs";

const EMPTY = `${JSON.stringify({ format: 1, lists: {}, sections: {}, text: {} }, null, 2)}\n`;
const EXPORT = { format: 1, text: { "home.hero.headline": "Preview's headline." }, sections: { home: { order: [], off: ["compounds"] } }, lists: {} };

let file: string;
let said: string[];
let fetched: string[];
beforeEach(() => {
  file = path.join(mkdtempSync(path.join(tmpdir(), "snapshot-")), "released.json");
  writeFileSync(file, EMPTY);
  said = [];
  fetched = [];
});

const site = (status: number, body: unknown, headers: Record<string, string> = {}) => async (url: URL) => {
  fetched.push(url.href);
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
};
const run = (o: { site: string; fetch: unknown; check?: () => boolean }) => snapshot({ file, check: () => true, log: (line: string) => said.push(line), warn: (line: string) => said.push(line), ...o });
const unchanged = () => expect(readFileSync(file, "utf8")).toBe(EMPTY);

describe("the release snapshot", () => {
  it("writes the export with its keys in order, says what changed, and passes", async () => {
    expect(await run({ site: "https://preview.example.test", fetch: site(200, EXPORT) })).toBe(0);
    expect(fetched).toEqual(["https://preview.example.test/api/site-content/published"]);
    const now = readFileSync(file, "utf8");
    expect(now).toBe(canonicalJson(EXPORT));
    expect(Object.keys(JSON.parse(now))).toEqual(["format", "lists", "sections", "text"]);
    const out = said.join("\n");
    expect(out).toContain("1 text(s) added, 0 changed, 0 back to the code's wording; 1 page(s) with other sections; 0 list(s) changed.");
    expect(out).toContain("+ home.hero.headline: “Preview's headline.”");
  });

  it("says there is no change when the file already holds the export", async () => {
    writeFileSync(file, canonicalJson(EXPORT));
    expect(await run({ site: "https://preview.example.test", fetch: site(200, EXPORT) })).toBe(0);
    expect(said.join("\n")).toContain("No change");
  });

  it("puts the file back as it was when the new one fails the strict test of this checkout", async () => {
    expect(await run({ site: "https://preview.example.test", fetch: site(200, EXPORT), check: () => false })).toBe(1);
    unchanged();
    expect(said.join("\n")).toContain("put back as it was");
  });

  it("refuses an http address that is not this machine, and asks nothing", async () => {
    expect(await run({ site: "http://preview.example.test", fetch: site(200, EXPORT) })).toBe(1);
    expect(fetched).toEqual([]);
    unchanged();
    expect(said.join("\n")).toContain("is not https");
  });

  it("reads http on localhost", () => {
    expect(exportAddress("http://localhost:3000").href).toBe("http://localhost:3000/api/site-content/published");
    expect(exportAddress("http://127.0.0.1:3000/").href).toBe("http://127.0.0.1:3000/api/site-content/published");
    expect(() => exportAddress("https://user:pw@preview.example.test")).toThrow("user name or a password");
  });

  it("refuses a 503, writing nothing, and says what the site said", async () => {
    expect(await run({ site: "https://preview.example.test", fetch: site(503, { error: "The published content could not be read just now." }) })).toBe(1);
    unchanged();
    expect(said.join("\n")).toContain("answered 503, not 200. It says: The published content could not be read just now.");
  });

  it("refuses a 409, writing nothing, and lists what to fix", async () => {
    expect(await run({ site: "https://preview.example.test", fetch: site(409, { error: "Cannot be released.", problems: ["Shared, Header: Link 2 · Label (nav.pricing.label): 30 characters, and the most is 24."] }) })).toBe(1);
    unchanged();
    expect(said.join("\n")).toContain("  - Shared, Header: Link 2 · Label (nav.pricing.label): 30 characters, and the most is 24.");
  });

  it("refuses an answer that is not an overlay of the format this checkout reads, writing nothing", async () => {
    for (const body of ["<html>not json</html>", [], { text: {} }, { format: "1", text: {}, sections: {}, lists: {} }, { format: 2, text: {}, sections: {}, lists: {} }, { ...EXPORT, draft: {} }, { ...EXPORT, text: [] }]) {
      expect(await run({ site: "https://preview.example.test", fetch: site(200, body) }), JSON.stringify(body)).toBe(1);
      unchanged();
    }
  });

  it("refuses an answer larger than a release file can be, and a site that does not answer", async () => {
    expect(await run({ site: "https://preview.example.test", fetch: site(200, EXPORT, { "content-length": "999999999" }) })).toBe(1);
    expect(
      await run({
        site: "https://preview.example.test",
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    ).toBe(1);
    unchanged();
  });

  it("summarises changed, removed and list changes", () => {
    const before = { format: 1, text: { a: "One", b: "Two" }, sections: {}, lists: { l: { order: [], removed: ["x"], added: [] } } };
    const after = { format: 1, text: { a: "Uno" }, sections: {}, lists: {} };
    const lines = summary(before, after);
    expect(lines[0]).toBe("released.json: 0 text(s) added, 1 changed, 1 back to the code's wording; 0 page(s) with other sections; 1 list(s) changed.");
    expect(lines).toContain("  ~ a: “One” → “Uno”");
    expect(lines).toContain("  ~ the list l: back to the code's");
  });

  it("puts the file back when the strict test cannot even be run, and leaves no other file beside it", async () => {
    const check = () => {
      throw new Error("spawn node ENOENT");
    };
    expect(await run({ site: "https://preview.example.test", fetch: site(200, EXPORT), check })).toBe(1);
    unchanged();
    expect(said.join("\n")).toContain("The strict test could not be run: spawn node ENOENT");
    expect(readdirSync(path.dirname(file))).toEqual(["released.json"]);
  });

  it("removes a file it created when there was none and the strict test fails", async () => {
    rmSync(file);
    expect(await run({ site: "https://preview.example.test", fetch: site(200, EXPORT), check: () => false })).toBe(1);
    expect(existsSync(file)).toBe(false);
  });
});

describe("the release snapshot against a real server on this machine", () => {
  let server: Server;
  let base: string;
  /** What the server does with each request. */
  let handle: (req: IncomingMessage, res: ServerResponse) => void;
  beforeEach(async () => {
    server = createServer((req, res) => handle(req, res));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return () => new Promise<void>((done) => server.close(() => done()));
  });
  const fetchFrom = (o: { timeoutMs?: number; maxBytes?: number } = {}) => fetchExport(exportAddress(base), o);

  it("reads a 200 overlay", async () => {
    handle = (_req, res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(EXPORT));
    expect(await fetchFrom()).toEqual(EXPORT);
  });

  it("follows no redirect, to another site or to its own", async () => {
    for (const to of ["https://elsewhere.example.test/api/site-content/published", `${base}/api/site-content/published?again`]) {
      handle = (_req, res) => res.writeHead(302, { location: to }).end();
      await expect(fetchFrom(), to).rejects.toThrow(Refused);
      await expect(fetchFrom(), to).rejects.toThrow("redirect");
    }
  });

  it("refuses an answer that grows past the size limit with no length given", async () => {
    handle = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write(`{"format":1,"text":{"a":"${"x".repeat(5000)}`);
      res.end(`${"y".repeat(5000)}"},"sections":{},"lists":{}}`);
    };
    await expect(fetchFrom({ maxBytes: 4000 })).rejects.toThrow("more than the 4000 bytes");
  });

  it("refuses a site that stops halfway through its answer, within the time limit", async () => {
    handle = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"format":1,');
      // and nothing more
    };
    await expect(fetchFrom({ timeoutMs: 300 })).rejects.toThrow("stopped before its whole answer was read");
  });

  it("refuses a site that does not answer at all, within the time limit", async () => {
    handle = () => {};
    await expect(fetchFrom({ timeoutMs: 300 })).rejects.toThrow(Refused);
  });

  it("refuses https to a server that does not speak it, saying why", async () => {
    handle = (_req, res) => res.writeHead(200).end("{}");
    await expect(fetchExport(exportAddress(base.replace("http:", "https:").replace("127.0.0.1", "localhost")), { timeoutMs: 2000 })).rejects.toThrow(/did not answer.*fetch failed: /);
  });
});
