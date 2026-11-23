import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      // Coverage is a statement about the product, so only `src/` counts: the suite, the tools and the vendored model
      // are excluded, otherwise the number measures the tests' own lines and hides the gaps.
      include: ["src/**/*.ts"],
      exclude: ["src/vendor/**"],
      reporter: ["text-summary", "text", "lcov"],
      reportsDirectory: "coverage",
      // Floors sit a few points under today's numbers (statements 94.9, branches 84.9, functions 98.9): they exist to
      // catch a collapse, not to force a rewrite whenever a branch is added.
      thresholds: {
        statements: 90,
        branches: 78,
        functions: 95,
        lines: 90,
      },
    },
  },
});
