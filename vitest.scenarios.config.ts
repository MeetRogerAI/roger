import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Scenario tests drive the real jobs: against fakes by default, or (SCENARIO_TARGET=sandbox) the sandbox files
// against the Stripe sandbox and the marked scenario-test database (tests/scenarios/README.md). Run them by hand.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // As in vitest.config.ts: Next.js resolves "server-only" itself; tests are server code.
      "server-only": "next/dist/compiled/server-only/empty.js",
    },
  },
  test: { environment: "node", include: ["tests/scenarios/**/*.test.ts"], testTimeout: 120_000, fileParallelism: false },
});
