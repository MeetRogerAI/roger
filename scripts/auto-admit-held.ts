/**
 * Auto-admit backfill (2026-11-27, Peter): applies the auto-admit rules to
 * every play still held with flags, once. Harm is dropped; a missing playbook
 * is drafted; names are redacted; what cannot be made private is kept as a
 * title-only outline (dropped if its title holds a name). A play whose model
 * call fails stays held for the next run. Admitted plays join the pool at the
 * next Cora merge.
 *
 *   node --env-file=.env.local node_modules/vite-node/vite-node.mjs --config vitest.config.ts scripts/auto-admit-held.ts -- [--limit 500] [--yes]
 *
 * Without --yes it is a dry run: no model call, nothing written, and it
 * prints what it would do. With --yes it writes to whatever database
 * DATABASE_URL names (it says which) and needs AI Gateway credentials for
 * drafting and the name review. Safe to run again: a play already admitted or
 * dropped is never touched twice, and each pass handles at most --limit plays.
 */
import { query } from "@/lib/db-query";
import { autoAdmitHeld } from "@/lib/intake/auto-admit-held";
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
const limitArg = opt("limit");
const limit = limitArg === undefined ? 500 : Number(limitArg);
if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
  console.error("--limit must be a whole number from 1 to 5000");
  process.exit(1);
}
if (args.length) {
  console.error(`Unknown arguments: ${args.join(" ")}. Usage: auto-admit-held [--limit 500] [--yes]`);
  process.exit(1);
}

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host;
  } catch {
    return "(DATABASE_URL is not set)";
  }
})();
console.log(`Database: ${host}`);
console.log(yes ? `Applying to at most ${limit} held plays.` : `Dry run over at most ${limit} held plays: no model calls, nothing written.`);

const t = await autoAdmitHeld(query, gatewayModel, { apply: yes, limit });
const verb = yes ? "" : "would be ";
console.log(
  [
    `held plays read: ${t.held}`,
    `${verb}dropped for harm: ${t.dropped}`,
    `${verb}admitted: ${t.admitted}`,
    `  ${verb}drafted by Roger: ${t.drafted}`,
    `  ${verb}names redacted: ${t.redacted}`,
    `  ${verb}outline only: ${t.outlined}${yes ? "" : " (sensitive; a draft or name review that finds nothing usable adds to this when applied)"}`,
    ...(yes ? [`left held (changed meanwhile, or a model call failed; run again): ${t.skipped}`] : []),
    `still held after this pass: ${t.left}`,
  ].join("\n"),
);
if (!yes) console.log("Nothing written. Add --yes to apply.");
