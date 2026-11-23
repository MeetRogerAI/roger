import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: pure rules, no database or network. Scenario tests (money and
// the weekly cycle) run here too against fakes and an in-process Postgres;
// `npm run test:scenarios` (vitest.scenarios.config.ts) runs them alone, and
// is where SCENARIO_TARGET=sandbox will point them at the Stripe sandbox and
// the scenario Neon branch (tests/scenarios/helpers.ts).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Tests that start an in-process Postgres get more time to set up when every file runs at once.
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx", "db/**/*.test.ts", "tests/**/*.test.ts"], hookTimeout: 30_000, testTimeout: 20_000 },
});
