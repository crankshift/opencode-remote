import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
    environment: "node",
    include: ["tests/**/*.test.js"],
    restoreMocks: true,
  },
})
