import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Scenario tests drive the real jobs against the scenario-test database and a
// Stripe sandbox. They are slow and need credentials; run them by hand.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["tests/scenarios/**/*.test.ts"], testTimeout: 120_000, fileParallelism: false },
});
