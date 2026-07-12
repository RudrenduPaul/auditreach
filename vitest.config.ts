import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      // cli.ts/index.ts are thin wiring; prompt.ts is raw terminal I/O
      // (masked keystroke handling) that is impractical to unit test
      // meaningfully -- covered by the manual TTHW walkthrough instead.
      exclude: ["src/cli.ts", "src/index.ts", "src/util/prompt.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
