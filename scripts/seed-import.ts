/**
 * Imports seed runs into the pool before the admin page exists (plan Unit 11).
 *
 *   node --env-file=.env.local node_modules/vite-node/vite-node.mjs --config vitest.config.ts scripts/seed-import.ts -- \
 *     --label "Rob" --agent hark [--date YYYY-MM-DD] [--replace] --yes "artifacts/v3/Zack Runs/Zack Run - Rob - 2026-11-12.md"
 *
 * Writes to whatever database DATABASE_URL names: it says which, and does
 * nothing without --yes. Needs AI Gateway credentials for intake and merging.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { gatewayMergeModel } from "@/lib/cora/merge";
import { dateFromFileName, importSeedRun, SeedRunExists } from "@/lib/cora/seed-import";
import { query } from "@/lib/db-query";
import { gatewayModel } from "@/lib/intake/model";

const args = process.argv.slice(2).filter((a) => a !== "--");
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) {
    console.error(`--${name} needs a value`);
    process.exit(1);
  }
  args.splice(i, 2);
  return v;
};
const yes = flag("yes");
const replace = flag("replace");
const label = opt("label");
const agent = opt("agent");
const date = opt("date");
const files = args;

const fail = (msg: string) => {
  console.error(msg);
  process.exit(1);
};
if (!label || !agent || !files.length) fail('Usage: seed-import --label "Name" --agent hark [--date YYYY-MM-DD] [--replace] --yes <file.md> [more files]');
if (date && files.length > 1) fail("--date applies to one file; name each file with its date instead.");
// Check every file before the first write.
const plan = files.map((file) => {
  if (!existsSync(file)) fail(`${file}: not found`);
  const ranOn = date ?? dateFromFileName(basename(file));
  if (!ranOn) fail(`${file}: no date in the file name; pass --date YYYY-MM-DD`);
  return { file, ranOn: ranOn!, text: readFileSync(file, "utf8") };
});

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host;
  } catch {
    return "(DATABASE_URL is not set)";
  }
})();
console.log(`Database: ${host}`);
if (!yes) fail("Nothing written. Add --yes to import into that database.");

for (const p of plan) {
  try {
    const r = await importSeedRun(query, { label: label!, agent: agent!, text: p.text, ranOn: p.ranOn, replace }, { model: gatewayModel, merge: gatewayMergeModel, query });
    console.log(
      `${basename(p.file)}: week ${r.weekOf}${r.replaced ? " (replaced)" : ""}, intake ${r.intake}, pool +${r.merge.created} new, ${r.merge.joined} joined${r.merge.failed ? `, ${r.merge.failed} kept separate after an error` : ""}${r.merge.busy ? ", merge waiting: Cora is placing plays" : ""}`,
    );
  } catch (e) {
    if (e instanceof SeedRunExists) console.error(`${basename(p.file)}: ${e.message}`);
    else throw e;
    process.exitCode = 1;
  }
}
