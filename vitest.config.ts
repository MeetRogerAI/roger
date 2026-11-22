import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: pure rules, no database or network. Scenario tests (money and
// the weekly cycle, against a test database and a Stripe sandbox) use
// vitest.scenarios.config.ts and run only with `npm run test:scenarios`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts", "db/**/*.test.ts"] },
});
