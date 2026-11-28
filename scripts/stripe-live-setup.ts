/**
 * Creates (or finds) the Stripe objects production needs: the "Roger Monthly"
 * product, the "Higher monthly rate" product (the first invoice's higher-rate
 * line, S18 point c), the four monthly prices and the live webhook endpoint (launch list
 * g-live-prices, g-live-webhook; src/lib/billing/live-setup.ts).
 *
 * Run it from the checkout that is linked to the Vercel project (has
 * .vercel/project.json), with the key in an env file that is deleted after:
 *
 *   node --env-file=<file holding STRIPE_SECRET_KEY> node_modules/vite-node/vite-node.mjs --config vitest.config.ts \
 *     scripts/stripe-live-setup.ts -- [--mode live|test] [--apply] [--write-vercel] [--replace]
 *
 * Without --apply it only prints the account, its tax settings and what it
 * would do. --mode (default live) must match the key's own mode.
 * --write-vercel (with --apply) checks the Vercel link and which variables
 * already exist BEFORE touching Stripe, then writes the webhook signing secret
 * first, then the four price ids and STRIPE_PRODUCT_HIGHER_RATE; --replace removes existing ones first.
 * Nothing secret is printed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import Stripe from "stripe";
import { applySetup, describePlan, existingNames, HIGHER_RATE_ENV, keyMode, LIVE_WEBHOOK_URL, planSetup, type Mode, type SetupClient } from "@/lib/billing/live-setup";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe";

const args = process.argv.slice(2).filter((a) => a !== "--");
const has = (f: string) => args.includes(`--${f}`);
function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
const modeArg = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "live";
if (modeArg !== "live" && modeArg !== "test") fail("--mode is live or test");
const mode: Mode = modeArg;

const key = process.env.STRIPE_SECRET_KEY;
const actual = keyMode(key);
if (actual !== mode) fail(`STRIPE_SECRET_KEY is ${actual ? `a ${actual} key` : "missing or not a secret key"}; --mode is ${mode}. Nothing done.`);

/** Runs the Vercel CLI with an optional stdin value; never echoes the value. */
function vercel(argv: string[], input?: string) {
  const r = spawnSync("vercel", argv, { input, encoding: "utf8", shell: true });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.replace(/whsec_\w+/g, "[hidden]");
  return { ok: r.status === 0 && !r.error, out, error: r.error?.message };
}

const RECOVER_SECRET = `Recovery: in the Stripe dashboard (Developers, Webhooks, ${LIVE_WEBHOOK_URL}) use "Roll secret", then set STRIPE_WEBHOOK_SECRET in Vercel Production to the new value by hand.`;

async function main() {
  const writeVercel = has("write-vercel");
  if (writeVercel && !has("apply")) fail("--write-vercel needs --apply.");

  // Preflight, before any Stripe write: the Vercel link and the variables that would block `vercel env add`.
  if (writeVercel) {
    if (!existsSync(".vercel/project.json")) fail("This folder is not linked to a Vercel project (.vercel/project.json is missing). Run from the linked checkout.");
    const project = JSON.parse(readFileSync(".vercel/project.json", "utf8")) as { projectName?: string; projectId?: string };
    console.log(`Vercel project: ${project.projectName ?? project.projectId}`);
    const ls = vercel(["env", "ls", "--environment=production"]);
    if (!ls.ok) fail(`Could not list Vercel Production variables: ${ls.error ?? ls.out.trim()}`);
    const present = existingNames(ls.out);
    if (present.length && !has("replace")) fail(`Already set in Vercel Production: ${present.join(", ")}. Re-run with --replace to overwrite them, or remove them first. Nothing done.`);
    if (present.length) console.log(`Will replace: ${present.join(", ")}`);
  }

  const client = new Stripe(key!, { apiVersion: STRIPE_API_VERSION }) as unknown as SetupClient;
  const plan = await planSetup(client, mode);
  console.log(`Stripe ${mode} mode.`);
  for (const line of describePlan(plan)) console.log(`  - ${line}`);
  if (!has("apply")) {
    console.log("Dry run: nothing changed. Add --apply to carry it out.");
    return;
  }

  const out = await applySetup(client, plan);
  console.log(`Done in Stripe. Product ${out.productId}, webhook ${out.webhookId}.`);
  const ids: [string, string][] = [...Object.entries(out.priceIds), [HIGHER_RATE_ENV, out.higherRateProductId]];
  for (const [env, id] of ids) console.log(`  ${env} = ${id}`);
  if (!out.webhookSecret) console.log("The webhook already existed: its signing secret is unchanged (Stripe does not show it again).");

  if (!writeVercel) {
    if (out.webhookSecret) console.log(`The new webhook's signing secret was not saved (no --write-vercel). ${RECOVER_SECRET}`);
    return;
  }
  const writes: [string, string][] = [...(out.webhookSecret ? ([["STRIPE_WEBHOOK_SECRET", out.webhookSecret]] as [string, string][]) : []), ...ids];
  const failed: string[] = [];
  for (const [name, value] of writes) {
    if (has("replace")) vercel(["env", "rm", name, "production", "--yes"]);
    const r = vercel(["env", "add", name, "production"], value);
    if (r.ok) console.log(`Set ${name} in Vercel Production.`);
    else {
      failed.push(name);
      console.error(`Could not set ${name}: ${r.error ?? r.out.trim()}`);
      if (name === "STRIPE_WEBHOOK_SECRET") console.error(RECOVER_SECRET);
    }
  }
  const after = existingNames(vercel(["env", "ls", "--environment=production"]).out, writes.map(([n]) => n));
  const missing = writes.map(([n]) => n).filter((n) => !after.includes(n));
  if (failed.length || missing.length) {
    console.error(`NOT COMPLETE. Missing in Vercel Production: ${[...new Set([...failed, ...missing])].join(", ")}. The ids are printed above.`);
    process.exitCode = 1;
  } else console.log(`All ${writes.length} variables are in Vercel Production. Redeploy production to pick them up.`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

