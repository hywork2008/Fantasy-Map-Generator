import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: "./src",
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    // Geometry-heavy city suites need enough memory per worker to avoid timeout cascades.
    maxWorkers: 4,
    testTimeout: 120000,
  },
});
