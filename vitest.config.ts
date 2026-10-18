import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // Database tests start an in-process Postgres (PGlite), which takes a few seconds.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
