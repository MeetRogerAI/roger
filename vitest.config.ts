import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: pure rules, no database or network. Scenario tests (money and
// the weekly cycle, against a test database and a Stripe sandbox) use
// vitest.scenarios.config.ts and run only with `npm run test:scenarios`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Tests that start an in-process Postgres get more time to set up when every file runs at once.
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx", "db/**/*.test.ts"], hookTimeout: 30_000, testTimeout: 20_000 },
});
