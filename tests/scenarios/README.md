# Scenario tests

The real jobs (Cora, charge, send, the hourly pass, the Stripe webhook handler) run against a simulated clock. There are two targets.

| Target | Files | Runs against | When |
|---|---|---|---|
| `fakes` (the default) | every `*.test.ts` except `sandbox-*` | in-process Postgres (PGlite) and the in-memory fake Stripe in `helpers.ts` | `npx vitest run`, CI, and `npm run test:scenarios` |
| `sandbox` | `sandbox-*.test.ts` | the Stripe sandbox on test clocks, and the marked scenario-test Neon branch | by hand, on a machine with the sandbox keys |

`helpers.test.ts` checks the sandbox harness itself (the refusals, clock grouping and clock stepping) with fakes and no network. It runs in the default suite.

Without the sandbox variables, the `sandbox-*` files are **skipped**, not failed. The fakes files run the same under either target.

## Running sandbox mode (Peter)

### One-time setup

1. **The scenario-test branch.** Use the `roger-db` branch from close-out S17, the one `SCENARIO_DATABASE_URL` points at. It must have the current `db/schema.sql` applied and be marked `test`, with `DATABASE_URL` pointed at that branch for this one command:

   ```
   DATABASE_URL=<scenario branch URL> node db/setup.mjs --mark=test
   ```

   Only a branch marked exactly `test` is reset. One marked `preview` or `local`, or not marked at all, is refused and left untouched. **Each run empties every table on this branch**, so never point it at preview data.
2. **Stripe sandbox prices.** The six `STRIPE_PRICE_*` test price ids must exist in the sandbox: monthly USD, monthly CAD, both higher rates, and both per-list prices. The scenarios assume the spec's amounts (US$200 and CA$280 a month). Stripe Tax must be on in the sandbox, since every charge uses automatic tax with an Ontario or New York address.

### Each run

Set these variables in the shell. Don't add them to `.env.local`, or every `npx vitest run` would pick them up.

| Variable | Value |
|---|---|
| `SCENARIO_TARGET` | `sandbox` |
| `STRIPE_SECRET_KEY` | the sandbox secret key, `sk_test_…`. A live key (`sk_live_`, `rk_live_`) is refused before anything is touched, and so is any key that isn't `sk_test_`. |
| `STRIPE_PRICE_MONTHLY_USD`, `STRIPE_PRICE_MONTHLY_CAD`, `STRIPE_PRICE_MONTHLY_HIGHER_USD`, `STRIPE_PRICE_MONTHLY_HIGHER_CAD`, `STRIPE_PRICE_RUN_USD`, `STRIPE_PRICE_RUN_CAD` | the sandbox price ids |
| `SCENARIO_DATABASE_URL` | the scenario branch's connection string. It must differ from `DATABASE_URL`, or the run is refused. Leaving `DATABASE_URL` unset is safest. |

Then run:

```
npx vitest run --config vitest.scenarios.config.ts tests/scenarios/sandbox-
```

Each test may take a few minutes, because test clocks take time to advance. The files run one at a time.

### What a run does

1. **Refusals, before any connection or Stripe call:** the key, then the URLs, then the branch's marker row.
2. **Reset:** every app table on the branch is truncated, and every settings row except the marker is deleted. That gives the same empty-schema baseline the fakes start from.
3. **Customers on test clocks:** customers are created on Stripe test clocks, at most three per clock. A new clock, frozen at the app clock's time, is started when the current one fills.
4. **Advancing:** every clock moves to the same instant as the app clock, at most one calendar month per step. Stripe allows at most two billing intervals per step. The run waits until every clock reports `ready`. After each step, Stripe's events about the scenario's own customers go through the webhook's handler, oldest first, and then the reconcile's accounts step runs.
5. **Cleanup:** afterwards the clocks are deleted, which deletes their customers, and so is the sponsor's customer. If a run is killed part-way, delete the leftover `roger scenario …` test clocks in the Stripe dashboard (Billing, Test clocks).

### The scenarios

- `sandbox-billing.test.ts`: B1 billing. Four monthly members on two clocks, a month of renewals, and one card that starts declining.
- `sandbox-referral-credit.test.ts`: B2 referral credit. The grant on the referred member's first invoice, the referrer's renewal spending it, and the clawback after a refund.
- `sandbox-sponsor-invoice.test.ts`: B2 sponsor invoicing. Last month's draft with automatic tax, 2 standard seats and 1 higher, then sent once.

Record the result of the first full run in the launch list.
