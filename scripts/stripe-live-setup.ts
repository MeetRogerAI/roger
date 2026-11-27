/**
 * Creates (or finds) the Stripe objects production needs: the "Roger Monthly"
 * product, the four monthly prices and the live webhook endpoint (launch list
 * g-live-prices, g-live-webhook; src/lib/billing/live-setup.ts).
 *
 *   node --env-file=<file holding STRIPE_SECRET_KEY> node_modules/vite-node/vite-node.mjs --config vitest.config.ts \
 *     scripts/stripe-live-setup.ts -- [--mode live|test] [--apply] [--write-vercel]
 *
 * Without --apply it only prints what it would do. --mode (default live) must
 * match the key's own mode. --write-vercel (with --apply) adds the four price
 * ids and, when the endpoint is new, its signing secret to the Vercel
 * Production environment with `vercel env add`; nothing secret is printed.
 */
import { spawnSync } from "node:child_process";
import Stripe from "stripe";
import { applySetup, describePlan, keyMode, planSetup, type Mode, type SetupClient } from "@/lib/billing/live-setup";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe";

const args = process.argv.slice(2).filter((a) => a !== "--");
const has = (f: string) => args.includes(`--${f}`);
const modeArg = args[args.indexOf("--mode") + 1];
const mode: Mode = args.includes("--mode") ? (modeArg === "test" ? "test" : modeArg === "live" ? "live" : (() => { console.error("--mode is live or test"); process.exit(1); })()) : "live";

const key = process.env.STRIPE_SECRET_KEY;
const actual = keyMode(key);
if (actual !== mode) {
  console.error(`STRIPE_SECRET_KEY is ${actual ? `a ${actual} key` : "missing or not a secret key"}; --mode is ${mode}. Nothing done.`);
  process.exit(1);
}

function vercelEnvAdd(name: string, value: string): boolean {
  // Value on stdin, never in argv or output. shell: true so Windows finds vercel.cmd.
  const r = spawnSync("vercel", ["env", "add", name, "production"], { input: value, encoding: "utf8", shell: true });
  if (r.status !== 0) {
    console.error(`vercel env add ${name} production failed (it may already exist: remove it first if it should change). ${(r.stderr ?? "").replace(/whsec_\w+|price_\w+/g, "[hidden]").trim()}`);
    return false;
  }
  console.log(`Set ${name} in Vercel Production.`);
  return true;
}

async function main() {
  const client = new Stripe(key!, { apiVersion: STRIPE_API_VERSION }) as unknown as SetupClient;
  const plan = await planSetup(client, mode);
  console.log(`Stripe ${mode} mode. Plan:`);
  for (const line of describePlan(plan)) console.log(`  - ${line}`);
  if (!has("apply")) {
    console.log("Dry run: nothing changed. Add --apply to carry it out.");
    return;
  }
  const out = await applySetup(client, plan);
  console.log(`Done. Product ${out.productId}, webhook ${out.webhookId}.`);
  for (const [env, id] of Object.entries(out.priceIds)) console.log(`  ${env} = ${id}`);
  if (!out.webhookSecret) console.log("The webhook already existed: its signing secret is unchanged (not shown again by Stripe).");
  if (has("write-vercel")) {
    let ok = true;
    for (const [env, id] of Object.entries(out.priceIds)) ok = vercelEnvAdd(env, id) && ok;
    if (out.webhookSecret) ok = vercelEnvAdd("STRIPE_WEBHOOK_SECRET", out.webhookSecret) && ok;
    if (!ok) process.exitCode = 1;
  } else if (out.webhookSecret) {
    console.log("The new webhook's signing secret was not saved anywhere (no --write-vercel). Roll it in the dashboard and set STRIPE_WEBHOOK_SECRET by hand.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
